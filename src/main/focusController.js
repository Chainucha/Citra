const { globalShortcut, BrowserWindow } = require('electron');
const { focusWindow } = require('./win32/windowOps');
const { getGroupIdByWebContents } = require('./browserInstanceManager');

let registered = [];

// Per-group state: groupId → { sessions, onSwitch, mru: [sessionId,...] }
// MRU is most-recent-first. Drives Alt+Tab-style toggle: Tab focuses MRU[1].
const cycleByGroup = new Map();
let onFullscreen = null;
let containerOn  = false;

function recordFocus(groupId, sessionId) {
  const state = cycleByGroup.get(groupId);
  if (!state) return;
  state.mru = [sessionId, ...state.mru.filter(id => id !== sessionId)];
}

// Bind per-session global hotkeys for one group's sessions.
// Per-session hotkeys are workspace-global (cannot collide between groups —
// dashboard is responsible for unique accelerators).
function bindHotkeys(groupId, sessions, onSwitch, shouldFire, onFullscreenCb) {
  // Preserve MRU across rebinds (sessions reordered, renamed, etc.)
  const prevMru = cycleByGroup.get(groupId)?.mru || [];
  unbindGroup(groupId);
  const fire = shouldFire || (() => true);

  sessions.forEach(session => {
    const accel = session.hotkey;
    if (!accel) return;
    const ok = globalShortcut.register(accel, () => {
      if (!fire() || !session.hwnd) return;
      focusWindow(session.hwnd);
      recordFocus(groupId, session.id);
      onSwitch?.(session);
    });
    if (ok) registered.push({ groupId, accel });
    else console.warn(`[hotkey] Could not register "${accel}" — already claimed.`);
  });

  const validIds = new Set(sessions.map(s => s.id));
  cycleByGroup.set(groupId, {
    sessions, onSwitch,
    mru: prevMru.filter(id => validIds.has(id)),
  });
  if (onFullscreenCb !== undefined) onFullscreen = onFullscreenCb;
}

function unbindGroup(groupId) {
  registered = registered.filter(r => {
    if (r.groupId !== groupId) return true;
    globalShortcut.unregister(r.accel);
    return false;
  });
  cycleByGroup.delete(groupId);
}

function enableContainerHotkeys() {
  if (containerOn) return;
  const okTab = globalShortcut.register('Tab', () => cycleFocus());
  const okF11 = globalShortcut.register('F11', () => {
    const groupId = focusedContainerGroupId();
    if (groupId) onFullscreen?.(groupId);
  });
  if (!okTab) console.warn('[hotkey] Could not register Tab');
  if (!okF11) console.warn('[hotkey] Could not register F11');
  containerOn = true;
}

function disableContainerHotkeys() {
  if (!containerOn) return;
  globalShortcut.unregister('Tab');
  globalShortcut.unregister('F11');
  containerOn = false;
}

function focusedContainerGroupId() {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return null;
  return getGroupIdByWebContents(win.webContents);
}

// Alt+Tab style: Tab jumps to previously-focused session in this group.
// Repeated Tab toggles between the two most-recent sessions. With 3+ active,
// the second Tab still goes back to the prior, matching Windows quick-switch.
function cycleFocus() {
  const groupId = focusedContainerGroupId();
  if (!groupId) return;
  const state = cycleByGroup.get(groupId);
  if (!state) return;
  const active = state.sessions.filter(s => s.hwnd);
  if (active.length === 0) return;

  const validIds = new Set(active.map(s => s.id));
  const mru = state.mru.filter(id => validIds.has(id));

  let target = null;
  if (mru.length >= 2) {
    target = active.find(s => s.id === mru[1]);
  } else {
    // No prior — fall back to first non-current.
    target = active.find(s => s.id !== mru[0]) || active[0];
  }
  if (!target) return;

  focusWindow(target.hwnd);
  recordFocus(groupId, target.id);
  state.onSwitch?.(target);
}

function unbindAll() {
  registered.forEach(r => globalShortcut.unregister(r.accel));
  registered = [];
  cycleByGroup.clear();
  disableContainerHotkeys();
}

module.exports = {
  bindHotkeys, unbindGroup, unbindAll, cycleFocus, recordFocus,
  enableContainerHotkeys, disableContainerHotkeys,
};
