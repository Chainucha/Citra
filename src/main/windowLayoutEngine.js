const { screen } = require('electron');
const { placeWindow } = require('./win32/windowOps');

// Presets receive physical-pixel workArea and return [rect, rect] in physical pixels.
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

  // workArea is in logical pixels; SetWindowPos needs physical pixels
  const sf = display.scaleFactor;
  const wa = display.workArea;
  const physWa = {
    x:      Math.round(wa.x      * sf),
    y:      Math.round(wa.y      * sf),
    width:  Math.round(wa.width  * sf),
    height: Math.round(wa.height * sf),
  };

  const rects = preset(physWa);

  sessions.forEach((s, i) => {
    if (s.hwnd && rects[i]) placeWindow(s.hwnd, rects[i]);
  });
}

module.exports = { applyLayout, PRESETS };
