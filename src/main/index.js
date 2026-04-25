const { randomUUID } = require('crypto');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const CH = require('../shared/ipc-channels');
const { launchSession, closeSession } = require('./browserInstanceManager');

// Single instance — two Sunkists would fight over hotkeys
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('high-dpi-support', '1');

const store = new Store({ name: 'sunkist' });

// Runtime state (HWNDs are not persisted — they change each launch)
const workspace = loadWorkspace();

function loadWorkspace() {
  const saved = store.get('workspace');
  if (saved) {
    // Strip runtime-only fields
    saved.sessions.forEach(s => { s.hwnd = null; s.pid = null; s.state = 'idle'; });
    return saved;
  }
  return {
    id: randomUUID(),
    name: 'Default',
    sessions: [],
    activePreset: 'split-h-50',
    lockLayout: false,
    overlayVisible: true,
  };
}

let dashboard;

function createDashboard() {
  dashboard = new BrowserWindow({
    width: 980, height: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/dashboard.js'),
    },
  });
  dashboard.loadFile(path.join(__dirname, '../renderer/dashboard/index.html'));
  if (process.env.NODE_ENV === 'dev') dashboard.webContents.openDevTools();
}

app.whenReady().then(() => {
  createDashboard();

  ipcMain.handle(CH.GET_WORKSPACE, () => workspace);

  ipcMain.handle(CH.ADD_SESSION, (_e, { name }) => {
    const session = {
      id: randomUUID(),
      name,
      browserPath: null,   // null = auto-detect Chrome
      url: 'https://universe.flyff.com/play',
      hotkey: null,        // null = use index default (Ctrl+Alt+1, Ctrl+Alt+2)
      accentColor: workspace.sessions.length === 0 ? '#F59E0B' : '#06B6D4',
      hwnd: null,
      pid: null,
      state: 'idle',       // idle | launching | tracking | arranged | active
    };
    workspace.sessions.push(session);
    return session;
  });

  ipcMain.handle(CH.SAVE_WORKSPACE, (_e, patch) => {
    Object.assign(workspace, patch);
    const toSave = {
      ...workspace,
      sessions: workspace.sessions.map(({ hwnd, pid, state, ...rest }) => rest),
    };
    store.set('workspace', toSave);
    return true;
  });

  ipcMain.handle(CH.LAUNCH_SESSION, async (_e, { id }) => {
    const session = workspace.sessions.find(s => s.id === id);
    if (!session) return { error: 'Session not found' };

    session.state = 'launching';
    dashboard.webContents.send(CH.SESSION_STATE_CHANGED, { ...session });

    try {
      const { pid, hwnd } = await launchSession(session);
      session.pid   = pid;
      session.hwnd  = hwnd;
      session.state = 'tracking';
    } catch (err) {
      session.state = 'idle';
      return { error: err.message };
    }

    dashboard.webContents.send(CH.SESSION_STATE_CHANGED, { ...session });
    return { ok: true };
  });

  ipcMain.handle(CH.CLOSE_SESSION, (_e, { id }) => {
    const session = workspace.sessions.find(s => s.id === id);
    if (!session) return;
    closeSession(session);
    session.hwnd  = null;
    session.pid   = null;
    session.state = 'idle';
    dashboard.webContents.send(CH.SESSION_STATE_CHANGED, { ...session });
    return { ok: true };
  });

  // Remaining handlers added in later tasks
});

app.on('window-all-closed', () => {
  if (!dashboard || dashboard.isDestroyed()) app.quit();
});

module.exports = { workspace };
