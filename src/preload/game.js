const { contextBridge, ipcRenderer } = require('electron');
const CH = require('../shared/ipc-channels');

contextBridge.exposeInMainWorld('gameBridge', {
  onUpdate: (cb) => ipcRenderer.on(CH.GAME_UPDATE, (_e, data) => cb(data)),
  ready:    ()   => ipcRenderer.send(CH.GAME_READY),
});
