const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceRoom', Object.freeze({
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getScreenSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),
  selectScreenSource: (sourceId) => ipcRenderer.invoke('desktop-capturer:select-source', sourceId),
  onDeepLink: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, url) => callback(url);
    ipcRenderer.on('deep-link', listener);
    return () => ipcRenderer.removeListener('deep-link', listener);
  },
  platform: process.platform
}));
