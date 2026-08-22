const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, session, shell, Tray } = require('electron');

let mainWindow;
let tray;
let selectedDisplaySourceId;
let isQuitting = false;
let pendingDeepLink;
pendingDeepLink = process.argv.find((argument) => argument.startsWith('voiceroom://'));

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = commandLine.find((argument) => argument.startsWith('voiceroom://'));
    if (deepLink) sendDeepLink(deepLink);
    showWindow();
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  pendingDeepLink = url;
  sendDeepLink(url);
});

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.setSkipTaskbar(false);
}

function sendDeepLink(url) {
  if (!url) return;
  pendingDeepLink = url;
  if (mainWindow?.webContents && !mainWindow.isDestroyed()) {
    showWindow();
    mainWindow.webContents.send('deep-link', url);
  }
}

function createTray() {
  if (tray) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#65d7a2"/><path d="M4 4h2.2L8 8.3 9.8 4H12L9.1 11H6.9z" fill="#07150f"/></svg>';
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  tray = new Tray(icon);
  tray.setToolTip('VoiceRoom');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir VoiceRoom', click: showWindow },
    { type: 'separator' },
    {
      label: 'Sair completamente',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        mainWindow?.destroy();
        app.quit();
      }
    }
  ]));
  tray.on('click', showWindow);
}

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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    createTray();
    if (pendingDeepLink) {
      const deepLink = pendingDeepLink;
      pendingDeepLink = undefined;
      mainWindow.webContents.send('deep-link', deepLink);
    }
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    mainWindow.setSkipTaskbar(true);
  });
  mainWindow.on('show', () => mainWindow.setSkipTaskbar(false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('voiceroom');
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
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // A janela é ocultada para a bandeja; a chamada continua viva até o usuário
  // escolher "Sair completamente" no menu da bandeja.
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  tray?.destroy();
});
