const { BrowserWindow } = require('electron');
const path = require('path');
const { getRect } = require('./win32/windowOps');

const overlays = new Map(); // sessionId → BrowserWindow
let trackingInterval = null;

function createBadge(session) {
  if (overlays.has(session.id)) return overlays.get(session.id);

  const win = new BrowserWindow({
    width: 220, height: 100,
    x: 100, y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/overlay.js'),
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(
    path.join(__dirname, '../renderer/overlay/badge.html'),
    { query: { sessionId: session.id, label: session.name, color: session.accentColor } },
  );

  overlays.set(session.id, win);
  return win;
}

function destroyBadge(sessionId) {
  const win = overlays.get(sessionId);
  if (!win) return;
  if (!win.isDestroyed()) win.close();
  overlays.delete(sessionId);
}

function positionBadge(session) {
  const win = overlays.get(session.id);
  if (!win) return;
  if (win.isDestroyed()) { overlays.delete(session.id); return; }
  if (!session.hwnd) return;
  try {
    const r = getRect(session.hwnd);
    win.setBounds({ x: r.x + 8, y: r.y + 8, width: 220, height: 100 });
  } catch { /* window may have closed */ }
}

function startTracking(getSessions, intervalMs = 250) {
  if (trackingInterval) return; // already tracking, existing interval covers all sessions
  trackingInterval = setInterval(() => {
    getSessions().forEach(s => { if (s.hwnd) positionBadge(s); });
  }, intervalMs);
}

function stopTracking() {
  if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
}

module.exports = { createBadge, destroyBadge, positionBadge, startTracking, stopTracking, overlays };
