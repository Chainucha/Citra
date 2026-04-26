const koffi = require('koffi');
const w = require('./bindings');

const BROWSER_CLASS_RE = /^(Chrome_WidgetWin_|MozillaWindowClass)/;

/**
 * Find all top-level visible windows for a given PID matching browser class.
 * koffi.register/unregister pair is required to avoid callback trampoline leaks.
 */
function findWindowsByPid(targetPid) {
  const handles = [];

  const cb = koffi.register((hwnd, _lp) => {
    const pidOut = [0];
    w.GetWindowThreadProcessId(hwnd, pidOut);
    if (pidOut[0] !== targetPid || !w.IsWindowVisible(hwnd)) return 1;

    const buf = Buffer.alloc(512);
    const len = w.GetClassName(hwnd, buf, 256);
    const className = buf.slice(0, len * 2).toString('utf16le');
    if (BROWSER_CLASS_RE.test(className)) handles.push(hwnd);
    return 1; // continue enumeration
  }, koffi.pointer(w.EnumWindowsProc));

  try {
    w.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return handles;
}

/**
 * Poll until at least one browser window appears for pid (browsers take 800–2000ms).
 * Pass childProcess (ChildProcess) for early abort if the process dies before window appears.
 */
async function waitForWindow(pid, { timeoutMs = 10_000, pollMs = 200, childProcess = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childProcess && childProcess.exitCode !== null) {
      throw new Error(`Process PID ${pid} exited (code ${childProcess.exitCode}) before window appeared`);
    }
    const found = findWindowsByPid(pid);
    if (found.length > 0) return found[0];
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`Window for PID ${pid} did not appear within ${timeoutMs}ms`);
}

/** Move/resize without stealing focus. */
function placeWindow(hwnd, { x, y, width, height }) {
  const flags = w.SWP_NOZORDER | w.SWP_NOACTIVATE | w.SWP_ASYNCWINDOWPOS;
  w.SetWindowPos(hwnd, w.HWND_TOP, x, y, width, height, flags);
}

/** Get window position/size. */
function getRect(hwnd) {
  const out = [{}];
  w.GetWindowRect(hwnd, out);
  const r = out[0];
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

/** Reliably bring window to foreground using AttachThreadInput. */
function focusWindow(hwnd) {
  const fg = w.GetForegroundWindow();
  if (fg === hwnd) return;          // already foreground, nothing to do
  if (!fg) { w.SetForegroundWindow(hwnd); return; }

  const fgPidOut = [0];
  const fgThread = w.GetWindowThreadProcessId(fg, fgPidOut);
  const myThread = w.GetCurrentThreadId();

  if (fgThread !== myThread) {
    w.AttachThreadInput(myThread, fgThread, 1);
    try {
      w.BringWindowToTop(hwnd);
      w.SetForegroundWindow(hwnd);
    } finally {
      w.AttachThreadInput(myThread, fgThread, 0);
    }
  } else {
    w.SetForegroundWindow(hwnd);
  }
}

module.exports = { findWindowsByPid, waitForWindow, placeWindow, getRect, focusWindow };
