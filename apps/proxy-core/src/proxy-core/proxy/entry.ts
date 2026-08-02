import { generateCACertificate, getLocal, type Mockttp } from 'mockttp';
import type {
  AbortedRequest,
  BodyData,
  CompletedRequest,
  CompletedResponse,
  InitiatedRequest,
  InitiatedResponse,
  ProxySetting,
  TlsPassthroughEvent,
  TrailerData,
  WebSocketClose,
  WebSocketMessage,
} from 'mockttp';

import type { UpstreamProxyConfig } from '@interceptor/core-protocol';

import { DEFAULT_PROXY_HOST, appVersion } from '../constants';
import type { ClientAppService } from '../client-app/entry';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import type {
  MutableRequestState,
  MutableResponseState,
} from '../rules/interfaces';
import type { RuleEngine } from '../rules/entry';
import type { BodyRefInput, ExchangeInput } from '../storage/interfaces';
import type {
  CaptureEventSink,
  CaptureSink,
  PendingTunnelCapture,
  ProxyAddress,
  ProxyRequestResult,
  ProxyResponseResult,
  ProxyRuntimeStatus,
  ProxyStartOptions,
  ProxyTlsConfig,
  RuleRequestInput,
  RuleResponseInput,
  WebSocketBridgeMessage,
} from './interfaces';
import { ExchangeTracker } from './proxy-exchange-tracker';
import { WebSocketBridge } from './proxy-websocket-bridge';
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
  private readonly tracker: ExchangeTracker;
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
  private webSocketBreakpointsOn = false;
  private tlsConfig: ProxyTlsConfig = { ca: null, insecureHosts: [] };
  /** 上游代理；null 表示直连源站。企业 PAC/VPN 环境下必须链式转发才不断网。 */
  private upstreamProxy: UpstreamProxyConfig | null = null;
  /** Mockttp TLS 分流器所需的进程内临时身份；所有 host passthrough，证书永不出示。 */
  private tlsPassthroughIdentity: { key: string; cert: string } | null = null;
  private diagnostics: DiagnosticsRecorder | null = null;

  constructor(
    private readonly storage: CaptureSink,
    private readonly events: CaptureEventSink,
    private readonly ruleEngine?: RuleEngine,
    private readonly clientApps?: ClientAppService,
  ) {
    this.tracker = new ExchangeTracker(storage, events, clientApps);
  }

  /**
   * 注入数据面诊断汇；由 CoreApplication 在 diagnostics 装配后调用一次。
   * 未注入时所有记录降为 no-op，便于单测直接 new。
   */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
    this.tracker.attachDiagnostics(sink);
  }

  /**
   * 启动 Mockttp 代理并登记捕获会话；重复调用先返回既有地址。
   * 调用方：proxy.start command handler（用户显式开始捕获）。
   */
  async start(options: ProxyStartOptions = {}): Promise<ProxyAddress> {
    // 启动/恢复均意味着恢复记录；暂停后再次 Start 等价于 Resume。
    this.recording = true;
    this.tracker.setRecording(true);
    if (this.server && this.address) {
      // 已在监听：显式请求不同端口时在同一会话上迁移监听端口，否则直接复用。
      if (options.port !== undefined && options.port !== this.address.port) {
        await this.stopServer();
        this.address = await this.startServer(options.port);
      }
      return this.address;
    }

    const sessionId = `session-${ProxyUtils.cryptoRandomId()}`;
    await this.storage.ensureSession({
      id: sessionId,
      name: 'Local capture',
      startedAt: Date.now(),
      captureMode: 'explicit-proxy',
      appVersion,
    });
    this.sessionId = sessionId;
    this.tracker.setSession(sessionId);
    this.host = options.host ?? DEFAULT_PROXY_HOST;
    this.address = await this.startServer(options.port);
    this.diagnostics?.info('proxy.listening', {
      attributes: { host: this.address.host, port: this.address.port },
    });
    return this.address;
  }

  /**
   * 更新 HTTPS MITM 配置（CA 材料 + 不安全例外）；代理正在监听时原端口重建。
   * 调用方：tls.configure command handler（Main 内部下发，非 Renderer）。
   */
  async configureTls(config: ProxyTlsConfig): Promise<void> {
    this.tlsConfig = {
      ca: config.ca,
      insecureHosts: [...config.insecureHosts],
    };
    if (this.server) {
      const port = this.address?.port;
      await this.stopServer();
      this.address = await this.startServer(port);
    }
    this.diagnostics?.info('tls.reconfigured', {
      attributes: {
        mitm: config.ca !== null,
        insecureHosts: config.insecureHosts.length,
      },
    });
  }

  /** 按当前 TLS 配置创建并启动一个 Mockttp server；有 CA 时开启 HTTPS MITM 与 HTTP/2。 */
  private async startServer(port?: number): Promise<ProxyAddress> {
    // H2-capable clients negotiate HTTP/2; H1-only clients fall back through ALPN.
    let server: Mockttp;
    if (this.tlsConfig.ca) {
      server = getLocal({
        https: {
          key: this.tlsConfig.ca.key,
          cert: this.tlsConfig.ca.cert,
        },
        http2: true,
      });
    } else {
      this.tlsPassthroughIdentity ??= await generateCACertificate();
      server = getLocal({
        https: {
          ...this.tlsPassthroughIdentity,
          tlsInterceptOnly: [],
        },
      });
    }
    this.registerCaptureListeners(server);
    // 默认验证源站证书（不关闭）；仅对显式不安全例外 host 忽略源站证书错误。
    //
    // 单一 passthrough 规则 + headers 阶段钩子：不使用 `.matching(callback)`，因为
    // Mockttp 的 CallbackMatcher 会先 waitForCompletedRequest 读完整个上传正文；也不
    // 使用 beforeRequest/beforeResponse，因为它们分别会等待完整请求与响应正文。
    // beforeRequestHead / beforeResponseHead 在头部阶段执行全部规则，正文始终流式。
    const ignoreHostHttpsErrors =
      this.tlsConfig.insecureHosts.length > 0
        ? [...this.tlsConfig.insecureHosts]
        : undefined;
    await server.forAnyRequest().thenPassThrough({
      // 上游连接失败（DNS/TCP/TLS）按真实网络故障镜像给客户端，而不是伪造一个
      // 502 响应：Interceptor 是透明调试代理，客户端必须看到与不挂代理时一致的
      // 失败形态，Capture 里也才会记成 aborted + 真实 errorCode 而非假响应。
      // 副作用是 Mockttp 走 AbortError 分支，不再向 stdout 打印上游错误堆栈。
      simulateConnectionErrors: true,
      // 回调而非固定值：上游代理切换时无需重注册规则或重启监听器。
      proxyConfig: () => this.upstreamProxySetting(),
      ...(ignoreHostHttpsErrors ? { ignoreHostHttpsErrors } : {}),
      ...(this.ruleEngine
        ? {
            beforeRequestHead: (req) => this.applyRulesToRequest(req),
            beforeResponseHead: (res, req) => this.applyRulesToResponse(res, req),
          }
        : {}),
    });
    const webSocketBridge = new WebSocketBridge({
      intercept: (message) => this.interceptWebSocketMessage(message),
      ignoreCertificateErrors: (hostname) =>
        this.tlsConfig.insecureHosts.includes(hostname),
      onError: (error) => {
        this.diagnostics?.error('websocket.bridge-failed', {
          errorCode: error.name,
        });
      },
      onUpgradeFailed: (streamId, error) => {
        this.tracker.failWebSocketUpgrade(
          streamId,
          ProxyUtils.readErrorCode(error),
        );
      },
    });
    await webSocketBridge.register(server);
    await server.start(port ?? undefined);
    this.webSocketBridge = webSocketBridge;
    this.server = server;
    this.clientApps?.setProxyPort(server.port);
    return { host: this.host, port: server.port };
  }

  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.clientApps?.setProxyPort(null);
    this.webSocketBridge?.close();
    this.webSocketBridge = null;
    this.tracker.reset();
    this.webSocketTails.clear();
    this.pendingTunnels.clear();
    if (server) {
      await server.stop();
    }
  }

  /**
   * 停止 Mockttp 代理并清空运行态；重复调用保持幂等。
   * 调用方：proxy.stop command handler 与 CoreApplication 关闭路径。
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await this.stopServer();
    await this.tracker.settle();
    await Promise.allSettled(Array.from(this.captureOperations));
    this.pendingTunnels.clear();
    this.address = null;
    this.sessionId = null;
    this.tracker.setSession(null);
    this.diagnostics?.info('proxy.stopped');
  }

  /** 返回当前代理运行态快照。调用方：proxy.status command handler。 */
  status(): ProxyRuntimeStatus {
    return {
      listening: this.server !== null,
      recording: this.recording && this.server !== null,
      host: this.address?.host ?? null,
      port: this.address?.port ?? null,
      sessionId: this.sessionId,
      capturedExchanges: this.capturedExchanges,
    };
  }

  /**
   * 暂停/恢复捕获记录。暂停时 Mockttp 监听器与系统代理保持不变，流量继续
   * 转发，仅不再为新连接创建 Exchange 记录；已在途的 Exchange 自然完成落库。
   * 调用方：proxy.setRecording command handler（用户 Stop/Start Recording）。
   */
  setRecording(enabled: boolean): void {
    this.recording = enabled;
    this.tracker.setRecording(enabled);
    this.diagnostics?.info(
      enabled ? 'proxy.recording-resumed' : 'proxy.recording-paused',
    );
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
        ? { attributes: { scheme: upstream.proxyUrl.split(':')[0] ?? 'unknown' } }
        : undefined,
    );
  }

  /** 当前上游代理的 Mockttp 形式；undefined 让 Mockttp 直连源站。 */
  private upstreamProxySetting(): ProxySetting | undefined {
    if (!this.upstreamProxy) {
      return undefined;
    }
    return {
      proxyUrl: this.upstreamProxy.proxyUrl,
      ...(this.upstreamProxy.noProxy
        ? { noProxy: [...this.upstreamProxy.noProxy] }
        : {}),
    };
  }

  /**
   * 推进 capture generation 并丢弃全部在途状态，返回仍在录制的活动 Session。
   * 调用方：CoreApplication 在 storage.cleanup(all) 入队前建立清空切面。
   */
  prepareCaptureReset(): string | null {
    this.tracker.reset();
    this.webSocketTails.clear();
    this.pendingTunnels.clear();
    this.capturedExchanges = 0;
    return this.server ? this.sessionId : null;
  }

  get webSocketBreakpointsEnabled(): boolean {
    return this.webSocketBreakpointsOn;
  }

  setWebSocketBreakpointsEnabled(enabled: boolean): void {
    this.webSocketBreakpointsOn = enabled;
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
      this.tracker.beginRequest(request);
      this.capturedExchanges = this.tracker.totalCaptured;
    });
    void server.on('request-body-data', (data: BodyData) => {
      this.tracker.appendRequestBody(data);
    });
    void server.on('request-trailers', (trailers: TrailerData) => {
      this.tracker.recordRequestTrailers(trailers.id, trailers.rawTrailers);
    });
    void server.on('response-initiated', (response: InitiatedResponse) => {
      this.tracker.beginResponse(response);
    });
    void server.on('response-information', (response: InitiatedResponse) => {
      this.tracker.recordInformationalResponse(response);
    });
    void server.on('response-body-data', (data: BodyData) => {
      this.tracker.appendResponseBody(data);
    });
    void server.on('response-trailers', (trailers: TrailerData) => {
      this.tracker.recordResponseTrailers(trailers.id, trailers.rawTrailers);
    });
    void server.on('abort', (request: AbortedRequest) => {
      this.tracker.abortExchange(request);
    });
    void server.on('websocket-request', (request: CompletedRequest) => {
      this.tracker.beginWebSocketRequest(request);
      this.capturedExchanges = this.tracker.totalCaptured;
    });
    void server.on('websocket-accepted', (response: CompletedResponse) => {
      this.tracker.acceptWebSocket(response.id, response.statusCode);
    });
    void server.on('websocket-message-received', (message: WebSocketMessage) => {
      this.enqueueWebSocketMessage(message);
    });
    void server.on('websocket-message-sent', (message: WebSocketMessage) => {
      this.enqueueWebSocketMessage(message);
    });
    void server.on('websocket-close', (close: WebSocketClose) => {
      const tail = this.webSocketTails.get(close.streamId) ?? Promise.resolve();
      void tail
        .then(() => {
          this.tracker.closeWebSocket(close.streamId);
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
    });
    void server.on('client-error', (error) => {
      this.diagnostics?.warn('client.error', {
        errorCode: error.errorCode ?? 'unknown',
      });
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
    const exchangeId = await this.tracker.trackTunnel(exchange);
    if (!exchangeId) {
      return null;
    }
    this.capturedExchanges = this.tracker.totalCaptured;
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
    await this.tracker.completeTunnel(
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

  /** 单 stream Promise 链保持 Mockttp 事件顺序，并等待 101 Exchange 先落库。 */
  private enqueueWebSocketMessage(message: WebSocketMessage): void {
    const tail = this.webSocketTails.get(message.streamId) ?? Promise.resolve();
    const next = tail
      .then(async () => {
        const exchangeId = await this.tracker.whenExchangeReady(
          message.streamId,
        );
        if (!exchangeId) {
          return;
        }
        const payload = await this.persistBody(
          message.content,
          message.isBinary
            ? 'application/octet-stream'
            : 'text/plain; charset=utf-8',
        );
        await this.storage.appendWebSocketFrames(exchangeId, [
          {
            direction:
              message.direction === 'received'
                ? 'client-to-server'
                : 'server-to-client',
            opcode: message.isBinary ? 2 : 1,
            payloadSize: message.content.byteLength,
            timestamp: ProxyUtils.toWallClockTimestamp(
              message.timingEvents.startTime,
              message.timingEvents.startTimestamp,
              message.eventTimestamp,
            ),
            ...(payload ? { payload } : {}),
          },
        ]);
      })
      .catch((error) => {
        this.diagnostics?.error('websocket.persist-failed', {
          errorCode: error instanceof Error ? error.name : 'unknown',
        });
      });
    this.webSocketTails.set(message.streamId, next);
  }

  private async interceptWebSocketMessage(message: WebSocketBridgeMessage) {
    if (!this.webSocketBreakpointsOn || !this.ruleEngine) {
      return {
        action: 'forward' as const,
        content: message.content,
        isBinary: message.isBinary,
      };
    }
    const bodyFormat = message.isBinary ? 'hex' : 'text';
    const body = message.isBinary
      ? ProxyUtils.toHexString(message.content)
      : message.content.toString('utf8');
    const outcome = await this.ruleEngine.pauseWebSocketMessage({
      ruleName: 'WebSocket message',
      url: message.url,
      direction: message.direction,
      opcode: message.isBinary ? 2 : 1,
      bodyFormat,
      headers: [],
      // 消息断点持有完整 payload，与头部阶段的 HTTP 断点不同。
      bodyAvailable: true,
      body,
    });
    if (
      outcome.state === 'dropped' ||
      (outcome.state === 'timed_out' && outcome.timeoutPolicy === 'drop')
    ) {
      return { action: 'drop' as const };
    }
    if (outcome.state === 'edited' && outcome.edit?.body !== undefined) {
      return {
        action: 'forward' as const,
        content: message.isBinary
          ? ProxyUtils.parseHexString(outcome.edit.body)
          : Buffer.from(outcome.edit.body, 'utf8'),
        isBinary: message.isBinary,
      };
    }
    return {
      action: 'forward' as const,
      content: message.content,
      isBinary: message.isBinary,
    };
  }

  /**
   * 把一段完整正文写入 TemporaryBodyStore 并生成 hash metadata。
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
      const { hash, size } = await this.storage.writeBody(
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

  /**
   * 请求头阶段套用规则引擎：不等待请求正文，因此上传全程流式。
   * 命中则记录审计、按需延迟，返回短路响应 / 阻断 / 改写后的请求头。
   */
  private async applyRulesToRequest(
    request: RuleRequestInput,
  ): Promise<ProxyRequestResult | undefined> {
    if (!this.ruleEngine || !this.ruleEngine.hasRules) {
      return undefined;
    }
    const state: MutableRequestState = {
      method: request.method,
      url: request.url,
      headers: ProxyUtils.cloneHeaders(request.headers),
    };
    try {
      const evaluation = await this.ruleEngine.evaluateRequest(
        ProxyUtils.buildRequestContext(request),
        state,
      );
      this.tracker.recordRuleOutcome(
        request.id,
        evaluation.hits,
        evaluation.headerEffects,
      );
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
        ...(state.body !== undefined ? { body: state.body } : {}),
      };
    } catch (error) {
      this.diagnostics?.error('rules.request-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
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
    if (!this.ruleEngine || !this.ruleEngine.hasRules) {
      return undefined;
    }
    const state: MutableResponseState = {
      statusCode: response.statusCode,
      headers: ProxyUtils.cloneHeaders(response.headers),
    };
    try {
      const evaluation = await this.ruleEngine.evaluateResponse(
        ProxyUtils.buildResponseContext(request, response),
        state,
      );
      this.tracker.recordRuleOutcome(
        request.id,
        evaluation.hits,
        evaluation.headerEffects,
      );
      if (evaluation.kind === 'block') {
        return evaluation.mode;
      }
      if (evaluation.delayMs > 0) {
        await ProxyUtils.delay(evaluation.delayMs);
      }
      return {
        statusCode: state.statusCode,
        headers: ProxyUtils.toMockttpHeaders(state.headers),
        ...(state.body !== undefined ? { body: state.body } : {}),
      };
    } catch (error) {
      this.diagnostics?.error('rules.response-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
      return undefined;
    }
  }
}
