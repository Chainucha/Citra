let timer   = null;
let running = false;

// Poll cadence — ms between cursor reads. 8ms ≈ 120Hz, smooth and well above
// human perception. Each tick is microseconds (GetCursorPos + array find), so
// CPU cost is negligible. Independent of Electron event-loop backpressure.
const POLL_MS = 8;

// Rect cache TTL — rebuild bounds every N polls or on miss.
const CACHE_TTL_MS = 250;

/**
 * Start hover-to-focus. Read-only — no input synthesis.
 * Polls cursor via Win32 GetCursorPos on a setInterval; bypasses uiohook
 * event-queue backpressure that caused noticeable lag under load.
 */
function start(getSessions) {
  if (running) return;

  const { getRect, focusWindow } = require('./win32/windowOps');
  const w = require('./win32/bindings');

  let cache    = [];   // [{ hwnd, x, y, x2, y2 }]
  let cachedAt = 0;
  let lastHwnd = null;
  const ptOut = [{}];

  function rebuildCache() {
    const sessions = getSessions();
    const seen = new Set();
    cache = [];
    for (const s of sessions) {
      if (!s.hwnd || seen.has(s.hwnd)) continue;
      seen.add(s.hwnd);
      try {
        const r = getRect(s.hwnd);
        cache.push({
          hwnd: s.hwnd,
          x: r.x, y: r.y,
          x2: r.x + r.width, y2: r.y + r.height,
        });
      } catch { /* dead hwnd — skip */ }
    }
    cachedAt = Date.now();
  }

  function findHit(x, y) {
    if (lastHwnd) {
      const last = cache.find(r => r.hwnd === lastHwnd);
      if (last && x >= last.x && x < last.x2 && y >= last.y && y < last.y2) return last;
    }
    return cache.find(r => x >= r.x && x < r.x2 && y >= r.y && y < r.y2);
  }

  timer = setInterval(() => {
    if (Date.now() - cachedAt > CACHE_TTL_MS) rebuildCache();

    if (!w.GetCursorPos(ptOut)) return;
    const { x, y } = ptOut[0];

    let hit = findHit(x, y);
    if (!hit) {
      rebuildCache();
      hit = findHit(x, y);
    }
    if (!hit) { lastHwnd = null; return; }

    if (hit.hwnd === lastHwnd) return;
    if (w.GetForegroundWindow() === hit.hwnd) {
      lastHwnd = hit.hwnd;
      return;
    }

    focusWindow(hit.hwnd);
    lastHwnd = hit.hwnd;
  }, POLL_MS);

  running = true;
}

function stop() {
  if (!running) return;
  clearInterval(timer);
  timer = null;
  running = false;
}

module.exports = { start, stop };
