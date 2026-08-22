const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = require('electron');

let mainWindow;
let selectedDisplaySourceId;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1_080,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e1117',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'fullscreen');
  });

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('desktop-capturer:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 }
    });
    return sources.map((source) => ({ id: source.id, name: source.name }));
  });
  ipcMain.handle('desktop-capturer:select-source', (_event, sourceId) => {
    if (typeof sourceId !== 'string' || sourceId.length < 1 || sourceId.length > 200) return false;
    selectedDisplaySourceId = sourceId;
    return true;
  });
  if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function') {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 }
      });
      const selected = sources.find((source) => source.id === selectedDisplaySourceId) || sources.find((source) => source.id.startsWith('screen:')) || sources[0];
      selectedDisplaySourceId = undefined;
      const streams = selected ? { video: selected } : {};
      if (selected && request.audioRequested && process.platform === 'win32') {
        streams.audio = 'loopback';
      }
      callback(streams);
    });
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
