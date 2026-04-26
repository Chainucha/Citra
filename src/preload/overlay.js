const { contextBridge, ipcRenderer } = require('electron');
const CH = require('../shared/ipc-channels');

const params = new URLSearchParams(location.search);

contextBridge.exposeInMainWorld('overlayBridge', {
  sessionId:    params.get('sessionId'),
  label:        params.get('label'),
  color:        params.get('color'),
  setInteractive: (on) =>
    ipcRenderer.send(CH.OVERLAY_INTERACTIVE, { sessionId: params.get('sessionId'), on }),
  focusSession: () =>
    ipcRenderer.send(CH.OVERLAY_FOCUS, { sessionId: params.get('sessionId') }),
});
