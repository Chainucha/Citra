const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const { waitForWindow } = require('./win32/windowOps');

const PROFILES_ROOT = path.join(app.getPath('userData'), 'profiles');

function profileDirFor(sessionId) {
  const dir = path.join(PROFILES_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    // Edge as fallback
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/**
 * Launch browser with isolated profile. Returns updated session with pid + hwnd.
 * Throws if no browser found or window doesn't appear within timeout.
 *
 * Deliberately omitted args: --remote-debugging-port, --load-extension,
 * --enable-automation, --disable-web-security.
 */
async function launchSession(session) {
  const exe = session.browserPath || defaultChromePath();
  if (!exe) throw new Error('No browser found. Set browserPath in session settings.');

  const profile = profileDirFor(session.id);
  const args = [
    `--user-data-dir=${profile}`,
    '--new-window',
    session.url || 'https://universe.flyff.com/play',
  ];

  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref(); // Sunkist crash must not kill the game

  const hwnd = await waitForWindow(child.pid, { childProcess: child });
  return { pid: child.pid, hwnd };
}

function closeSession(session) {
  if (!session.pid) return;
  try {
    process.kill(session.pid, 'SIGTERM');
  } catch { /* already gone */ }
}

module.exports = { launchSession, closeSession, defaultChromePath };
