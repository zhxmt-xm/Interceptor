import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, session } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  type CoreProcessStatus,
} from '../shared/desktop-api';
import { CoreRuntime } from './core/core-runtime';
import { isTrustedRendererUrl } from './security/trusted-renderer-url';
import {
  assertBoundedString,
  assertIdentifier,
  toRendererDiagnosticRecord,
} from './utils/renderer-utils';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/** Electron Main 应用所有者：窗口、安全策略、CoreRuntime 和 Renderer IPC。 */
class DesktopApplication {
  private readonly coreRuntime = new CoreRuntime();
  private quitting = false;

  start(): void {
    void app.whenReady().then(() => this.onReady());
    app.on('activate', () => this.onActivate());
    app.on('window-all-closed', () => this.onAllWindowsClosed());
    app.on('before-quit', (event) => this.onBeforeQuit(event));
  }

  private onReady(): void {
    this.configureSessionSecurity();
    this.configureRendererIpc();
    this.coreRuntime.onCoreProcessStatusChange((status) => {
      this.broadcastCoreProcessStatus(status);
    });
    this.coreRuntime.start();
    this.createMainWindow();
  }

  private onActivate(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createMainWindow();
    }
  }

  private onAllWindowsClosed(): void {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  private onBeforeQuit(event: Electron.Event): void {
    if (this.quitting) {
      return;
    }

    // 先让 CoreProcess 完成清理；超时强杀由 CoreRuntime 统一兜底。
    event.preventDefault();
    this.quitting = true;
    void this.coreRuntime.stop().finally(() => {
      app.quit();
    });
  }

  private createMainWindow(): BrowserWindow {
    const mainWindow = new BrowserWindow({
      autoHideMenuBar: process.platform !== 'darwin',
      icon: this.getWindowIconPath(),
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
      if (!this.isTrustedRendererNavigation(url)) {
        event.preventDefault();
      }
    });
    mainWindow.webContents.on('will-redirect', (event, url) => {
      if (!this.isTrustedRendererNavigation(url)) {
        event.preventDefault();
      }
    });
    mainWindow.webContents.session.on('will-download', (event) => {
      event.preventDefault();
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      void mainWindow.loadFile(this.getPackagedRendererPath());
    }
    return mainWindow;
  }

  private configureSessionSecurity(): void {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault());
    });
    app.on('open-url', (event) => event.preventDefault());
  }

  private configureRendererIpc(): void {
    // CoreProcess 状态只来自 heartbeat，不代表代理监听、存储等业务一定可用。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.coreGetProcessStatus, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.coreRuntime.getCoreProcessStatus();
    });

    // 业务请求统一走 CoreRuntime；Main 只做权限校验与 Renderer DTO 映射。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreEcho,
      async (event, value: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertBoundedString(value, 'value', 4_096);
        const traceId = `trace-${randomUUID()}`;
        const result = await this.coreRuntime.request(
          { type: 'echo', payload: { value } },
          { traceId },
        );
        return {
          value: result.payload.value,
          handledAt: result.payload.handledAt,
          traceId,
        };
      },
    );
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreGetTrace,
      async (event, traceId: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertIdentifier(traceId, 'traceId');
        const result = await this.coreRuntime.request({
          type: 'diagnostics.recent',
          payload: { limit: 200, traceId },
        });
        return {
          traceId,
          records: result.payload.records.map((record) =>
            toRendererDiagnosticRecord(record)),
          droppedCount: result.payload.droppedCount,
        };
      },
    );
  }

  private broadcastCoreProcessStatus(status: CoreProcessStatus): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(
          DESKTOP_IPC_CHANNELS.coreProcessStatus,
          status,
        );
      }
    }
  }

  private assertTrustedSender(senderUrl: string | undefined): void {
    if (!senderUrl || !this.isTrustedRendererNavigation(senderUrl)) {
      throw new Error('Rejected IPC request from an untrusted sender');
    }
  }

  private isTrustedRendererNavigation(url: string): boolean {
    return isTrustedRendererUrl(url, {
      devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
      packagedRendererPath: this.getPackagedRendererPath(),
    });
  }

  private getPackagedRendererPath(): string {
    return path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    );
  }

  private getWindowIconPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'interceptor-icon.png')
      : path.resolve(app.getAppPath(), 'assets/interceptor-icon.png');
  }
}

new DesktopApplication().start();