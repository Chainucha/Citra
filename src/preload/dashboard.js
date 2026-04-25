const { contextBridge, ipcRenderer } = require('electron');
const CH = require('../shared/ipc-channels');

contextBridge.exposeInMainWorld('sunkist', {
  getWorkspace:    ()       => ipcRenderer.invoke(CH.GET_WORKSPACE),
  launchSession:   (id)     => ipcRenderer.invoke(CH.LAUNCH_SESSION, { id }),
  closeSession:    (id)     => ipcRenderer.invoke(CH.CLOSE_SESSION,  { id }),
  applyLayout:     (preset) => ipcRenderer.invoke(CH.APPLY_LAYOUT,   { preset }),
  addSession:      (name)   => ipcRenderer.invoke(CH.ADD_SESSION,    { name }),
  focusSession:    (id)     => ipcRenderer.invoke(CH.FOCUS_SESSION,  { id }),
  saveWorkspace:   (data)   => ipcRenderer.invoke(CH.SAVE_WORKSPACE, data),
  onSessionChanged:(cb)     => ipcRenderer.on(CH.SESSION_STATE_CHANGED, (_e, s) => cb(s)),
});
