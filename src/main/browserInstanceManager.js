const { BrowserWindow } = require('electron');
const path = require('path');

let containerWin = null;

function ensureContainer(onClosedOnce) {
  if (containerWin && !containerWin.isDestroyed()) return containerWin;

  containerWin = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/game.js'),
    },
  });

  containerWin.maximize();
  containerWin.loadFile(path.join(__dirname, '../renderer/game/index.html'));
  containerWin.on('closed', () => {
    containerWin = null;
    if (onClosedOnce) onClosedOnce();
  });

  return containerWin;
}

function sendToContainer(channel, payload) {
  if (containerWin && !containerWin.isDestroyed()) {
    containerWin.webContents.send(channel, payload);
  }
}

function getContainerHwnd() {
  if (!containerWin || containerWin.isDestroyed()) return null;
  return Number(containerWin.getNativeWindowHandle().readBigUInt64LE(0));
}

function destroyContainer() {
  if (containerWin && !containerWin.isDestroyed()) containerWin.destroy();
  containerWin = null;
}

function isContainerAlive() {
  return containerWin != null && !containerWin.isDestroyed();
}

function maximizeContainer() {
  if (containerWin && !containerWin.isDestroyed()) containerWin.maximize();
}

module.exports = { ensureContainer, sendToContainer, getContainerHwnd, destroyContainer, isContainerAlive, maximizeContainer };
