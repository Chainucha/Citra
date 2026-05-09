# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Phayura** — ToS-compliant Electron multi-client window manager for Flyff Universe. Each *group* opens its own container window hosting an N-pane CSS Grid of Flyff webviews with independent storage partitions. The grid auto-fits the container window's aspect ratio by default; users can lock the topology, divider ratios, and per-cell session assignment. No input injection, no game inspection, no CDP.

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

Two kinds of renderer:
1. **Dashboard** — single window, vanilla JS UI for managing groups/sessions/layout.
2. **Group container** — one BrowserWindow per group, hosts that group's `<webview>` panes inside `src/renderer/game/index.html`. Multiple groups = multiple container windows running concurrently.

```
src/
  main/
    index.js                 ← app lifecycle, single-instance lock, IPC wiring per group
    workspaceController.js   ← electron-store persistence; groups + sessions; migration
    browserInstanceManager.js← Map<groupId, BrowserWindow>; per-group container, HWND lookup
    focusController.js       ← per-group globalShortcut binding; Tab/F10/F11 in focused container's group
    hoverFocus.js            ← Win32 GetCursorPos polling (16ms); read-only, off by default
    win32/
      bindings.js            ← all koffi declarations; absence list documented
      windowOps.js           ← placeWindow, getRect, focusWindow (HWND-normalized)
  preload/
    dashboard.js             ← exposes window.citra.* to dashboard renderer
    game.js                  ← exposes window.gameBridge.* + groupId (read from process.argv) to container renderer
  renderer/
    dashboard/               ← group sections, session cards, sidebar, dialogs
    game/                    ← container page: webview panes + divider + focus indicator label
  shared/
    ipc-channels.js          ← string constants used by main + all preloads
    gridLayoutEngine.js      ← pure: computeAutoGrid, rebuildCellMap, normalizeRatios; shared by main + game renderer
```

## Key Constraints

**Compliance boundary** — `src/main/win32/bindings.js` deliberately omits: `SendInput`, `keybd_event`, `mouse_event`, `PostMessage`, `ReadProcessMemory`, `WriteProcessMemory`, debugger APIs, `BitBlt`/`PrintWindow`. Adding any is a ToS violation — flag in PR review.

**Webviews** — each session is a `<webview>` element inside its group's container window with `partition="persist:<sessionId>"` for cookie isolation. Removing a webview from the DOM destroys its `webContents` (and reloads the page on re-attach), so the container renderer never detaches surviving panes. The container uses CSS Grid (`display: grid` with `grid-template-columns/rows` driven by `colRatios`/`rowRatios`); reconcile updates `style.gridArea` on surviving wrappers — no detach/reattach, no webview reload.

**Container windows** — `browserInstanceManager` keyed by `groupId`. `additionalArguments: ['--group-id=<uuid>']` is passed to the renderer; `preload/game.js` reads it from `process.argv` and exposes it on `window.gameBridge.groupId`. Main routes `GAME_UPDATE` per-group by mapping `webContents.id → groupId` (see `getGroupIdByWebContents`).

**HWND comparisons** — koffi opaque-pointer HWNDs (External objects) never match `===` against JS Number HWNDs from session state. `focusWindow` normalizes via `koffi.address()` before comparing. Skipping normalization causes `AttachThreadInput` to fire on every call (foreground check always false), which at high call rates corrupts Windows input state machine and produces stuck-key bugs persisting after process exit.

**hoverFocus poll rate** — 16ms (~60Hz) is the floor. Going to 1ms hammered `AttachThreadInput` when `SetForegroundWindow` was blocked by foreground-stealing prevention. Per-hwnd `REFOCUS_COOLDOWN_MS = 250` prevents retry storms on the same target while keeping cross-window switching instant.

**koffi callbacks** — if `EnumWindows` is ever used again, always `koffi.register` / `koffi.unregister` in pairs to avoid trampoline leaks.

**Hotkeys** — per-session global accelerators bind through `globalShortcut`; `Tab`, `F10`, and `F11` register globally but resolve the focused BrowserWindow's groupId via `getGroupIdByWebContents` so cycle/zoom/fullscreen act on the active group only. Per-session accelerator strings must be unique across the whole workspace (no per-group namespace).

## State Model

```
workspace = {
  id, name,
  groups:   [{ id, name,
              layout: { cols, rows, colRatios, rowRatios, cellMap, manual } }],
  sessions: [{ id, groupId, name, browserPath, url, hotkey, accentColor, muted?,
               hwnd?, pid?, state? }],
  hoverFocusEnabled?, hoverFocusDelayMs?,
}
```

- **Persisted on session**: `id`, `groupId`, `name`, `browserPath`, `url`, `hotkey`, `accentColor`, `muted`
- **Runtime only (cleared by `loadWorkspace`)**: `hwnd`, `pid`, `state`
- **Layout**: per-group `layout` object — `cols`/`rows` topology, `colRatios`/`rowRatios` divider positions, `cellMap` (`"r,c" → sessionId`), and `manual` flag (false = auto-fit window aspect; true = locked).
- `loadWorkspace` migrates legacy `activePreset`, `lockLayout`, `splitRatio` fields into `layout` on first run.
- All sessions in a group share the container's HWND; per-session focus is accomplished by sending `GAME_FOCUS_WEBVIEW` to the container.
- Default `hoverFocusDelayMs` is 30ms; existing user state may persist higher legacy values.

`electron-store` filename: `citra` → `workspace` object. (Filename retained from pre-rename for backward compat with existing user data.)

## Dashboard Drag-and-Drop

`MOVE_SESSION_GROUP` IPC accepts optional `beforeId`, unifying cross-group move + in-group reorder + cross-group reorder:

- `beforeId === undefined` → move group only, leave array order alone.
- `beforeId === null` → move/keep group, append at end of `workspace.sessions`.
- `beforeId === <id>` → move/keep group, splice immediately before that anchor in `workspace.sessions`.

Drop targets in dashboard:
- **Card** — cursor X vs midpoint decides before/after; after = `nextElementSibling.id` or `null` if last.
- **Section** (cards-row empty area or whole group section) — appends with `beforeId=null`.
- **Sidebar `li`** — cursor Y vs midpoint; reorder in flat array, keeps dragged session's `groupId`.
- **Ungrouped details** — appends to ungrouped (groupId=null) without repositioning.

`REORDER_SESSION` channel was removed; all reorder paths flow through `MOVE_SESSION_GROUP` now.

## Container Renderer Notes (`src/renderer/game/game.js`)

- `wrappers: Map<sessionId, HTMLDivElement>` — wrapper holds the `<webview>` plus its `.session-label`.
- **Reconcile** is incremental: only add/remove the diff. Surviving wrappers stay attached → no webview reload on launch/close churn.
- **Visual placement** is driven by CSS `grid-area` on each wrapper, computed from `cellMap`. Reordering a session updates `gridArea` only — webviews are never detached.
- **Focus indicator** is the `.session-label` badge: idle = dark badge; focused = `var(--accent)` background + glow.
- **Drag-and-swap** is gated on a per-wrapper "Edit Position" toggle (menu item). When active, the label becomes draggable; dropping on another cell sends `LAYOUT_SWAP_CELLS`. While `isDragging === true`, hover-focus is suppressed.
- **Tab cycle**: `≤2` panes use simple toggle; `>2` panes use row-major over `cellMap`.
- **F11**: container window fullscreen. **F10**: focused pane zoom (others `display: none`, press again to restore).
- **ResizeObserver** on `#container` debounces `LAYOUT_RESIZE_HINT` to main; main recomputes topology if `manual === false`.
- **Session-label dropdown** sends `OPEN_DASHBOARD` via `window.gameBridge.openDashboard()`.

## Window Foreground Policy

- **Group launch** — after `LAUNCH_GROUP` spawns/maximizes the container, main re-focuses the dashboard via `setImmediate` so the manager stays on top. Single-session launch does not refocus (callers from inside the container expect it to stay active).
- **Single-instance lock** — `app.requestSingleInstanceLock()` prevents a second Phayura from fighting over `globalShortcut` accelerators. `window-all-closed → app.quit()` means closing both the dashboard and every container exits the app.
- **Pane zoom** — F10 toggles a `.pane-zoomed` class on the focused wrapper inside the container; other wrappers + dividers are hidden until F10 is pressed again. State is renderer-local and not persisted.

## Theming

Dashboard uses CSS custom properties at `:root` in `src/renderer/dashboard/styles.css`. Accent color is teal (`#14b8a6`); container renderer inline styles fall back to the same teal where `--accent` is unset. Per-session `accentColor` overrides the default in the container.

## Tech Stack

Electron 41 · Node 20 · koffi 2.10 (Win32 FFI) · electron-store 8 (v10 is ESM-only, incompatible with CJS main) · vanilla HTML/JS — no TypeScript, no bundler.
