let uIOhook = null;
let running  = false;

/**
 * Start hover-to-focus. Read-only hook — no input synthesis, no fire/post/inject calls.
 * Gated behind settings toggle; default OFF.
 */
function start(getSessions, { delayMs = 400 } = {}) {
  if (running) return;
  try {
    uIOhook = require('uiohook-napi').uIOhook;
  } catch {
    console.warn('[hover-focus] uiohook-napi not installed — hover focus unavailable.');
    return;
  }

  const { getRect, focusWindow } = require('./win32/windowOps');

  let hoverTarget = null;
  let hoverStart  = 0;

  uIOhook.on('mousemove', (e) => {
    const sessions = getSessions().filter(s => s.hwnd);
    const inside = sessions.find(s => {
      try {
        const r = getRect(s.hwnd);
        return e.x >= r.x && e.x < r.x + r.width
            && e.y >= r.y && e.y < r.y + r.height;
      } catch { return false; }
    });

    if (inside?.id !== hoverTarget?.id) {
      hoverTarget = inside || null;
      hoverStart  = Date.now();
    } else if (inside && Date.now() - hoverStart >= delayMs) {
      focusWindow(inside.hwnd);
      hoverStart = Infinity; // don't re-focus until pointer leaves and re-enters
    }
  });

  uIOhook.start();
  running = true;
}

function stop() {
  if (!running || !uIOhook) return;
  uIOhook.stop();
  running = false;
}

module.exports = { start, stop };
