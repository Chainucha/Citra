# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Citra** — ToS-compliant Electron multi-client window manager for Flyff Universe. Each *group* opens its own container window hosting up to two side-by-side Flyff webviews with independent storage partitions. No input injection, no game inspection, no CDP.

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
    dashboard.js             ← exposes window.sunkist.* to dashboard renderer
    game.js                  ← exposes window.gameBridge.* + groupId (read from process.argv) to container renderer
    overlay.js               ← exposes window.overlayBridge.* to badge renderer (legacy)
  renderer/
    dashboard/               ← group sections, session cards, layout picker, dialogs
    game/                    ← container page: webview panes + divider + focus indicator label
    overlay/                 ← transparent badge with timer (legacy)
  shared/
    ipc-channels.js          ← string constants used by main + all preloads
```

## Key Constraints

**Compliance boundary** — `src/main/win32/bindings.js` deliberately omits: `SendInput`, `keybd_event`, `mouse_event`, `PostMessage`, `ReadProcessMemory`, `WriteProcessMemory`, debugger APIs, `BitBlt`/`PrintWindow`. Adding any is a ToS violation — flag in PR review.

**Webviews** — each session is a `<webview>` element inside its group's container window with `partition="persist:<sessionId>"` for cookie isolation. Removing a webview from the DOM destroys its `webContents` (and reloads the page on re-attach), so the container renderer never detaches surviving panes — see "Reconcile" below.

**Container windows** — `browserInstanceManager` keyed by `groupId`. `additionalArguments: ['--group-id=<uuid>']` is passed to the renderer; `preload/game.js` reads it from `process.argv` and exposes it on `window.gameBridge.groupId`. Main routes `GAME_UPDATE` per-group by mapping `webContents.id → groupId` (see `getGroupIdByWebContents`).

**koffi callbacks** — if `EnumWindows` is ever used again, always `koffi.register` / `koffi.unregister` in pairs to avoid trampoline leaks.

**Hotkeys** — per-session global accelerators bind through `globalShortcut`; `Tab` and `F11` register globally but resolve the focused BrowserWindow's groupId via `getGroupIdByWebContents` so cycle/fullscreen act on the active group only. Per-session accelerator strings must be unique across the whole workspace (no per-group namespace).

## State Model

```
workspace = {
  id, name,
  groups:   [{ id, name, activePreset, lockLayout }],
  sessions: [{ id, groupId, name, browserPath, url, hotkey, accentColor,
               hwnd?, pid?, state? }],
  hoverFocusEnabled?, hoverFocusDelayMs?,
}
```

- **Persisted on session**: `id`, `groupId`, `name`, `browserPath`, `url`, `hotkey`, `accentColor`
- **Runtime only (cleared by `loadWorkspace`)**: `hwnd`, `pid`, `state` (`idle | launching | tracking | arranged | active`)
- **Layout state** (`activePreset`, `lockLayout`) lives on each group, not on the workspace. `loadWorkspace` migrates legacy top-level fields onto the first group on first run.
- All sessions in a group share the container's HWND (one OS window per group); per-session focus is accomplished by sending `GAME_FOCUS_WEBVIEW` to the container so the right `<webview>` calls `.focus()`.

`electron-store` filename: `citra` → `workspace` object.

## Container Renderer Notes (`src/renderer/game/game.js`)

- `wrappers: Map<sessionId, HTMLDivElement>` — wrapper holds the `<webview>` plus its `.session-label`.
- **Reconcile** is incremental: only add/remove the diff. Surviving wrappers stay attached → no webview reload on launch/close churn.
- **Visual order** is driven by CSS `order` (0 / 1 / 2 for view0 / divider / view1), never by DOM reordering, so reordering sessions does not destroy webviews.
- **Focus indicator** is the `.session-label` badge: idle = dark badge; focused = `var(--accent)` background + glow. The wrapper's `--accent` CSS var is set/refreshed at create + on `syncLabel`.
- **Drag math** assumes `views[0]` is visually first. Always look up views by group order and use CSS order to align DOM with visual layout.
- **Session-label dropdown** (`▽` menu button on each pane) sends `OPEN_DASHBOARD` via `window.gameBridge.openDashboard()`. Main recreates the dashboard window if it was closed; otherwise restores + focuses it.

## Window Foreground Policy

- **Group launch** — after `LAUNCH_GROUP` spawns/maximizes the container, main re-focuses the dashboard via `setImmediate` so the manager stays on top. Single-session launch does not refocus (callers from inside the container expect it to stay active).
- **Single-instance lock** — `app.requestSingleInstanceLock()` prevents a second Citra from fighting over `globalShortcut` accelerators. `window-all-closed → app.quit()` means closing both the dashboard and every container exits the app.

## Tech Stack

Electron 30 · Node 20 · koffi 2.10 (Win32 FFI) · electron-store 8 (v10 is ESM-only, incompatible with CJS main) · uiohook-napi 1.5 (optional) · vanilla HTML/JS — no TypeScript, no bundler.
