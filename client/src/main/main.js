const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, session, shell, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let tray;
let selectedDisplaySourceId;
let isQuitting = false;
let pendingDeepLink;
let updateCheckTimer;
let updateState = Object.freeze({ status: 'unavailable' });
pendingDeepLink = process.argv.find((argument) => argument.startsWith('voiceroom://'));

const UPDATE_CHECK_DELAY_MS = 15_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

function publishUpdateState(nextState) {
  updateState = Object.freeze({
    ...nextState,
    checkedAt: Date.now()
  });
  if (mainWindow?.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update-state', updateState);
  }
}

function formatUpdateError(error) {
  const message = String(error?.message || error || 'Não foi possível verificar atualizações.');
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

async function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    publishUpdateState({ status: 'unavailable', reason: 'development' });
    return updateState;
  }
  if (updateState.status === 'downloading') return updateState;
  publishUpdateState({ status: 'checking', manual });
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      publishUpdateState({
        status: 'idle',
        version: result?.updateInfo?.version || app.getVersion(),
        manual
      });
    }
    return updateState;
  } catch (error) {
    publishUpdateState({ status: 'error', message: formatUpdateError(error), manual });
    return updateState;
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) {
    publishUpdateState({ status: 'unavailable', reason: 'development' });
    return;
  }

  // O download acontece em segundo plano e a instalação fica para a saída do
  // app, evitando interromper uma chamada em andamento.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => publishUpdateState({
    status: 'available',
    version: info?.version || 'nova',
    releaseDate: info?.releaseDate || null
  }));
  autoUpdater.on('download-progress', (progress) => publishUpdateState({
    status: 'downloading',
    version: updateState.version || null,
    percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
    transferred: progress?.transferred || 0,
    total: progress?.total || 0
  }));
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({
    status: 'downloaded',
    version: info?.version || updateState.version || 'nova'
  }));
  autoUpdater.on('update-not-available', (info) => publishUpdateState({
    status: 'idle',
    version: info?.version || app.getVersion()
  }));
  autoUpdater.on('error', (error) => publishUpdateState({
    status: 'error',
    message: formatUpdateError(error)
  }));

  updateCheckTimer = setTimeout(() => {
    checkForUpdates();
    updateCheckTimer = setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  }, UPDATE_CHECK_DELAY_MS);
}

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
  const iconFile = process.platform === 'win32' ? 'voice-icon.ico' : 'voice-icon.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', iconFile));
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
    width: 1_200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'voice-icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0e1117',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu?.();

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
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'fullscreen');
  });

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-update-state', () => updateState);
  ipcMain.handle('app:update-check', () => checkForUpdates({ manual: true }));
  ipcMain.handle('app:update-install', () => {
    if (updateState.status !== 'downloaded') return false;
    isQuitting = true;
    tray?.destroy();
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
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
  configureAutoUpdates();

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
  if (updateCheckTimer) {
    clearTimeout(updateCheckTimer);
    clearInterval(updateCheckTimer);
    updateCheckTimer = undefined;
  }
  tray?.destroy();
});
