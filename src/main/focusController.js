const { globalShortcut } = require('electron');
const { focusWindow } = require('./win32/windowOps');

let registered = [];

const DEFAULT_HOTKEYS = [
  'Shift+1',
  'Shift+2',
  'CommandOrControl+Alt+3',
  'CommandOrControl+Alt+4',
];

let cycleSessions = [];
let cycleOnSwitch = null;
let cycleIdx = 0;
let onFullscreen = null;
let containerOn  = false;

function bindHotkeys(sessions, onSwitch, shouldFire, onFullscreenCb) {
  unbindAll();
  const fire = shouldFire || (() => true);

  sessions.forEach((session, i) => {
    const accel = session.hotkey; //|| DEFAULT_HOTKEYS[i];
    if (!accel) return;

    const ok = globalShortcut.register(accel, () => {
      if (!fire() || !session.hwnd) return;
      focusWindow(session.hwnd);
      onSwitch?.(session);
    });

    if (ok) registered.push(accel);
    else console.warn(`[hotkey] Could not register "${accel}" — already claimed by another app.`);
  });

  cycleSessions = sessions;
  cycleOnSwitch = onSwitch;
  if (onFullscreenCb !== undefined) onFullscreen = onFullscreenCb;
  cycleIdx = 0;
}

function enableContainerHotkeys() {
  if (containerOn) return;
  const okTab = globalShortcut.register('Tab', () => cycleFocus());
  const okF11 = globalShortcut.register('F11', () => onFullscreen?.());
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

function cycleFocus() {
  const active = cycleSessions.filter(s => s.hwnd);
  if (active.length === 0) return;
  cycleIdx = (cycleIdx + 1) % active.length;
  const target = active[cycleIdx];
  focusWindow(target.hwnd);
  cycleOnSwitch?.(target);
}

function unbindAll() {
  registered.forEach(a => globalShortcut.unregister(a));
  registered = [];
  disableContainerHotkeys();
}

module.exports = { bindHotkeys, unbindAll, cycleFocus, enableContainerHotkeys, disableContainerHotkeys };
