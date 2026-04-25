const { screen } = require('electron');
const { placeWindow } = require('./win32/windowOps');

/**
 * Presets: pure functions of workArea → [rect, rect].
 * workArea is Electron's DPI-scaled workArea (already excludes taskbar).
 * Values passed to SetWindowPos are physical pixels on a per-monitor-aware
 * process — Electron handles the DPI conversion so we pass them directly.
 */
const PRESETS = {
  'split-h-50': (wa) => [
    { x: wa.x,                         y: wa.y, width: Math.floor(wa.width / 2), height: wa.height },
    { x: wa.x + Math.floor(wa.width / 2), y: wa.y, width: wa.width - Math.floor(wa.width / 2), height: wa.height },
  ],
  'split-v-50': (wa) => [
    { x: wa.x, y: wa.y,                         width: wa.width, height: Math.floor(wa.height / 2) },
    { x: wa.x, y: wa.y + Math.floor(wa.height / 2), width: wa.width, height: wa.height - Math.floor(wa.height / 2) },
  ],
  'split-h-70': (wa) => {
    const w1 = Math.floor(wa.width * 0.7);
    return [
      { x: wa.x,      y: wa.y, width: w1,            height: wa.height },
      { x: wa.x + w1, y: wa.y, width: wa.width - w1, height: wa.height },
    ];
  },
  'split-v-70': (wa) => {
    const h1 = Math.floor(wa.height * 0.7);
    return [
      { x: wa.x, y: wa.y,      width: wa.width, height: h1               },
      { x: wa.x, y: wa.y + h1, width: wa.width, height: wa.height - h1   },
    ];
  },
};

function applyLayout(presetId, sessions, displayId = null) {
  const preset = PRESETS[presetId];
  if (!preset) throw new Error(`Unknown layout preset: ${presetId}`);

  const display = displayId
    ? screen.getAllDisplays().find(d => d.id === displayId)
    : screen.getPrimaryDisplay();
  if (!display) throw new Error('Display not found');

  const rects = preset(display.workArea);

  sessions.forEach((s, i) => {
    if (s.hwnd && rects[i]) {
      const r = rects[i];
      placeWindow(s.hwnd, {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
      });
    }
  });
}

module.exports = { applyLayout, PRESETS };
