const { contextBridge, ipcRenderer } = require('electron');
const CH = require('../shared/ipc-channels');

const groupArg = process.argv.find(a => a.startsWith('--group-id='));
const groupId  = groupArg ? groupArg.split('=')[1] : null;

contextBridge.exposeInMainWorld('gameBridge', {
  groupId,
  onUpdate:        (cb) => ipcRenderer.on(CH.GAME_UPDATE,        (_e, data) => cb(data)),
  onFocusWebview:  (cb) => ipcRenderer.on(CH.GAME_FOCUS_WEBVIEW, (_e, data) => cb(data)),
  ready:           ()   => ipcRenderer.send(CH.GAME_READY),
  saveLayoutRatio:  (ratio) => ipcRenderer.invoke(CH.SAVE_LAYOUT_RATIO,    { groupId, ratio }),
  reportRatio:      (ratio) => ipcRenderer.send(CH.LAYOUT_RATIO_CHANGED, { groupId, ratio }),
  reportFocus:      (id)    => ipcRenderer.send(CH.GAME_REPORT_FOCUS, { groupId, id }),
  openDashboard:    ()      => ipcRenderer.send(CH.OPEN_DASHBOARD),
});
