import { execFile } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain as electronIpcMain,
  safeStorage,
  session,
  shell,
} from 'electron';

import type {
  ClientAppIdentity,
  UpstreamProxyConfig,
} from '@interceptor/core-protocol';

import {
  DESKTOP_IPC_CHANNELS,
  type CaptureExchangeEvent,
  type ClientAppIcon,
  type CertificateInfo,
  type CoreProcessStatus,
  type SystemProxyStatus as DesktopSystemProxyStatus,
  type UpdateStatus,
} from '../shared/desktop-api';
import { CertificateService } from './certificates/certificate-service';
import { TrustStoreService } from './certificates/trust-store-service';
import {
  readClientAppIcon,
  resolveClientAppHelperPath,
} from './client-app/client-app-helper';
import {
  UPSTREAM_PROBE_INTERVAL_MS,
  UPSTREAM_PROBE_TIMEOUT_MS,
} from './constants';
import { CoreRuntime } from './core/core-runtime';
import { MainDiagnostics } from './diagnostics/main-diagnostics';
import type {
  SystemProxyService,
  SystemProxyStatus,
  UpdateService,
} from './interfaces';
import { TrustedRendererUrl } from './security/trusted-renderer-url';
import { PackagedRendererProtocol } from './security/packaged-renderer-protocol';
import { MacosSystemProxyService } from './system-proxy/macos-system-proxy-service';
import { SystemProxyJournal } from './system-proxy/system-proxy-journal';
import { toUpstreamAuthority } from './system-proxy/system-proxy-upstream';
import { UpstreamProbe } from './system-proxy/upstream-probe';
import { WindowsSystemProxyService } from './system-proxy/windows-system-proxy-service';
import { GitHubReleaseUpdateService } from './updates/github-release-update-service';
import {
  readErrorMessage,
  readErrorName,
  toBodyDecodeOptions,
  toBodyExportRequest,
  toBreakpointEdit,
  toByteRange,
  toCollectionNodes,
  toComposerRequest,
  toCoreRuleNodes,
  toCoreSessionQuery,
  toGrpcMessageQuery,
  toHarExportRequest,
  toDiagnosticsExportFilter,
  toDiagnosticsQueryRequest,
  toInsecureHosts,
  toRendererDiagnosticReport,
  toRendererCaptureStatus,
  toRendererDiagnosticRecord,
  toRendererCaptureUsage,
  toSafeBodyFileName,
  toWebSocketFrameQuery,
} from './utils';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// 采用 Chromium overlay 滚动条：滚动条悬浮在内容上、不占布局宽度，
// 避免独立表头与虚拟滚动列表因滚动条占位产生的列错位。
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');

PackagedRendererProtocol.registerScheme();

/** Electron Main 应用所有者：窗口、安全策略、CoreRuntime 、证书与 Renderer IPC。 */
class DesktopApplication {
  private readonly coreRuntime = new CoreRuntime();
  private readonly diagnostics = new MainDiagnostics(this.coreRuntime);
  private certificateService: CertificateService | null = null;
  /** Secure packaged Renderer protocol, installed only outside development. */
  private packagedRendererProtocol: PackagedRendererProtocol | null = null;
  private systemProxyService: SystemProxyService | null = null;
  /** 接管时检测到的上游代理；降级期间保留，供探活恢复后升级回去。 */
  private detectedUpstreamProxy: UpstreamProxyConfig | null = null;
  /** Core 当前实际使用的上游代理；null 表示直连。 */
  private activeUpstreamProxy: UpstreamProxyConfig | null = null;
  /** 上游探活；不可达时降级直连并告警，恢复后自动升级。 */
  private readonly upstreamProbe = new UpstreamProbe(
    UPSTREAM_PROBE_INTERVAL_MS,
    UPSTREAM_PROBE_TIMEOUT_MS,
    (reachable) => {
      void this.onUpstreamReachabilityChange(reachable);
    },
  );
  /** Public GitHub release checker; downloads always remain user-controlled. */
  private updateService: UpdateService | null = null;
  private readonly trustStore = new TrustStoreService();
  /** per-host 源站证书不安全例外；下发 Core 供 MITM passThrough 忽略源站证书错误。 */
  private insecureHosts: string[] = [];
  /** HTTPS 解密（MITM）用户意图开关；与“CA 是否信任”解耦——信任是系统层
   * 安装，此开关只控制运行时是否对 HTTPS 做 MITM。仅当 CA 已信任且此开关开启才下发 CA 材料。 */
  private mitmEnabled = false;
  private lastCoreProcessState: CoreProcessStatus['state'] | null = null;
  /** Core 不可用期间暂存的首个失败原因；新 Core running 后补记到持久 Diagnostics。 */
  private pendingCoreFailureDetail: string | null = null;
  /** In-flight recovery shared by duplicate unresponsive/restarting notifications. */
  private systemProxyRecovery: Promise<void> | null = null;
  /** 本机应用图标缓存（含解析失败的 null）；应用身份稳定，无需失效。 */
  private readonly clientAppIcons = new Map<string, string | null>();
  private quitting = false;

  start(): void {
    process.on('uncaughtExceptionMonitor', (error, origin) => {
      this.diagnostics.error('main.uncaught-exception', {
        errorCode: error.name,
        outcome: 'failed',
        attributes: {
          message: error.message,
          origin,
        },
      });
    });
    void app.whenReady().then(() => this.onReady());
    app.on('activate', () => this.onActivate());
    app.on('window-all-closed', () => this.onAllWindowsClosed());
    app.on('before-quit', (event) => this.onBeforeQuit(event));
  }

  private async onReady(): Promise<void> {
    this.configureSessionSecurity();
    this.certificateService = new CertificateService({
      dataDir: path.join(app.getPath('userData'), 'certificates'),
      secureStore: safeStorage,
    });
    this.systemProxyService = this.createSystemProxyService();
    this.createUpdateService();
    const updateService = this.requireUpdateService();
    updateService.onStatusChange((status) => {
      this.broadcastUpdateStatus(status);
    });
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.packagedRendererProtocol = new PackagedRendererProtocol(
        path.dirname(this.getPackagedRendererPath()),
      );
      this.packagedRendererProtocol.install();
    }
    await this.repairSystemProxyOnStartup();
    this.configureRendererIpc();
    this.coreRuntime.onCoreProcessStatusChange((status) => {
      const previousState = this.lastCoreProcessState;
      if (status.state !== this.lastCoreProcessState) {
        if (
          (status.state === 'unresponsive' || status.state === 'restarting')
          && status.detail
          && this.pendingCoreFailureDetail === null
        ) {
          this.pendingCoreFailureDetail = status.detail;
        }
        const fields = {
          attributes: {
            state: status.state,
            restartCount: status.restartCount,
            ...(status.pid === null ? {} : { pid: status.pid }),
            ...(status.detail === null ? {} : { detail: status.detail }),
          },
        };
        if (status.state === 'unresponsive' || status.state === 'restarting') {
          this.diagnostics.warn('main.core-runtime.status', fields);
        } else {
          this.diagnostics.info('main.core-runtime.status', fields);
        }
        this.lastCoreProcessState = status.state;
      }
      if (status.state === 'running' && this.pendingCoreFailureDetail) {
        const failureDetail = this.pendingCoreFailureDetail;
        this.pendingCoreFailureDetail = null;
        this.diagnostics.warn('main.core-runtime.recovered', {
          attributes: {
            failureDetail,
            restartCount: status.restartCount,
            ...(status.pid === null ? {} : { pid: status.pid }),
          },
        });
      }
      if (status.state === 'running') {
        this.diagnostics.resume();
      }
      if (
        previousState === 'running' &&
        (status.state === 'unresponsive' || status.state === 'restarting')
      ) {
        this.scheduleSystemProxyRecovery('main.system-proxy.core-failure');
      }
      this.broadcastCoreProcessStatus(status);
    });
    this.coreRuntime.onCaptureEvents((events, clientApps) => {
      this.broadcastCaptureEvents(events);
      this.loadClientAppIcons(clientApps);
    });
    this.coreRuntime.onCoreRpcProtocolIssue((detail) => {
      this.diagnostics.warn('main.core-rpc.message-rejected', {
        errorCode: 'invalid-message',
        attributes: { detail },
      });
    });
    // 新 CoreProcess 就绪后下发 CA 材料（若已生成），启用 HTTPS MITM；
    // 上游代理同样保存在 Core 进程内，不重新下发会让重启后的企业环境断网。
    this.coreRuntime.onCoreProcessReady(() => {
      void this.provisionCoreTls();
      void this.applyUpstreamProxy(
        this.systemProxyService?.detectedUpstream() ?? null,
      );
    });
    this.coreRuntime.start();
    this.createMainWindow();
    updateService.start();
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

    // 先恢复仍由本产品持有的系统代理，再让 CoreProcess 完成清理。
    event.preventDefault();
    this.quitting = true;
    this.updateService?.stop();
    void this.restoreSystemProxyBeforeShutdown()
      .then(() => this.coreRuntime.stop())
      .then(() => {
        app.quit();
      })
      .catch((error: unknown) => {
        this.quitting = false;
        dialog.showErrorBox(
          'Unable to restore system proxy',
          `${readErrorMessage(error)}\n\nInterceptor is still running so the local proxy remains available.`,
        );
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
      frame: false,
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
    // Renderer 重新加载后会丢失已推送的图标，补发一次已知集合。
    mainWindow.webContents.on('did-finish-load', () => {
      this.broadcastClientAppIcons(
        [...this.clientAppIcons].map(([clientAppId, icon]) => ({
          clientAppId,
          icon,
        })),
      );
    });
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
      void mainWindow.loadURL(PackagedRendererProtocol.entryUrl);
    }
    return mainWindow;
  }

  private configureSessionSecurity(): void {
    // 仅放开剪贴板读写权限以支持复制操作；其余权限（相机/麦克风/定位/通知等）一律拒绝。
    const allowedPermissions = new Set([
      'clipboard-read',
      'clipboard-sanitized-write',
    ]);
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) =>
        callback(allowedPermissions.has(permission)),
    );
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission) => allowedPermissions.has(permission),
    );
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault());
    });
    app.on('open-url', (event) => event.preventDefault());
  }

  private configureRendererIpc(): void {
    const ipcMain = {
      handle: (
        channel: string,
        listener: Parameters<typeof electronIpcMain.handle>[1],
      ): void => {
        electronIpcMain.handle(channel, async (event, ...args) => {
          const startedAt = Date.now();
          try {
            return await listener(event, ...args);
          } catch (error) {
            this.diagnostics.error('main.ipc.failed', {
              durationMs: Date.now() - startedAt,
              outcome: 'failed',
              errorCode: readErrorName(error),
              attributes: {
                channel,
                message: readErrorMessage(error),
              },
            });
            throw error;
          }
        });
      },
    };

    // 自绘窗口栏的窗口控制：退出走 guarded shutdown，最小化/最大化只作用于发起窗口。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.appQuit, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      setImmediate(() => app.quit());
    });
    ipcMain.handle(DESKTOP_IPC_CHANNELS.windowMinimize, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      BrowserWindow.fromWebContents(event.sender)?.minimize();
    });
    ipcMain.handle(DESKTOP_IPC_CHANNELS.windowToggleMaximize, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return false;
      }
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return window.isMaximized();
    });

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
        const traceId = `trace-${randomUUID()}`;
        const result = await this.coreRuntime.request(
          { type: 'echo', payload: { value: value as string } },
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
        const result = await this.coreRuntime.request({
          type: 'diagnostics.recent',
          payload: { limit: 200, traceId: traceId as string },
        });
        return {
          traceId: traceId as string,
          records: result.payload.records.map((record) =>
            toRendererDiagnosticRecord(record)),
          droppedCount: result.payload.droppedCount,
        };
      },
    );
    // 拉取最近诊断记录（不限 traceId），供 Diagnostics 面板列表与时间线展示。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreGetDiagnostics,
      async (event, rawLimit: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const limit = rawLimit === undefined ? 200 : rawLimit as number;
        try {
          const result = await this.coreRuntime.request({
            type: 'diagnostics.recent',
            payload: { limit },
          });
          return {
            records: result.payload.records.map((record) =>
              toRendererDiagnosticRecord(record)),
            droppedCount: result.payload.droppedCount,
          };
        } catch (error) {
          // 诊断面板每 2 秒轮询；Core 重启/重连期间 RPC 连接会短暂关闭，
          // 这属预期内暂时状态：返回空快照，而非把断连当错误抛出刷 Main 日志。
          const code =
            typeof error === 'object' && error !== null && 'code' in error
              ? (error as { code: unknown }).code
              : undefined;
          if (code === 'disconnected') {
            return { records: [], droppedCount: 0 };
          }
          throw error;
        }
      },
    );

    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreQueryDiagnostics,
      async (event, request: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const query = toDiagnosticsQueryRequest(request);
        try {
          const result = await this.coreRuntime.request({
            type: 'diagnostics.query',
            payload: query,
          });
          return {
            records: result.payload.records.map(toRendererDiagnosticRecord),
            nextCursor: result.payload.nextCursor,
            hasMore: result.payload.hasMore,
            droppedCount: result.payload.droppedCount,
          };
        } catch (error) {
          // 与 coreGetDiagnostics 一致：面板每 2 秒轮询，Core 重启/重连期间
          // 连接短暂关闭属预期，返回空页而非把断连当错误抛出刷 Main 日志。
          const code =
            typeof error === 'object' && error !== null && 'code' in error
              ? (error as { code: unknown }).code
              : undefined;
          if (code === 'disconnected') {
            return { records: [], hasMore: false, droppedCount: 0 };
          }
          throw error;
        }
      },
    );

    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.rendererDiagnosticReport,
      (event, report: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const parsed = toRendererDiagnosticReport(report);
        this.diagnostics.rendererError(
          parsed.kind === 'uncaught-error'
            ? 'renderer.uncaught-error'
            : 'renderer.unhandled-rejection',
          {
            errorCode: parsed.name,
            outcome: 'failed',
            attributes: { message: parsed.message },
          },
        );
      },
    );

    ipcMain.handle(DESKTOP_IPC_CHANNELS.systemProxyGetStatus, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.requireSystemProxyService()
        .status()
        .then((status) => this.withUpstreamProxy(status));
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.systemProxyEnable, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const proxy = await this.coreRuntime.request({
        type: 'proxy.status',
        payload: {},
      });
      const { listening, host, port } = proxy.payload;
      if (!listening || !host || !port) {
        throw new Error('Start capture before enabling the system proxy.');
      }
      return this.runMainAction('main.system-proxy.enable', async () => {
        const service = this.requireSystemProxyService();
        const status = await service.enable(host, port);
        // 接管后所有流量都走 Interceptor，若仍直连源站，必须经公司 PAC / VPN /
        // 认证代理才能出网的环境会在接管期间完全断网，因此把原有配置接到上游。
        const detected = service.detectedUpstream();
        this.detectedUpstreamProxy = detected;
        await this.applyUpstreamProxy(detected);
        if (detected) {
          this.upstreamProbe.start(detected.proxyUrl);
        }
        return this.withUpstreamProxy(status);
      });
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.systemProxyRestore, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.runMainAction('main.system-proxy.restore', async () => {
        const result = await this.requireSystemProxyService().restore();
        this.upstreamProbe.stop();
        this.detectedUpstreamProxy = null;
        await this.applyUpstreamProxy(null);
        return { ...result, status: this.withUpstreamProxy(result.status) };
      });
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.systemProxyRepair, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.runMainAction('main.system-proxy.emergency-repair', async () => {
        const result = await this.requireSystemProxyService().repair();
        this.upstreamProbe.stop();
        this.detectedUpstreamProxy = null;
        await this.applyUpstreamProxy(null);
        try {
          await this.coreRuntime.request({ type: 'proxy.stop', payload: {} });
        } catch (error) {
          this.diagnostics.warn('main.system-proxy.repair-core-stop-failed', {
            outcome: 'failed',
            errorCode: readErrorName(error),
            attributes: { message: readErrorMessage(error) },
          });
        }
        return { ...result, status: this.withUpstreamProxy(result.status) };
      });
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.updateGetStatus, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.requireUpdateService().status();
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.updateCheck, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.runMainAction('main.update.check', async () =>
        Promise.resolve(this.requireUpdateService().check()));
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.updateDownload, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return this.runMainAction('main.update.download', () =>
        this.requireUpdateService().download());
    });

    ipcMain.handle(DESKTOP_IPC_CHANNELS.updateOpenDownloaded, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      await this.runMainAction('main.update.open-downloaded', () =>
        this.requireUpdateService().openDownloaded());
    });

    // 存储用量只读查询；数据库与 Blob 路径不暴露给 Renderer。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.captureGetUsage, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'capture.status',
        payload: {},
      });
      return toRendererCaptureUsage(result.payload);
    });

    // 清空全部捕获数据属于破坏性操作，由 Renderer 侧显式确认后调用。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.captureClear, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'capture.cleanup',
        payload: { scope: 'all' },
      });
      return toRendererCaptureUsage(result.payload);
    });

    // 启动代理捕获：可选端口，未指定由 Core 选默认监听端口。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.captureStart,
      async (event, port: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'proxy.start',
          payload: port === undefined ? {} : { port: port as number },
        });
        return toRendererCaptureStatus(result.payload);
      },
    );

    // Stop 只暂停记录（proxy.setRecording:false）：监听器与系统代理保持不变，
    // 流量继续转发；已有 Capture 记录保留到用户手动 Clear。系统代理只在退出/修复时恢复。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.captureStop, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'proxy.setRecording',
        payload: { recording: false },
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

    // 会话分页查询；Renderer 属于可信应用代码，Main 原样转交 payload。
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
        const result = await this.coreRuntime.request({
          type: 'sessions.detail',
          payload: { exchangeId: exchangeId as string },
        });
        return result.payload.detail;
      },
    );

    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.websocketFrames,
      async (event, request: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const query = toWebSocketFrameQuery(request);
        const result = await this.coreRuntime.request({
          type: 'websocket.frames',
          payload: query,
        });
        return result.payload;
      },
    );

    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.websocketBreakpointConfigure,
      async (event, enabled: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'websocket.breakpoint.configure',
          payload: { enabled: enabled as boolean },
        });
        return result.payload.enabled;
      },
    );

    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.grpcMessages,
      async (event, request: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const query = toGrpcMessageQuery(request);
        const result = await this.coreRuntime.request({
          type: 'grpc.messages',
          payload: query,
        });
        return result.payload;
      },
    );

    // HAR 导出：Renderer 只提交 scope/redaction；路径由 Main 系统对话框生成。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.harExportStart,
      async (event, request: unknown, title: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const options = toHarExportRequest(request);
        const selection = await dialog.showSaveDialog({
          title: title as string,
          defaultPath: `interceptor-${new Date().toISOString().slice(0, 10)}.har`,
          filters: [{ name: 'HTTP Archive', extensions: ['har'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (selection.canceled || !selection.filePath) {
          return null;
        }
        const result = await this.coreRuntime.request({
          type: 'har.export.start',
          payload: {
            jobId: `transfer-${randomUUID()}`,
            filePath: selection.filePath,
            scope: options.scope,
            redaction: options.redaction,
          },
        });
        return result.payload.job;
      },
    );

    // HAR 导入：系统对话框仅允许选择一个 .har，Renderer 不接触真实路径或文件内容。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.harImportStart, async (event, title: unknown) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const selection = await dialog.showOpenDialog({
        title: title as string,
        filters: [{ name: 'HTTP Archive', extensions: ['har'] }],
        properties: ['openFile'],
      });
      const [filePath] = selection.filePaths;
      if (selection.canceled || !filePath) {
        return null;
      }
      const result = await this.coreRuntime.request({
        type: 'har.import.start',
        payload: {
          jobId: `transfer-${randomUUID()}`,
          filePath,
        },
      });
      return result.payload.job;
    });

    // 原生 archive 导出：整库快照，无需 Renderer 提交 scope/redaction；路径由 Main 生成。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.archiveExportStart, async (event, title: unknown) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const selection = await dialog.showSaveDialog({
        title: title as string,
        defaultPath: `interceptor-${new Date().toISOString().slice(0, 10)}.iarchive`,
        filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (selection.canceled || !selection.filePath) {
        return null;
      }
      const result = await this.coreRuntime.request({
        type: 'archive.export.start',
        payload: {
          jobId: `transfer-${randomUUID()}`,
          filePath: selection.filePath,
        },
      });
      return result.payload.job;
    });

    // 原生 archive 导入：系统对话框仅允许选择一个 .iarchive，Renderer 不接触真实路径。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.archiveImportStart, async (event, title: unknown) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const selection = await dialog.showOpenDialog({
        title: title as string,
        filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }],
        properties: ['openFile'],
      });
      const [filePath] = selection.filePaths;
      if (selection.canceled || !filePath) {
        return null;
      }
      const result = await this.coreRuntime.request({
        type: 'archive.import.start',
        payload: {
          jobId: `transfer-${randomUUID()}`,
          filePath,
        },
      });
      return result.payload.job;
    });

    // 诊断 JSONL 导出：Renderer 只提交 process/level/outcome 过滤；路径由 Main 生成。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.diagnosticsExportStart,
      async (event, filter: unknown, title: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const parsedFilter = toDiagnosticsExportFilter(filter);
        const selection = await dialog.showSaveDialog({
          title: title as string,
          defaultPath: `interceptor-diagnostics-${new Date().toISOString().slice(0, 10)}.jsonl`,
          filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (selection.canceled || !selection.filePath) {
          return null;
        }
        const result = await this.coreRuntime.request({
          type: 'diagnostics.export.start',
          payload: {
            jobId: `transfer-${randomUUID()}`,
            filePath: selection.filePath,
            ...(parsedFilter.process ? { process: parsedFilter.process } : {}),
            ...(parsedFilter.level ? { level: parsedFilter.level } : {}),
            ...(parsedFilter.outcome ? { outcome: parsedFilter.outcome } : {}),
          },
        });
        return result.payload.job;
      },
    );

    // 查询一个异步文件任务的公开快照；绝对路径永不返回 Renderer。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.transferJobGet,
      async (event, jobId: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'transfer.job.get',
          payload: { jobId: jobId as string },
        });
        return result.payload.job;
      },
    );

    // 取消运行中的 HAR 文件任务；终态任务保持幂等。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.transferJobCancel,
      async (event, jobId: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'transfer.job.cancel',
          payload: { jobId: jobId as string },
        });
        return result.payload.job;
      },
    );

    // 按需读取正文字节；offset/length 由可信 Renderer 决定并原样转交。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.bodyReadRange,
      async (
        event,
        bodyId: unknown,
        offset: unknown,
        length: unknown,
        options: unknown,
      ) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const range = toByteRange(offset, length);
        const decodeOptions = toBodyDecodeOptions(options);
        const result = await this.coreRuntime.request({
          type: 'body.read-range',
          payload: {
            bodyId: bodyId as string,
            offset: range.offset,
            length: range.length,
            ...decodeOptions,
          },
        });
        return {
          offset: result.payload.offset,
          data: result.payload.data,
          end: result.payload.end,
          decodeStatus: result.payload.decodeStatus,
        };
      },
    );

    // 单正文保存：Renderer 只提交 hash/建议文件名，路径由 Main 系统对话框生成。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.bodyExportStart,
      async (event, value: unknown, title: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const request = toBodyExportRequest(value);
        const selection = await dialog.showSaveDialog({
          title: title as string,
          defaultPath: toSafeBodyFileName(request.suggestedName),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (selection.canceled || !selection.filePath) {
          return null;
        }
        const result = await this.coreRuntime.request({
          type: 'body.export.start',
          payload: {
            jobId: `transfer-${randomUUID()}`,
            filePath: selection.filePath,
            bodyId: request.bodyId,
          },
        });
        return result.payload.job;
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
      return this.runMainAction('main.certificate.generate', async () => {
        await this.requireCertificateService().regenerate();
        await this.provisionCoreTls();
        return this.buildCertificateInfo();
      });
    });

    // 安装已生成的 CA 到本地计算机信任库（需提权），随后启用 MITM。要求 CA 已生成，
    // 不在此自动生成——生成是用户显式的独立操作。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caInstall, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const service = this.requireCertificateService();
      const status = await service.getStatus();
      if (!status.present) {
        throw new Error('Root CA has not been generated yet.');
      }
      return this.runMainAction('main.trust-store.install', async () => {
        await this.trustStore.install(service.getCertificatePath());
        await this.provisionCoreTls();
        return this.buildCertificateInfo();
      });
    });

    // 按 SHA-1 thumbprint 从信任库精确移除 CA，随后禁用 MITM。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caUninstall, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const thumbprints = await this.requireCertificateService().getThumbprints();
      return this.runMainAction('main.trust-store.uninstall', async () => {
        if (thumbprints) {
          await this.trustStore.uninstall(thumbprints.sha1);
        }
        await this.provisionCoreTls();
        return this.buildCertificateInfo();
      });
    });

    // 删除本地生成的 CA 材料（证书/私钥/元数据）；若仍在信任库先移除（提权）避免孤儿信任。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caDelete, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const service = this.requireCertificateService();
      const thumbprints = await service.getThumbprints();
      if (thumbprints && (await this.trustStore.isTrusted(thumbprints.sha1))) {
        await this.trustStore.uninstall(thumbprints.sha1);
      }
      await service.delete();
      await this.provisionCoreTls();
      return this.buildCertificateInfo();
    });

    // 在系统文件管理器中定位 Root CA 证书文件（只读；私钥文件不暴露）。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caReveal, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      shell.showItemInFolder(
        this.requireCertificateService().getCertificatePath(),
      );
    });

    // 打开系统证书查看对话框查看 Root CA 详情。.pem 扩展名不被系统证书查看器
    // 关联，故导出 DER 编码的 .cer（标准证书格式）再由系统默认程序打开
    // （Windows 证书对话框 / macOS Keychain）。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caView, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const certPath = this.requireCertificateService().getCertificatePath();
      const cerPath = certPath.replace(/\.pem$/i, '.cer');
      const pem = await readFile(certPath, 'utf8');
      await writeFile(cerPath, new X509Certificate(pem).raw);
      const error = await shell.openPath(cerPath);
      if (error) {
        await shell.openPath(certPath);
      }
    });

    // 打开系统证书管理器（Windows certmgr.msc 当前用户存储 / macOS 钥匙串访问）。
    // 注：MMC 无法经命令行定位到特定证书，用户需在“受信任的根证书颁发机构”
    // 下按名称/指纹查找；直接查看本 CA 详情用 ca:view。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caOpenManager, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      if (process.platform === 'win32') {
        execFile('cmd.exe', ['/c', 'start', '', 'certmgr.msc'], {
          windowsHide: true,
        });
        return;
      }
      execFile('open', ['-a', 'Keychain Access']);
    });

    // 源站证书不安全例外（per-host）只读查询。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.httpsGetInsecureHosts, (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      return [...this.insecureHosts];
    });

    // 更新 per-host 不安全例外并重下发给 Core；Main 不修改 Renderer 提交的数据。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.httpsSetInsecureHosts,
      async (event, hosts: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        this.insecureHosts = toInsecureHosts(hosts);
        await this.provisionCoreTls();
        return [...this.insecureHosts];
      },
    );

    // 独立的 HTTPS 解密（MITM）开关：不改信任库，只控制是否对 HTTPS 做 MITM。
    // 前提是 CA 已安装信任；未信任时即使开启也不会下发 CA 材料（provisionCoreTls 把关）。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.httpsSetDecryption,
      async (event, enabled: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        this.mitmEnabled = enabled as boolean;
        await this.provisionCoreTls();
        return this.buildCertificateInfo();
      },
    );

    // 规则集只读查询：返回当前 revision + 全部规则，供 Rules workspace 编辑器加载。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.rulesGet, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'rules.get',
        payload: {},
      });
      return result.payload.ruleSet;
    });

    // 乐观并发替换规则集：expectedRevision 需匹配当前 revision，返回新 revision。
    // 冲突/非法/其它失败以结构化结果返回，避免 IPC 抛错丢失错误码。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.rulesReplace,
      async (event, expectedRevision: unknown, nodes: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const ruleNodes = toCoreRuleNodes(nodes);
        try {
          const result = await this.coreRuntime.request({
            type: 'rules.replace',
            payload: {
              expectedRevision: expectedRevision as number,
              nodes: ruleNodes,
            },
          });
          return { ok: true, revision: result.payload.revision };
        } catch (error) {
          return DesktopApplication.toReplaceFailure(error);
        }
      },
    );

    // 规则命中计数（按 ruleId 聚合），供 Rules workspace 的 hit counter。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.rulesHits, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'rules.hits',
        payload: {},
      });
      return result.payload.counts;
    });

    // Composer 集合只读查询：整棵树 + 当前 revision，供 Composer workspace 加载。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.collectionGet, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'collection.get',
        payload: {},
      });
      return result.payload.collection;
    });

    // 乐观并发替换整棵集合树；语义与 rulesReplace 一致（编辑即生效，由 Renderer 节流）。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.collectionReplace,
      async (event, expectedRevision: unknown, nodes: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const collectionNodes = toCollectionNodes(nodes);
        try {
          const result = await this.coreRuntime.request({
            type: 'collection.replace',
            payload: {
              expectedRevision: expectedRevision as number,
              nodes: collectionNodes,
            },
          });
          return { ok: true, revision: result.payload.revision };
        } catch (error) {
          return DesktopApplication.toReplaceFailure(error);
        }
      },
    );

    // 集合导出：数据本来就在 Renderer 手上，Main 只负责选路径并落盘，不经过 Core。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.collectionExport,
      async (event, nodes: unknown, title: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const collectionNodes = toCollectionNodes(nodes);
        const selection = await dialog.showSaveDialog({
          title: title as string,
          defaultPath: `interceptor-collection-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (selection.canceled || !selection.filePath) {
          return false;
        }
        await writeFile(
          selection.filePath,
          JSON.stringify({ nodes: collectionNodes }, null, 2),
          'utf8',
        );
        return true;
      },
    );

    // Composer 手工请求：原样转交 Core 用 http/https/http2 执行并回传响应。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.composerSend,
      async (event, request: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const payload = toComposerRequest(request);
        const result = await this.coreRuntime.request({
          type: 'composer.send',
          payload,
        });
        return result.payload;
      },
    );

    // 当前等待中断点快照 + break-on-match 开关；Breakpoints 工作区轮询。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.breakpointList, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const result = await this.coreRuntime.request({
        type: 'breakpoint.list',
        payload: {},
      });
      return {
        breakpoints: result.payload.breakpoints,
        enabled: result.payload.enabled,
      };
    });

    // 放行断点：continue（可带 edit）/ drop；payload 原样转交 Core。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.breakpointResolve,
      async (event, breakpointId: unknown, action: unknown, edit: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const safeEdit = toBreakpointEdit(edit);
        const result = await this.coreRuntime.request({
          type: 'breakpoint.resolve',
          payload: {
            breakpointId: breakpointId as string,
            action: action as 'continue' | 'drop',
            edit: safeEdit,
          },
        });
        return { state: result.payload.state };
      },
    );

    // 全局 break-on-match 开关：关闭时命中断点直接放行不挂起。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.breakpointConfigure,
      async (event, enabled: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'breakpoint.configure',
          payload: { enabled: enabled as boolean },
        });
        return result.payload.enabled;
      },
    );

    // TLS 探测：对 host:port 建立 TLS 握手读取协议/套件/ALPN/证书链。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.tlsProbe,
      async (event, host: unknown, port: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const result = await this.coreRuntime.request({
          type: 'tls.probe',
          payload: { host: host as string, port: port as number },
        });
        return result.payload;
      },
    );
  }

  /**
   * 下发上游代理给 Core；失败不影响系统代理接管本身，只记诊断。
   * Core 未运行时无需下发：代理没在跑就不会有流量。
   */
  private async applyUpstreamProxy(
    upstream: UpstreamProxyConfig | null,
  ): Promise<void> {
    try {
      await this.coreRuntime.request({
        type: 'proxy.setUpstream',
        payload: { upstream },
      });
      this.activeUpstreamProxy = upstream;
    } catch (error) {
      this.diagnostics.warn('main.system-proxy.upstream-apply-failed', {
        outcome: 'failed',
        errorCode: readErrorName(error),
        attributes: { message: readErrorMessage(error) },
      });
    }
  }

  /**
   * 给系统代理快照补上 Core 实际在用的上游，供底栏展示。
   * 只给 host:port：上游 URL 可能带认证信息，不能原样进 Renderer。
   */
  private withUpstreamProxy(status: SystemProxyStatus): DesktopSystemProxyStatus {
    return {
      ...status,
      upstreamProxy: toUpstreamAuthority(this.detectedUpstreamProxy),
      upstreamReachable: this.activeUpstreamProxy !== null,
    };
  }

  /**
   * 上游可达性跃迁：不可达就降级直连，恢复就升级回代理链。
   * 接管期间用户失去了对出口的控制，上游（如本地 Clash）退出后如果不降级，
   * 所有外网流量会一直卡在死端口且无法自愈。降级是临时的，恢复后会自动接回上游。
   */
  private async onUpstreamReachabilityChange(reachable: boolean): Promise<void> {
    const detected = this.detectedUpstreamProxy;
    if (!detected) {
      return;
    }
    this.diagnostics.warn('main.system-proxy.upstream-reachability', {
      attributes: { reachable },
    });
    await this.applyUpstreamProxy(reachable ? detected : null);
    await this.broadcastSystemProxyStatus();
  }

  /** 把含上游健康状态的系统代理快照广播给所有 Renderer。 */
  private async broadcastSystemProxyStatus(): Promise<void> {
    const service = this.systemProxyService;
    if (!service) {
      return;
    }
    const status = this.withUpstreamProxy(await service.status());
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_IPC_CHANNELS.systemProxyStatus, status);
      }
    }
  }

  /**
   * 读取 Core 随事件批交来的新应用图标，取完即推给 Renderer。
   * 图标按应用而非按请求去重，因此不会随每条 Exchange 重复传输。
   */
  private loadClientAppIcons(clientApps: ClientAppIdentity[]): void {    const helperPath = resolveClientAppHelperPath();
    if (!helperPath) {
      return;
    }
    for (const clientApp of clientApps) {
      if (this.clientAppIcons.has(clientApp.id)) {
        continue;
      }
      // 先占位，避免同一应用在读取期间被重复发起。
      this.clientAppIcons.set(clientApp.id, null);
      if (clientApp.path.length === 0) {
        // 系统权限进程只反查到了进程名，没有可执行文件路径就取不到图标。
        this.broadcastClientAppIcons([{ clientAppId: clientApp.id, icon: null }]);
        continue;
      }
      void readClientAppIcon(helperPath, clientApp.path)
        .catch((error: unknown) => {
          this.diagnostics.warn('main.client-app.icon-failed', {
            errorCode: error instanceof Error ? error.name : 'unknown',
          });
          return null;
        })
        .then((icon) => {
          this.clientAppIcons.set(clientApp.id, icon);
          this.broadcastClientAppIcons([{ clientAppId: clientApp.id, icon }]);
        });
    }
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

  /** 把已取到的本机应用图标广播给所有 Renderer 窗口。 */
  private broadcastClientAppIcons(icons: ClientAppIcon[]): void {
    if (icons.length === 0) {
      return;
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_IPC_CHANNELS.clientAppIcons, icons);
      }
    }
  }

  /** Broadcast one bounded update-state snapshot to every trusted Renderer. */
  private broadcastUpdateStatus(status: UpdateStatus): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_IPC_CHANNELS.updateStatus, status);
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
      const material =
        trusted && this.mitmEnabled
          ? await this.certificateService.getMaterial()
          : null;
      await this.coreRuntime.request({
        type: 'tls.configure',
        payload: { ca: material, insecureHosts: this.insecureHosts },
      });
    } catch (error) {
      this.diagnostics.warn('main.tls.provision-failed', {
        errorCode: readErrorName(error),
        outcome: 'failed',
        attributes: { message: readErrorMessage(error) },
      });
      // Core 尚未就绪、无代理或无存储时不阻断启动。
    }
  }

  private async runMainAction<T>(
    phase: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      this.diagnostics.info(`${phase}.completed`, {
        durationMs: Date.now() - startedAt,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.diagnostics.error(`${phase}.failed`, {
        durationMs: Date.now() - startedAt,
        outcome: 'failed',
        errorCode: readErrorName(error),
        attributes: { message: readErrorMessage(error) },
      });
      throw error;
    }
  }

  private requireCertificateService(): CertificateService {
    if (!this.certificateService) {
      throw new Error('CertificateService is not initialized');
    }
    return this.certificateService;
  }

  private requireSystemProxyService(): SystemProxyService {
    if (!this.systemProxyService) {
      throw new Error('System proxy service is not initialized');
    }
    return this.systemProxyService;
  }

  /** Return the initialized GitHub release notification owner. */
  private requireUpdateService(): UpdateService {
    if (!this.updateService) {
      throw new Error('Update service is not initialized');
    }
    return this.updateService;
  }

  /** Create one user-triggered installer downloader backed by GitHub Releases. */
  private createUpdateService(): void {
    this.updateService = new GitHubReleaseUpdateService({
      packaged: app.isPackaged,
      currentVersion: app.getVersion(),
      dataDirectory: app.getPath('userData'),
      diagnostics: this.diagnostics,
      openPath: (filePath) => shell.openPath(filePath),
    });
  }

  private async restoreSystemProxyBeforeShutdown(): Promise<void> {
    if (!this.systemProxyService?.supported()) {
      return;
    }
    try {
      const result = await this.systemProxyService.restore();
      if (result.reason === 'externally-modified') {
        this.diagnostics.warn('main.system-proxy.ownership-lost', {
          outcome: 'failed',
        });
      }
    } catch (error) {
      this.diagnostics.error('main.system-proxy.restore-failed', {
        outcome: 'failed',
        errorCode: readErrorName(error),
        attributes: { message: readErrorMessage(error) },
      });
      throw error;
    }
  }

  /** Repair a stale journal before Core or Renderer starts, without blocking app access on failure. */
  private async repairSystemProxyOnStartup(): Promise<void> {
    if (!this.systemProxyService?.supported()) {
      return;
    }
    try {
      const result = await this.systemProxyService.repair();
      this.recordSystemProxyRecovery('main.system-proxy.startup-repair', result);
    } catch (error) {
      this.diagnostics.error('main.system-proxy.startup-repair-failed', {
        outcome: 'failed',
        errorCode: readErrorName(error),
        attributes: { message: readErrorMessage(error) },
      });
      dialog.showErrorBox(
        'System proxy recovery required',
        `${readErrorMessage(error)}\n\nUse Settings > Proxy > Emergency repair after Interceptor opens.`,
      );
    }
  }

  /** Serialize recovery triggered by duplicate Core failure state transitions. */
  private scheduleSystemProxyRecovery(phase: string): void {
    if (this.systemProxyRecovery || !this.systemProxyService?.supported()) {
      return;
    }
    this.systemProxyRecovery = this.systemProxyService.repair()
      .then((result) => this.recordSystemProxyRecovery(phase, result))
      .catch((error: unknown) => {
        this.diagnostics.error(`${phase}.failed`, {
          outcome: 'failed',
          errorCode: readErrorName(error),
          attributes: { message: readErrorMessage(error) },
        });
        dialog.showErrorBox(
          'Unable to restore system proxy',
          `${readErrorMessage(error)}\n\nUse Settings > Proxy > Emergency repair.`,
        );
      })
      .finally(() => {
        this.systemProxyRecovery = null;
      });
  }

  /** Record a guarded recovery outcome without exposing proxy snapshots. */
  private recordSystemProxyRecovery(
    phase: string,
    result: Awaited<ReturnType<SystemProxyService['repair']>>,
  ): void {
    if (result.reason === 'externally-modified') {
      this.diagnostics.warn(`${phase}.ownership-lost`, { outcome: 'failed' });
    } else if (result.restored) {
      this.diagnostics.info(`${phase}.completed`, { outcome: 'success' });
    }
  }

  private async isCaTrusted(): Promise<boolean> {
    const thumbprints = await this.requireCertificateService().getThumbprints();
    return thumbprints ? this.trustStore.isTrusted(thumbprints.sha1) : false;
  }

  // 组装面向 Renderer 的证书状态 DTO（公开元数据 + 信任状态）；绝不含私钥。
  private async buildCertificateInfo(): Promise<CertificateInfo> {
    const supported = this.trustStore.supported();
    const service = this.requireCertificateService();
    const status = await service.getStatus();
    const trusted = status.present ? await this.isCaTrusted() : false;
    return {
      present: status.present,
      trusted,
      supported,
      mitmEnabled: this.mitmEnabled,
      fingerprint: status.fingerprint,
      subject: status.subject,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      path: status.present ? service.getCertificatePath() : null,
    };
  }

  private assertTrustedSender(senderUrl: string | undefined): void {
    if (!senderUrl || !this.isTrustedRendererNavigation(senderUrl)) {
      throw new Error('Rejected IPC request from an untrusted sender');
    }
  }

  /** 把乐观并发替换的失败映射为结构化结果，避免 IPC 抛错丢掉 Core 的错误码。 */
  private static toReplaceFailure(error: unknown): {
    ok: false;
    reason: 'conflict' | 'invalid' | 'error';
    message: string;
  } {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'conflict') {
      return { ok: false, reason: 'conflict', message };
    }
    if (code === 'invalid-message') {
      return { ok: false, reason: 'invalid', message };
    }
    return { ok: false, reason: 'error', message };
  }

  private isTrustedRendererNavigation(url: string): boolean {
    return TrustedRendererUrl.isTrusted(url, {
      devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
      packagedRendererUrl: PackagedRendererProtocol.entryUrl,
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

  /** Create the native system-proxy owner for the current desktop platform. */
  private createSystemProxyService(): SystemProxyService {
    const systemProxyJournal = new SystemProxyJournal(
      path.join(app.getPath('userData'), 'system-proxy/ownership.json'),
    );
    if (process.platform === 'darwin') {
      return new MacosSystemProxyService({
        helperPath: this.getMacosProxyHelperPath(),
        journal: systemProxyJournal,
      });
    }
    return new WindowsSystemProxyService({
      helperPath: this.getWinInetProxyHelperPath(),
      journal: systemProxyJournal,
    });
  }

  private getWinInetProxyHelperPath(): string {
    return app.isPackaged
      ? path.join(
          process.resourcesPath,
          'system-proxy/wininet-proxy-helper.exe',
        )
      : path.resolve(
          app.getAppPath(),
          'dist/system-proxy/wininet-proxy-helper.exe',
        );
  }

  /** Resolve the Swift SystemConfiguration helper in development and packages. */
  private getMacosProxyHelperPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'system-proxy/macos-proxy-helper')
      : path.resolve(
          app.getAppPath(),
          'dist/system-proxy/macos-proxy-helper',
        );
  }
}

new DesktopApplication().start();