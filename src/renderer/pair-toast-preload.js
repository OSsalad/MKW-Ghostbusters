const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toast', {
  onInitiator: (cb) => ipcRenderer.on('toast:initiator', (_e, d) => cb(d)),
  submit: (pin) => ipcRenderer.invoke('toast:submit', pin),
  cancel: () => ipcRenderer.send('toast:cancel'),
  close: () => ipcRenderer.send('toast:close'),
});
