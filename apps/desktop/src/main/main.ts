import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, session } from 'electron';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import {
  DESKTOP_IPC_CHANNELS,
  type CoreDiagnosticRecord,
  type CoreProcessStatus,
} from '../shared/desktop-api';
import { CoreRpcClient } from './core/core-rpc-client';
import { CoreSupervisor } from './core/core-supervisor';
import { createElectronCoreProcess } from './core/core-process-adapter';
import { isTrustedRendererUrl } from './security/trusted-renderer-url';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/** Electron Main 的应用级所有者：窗口、安全策略、Core 生命周期和 Renderer IPC。 */
class DesktopApplication {
  private readonly rpcClient = new CoreRpcClient();
  private readonly coreSupervisor = new CoreSupervisor({
    createProcess: () => createElectronCoreProcess(this.rpcClient),
  });
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
    this.coreSupervisor.onProcessStatusChange((status) => {
      this.broadcastProcessStatus(status);
    });
    this.coreSupervisor.start();
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

    // 先让 Core 有机会完成清理；超时强杀由 CoreSupervisor 统一兜底。
    event.preventDefault();
    this.quitting = true;
    void this.coreSupervisor.stop().finally(() => {
      this.rpcClient.close();
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
    // 进程状态只来自 heartbeat，它不代表代理监听、存储等业务一定可用。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.coreGetProcessStatus, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.coreSupervisor.getProcessStatus();
    });

    // 业务请求统一走 CoreRpcClient；Main 只做权限校验与 Renderer DTO 映射。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreEcho,
      async (event, value: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        this.assertBoundedString(value, 'value', 4_096);
        const traceId = `trace-${randomUUID()}`;
        const result = await this.rpcClient.request(
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
        this.assertIdentifier(traceId, 'traceId');
        const result = await this.rpcClient.request({
          type: 'diagnostics.recent',
          payload: { limit: 200, traceId },
        });
        return {
          traceId,
          records: result.payload.records.map((record) =>
            this.toRendererDiagnosticRecord(record)),
          droppedCount: result.payload.droppedCount,
        };
      },
    );
  }

  private broadcastProcessStatus(status: CoreProcessStatus): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(
          DESKTOP_IPC_CHANNELS.coreProcessStatus,
          status,
        );
      }
    }
  }

  private toRendererDiagnosticRecord(
    record: DiagnosticLogRecord,
  ): CoreDiagnosticRecord {
    return {
      timestamp: record.timestamp,
      sequence: record.sequence,
      level: record.level,
      requestId: record.requestId,
      command: record.command,
      phase: record.phase,
      action: record.action,
      durationMs: record.durationMs,
      outcome: record.outcome,
      errorCode: record.errorCode,
    };
  }

  private assertBoundedString(
    value: unknown,
    name: string,
    maxLength: number,
  ): asserts value is string {
    if (typeof value !== 'string' || value.length > maxLength) {
      throw new Error(`${name} is invalid`);
    }
  }

  private assertIdentifier(
    value: unknown,
    name: string,
  ): asserts value is string {
    if (
      typeof value !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ) {
      throw new Error(`${name} is invalid`);
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