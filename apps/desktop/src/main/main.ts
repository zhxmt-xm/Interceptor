import { execFile } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron';

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
  assertRevision,
  toBodyDecodeOptions,
  toBreakpointEdit,
  toByteRange,
  toComposerRequest,
  toCoreRuleDefinitions,
  toCoreSessionQuery,
  toInsecureHosts,
  toRendererCaptureStatus,
  toRendererDiagnosticRecord,
  toRendererStorageUsage,
  toWebSocketFrameQuery,
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
  /** HTTPS 解密（MITM）用户意图开关；与“CA 是否信任”解耦——信任是系统层
   * 安装，此开关只控制运行时是否对 HTTPS 做 MITM。仅当 CA 已信任且此开关开启才下发 CA 材料。 */
  private mitmEnabled = true;
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
    // 拉取最近诊断记录（不限 traceId），供 Diagnostics 面板列表与时间线展示。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.coreGetDiagnostics,
      async (event, rawLimit: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const limit =
          typeof rawLimit === 'number' && Number.isFinite(rawLimit)
            ? Math.min(Math.max(1, Math.floor(rawLimit)), 200)
            : 200;
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
        if (typeof enabled !== 'boolean') {
          throw new Error('enabled is invalid');
        }
        const result = await this.coreRuntime.request({
          type: 'websocket.breakpoint.configure',
          payload: { enabled },
        });
        return result.payload.enabled;
      },
    );

    // 按需分块读取正文字节；offset/length 在边界校验，避免过大读取。
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
        assertIdentifier(bodyId, 'bodyId');
        const range = toByteRange(offset, length, MAX_BODY_CHUNK_BYTES);
        const decodeOptions = toBodyDecodeOptions(options);
        const result = await this.coreRuntime.request({
          type: 'body.read-range',
          payload: {
            bodyId,
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

    // 安装已生成的 CA 到本地计算机信任库（需提权），随后启用 MITM。要求 CA 已生成，
    // 不在此自动生成——生成是用户显式的独立操作。
    ipcMain.handle(DESKTOP_IPC_CHANNELS.caInstall, async (event) => {
      this.assertTrustedSender(event.senderFrame?.url);
      const service = this.requireCertificateService();
      const status = await service.getStatus();
      if (!status.present) {
        throw new Error('Root CA has not been generated yet.');
      }
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

    // 独立的 HTTPS 解密（MITM）开关：不改信任库，只控制是否对 HTTPS 做 MITM。
    // 前提是 CA 已安装信任；未信任时即使开启也不会下发 CA 材料（provisionCoreTls 把关）。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.httpsSetDecryption,
      async (event, enabled: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        this.mitmEnabled = enabled === true;
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

    // 规则集语义校验（无副作用）：Renderer 编辑时实时校验，返回诊断明细。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.rulesValidate,
      async (event, rules: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        const definitions = toCoreRuleDefinitions(rules);
        const result = await this.coreRuntime.request({
          type: 'rules.validate',
          payload: { rules: definitions },
        });
        return {
          valid: result.payload.valid,
          diagnostics: result.payload.diagnostics,
        };
      },
    );

    // 乐观并发替换规则集：expectedRevision 需匹配当前 revision，返回新 revision。
    // 冲突/非法/其它失败以结构化结果返回，避免 IPC 抛错丢失错误码。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.rulesReplace,
      async (event, expectedRevision: unknown, rules: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertRevision(expectedRevision);
        const definitions = toCoreRuleDefinitions(rules);
        try {
          const result = await this.coreRuntime.request({
            type: 'rules.replace',
            payload: { expectedRevision, rules: definitions },
          });
          return { ok: true, revision: result.payload.revision };
        } catch (error) {
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

    // Composer 手工请求：边界校验后转交 Core 用 http/https/http2 执行并回传响应。
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

    // 放行断点：continue（可带 edit）/ drop；边界校验 id/action/edit。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.breakpointResolve,
      async (event, breakpointId: unknown, action: unknown, edit: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertIdentifier(breakpointId, 'breakpointId');
        if (action !== 'continue' && action !== 'drop') {
          throw new Error('action is invalid');
        }
        const safeEdit = toBreakpointEdit(edit);
        const result = await this.coreRuntime.request({
          type: 'breakpoint.resolve',
          payload: { breakpointId, action, edit: safeEdit },
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
          payload: { enabled: enabled === true },
        });
        return result.payload.enabled;
      },
    );

    // TLS 探测：对 host:port 建立 TLS 握手读取协议/套件/ALPN/证书链。
    ipcMain.handle(
      DESKTOP_IPC_CHANNELS.connectionProbe,
      async (event, host: unknown, port: unknown) => {
        this.assertTrustedSender(event.senderFrame?.url);
        assertBoundedString(host, 'host', 512);
        if (
          typeof port !== 'number' ||
          !Number.isInteger(port) ||
          port < 1 ||
          port > 65_535
        ) {
          throw new Error('port is invalid');
        }
        const result = await this.coreRuntime.request({
          type: 'connection.probe',
          payload: { host, port },
        });
        return result.payload;
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
      const material =
        trusted && this.mitmEnabled
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