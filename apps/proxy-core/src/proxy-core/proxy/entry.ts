import { generateCACertificate, getLocal, matchers, requestSteps, type Mockttp } from 'mockttp';
import type {
  AbortedRequest,
  BodyData,
  CompletedRequest,
  CompletedResponse,
  InitiatedRequest,
  InitiatedResponse,
  ProxySetting,
  TlsHandshakeFailure,
  TlsPassthroughEvent,
  TrailerData,
  WebSocketClose,
} from 'mockttp';

import type {
  TlsCompatibilityEvent,
  UpstreamProxyConfig,
  WebSocketBreakpointSettings,
} from '@interceptor/core-protocol';

import { DEFAULT_PROXY_HOST, appVersion } from '../constants';
import type { ClientAppService } from '../client-app/entry';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import { HttpMessageService } from '../http-message/entry';
import type {
  HeaderBag,
  MutableRequestState,
  MutableResponseState,
  RuleBodyEffect,
} from '../rules/interfaces';
import type { RuleService } from '../rules/entry';
import type { CaptureService } from '../capture/entry';
import type { BodyRefInput, ExchangeInput } from '../capture/interfaces';
import type {
  PendingTunnelCapture,
  ProxyAddress,
  ProxyRequestResult,
  ProxyResponseResult,
  ProxyRuntimeStatus,
  ProxyStartOptions,
  ProxyTlsConfig,
  RuleRequestInput,
  RuleBodyReplacement,
  RuleResponseInput,
  WebSocketBridgeMessage,
} from './interfaces';
import type { CaptureEventQueue } from './internal/capture-event-queue';
import { WEBSOCKET_BREAKPOINT_RULE_NAME } from './internal/constants';
import { ExchangeTracker } from './internal/exchange-tracker';
import { TlsCompatibilityEventQueue } from './internal/tls-compatibility-event-queue';
import { WebSocketBridge } from './internal/websocket-bridge';
import * as ProxyUtils from './utils';

/**
 * 基于 Mockttp 的显式代理服务，仅绑定 loopback。
 *
 * 用 Mockttp 的 `getLocal()` 作为显式代理：`thenPassThrough()` 转发 HTTP/1.1
 * absolute-form 请求，未配置 HTTPS 解密时对 CONNECT 做不解密的字节直通。
 *
 * Capture 只订阅 initiated / body-data 类增量事件，绝不订阅 completed 的
 * `request` / `response`：Mockttp 一旦发现 completed listener 就会调用
 * `waitForCompletedRequest` 与 `body.asBuffer()` 无条件缓冲完整正文。
 */
export class ProxyService {
  /** 按 Mockttp request id 聚合的 Exchange 生命周期。 */
  private readonly exchangeTracker: ExchangeTracker;
  /** WebSocket stream id 到有序 frame 写入链。 */
  private readonly webSocketTails = new Map<string, Promise<void>>();
  /** 原始 CONNECT tunnel id → 持久化结果；closed 事件等待 opened 落库后更新。 */
  private readonly pendingTunnels = new Map<
    string,
    Promise<PendingTunnelCapture | null>
  >();
  /** 已启动但尚未完成的 Capture 持久化；Stop 返回前必须全部退出。 */
  private readonly captureOperations = new Set<Promise<unknown>>();

  private server: Mockttp | null = null;
  private webSocketBridge: WebSocketBridge | null = null;
  private address: ProxyAddress | null = null;
  private host = DEFAULT_PROXY_HOST;
  private sessionId: string | null = null;
  private capturedExchanges = 0;
  /** 是否正在记录；暂停时监听器继续转发但不再持久化/推送新 Exchange。 */
  private recording = true;
  /** 当前 WebSocket 断点配置；null 表示未启用。 */
  private webSocketBreakpoint: WebSocketBreakpointSettings | null = null;
  private tlsConfig: ProxyTlsConfig = {
    ca: null,
    mitm: false,
    insecureHosts: [],
    passthroughHosts: [],
  };
  /** Listener configuration generation used to deduplicate compatibility signals. */
  private tlsGeneration = 0;
  /** Hosts already reported in the current TLS generation. */
  private readonly reportedTlsCompatibilityKeys = new Set<string>();
  /** Pending global Settings events, independent from Capture exchanges. */
  private readonly tlsCompatibilityEventQueue = new TlsCompatibilityEventQueue();
  /** 上游代理；null 表示直连源站。企业 PAC/VPN 环境下必须链式转发才不断网。 */
  private upstreamProxy: UpstreamProxyConfig | null = null;
  /** Mockttp TLS 分流器所需的进程内临时身份；所有 host passthrough，证书永不出示。 */
  private tlsPassthroughIdentity: { key: string; cert: string } | null = null;
  /** 当前 listener 构造时实际用的证书；与 tlsConfig.ca 不一致说明重建才能生效。 */
  private listenerCertificate: { key: string; cert: string } | null = null;
  /** 交给 Mockttp getter 的稳定数组；引用只在 configureTls 变化，避免每连接重编译 URLPattern。 */
  private passthroughRules: { hostname: string }[] = [{ hostname: '*' }];
  /** 原端口替换 listener 的窗口；期间 server 为 null 但对外仍是 listening。 */
  private rebuilding = false;
  private diagnostics: DiagnosticsRecorder | null = null;

  constructor(
    private readonly captureService: CaptureService,
    private readonly captureEventQueue: CaptureEventQueue,
    private readonly ruleService?: RuleService,
    private readonly clientAppService?: ClientAppService,
    private readonly httpMessageService = new HttpMessageService(),
  ) {
    this.exchangeTracker = new ExchangeTracker(captureService, captureEventQueue, clientAppService);
  }

  /**
   * 注入数据面诊断汇；由 CoreApplication 在 diagnostics 装配后调用一次。
   * 未注入时所有记录降为 no-op，便于单测直接 new。
   */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
    this.exchangeTracker.attachDiagnostics(sink);
  }

  /**
   * 首次启动时登记会话并开始监听；已在监听时只恢复记录。
   * 调用方：proxy.start command handler（用户显式开始捕获）。
   */
  async start(options: ProxyStartOptions = {}): Promise<ProxyAddress> {
    // 启动与恢复共用入口：暂停后再次 Start 等价于 Resume。
    this.resumeRecording();
    if (this.address) {
      return this.address;
    }

    const sessionId = `session-${ProxyUtils.cryptoRandomId()}`;
    await this.captureService.ensureSession({
      id: sessionId,
      name: 'Local capture',
      startedAt: Date.now(),
      captureMode: 'explicit-proxy',
      appVersion,
    });
    this.sessionId = sessionId;
    this.exchangeTracker.setSession(sessionId);
    this.host = options.host ?? DEFAULT_PROXY_HOST;
    this.address = await this.startServer(options.port);
    this.diagnostics?.info('proxy.listening', {
      attributes: { host: this.address.host, port: this.address.port },
    });
    return this.address;
  }

  /**
   * 停止 Mockttp 代理并清空运行态；重复调用保持幂等。
   * 调用方：proxy.stop command handler 与 CoreApplication 关闭路径。
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await this.closeListener('reset');
    await this.exchangeTracker.settle();
    await Promise.allSettled(Array.from(this.captureOperations));
    this.pendingTunnels.clear();
    this.address = null;
    this.sessionId = null;
    this.exchangeTracker.setSession(null);
    this.diagnostics?.info('proxy.stopped');
  }

  /** 返回当前代理运行态快照。调用方：proxy.status command handler。 */
  status(): ProxyRuntimeStatus {
    const listening = this.server !== null || this.rebuilding;
    return {
      listening,
      recording: this.recording && listening,
      host: this.address?.host ?? null,
      port: this.address?.port ?? null,
      sessionId: this.sessionId,
      capturedExchanges: this.capturedExchanges,
    };
  }

  /**
   * 记录当前可用的 CA 材料。不解密时 listener 所有连接都进隧道、证书永不出示，
   * 因此这里只更新状态；换 listener 统一由 startHttpsDecryption 在真要用时完成。
   * 调用方：tls.useCertificate command handler（Root CA 生成 / 安装信任 / 卸载 / 删除）。
   */
  useCertificate(ca: ProxyTlsConfig['ca']): void {
    if (ca?.cert === this.tlsConfig.ca?.cert) {
      return;
    }
    this.generateTls({ ...this.tlsConfig, ca });
    this.diagnostics?.info('tls.certificate-changed', {
      attributes: { present: ca !== null },
    });
  }

  /**
   * 开始解密 HTTPS：只放行用户名单内的 host 进隧道，其余全部 MITM。
   * 名单经 getter 每连接求值；只有 listener 还挂着旧证书时才需要重建。
   * 调用方：tls.startDecryption command handler（Settings 的 Decrypt HTTPS 开关）。
   */
  async startHttpsDecryption(): Promise<void> {
    if (!this.tlsConfig.ca) {
      throw new Error('A Root CA is required for HTTPS decryption.');
    }
    this.generateTls({ ...this.tlsConfig, mitm: true });
    if (this.server && this.listenerCertificate?.cert !== this.tlsConfig.ca?.cert) {
      await this.rebuildServer();
    }
    this.diagnostics?.info('tls.decryption-started');
  }

  /**
   * 停止解密 HTTPS：全部 host 退回隧道，证书不再出示。
   * 新代际让停止期间报过的 host 在重新开始后可以再次上报。
   * 调用方：tls.stopDecryption command handler（Settings 的 Decrypt HTTPS 开关）。
   */
  stopHttpsDecryption(): void {
    this.generateTls({ ...this.tlsConfig, mitm: false });
    this.diagnostics?.info('tls.decryption-stopped');
  }

  /**
   * 全量替换源站证书的不安全例外名单。ignoreHostHttpsErrors 是注册规则时的快照，
   * 因此重注册转发规则即可生效，不必换 listener。
   * 调用方：tls.replaceInsecureHosts command handler（Certificates 的 Per-host overrides）。
   */
  async replaceInsecureHosts(hosts: readonly string[]): Promise<void> {
    if (ProxyUtils.sameHosts(this.tlsConfig.insecureHosts, hosts)) {
      return;
    }
    this.generateTls({ ...this.tlsConfig, insecureHosts: [...hosts] });
    if (this.server) {
      await this.registerForwardingRule(this.server);
    }
    this.diagnostics?.info('tls.insecure-hosts-replaced', {
      attributes: { hosts: hosts.length },
    });
  }

  /**
   * 全量替换 TLS passthrough 名单。名单经 getter 每连接求值，对新连接立即生效。
   * 调用方：tls-passthrough.replace command handler（TLS passthrough 页的增删）。
   */
  replacePassthroughHosts(hosts: readonly string[]): void {
    this.generateTls({ ...this.tlsConfig, passthroughHosts: [...hosts] });
    this.diagnostics?.info('tls.passthrough-hosts-replaced', {
      attributes: { hosts: hosts.length },
    });
  }

  /**
   * 换上新配置并开启新代际，旧代际累积的兼容性上报随之作废。
   * 同时刷新 `passthroughRules` —— 它就是 Mockttp `tlsPassthrough` getter 每连接读的那份，
   * 因此只改名单的命令做完这一步就已经生效，不必碰 listener。
   */
  private generateTls(config: ProxyTlsConfig): void {
    this.tlsGeneration += 1;
    this.reportedTlsCompatibilityKeys.clear();
    this.tlsCompatibilityEventQueue.reset();
    this.tlsConfig = {
      ca: config.ca,
      mitm: config.mitm,
      insecureHosts: [...config.insecureHosts],
      passthroughHosts: [...config.passthroughHosts],
    };
    this.passthroughRules = ProxyService.toPassthroughRules(config);
  }

  /** 当前 TLS 运行态；每条 tls.* 命令都回报它。 */
  tlsState(): { certificateReady: boolean; decrypting: boolean } {
    return {
      certificateReady: this.tlsConfig.ca !== null,
      decrypting: this.tlsConfig.mitm,
    };
  }

  /** `*` 匹配全部 hostname（含 IP 与 localhost），因此 MITM 关闭等价于全量 passthrough。 */
  private static toPassthroughRules(
    config: ProxyTlsConfig,
  ): { hostname: string }[] {
    return config.mitm
      ? config.passthroughHosts.map((hostname) => ({ hostname }))
      : [{ hostname: '*' }];
  }

  /** 按当前 TLS 配置创建并启动一个 Mockttp server；passthrough 名单由 getter 每连接求值。 */
  private async startServer(port?: number): Promise<ProxyAddress> {
    // 无 CA 时用进程内临时身份；此时名单为 `*`，所有 host 直接进隧道，证书永不出示。
    const identity = this.tlsConfig.ca
      ?? (this.tlsPassthroughIdentity ??= await generateCACertificate());
    const server = getLocal({
      https: {
        key: identity.key,
        cert: identity.cert,
        tlsPassthrough: () => this.passthroughRules,
      },
      // 支持 H2 的客户端协商 HTTP/2，仅支持 H1 的客户端经 ALPN 回退。
      http2: true,
      passthroughProxyConfig: ({ hostname }) => this.upstreamProxySetting('https', hostname),
    });
    this.registerCaptureListeners(server);
    await this.registerForwardingRule(server);
    const webSocketBridge = this.createWebSocketBridge();
    await webSocketBridge.register(server);
    await server.start(port ?? undefined);
    this.webSocketBridge = webSocketBridge;
    this.server = server;
    this.listenerCertificate = identity;
    this.clientAppService?.setProxyPort(server.port);
    return { host: this.host, port: server.port };
  }

  /**
  * 按协议注册同一转发逻辑，全部判定都在头部阶段完成。
   * 不用 `.matching(callback)`：Mockttp 的 CallbackMatcher 会先 waitForCompletedRequest
   * 读完整个上传正文；也不用 beforeRequest/beforeResponse，它们分别等待完整请求与响应正文。
   * 只有 beforeRequestHead / beforeResponseHead 能让正文全程保持流式。
   */
  private async registerForwardingRule(server: Mockttp): Promise<void> {
    // 默认验证源站证书；仅对显式不安全例外 host 忽略。
    const ignoreHostHttpsErrors =
      this.tlsConfig.insecureHosts.length > 0
        ? [...this.tlsConfig.insecureHosts]
        : undefined;
    const rules = process.platform === 'darwin'
      ? (['http', 'https'] as const).map((protocol) => ({ protocol, requestMatchers: [new matchers.WildcardMatcher(), new matchers.ProtocolMatcher(protocol)] }))
      : [{ protocol: 'http' as const, requestMatchers: [new matchers.WildcardMatcher()] }];
    await server.setRequestRules(...rules.map(({ protocol, requestMatchers }) => ({
      matchers: requestMatchers,
      steps: [new requestSteps.PassThroughStep({
        // 上游连接失败（DNS/TCP/TLS）按真实网络故障镜像给客户端，而不是伪造一个
        // 502 响应：Interceptor 是透明调试代理，客户端必须看到与不挂代理时一致的
        // 失败形态，Capture 里也才会记成 aborted + 真实 errorCode 而非假响应。
        // 副作用是 Mockttp 走 AbortError 分支，不再向 stdout 打印上游错误堆栈。
        simulateConnectionErrors: true,
        // 回调而非固定值：上游代理切换时无需重注册规则或重启监听器。
        proxyConfig: ({ hostname }) => this.upstreamProxySetting(protocol, hostname),
        ...(ignoreHostHttpsErrors ? { ignoreHostHttpsErrors } : {}),
        ...(this.ruleService
          ? {
              beforeRequestHead: (req) => this.applyRulesToRequest(req),
              beforeResponseHead: (res, req) => this.applyRulesToResponse(res, req),
            }
          : {}),
      })],
    })));
  }

  /** WebSocket 桥自建上游连接、不经规则链，因此上游与证书例外都要单独接进去。 */
  private createWebSocketBridge(): WebSocketBridge {
    return new WebSocketBridge({
      intercept: (message) => this.interceptWebSocketMessage(message),
      ignoreCertificateErrors: (hostname) =>
        this.tlsConfig.insecureHosts.includes(hostname),
      upstreamProxy: () => this.upstreamProxy,
      onError: (error) => {
        this.diagnostics?.error('websocket.bridge-failed', {
          errorCode: error.name,
        });
      },
      onAbnormalDisconnect: (streamId) => {
        const exchangeId = this.exchangeTracker.exchangeIdFor(streamId);
        if (exchangeId !== undefined) {
          this.ruleService?.abortWebSocketBreakpoints(exchangeId);
        }
      },
      onUpgradeFailed: (streamId, error) => {
        this.exchangeTracker.failWebSocketUpgrade(
          streamId,
          ProxyUtils.readErrorCode(error),
        );
      },
    });
  }

  /**
   * 关闭当前 listener。capture 记账的处置由调用方决定：
   * 重建只终结在途 Exchange（保留代际与计数），停止则整体重置。
   */
  private async closeListener(
    capture: 'abort-in-flight' | 'reset',
  ): Promise<void> {
    const server = this.server;
    this.server = null;
    this.clientAppService?.setProxyPort(null);
    this.webSocketBridge?.close();
    this.webSocketBridge = null;
    if (capture === 'reset') {
      this.exchangeTracker.reset();
    } else {
      this.exchangeTracker.abortInFlight('ERR_LISTENER_REBUILD');
    }
    this.webSocketTails.clear();
    this.pendingTunnels.clear();
    if (server) {
      await server.stop();
    }
  }

  /** 原端口替换 listener；重建窗口内对外仍报 listening，避免状态栏闪断。 */
  private async rebuildServer(): Promise<void> {
    const port = this.address?.port;
    this.rebuilding = true;
    try {
      await this.closeListener('abort-in-flight');
      this.address = await this.startServer(port);
    } finally {
      this.rebuilding = false;
    }
  }

  /**
   * 恢复捕获记录：新连接重新创建 Exchange。
   * 调用方：proxy.setRecording command handler 与 start()——暂停后再次 Start 等价于 Resume。
   */
  resumeRecording(): void {
    this.recording = true;
    this.exchangeTracker.setRecording(true);
    this.diagnostics?.info('proxy.recording-resumed');
  }

  /**
   * 暂停捕获记录。Mockttp 监听器与系统代理保持不变，流量继续转发，
   * 仅不再为新连接创建 Exchange；已在途的 Exchange 自然完成落库。
   * 调用方：proxy.setRecording command handler。
   */
  pauseRecording(): void {
    this.recording = false;
    this.exchangeTracker.setRecording(false);
    this.diagnostics?.info('proxy.recording-paused');
  }

  /**
   * 设置上游代理；null 表示直连源站。
   * 企业 PAC / VPN / 认证代理环境下必须链式转发，否则接管系统代理期间会完全断网。
   * 调用方：proxy.setUpstream command handler（Main 在接管系统代理时下发原有配置）。
   */
  setUpstreamProxy(upstream: UpstreamProxyConfig | null): void {
    this.upstreamProxy = upstream;
    this.diagnostics?.info(
      upstream ? 'proxy.upstream-configured' : 'proxy.upstream-cleared',
      upstream
        ? { attributes: { scheme: 'proxyUrl' in upstream ? upstream.proxyUrl.split(':')[0] ?? 'unknown' : 'per-protocol' } }
        : undefined,
    );
  }

  /** Load and compile PAC configuration before committing a user-requested route change. */
  async validateUpstream(upstream: UpstreamProxyConfig | null, abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    if (!upstream) return;
    const urls = 'proxyUrl' in upstream
      ? [upstream.proxyUrl]
      : [upstream.httpProxyUrl, upstream.httpsProxyUrl].filter((url): url is string => url !== null);
    const pacUrls = [...new Set(urls.filter(url => url.startsWith('pac+')))];
    if (pacUrls.length === 0) return;
    const { PacProxyAgent } = await import('pac-proxy-agent');
    for (const url of pacUrls) {
      const pacProxyAgent = new PacProxyAgent(url, {
        timeout: 5_000,
        signal: AbortSignal.any([abortSignal, AbortSignal.timeout(5_000)]),
      });
      try {
        await pacProxyAgent.getResolver();
        abortSignal.throwIfAborted();
      } catch (error) {
        throw new Error('PAC configuration could not be loaded or compiled.', { cause: error });
      } finally {
        pacProxyAgent.destroy();
      }
    }
  }

  /** 当前上游代理的 Mockttp 形式；undefined 让 Mockttp 直连源站。 */
  private upstreamProxySetting(protocol: 'http' | 'https', hostname: string): ProxySetting | undefined {
    return ProxyUtils.selectUpstreamProxy(this.upstreamProxy, protocol, hostname);
  }

  /**
   * 推进 capture generation 并丢弃全部在途状态，返回仍在录制的活动 Session。
   * 调用方：CoreApplication 在 capture.cleanup(all) 入队前建立清空切面。
   */
  async prepareCaptureReset(): Promise<string | null> {
    this.exchangeTracker.reset();
    await this.exchangeTracker.settle();
    await Promise.allSettled(Array.from(this.captureOperations));
    this.webSocketTails.clear();
    this.pendingTunnels.clear();
    this.capturedExchanges = 0;
    return this.server ? this.sessionId : null;
  }

  /** 当前 WebSocket 断点配置；未启用时 bridge 直接转发不挂起。 */
  get webSocketBreakpointSettings(): WebSocketBreakpointSettings | null {
    return this.webSocketBreakpoint;
  }

  /** 调用方：websocket.breakpoint.enable command handler。 */
  enableWebSocketBreakpoints(settings: WebSocketBreakpointSettings): void {
    this.webSocketBreakpoint = settings;
  }

  /** 调用方：websocket.breakpoint.disable command handler。 */
  disableWebSocketBreakpoints(): void {
    this.webSocketBreakpoint = null;
  }

  private registerCaptureListeners(server: Mockttp): void {
    void server.on('tls-passthrough-opened', (tunnel: TlsPassthroughEvent) => {
      if (!this.recording) {
        return;
      }
      const capture = this.trackCapture(this.captureTunnelOpened(tunnel)).catch((error: unknown) => {
        this.diagnostics?.error('tunnel.open-persist-failed', {
          errorCode: error instanceof Error ? error.name : 'unknown',
          attributes: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        return null;
      });
      this.pendingTunnels.set(tunnel.id, capture);
    });
    void server.on('tls-passthrough-closed', (tunnel: TlsPassthroughEvent) => {
      const capture = this.pendingTunnels.get(tunnel.id);
      if (!capture) {
        return;
      }
      void capture
        .then((pending) => this.trackCapture(this.captureTunnelClosed(pending)))
        .catch((error: unknown) => {
          this.diagnostics?.error('tunnel.close-persist-failed', {
            errorCode: error instanceof Error ? error.name : 'unknown',
          });
        })
        .finally(() => this.pendingTunnels.delete(tunnel.id));
    });
    // 只订阅增量事件。绝不订阅 completed 的 'request' / 'response'：Mockttp 检测到
    // 这两个 listener 后会调用 waitForCompletedRequest 与 body.asBuffer()，
    // 无条件把完整正文缓冲进内存。
    void server.on('request-initiated', (request: InitiatedRequest) => {
      this.exchangeTracker.beginRequest(request);
      this.capturedExchanges = this.exchangeTracker.totalCaptured;
    });
    void server.on('request-body-data', (data: BodyData) => {
      this.exchangeTracker.appendRequestBody(data);
    });
    void server.on('request-trailers', (trailers: TrailerData) => {
      this.exchangeTracker.recordRequestTrailers(trailers.id, trailers.rawTrailers);
    });
    void server.on('response-initiated', (response: InitiatedResponse) => {
      this.exchangeTracker.beginResponse(response);
    });
    void server.on('response-information', (response: InitiatedResponse) => {
      this.exchangeTracker.recordInformationalResponse(response);
    });
    void server.on('response-body-data', (data: BodyData) => {
      this.exchangeTracker.appendResponseBody(data);
    });
    void server.on('response-trailers', (trailers: TrailerData) => {
      this.exchangeTracker.recordResponseTrailers(trailers.id, trailers.rawTrailers);
    });
    void server.on('abort', (request: AbortedRequest) => {
      this.ruleService?.abortRequestBreakpoints(request.id);
      this.exchangeTracker.abortExchange(request);
    });
    void server.on('websocket-request', (request: CompletedRequest) => {
      this.exchangeTracker.beginWebSocketRequest(request);
      this.capturedExchanges = this.exchangeTracker.totalCaptured;
    });
    void server.on('websocket-accepted', (response: CompletedResponse) => {
      this.exchangeTracker.acceptWebSocket(response.id, response.statusCode);
    });
    void server.on('websocket-close', (close: WebSocketClose) => {
      const tail = this.webSocketTails.get(close.streamId) ?? Promise.resolve();
      void tail
        .then(() => {
          this.exchangeTracker.closeWebSocket(close.streamId);
        })
        .catch((error: unknown) => {
          this.diagnostics?.error('websocket.close-persist-failed', {
            errorCode: error instanceof Error ? error.name : 'unknown',
          });
        })
        .finally(() => {
          this.webSocketTails.delete(close.streamId);
        });
      this.diagnostics?.info('websocket.closed', {
        attributes: {
          code: close.closeCode ?? 0,
          reason: close.closeReason,
        },
      });
    });
    // HTTPS 握手/客户端协议错误是抓包排障关键：CA 未信任、ALPN、证书拒绝等。
    void server.on('tls-client-error', (error) => {
      this.diagnostics?.warn('tls.client-error', {
        attributes: {
          reason: error.failureCause,
          host: error.tlsMetadata?.sniHostname ?? 'unknown',
        },
      });
      this.enqueueTlsCompatibilityEvent(error);
    });
    void server.on('client-error', (error) => {
      this.diagnostics?.warn('client.error', {
        errorCode: error.errorCode ?? 'unknown',
      });
    });
  }

  /** 排空全局 TLS 兼容性信号，交给 Core 的事件批通道。 */
  drainTlsCompatibilityEvents(maxBatch: number): TlsCompatibilityEvent[] {
    return this.tlsCompatibilityEventQueue.drain(maxBatch);
  }

  /** 事件通道发送失败时把整批放回队列。 */
  restoreTlsCompatibilityEvents(
    events: readonly TlsCompatibilityEvent[],
  ): void {
    this.tlsCompatibilityEventQueue.restore(events);
  }

  /** 每个代际每个 host 只上报一条可操作的 TLS 兼容性信号。 */
  private enqueueTlsCompatibilityEvent(error: TlsHandshakeFailure): void {
    // 任何握手失败原因都可能是客户端拒绝解密；能归属到 host 就值得建议 passthrough。
    if (!this.tlsConfig.ca) {
      return;
    }
    const host = (
      error.tlsMetadata?.sniHostname ?? error.destination?.hostname ?? ''
    ).trim().toLowerCase();
    if (!host) {
      return;
    }
    const key = `${this.tlsGeneration}:${host}`;
    if (this.reportedTlsCompatibilityKeys.has(key)) {
      return;
    }
    this.reportedTlsCompatibilityKeys.add(key);
    this.tlsCompatibilityEventQueue.enqueue({
      generation: this.tlsGeneration,
      host,
      reason: error.failureCause,
      timestamp: Date.now(),
    });
  }

  /** 持久化一个未解密 CONNECT 隧道的有限目标元数据并推送 open 摘要。 */
  private async captureTunnelOpened(
    tunnel: TlsPassthroughEvent,
  ): Promise<PendingTunnelCapture | null> {
    const sessionId = this.sessionId;
    const startedAt = tunnel.timingEvents.startTime;
    if (!this.server || !sessionId) {
      return null;
    }
    const secure = true;
    const protocol = 'tls';
    const exchange: ExchangeInput = {
      id: `ex-${ProxyUtils.cryptoRandomId()}`,
      sessionId,
      method: 'CONNECT',
      scheme: 'https',
      host: tunnel.destination.hostname,
      port: tunnel.destination.port,
      url: `https://${tunnel.destination.hostname}:${tunnel.destination.port}`,
      protocol,
      statusCode: 200,
      responseMime: 'application/x-encrypted-tunnel',
      startedAt,
      requestBytes: 0,
      responseBytes: 0,
      state: 'request-complete',
      headers: [],
    };
    const exchangeId = await this.exchangeTracker.trackTunnel(exchange);
    if (!exchangeId) {
      return null;
    }
    this.capturedExchanges = this.exchangeTracker.totalCaptured;
    return {
      exchangeId,
      startedAt,
      host: tunnel.destination.hostname,
      port: tunnel.destination.port,
      secure,
      protocol,
    };
  }

  /** 将原始 CONNECT 隧道标记为完成，并推送同 id 的 duration 更新。 */
  private async captureTunnelClosed(
    pending: PendingTunnelCapture | null,
  ): Promise<void> {
    if (!pending) {
      return;
    }
    await this.exchangeTracker.completeTunnel(
      pending.exchangeId,
      pending.startedAt,
      pending.host,
      pending.secure,
      pending.protocol,
    );
  }

  /** 登记一项在途 Capture 工作，并在完成后自动移除。 */
  private trackCapture<T>(operation: Promise<T>): Promise<T> {
    this.captureOperations.add(operation);
    void operation.then(
      () => this.captureOperations.delete(operation),
      () => this.captureOperations.delete(operation),
    );
    return operation;
  }

  /** 按 stream 顺序保存已关联 Exchange 的 WebSocket 消息。 */
  private captureWebSocketMessage(
    message: WebSocketBridgeMessage,
    exchangeId: string,
  ): Promise<number | undefined> {
    const tail = this.webSocketTails.get(message.streamId) ?? Promise.resolve();
    const capture = this.trackCapture(tail
      .then(async () => {
        const payload = await this.persistBody(
          message.content,
          message.isBinary
            ? 'application/octet-stream'
            : 'text/plain; charset=utf-8',
        );
        const [frameSequence] = await this.captureService.appendWebSocketFrames(exchangeId, [
          {
            direction: message.direction,
            opcode: message.isBinary ? 2 : 1,
            payloadSize: message.content.byteLength,
            timestamp: message.timestamp,
            ...(payload ? { payload } : {}),
          },
        ]);
        return frameSequence;
      })
      .catch((error) => {
        this.diagnostics?.error('websocket.persist-failed', {
          errorCode: error instanceof Error ? error.name : 'unknown',
        });
        return undefined;
      }));
    this.webSocketTails.set(message.streamId, capture.then(() => undefined));
    return capture;
  }

  private async interceptWebSocketMessage(message: WebSocketBridgeMessage) {
    const forwardUnchanged = {
      action: 'forward' as const,
      content: message.content,
      isBinary: message.isBinary,
      ...(message.closeCode !== undefined ? { closeCode: message.closeCode } : {}),
    };
    const settings = this.webSocketBreakpoint;
    const exchangeId = await this.exchangeTracker.whenExchangeReady(message.streamId);
    if (
      !settings
      || !this.ruleService
      || exchangeId === null
      || settings.exchangeId !== exchangeId
      || !ProxyUtils.matchesWebSocketBreakpoint(settings, message)
    ) {
      if (message.frame === 'message' && exchangeId !== null) {
        void this.captureWebSocketMessage(message, exchangeId);
      }
      return forwardUnchanged;
    }
    const webSocketFrameSequence = message.frame === 'message'
      ? await this.captureWebSocketMessage(message, exchangeId)
      : undefined;
    const bodyFormat = message.isBinary ? 'hex' : 'text';
    const body = message.isBinary
      ? ProxyUtils.toHexString(message.content)
      : message.content.toString('utf8');
    const outcome = await this.ruleService.pauseWebSocketMessage({
      ruleName: WEBSOCKET_BREAKPOINT_RULE_NAME[message.frame],
      exchangeId,
      url: message.url,
      direction: message.direction,
      frame: message.frame,
      ...(webSocketFrameSequence !== undefined ? { webSocketFrameSequence } : {}),
      ...(message.frame === 'message' ? { opcode: message.isBinary ? 2 : 1 } as const : {}),
      bodyFormat,
      headers: [],
      // 消息断点持有完整 payload，与头部阶段的 HTTP 断点不同。
      bodyAvailable: true,
      body,
      ...(message.closeCode !== undefined ? { closeCode: message.closeCode } : {}),
    }, `ws:${exchangeId}`);
    if (outcome.state === 'dropped' || outcome.state === 'aborted') {
      return { action: 'drop' as const };
    }
    if (
      outcome.state === 'edited' &&
      outcome.edit !== undefined &&
      (outcome.edit.body !== undefined || outcome.edit.closeCode !== undefined)
    ) {
      return {
        action: 'forward' as const,
        content: outcome.edit.body === undefined
          ? message.content
          : message.isBinary
            ? ProxyUtils.parseHexString(outcome.edit.body)
            : Buffer.from(outcome.edit.body, 'utf8'),
        isBinary: message.isBinary,
        ...(outcome.edit.closeCode !== undefined
          ? { closeCode: outcome.edit.closeCode }
          : message.closeCode !== undefined ? { closeCode: message.closeCode } : {}),
      };
    }
    return forwardUnchanged;
  }

  /**
   * 把一段完整正文写入 BodyStore 并生成 hash metadata。
   * 仅用于 WebSocket 单条消息 payload —— HTTP 正文走 ExchangeTracker 的增量写入器。
   */
  private async persistBody(
    buffer: Uint8Array,
    mediaType: string,
  ): Promise<BodyRefInput | undefined> {
    if (buffer.byteLength === 0) {
      return undefined;
    }
    const id = `body-${ProxyUtils.cryptoRandomId()}`;
    try {
      const { hash, size } = await this.captureService.writeBody(
        ProxyUtils.singleChunk(buffer),
      );
      return {
        id,
        blobHash: hash,
        encodedSize: size,
        mediaType,
        decodeStatus: 'ok',
      };
    } catch {
      return {
        id,
        encodedSize: buffer.byteLength,
        mediaType,
        decodeStatus: 'skipped',
      };
    }
  }

  /** 构造最终 content bytes、维护继承 CL，并收敛为 Tracker replacement。 */
  private async prepareRuleBodyReplacement(
    effect: RuleBodyEffect | undefined,
    body: string | Uint8Array | undefined,
    originalHeaders: HeaderBag,
    state: MutableRequestState | MutableResponseState,
  ): Promise<RuleBodyReplacement | undefined> {
    if (!effect || body === undefined) {
      return undefined;
    }
    const prepared = await this.httpMessageService.prepareReplacement({
      body,
      source: effect.source,
      originalHeaders,
      headers: state.headers,
      editedHeaderNames: state.editedHeaderNames ?? new Set(),
    });
    state.headers = prepared.headers;
    const mediaType = ProxyUtils.readHeader(state.headers, 'content-type');
    const contentEncoding = ProxyUtils.readHeader(state.headers, 'content-encoding');
    return {
      effect,
      content: prepared.content,
      ...(mediaType ? { mediaType } : {}),
      ...(contentEncoding ? { contentEncoding } : {}),
    };
  }

  /**
   * 请求头阶段套用规则引擎：不等待请求正文，因此上传全程流式。
   * 命中则记录审计、按需延迟，返回短路响应 / 阻断 / 改写后的请求头。
   */
  private async applyRulesToRequest(
    request: RuleRequestInput,
  ): Promise<ProxyRequestResult | undefined> {
    if (!this.ruleService || !this.ruleService.hasRules) {
      return undefined;
    }
    const state: MutableRequestState = {
      method: request.method,
      url: request.url,
      headers: ProxyUtils.cloneHeaders(request.headers),
      editedHeaderNames: new Set<string>(),
    };
    try {
      const evaluation = await this.ruleService.evaluateRequest(
        ProxyUtils.buildRequestContext(request),
        state,
        request.id,
        this.exchangeTracker.exchangeIdFor(request.id),
      );
      const bodyReplacement = await this.prepareRuleBodyReplacement(
        evaluation.bodyEffect,
        state.body,
        request.headers,
        state,
      );
      this.exchangeTracker.recordRuleOutcome(
        request.id,
        evaluation.hits,
        evaluation.headerEffects,
        bodyReplacement,
      );
      if (evaluation.kind === 'aborted') {
        return undefined;
      }
      if (evaluation.kind === 'respond') {
        return { response: ProxyUtils.toCallbackResponse(evaluation.response) };
      }
      if (evaluation.kind === 'block') {
        return { response: evaluation.mode };
      }
      if (evaluation.delayMs > 0) {
        await ProxyUtils.delay(evaluation.delayMs);
      }
      return {
        method: state.method,
        url: state.url,
        headers: ProxyUtils.toMockttpHeaders(state.headers),
        editedHeaderNames: [...(state.editedHeaderNames ?? [])],
        ...(bodyReplacement ? { rawBody: bodyReplacement.content } : {}),
      };
    } catch (error) {
      this.diagnostics?.error('rules.request-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
      if (this.httpMessageService.isEncodingError(error)) {
        throw error;
      }
      return undefined;
    }
  }

  /**
   * 响应头阶段套用规则引擎：不缓冲响应正文，因此下载全程流式。
   * 命中则记录审计、按需延迟，返回阻断或改写后的响应头。
   */
  private async applyRulesToResponse(
    response: RuleResponseInput,
    request: RuleRequestInput,
  ): Promise<ProxyResponseResult | undefined> {
    if (!this.ruleService || !this.ruleService.hasRules) {
      return undefined;
    }
    const state: MutableResponseState = {
      statusCode: response.statusCode,
      headers: ProxyUtils.cloneHeaders(response.headers),
      editedHeaderNames: new Set<string>(),
    };
    try {
      const evaluation = await this.ruleService.evaluateResponse(
        ProxyUtils.buildResponseContext(request, response),
        state,
        request.id,
        this.exchangeTracker.exchangeIdFor(request.id),
      );
      const bodyReplacement = await this.prepareRuleBodyReplacement(
        evaluation.bodyEffect,
        state.body,
        response.headers,
        state,
      );
      this.exchangeTracker.recordRuleOutcome(
        request.id,
        evaluation.hits,
        evaluation.headerEffects,
        bodyReplacement,
      );
      if (evaluation.kind === 'aborted') {
        return undefined;
      }
      if (evaluation.kind === 'block') {
        return evaluation.mode;
      }
      if (evaluation.delayMs > 0) {
        await ProxyUtils.delay(evaluation.delayMs);
      }
      return {
        statusCode: state.statusCode,
        headers: ProxyUtils.toMockttpHeaders(state.headers),
        editedHeaderNames: [...(state.editedHeaderNames ?? [])],
        ...(bodyReplacement ? { rawBody: bodyReplacement.content } : {}),
      };
    } catch (error) {
      this.diagnostics?.error('rules.response-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
      if (this.httpMessageService.isEncodingError(error)) {
        throw error;
      }
      return undefined;
    }
  }
}
