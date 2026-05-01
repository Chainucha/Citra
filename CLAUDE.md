# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Citra** — ToS-compliant Electron multi-client window manager for Flyff Universe. Each *group* opens its own container window hosting an N-pane CSS Grid of Flyff webviews with independent storage partitions. The grid auto-fits the container window's aspect ratio by default; users can lock the topology, divider ratios, and per-cell session assignment. No input injection, no game inspection, no CDP.

Implementation plan: `docs/superpowers/plans/2026-04-25-citra-electron.md`

## Commands

```bash
npm start                  # run Electron app
npm run build              # electron-builder NSIS installer → dist/
NODE_ENV=dev npm start     # open DevTools in dashboard + each container window
```

No test framework until architecture is proven against real Flyff windows (per plan).

## Architecture

Single Electron main process owns all Win32 calls and mutable workspace state. Renderer processes talk to main through narrow IPC preload bridges only.

Three kinds of renderer:
1. **Dashboard** — single window, vanilla JS UI for managing groups/sessions/layout.
2. **Group container** — one BrowserWindow per group, hosts that group's `<webview>` panes inside `src/renderer/game/index.html`. Multiple groups = multiple container windows running concurrently.
3. **Overlay badge** — legacy transparent BrowserWindow per session for HWND tracking; not in active path now that webviews live inside the container.

```
src/
  main/
    index.js                 ← app lifecycle, single-instance lock, IPC wiring per group
    workspaceController.js   ← electron-store persistence; groups + sessions; migration
    browserInstanceManager.js← Map<groupId, BrowserWindow>; per-group container, HWND lookup
    focusController.js       ← per-group globalShortcut binding; Tab/F11 cycle in focused container's group
    windowLayoutEngine.js    ← pure layout math (legacy, unused since webview-based layout)
    overlayManager.js        ← transparent badge BrowserWindows + 250ms tracking loop (legacy)
    hoverFocus.js            ← uiohook-napi read-only hover detection (off by default)
    win32/
      bindings.js            ← all koffi declarations; absence list documented
      windowOps.js           ← placeWindow, getRect, focusWindow
  preload/
    dashboard.js             ← exposes window.phayura.* to dashboard renderer
    game.js                  ← exposes window.gameBridge.* + groupId (read from process.argv) to container renderer
    overlay.js               ← exposes window.overlayBridge.* to badge renderer (legacy)
  renderer/
    dashboard/               ← group sections, session cards, layout picker, dialogs
    game/                    ← container page: webview panes + divider + focus indicator label
    overlay/                 ← transparent badge with timer (legacy)
  shared/
    ipc-channels.js          ← string constants used by main + all preloads
    gridLayoutEngine.js      ← pure: computeAutoGrid, rebuildCellMap, normalizeRatios; shared by main + game renderer
```

## Key Constraints

**Compliance boundary** — `src/main/win32/bindings.js` deliberately omits: `SendInput`, `keybd_event`, `mouse_event`, `PostMessage`, `ReadProcessMemory`, `WriteProcessMemory`, debugger APIs, `BitBlt`/`PrintWindow`. Adding any is a ToS violation — flag in PR review.

**Webviews** — each session is a `<webview>` element inside its group's container window with `partition="persist:<sessionId>"` for cookie isolation. Removing a webview from the DOM destroys its `webContents` (and reloads the page on re-attach), so the container renderer never detaches surviving panes. The container uses CSS Grid (`display: grid` with `grid-template-columns/rows` driven by `colRatios`/`rowRatios`); reconcile updates `style.gridArea` on surviving wrappers — no detach/reattach, no webview reload.

**Container windows** — `browserInstanceManager` keyed by `groupId`. `additionalArguments: ['--group-id=<uuid>']` is passed to the renderer; `preload/game.js` reads it from `process.argv` and exposes it on `window.gameBridge.groupId`. Main routes `GAME_UPDATE` per-group by mapping `webContents.id → groupId` (see `getGroupIdByWebContents`).

**koffi callbacks** — if `EnumWindows` is ever used again, always `koffi.register` / `koffi.unregister` in pairs to avoid trampoline leaks.

**Hotkeys** — per-session global accelerators bind through `globalShortcut`; `Tab` and `F11` register globally but resolve the focused BrowserWindow's groupId via `getGroupIdByWebContents` so cycle/fullscreen act on the active group only. Per-session accelerator strings must be unique across the whole workspace (no per-group namespace).

## State Model

```
workspace = {
  id, name,
  groups:   [{ id, name,
              layout: { cols, rows, colRatios, rowRatios, cellMap, manual } }],
  sessions: [{ id, groupId, name, browserPath, url, hotkey, accentColor,
               hwnd?, pid?, state? }],
  hoverFocusEnabled?, hoverFocusDelayMs?,
}
```

- **Persisted on session**: `id`, `groupId`, `name`, `browserPath`, `url`, `hotkey`, `accentColor`
- **Runtime only (cleared by `loadWorkspace`)**: `hwnd`, `pid`, `state`
- **Layout**: per-group `layout` object — `cols`/`rows` topology, `colRatios`/`rowRatios` divider positions, `cellMap` (`"r,c" → sessionId`), and `manual` flag (false = auto-fit window aspect; true = locked).
- `loadWorkspace` migrates legacy `activePreset`, `lockLayout`, `splitRatio` fields into `layout` on first run.
- All sessions in a group share the container's HWND; per-session focus is accomplished by sending `GAME_FOCUS_WEBVIEW` to the container.

`electron-store` filename: `citra` → `workspace` object.

## Container Renderer Notes (`src/renderer/game/game.js`)

- `wrappers: Map<sessionId, HTMLDivElement>` — wrapper holds the `<webview>` plus its `.session-label`.
- **Reconcile** is incremental: only add/remove the diff. Surviving wrappers stay attached → no webview reload on launch/close churn.
- **Visual placement** is driven by CSS `grid-area` on each wrapper, computed from `cellMap`. Reordering a session updates `gridArea` only — webviews are never detached.
- **Focus indicator** is the `.session-label` badge: idle = dark badge; focused = `var(--accent)` background + glow.
- **Drag-and-swap** is gated on a per-wrapper "Edit Position" toggle (menu item). When active, the label becomes draggable; dropping on another cell sends `LAYOUT_SWAP_CELLS`. While `isDragging === true`, hover-focus is suppressed.
- **Tab cycle**: `≤2` panes use simple toggle; `>2` panes use row-major over `cellMap`.
- **F11**: container window fullscreen. **F12**: focused pane zoom (others `display: none`, press again to restore).
- **ResizeObserver** on `#container` debounces `LAYOUT_RESIZE_HINT` to main; main recomputes topology if `manual === false`.
- **Session-label dropdown** sends `OPEN_DASHBOARD` via `window.gameBridge.openDashboard()`.

## Window Foreground Policy

- **Group launch** — after `LAUNCH_GROUP` spawns/maximizes the container, main re-focuses the dashboard via `setImmediate` so the manager stays on top. Single-session launch does not refocus (callers from inside the container expect it to stay active).
- **Single-instance lock** — `app.requestSingleInstanceLock()` prevents a second Citra from fighting over `globalShortcut` accelerators. `window-all-closed → app.quit()` means closing both the dashboard and every container exits the app.
- **Pane zoom** — F12 toggles a `.pane-zoomed` class on the focused wrapper inside the container; other wrappers + dividers are hidden until F12 is pressed again. State is renderer-local and not persisted.

## Tech Stack

Electron 41 · Node 20 · koffi 2.10 (Win32 FFI) · electron-store 8 (v10 is ESM-only, incompatible with CJS main) · uiohook-napi 1.5 (optional) · vanilla HTML/JS — no TypeScript, no bundler.
