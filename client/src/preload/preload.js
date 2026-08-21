const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceRoom', Object.freeze({
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getScreenSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),
  selectScreenSource: (sourceId) => ipcRenderer.invoke('desktop-capturer:select-source', sourceId),
  platform: process.platform
}));
