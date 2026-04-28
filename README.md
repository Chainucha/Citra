# Citra

ToS-compliant multi-client launcher for Flyff Universe. Manage many accounts in side-by-side panes with per-account cookie isolation and global hotkey focus switching — no input injection, no memory reads.

## Features

- **Groups** — organize sessions into groups; each group launches in its own window so you can run multiple split-screen layouts simultaneously.
- **Per-session storage** — every account gets its own persistent Chromium partition (`persist:<sessionId>`); cookies and localStorage stay isolated.
- **Split layouts** — 50/50, 70/30, or 30/70 in horizontal or vertical orientation. Drag the divider live, then lock it.
- **Reorder + rename** — move sessions up/down within the workspace and rename without restarting them. Reordering does not reload the webviews.
- **Focus indicator** — accent-colored session badge highlights the focused pane.
- **Global hotkeys** — per-session accelerators focus an account from anywhere. `Tab` cycles focus inside the active group window. `F11` toggles fullscreen on the active group.
- **Hover focus** (optional) — automatically focus a pane when the mouse hovers over it for a configurable delay.
- **Manage Panel from any pane** — each session badge has a dropdown to reopen the dashboard. If the manager window was closed, it is recreated; otherwise restored and focused.
- **Manager stays in front on launch** — launching a group spawns the container window without stealing focus from the dashboard, so you can keep managing while the panes load.

## How it works

Each group opens one Electron `BrowserWindow`. Inside that window, sessions render as `<webview>` panes laid out via flexbox. Layout, lock, and active-preset are stored per-group; sessions belong to exactly one group at a time.

The main process owns all OS-level state (HWNDs, hotkeys) and exposes a small IPC surface to the dashboard. The dashboard is a single window with one section per group: launch/close at the group level, plus per-session controls.

## Compliance boundary

Citra never injects input, never reads game memory, and never attaches a debugger. Win32 usage is limited to window placement and focus (`SetWindowPos`, `SetForegroundWindow`, `AttachThreadInput`, `GetWindowRect`). The deliberately-omitted API list is documented in `src/main/win32/bindings.js`; adding any of those should be flagged in review.

## Develop

```bash
npm install
npm start                 # run Electron app
NODE_ENV=dev npm start    # also opens DevTools
npm run build             # NSIS installer → dist/
```

Stack: Electron 30 · Node 20 · koffi (Win32 FFI) · electron-store · vanilla HTML/JS (no TypeScript, no bundler).

## Status

Early — architecture stabilizing. No automated tests yet; verify against real Flyff windows.
