import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, safeStorage, session } from 'electron';

import { MAX_BODY_CHUNK_BYTES } from '@interceptor/core-protocol';

import {
  DESKTOP_IPC_CHANNELS,
  type CaptureExchangeEvent,
  type CertificateInfo,
  type CoreProcessStatus,
} from '../shared/desktop-api';
import { CertificateService } from './certificates/certificate-service';
import { TrustStoreService } from './certificates/trust-store-service';
import { CoreRuntime } from './core/core-runtime';
import { isTrustedRendererUrl } from './security/trusted-renderer-url';
import {
  assertBoundedString,
  assertIdentifier,
  assertOptionalPort,
  toByteRange,
  toCoreSessionQuery,
  toInsecureHosts,
  toRendererCaptureStatus,
  toRendererDiagnosticRecord,
  toRendererStorageUsage,
} from './utils/renderer-utils';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/** Electron Main 应用所有者：窗口、安全策略、CoreRuntime 、证书与 Renderer IPC。 */
class DesktopApplication {
  private readonly coreRuntime = new CoreRuntime();
  private certificateService: CertificateService | null = null;
  private readonly trustStore = new TrustStoreService();
  /** per-host 源站证书不安全例外；下发 Core 供 MITM passThrough 忽略源站证书错误。 */
  private insecureHosts: string[] = [];
  private quitting = false;

  start(): void {
    void app.whenReady().then(() => this.onReady());
    app.on('activate', () => this.onActivate());
    app.on('window-all-closed', () => this.onAllWindowsClosed());
    app.on('before-quit', (event) => this.onBeforeQuit(event));
  }

  private onReady(): void {
    this.configureSessionSecurity();
    this.certificateService = new CertificateService({
      dataDir: path.join(app.getPath('userData'), 'certificates'),
      secureStore: safeStorage,
    });
    this.configureRendererIpc();
    this.coreRuntime.onCoreProcessStatusChange((status) => {
      this.broadcastCoreProcessStatus(status);
    });
    this.coreRuntime.onCaptureEvents((events) => {
      this.broadcastCaptureEvents(events);
    });
    // 新 CoreProcess 就绪后下发 CA 材料（若已生成），启用 HTTPS MITM。
    this.coreRuntime.onCoreProcessReady(() => {
      void this.provisionCoreTls();
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

    // 存储用量只读查询；数据库与 Blob 路径不暴露给 Renderer。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.storageGetStatus, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'storage.status',
        payload: {},
      });
      return toRendererStorageUsage(result.payload);
    });

    // 清空全部捕获数据属于破坏性操作，由 Renderer 侧显式确认后调用。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.storageClear, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'storage.cleanup',
        payload: { scope: 'all' },
      });
      return toRendererStorageUsage(result.payload);
    });

    // 启动代理捕获：可选端口，未指定由 Core 选默认监听端口。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.captureStart,
      async (event, port: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertOptionalPort(port);
        const result = await this.coreRuntime.request({
          type: 'proxy.start',
          payload: port === undefined ? {} : { port },
        });
        return toRendererCaptureStatus(result.payload);
      },
    );

    // 停止代理捕获；返回停止后的捕获状态快照。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.captureStop, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'proxy.stop',
        payload: {},
      });
      return toRendererCaptureStatus(result.payload);
    });

    // 只读捕获状态查询；Renderer 启动时同步一次运行态。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.captureGetStatus, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'proxy.status',
        payload: {},
      });
      return toRendererCaptureStatus(result.payload);
    });

    // 会话分页查询；对 Renderer 不可信输入做结构与范围校验后转交 Core。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.sessionsQuery,
      async (event, request: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const query = toCoreSessionQuery(request);
        const result = await this.coreRuntime.request({
          type: 'sessions.query',
          payload: query,
        });
        return {
          items: result.payload.items,
          nextCursor: result.payload.nextCursor,
          hasMore: result.payload.hasMore,
        };
      },
    );

    // 单条 Exchange 详情按需查询（Inspector 选中行时）。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.sessionsDetail,
      async (event, exchangeId: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertIdentifier(exchangeId, 'exchangeId');
        const result = await this.coreRuntime.request({
          type: 'sessions.detail',
          payload: { exchangeId },
        });
        return result.payload.detail;
      },
    );

    // 按需分块读取正文字节；offset/length 在边界校验，避免过大读取。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.bodyReadRange,
      async (event, bodyId: unknown, offset: unknown, length: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertIdentifier(bodyId, 'bodyId');
        const range = toByteRange(offset, length, MAX_BODY_CHUNK_BYTES);
        const result = await this.coreRuntime.request({
          type: 'body.read-range',
          payload: { bodyId, offset: range.offset, length: range.length },
        });
        return {
          offset: result.payload.offset,
          data: result.payload.data,
          end: result.payload.end,
        };
      },
    );

    // CA 只读状态查询（present/trusted/supported + 公开指纹）；私钥不暴露。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caStatus, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.buildCertificateInfo();
    });

    // 生成（或重新生成）Root CA；生成不自动信任，需用户单独安装后才启用 MITM。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caGenerate, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      await this.requireCertificateService().regenerate();
      await this.provisionCoreTls();
      return this.buildCertificateInfo();
    });

    // 安装 CA 到当前用户信任库（用户显式授权的破坏性系统操作），随后启用 MITM。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caInstall, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const service = this.requireCertificateService();
      await service.ensure();
      await this.trustStore.install(service.getCertificatePath());
      await this.provisionCoreTls();
      return this.buildCertificateInfo();
    });

    // 按 SHA-1 thumbprint 从信任库精确移除 CA，随后禁用 MITM。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caUninstall, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const thumbprints = await this.requireCertificateService().getThumbprints();
      if (thumbprints) {
        await this.trustStore.uninstall(thumbprints.sha1);
      }
      await this.provisionCoreTls();
      return this.buildCertificateInfo();
    });

    // 源站证书不安全例外（per-host）只读查询。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.httpsGetInsecureHosts, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return [...this.insecureHosts];
    });

    // 更新 per-host 不安全例外并重下发给 Core；每项在边界校验为有界 host。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.httpsSetInsecureHosts,
      async (event, hosts: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        this.insecureHosts = toInsecureHosts(hosts);
        await this.provisionCoreTls();
        return [...this.insecureHosts];
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

  // 把 Core 推送的实时捕获事件批广播给所有 Renderer 窗口；Renderer 侧合并进视图状态。
  private broadcastCaptureEvents(events: CaptureExchangeEvent[]): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_IPC_CHANNELS.captureEvents, events);
      }
    }
  }

  // 解密当前 CA 材料并经内部 tls.configure 命令下发 Core（私钥不经 Renderer）。
  // 仅当 CA 已安装信任时才下发 material 启用 MITM；否则下发 null，CONNECT 直通不解密。
  private async provisionCoreTls(): Promise<void> {
    if (!this.certificateService) {
      return;
    }
    try {
      const trusted = await this.isCaTrusted();
      const material = trusted
        ? await this.certificateService.getMaterial()
        : null;
      await this.coreRuntime.request({
        type: 'tls.configure',
        payload: { ca: material, insecureHosts: this.insecureHosts },
      });
    } catch {
      // Core 尚未就绪、无代理或无存储时不阻断启动。
    }
  }

  private requireCertificateService(): CertificateService {
    if (!this.certificateService) {
      throw new Error('CertificateService is not initialized');
    }
    return this.certificateService;
  }

  private async isCaTrusted(): Promise<boolean> {
    const thumbprints = await this.requireCertificateService().getThumbprints();
    return thumbprints ? this.trustStore.isTrusted(thumbprints.sha1) : false;
  }

  // 组装面向 Renderer 的证书状态 DTO（公开元数据 + 信任状态）；绝不含私钥。
  private async buildCertificateInfo(): Promise<CertificateInfo> {
    const supported = this.trustStore.supported();
    const status = await this.requireCertificateService().getStatus();
    const trusted = status.present ? await this.isCaTrusted() : false;
    return {
      present: status.present,
      trusted,
      supported,
      fingerprint: status.fingerprint,
      subject: status.subject,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
    };
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