import path from 'node:path';

import { app, BrowserWindow, ipcMain, session } from 'electron';

import type { CoreStatus } from '../shared/desktop-api';
import { CoreSupervisor } from './core/core-supervisor';
import { createElectronCoreProcess } from './core/electron-core-process';
import { isTrustedRendererUrl } from './security/trusted-renderer-url';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const CORE_STATUS_CHANNEL = 'core:status';
const CORE_GET_STATUS_CHANNEL = 'core:get-status';

const coreSupervisor = new CoreSupervisor({
  createProcess: createElectronCoreProcess,
});

let quitting = false;

app.whenReady().then(() => {
  configureSessionSecurity();
  configureIpc();
  coreSupervisor.onStatusChange(broadcastCoreStatus);
  coreSupervisor.start();
  createMainWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (quitting) {
    return;
  }

  event.preventDefault();
  quitting = true;
  void coreSupervisor.stop().finally(() => app.quit());
});

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: process.platform !== 'darwin',
    icon: getWindowIconPath(),
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#f2f4f5',
    show: false,
    title: 'Interceptor',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
    },
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererNavigation(url)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isTrustedRendererNavigation(url)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.session.on('will-download', (event) => {
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      getPackagedRendererPath(),
    );
  }

  return mainWindow;
}

function configureSessionSecurity(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  app.on('open-url', (event) => event.preventDefault());
}

function configureIpc(): void {
  ipcMain.handle(CORE_GET_STATUS_CHANNEL, (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return coreSupervisor.getStatus();
  });
}

function broadcastCoreStatus(status: CoreStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(CORE_STATUS_CHANNEL, status);
    }
  }
}

function assertTrustedSender(senderUrl: string | undefined): void {
  if (senderUrl && isTrustedRendererNavigation(senderUrl)) {
    return;
  }

  throw new Error('Rejected IPC request from an untrusted sender');
}

function isTrustedRendererNavigation(url: string): boolean {
  return isTrustedRendererUrl(url, {
    devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    packagedRendererPath: getPackagedRendererPath(),
  });
}

function getPackagedRendererPath(): string {
  return path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
}

function getWindowIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'interceptor-icon.png');
  }

  return path.resolve(app.getAppPath(), 'assets/interceptor-icon.png');
}