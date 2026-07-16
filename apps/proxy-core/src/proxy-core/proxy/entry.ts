import { getLocal, type Mockttp } from 'mockttp';
import type {
  AbortedRequest,
  CompletedRequest,
  CompletedResponse,
  WebSocketClose,
  WebSocketMessage,
} from 'mockttp';

import { DEFAULT_PROXY_HOST, appVersion } from '../constants';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import type {
  MutableRequestState,
  MutableResponseState,
  SyntheticResponseInit,
  MatchContext,
  RuleHitRecord,
} from '../rules/interfaces';
import type { RuleEngine } from '../rules/entry';
import type {
  BodyRefInput,
  ExchangeInput,
  HeaderInput,
} from '../storage/interfaces';
import type {
  CaptureEventSink,
  CaptureSink,
  PendingWebSocketCapture,
  ProxyAddress,
  ProxyPassThroughResponse,
  ProxyRequestResult,
  ProxyResponseResult,
  ProxyRuntimeStatus,
  ProxyStartOptions,
  ProxyTlsConfig,
  WebSocketBridgeMessage,
} from './interfaces';
import { WebSocketBridge } from './proxy-websocket-bridge';
import * as ProxyUtils from './utils';

/**
 * 基于 Mockttp 的显式代理服务，仅绑定 loopback。
 *
 * 用 Mockttp 的 `getLocal()` 作为显式代理：`thenPassThrough()` 转发 HTTP/1.1
 * absolute-form 请求，未配置 HTTPS 解密时对 CONNECT 做不解密的字节直通。通过
 * `request`/`response` 事件按 id 关联，采集规范 Exchange 写入 StorageService。
 * Mockttp 选型的动机与打包方案见 M3.md：它同时支撑 M5 HTTPS MITM 与 M6 HTTP/2，
 * 因其含 WASM/原生依赖不能内联进单文件，故以 external + nft 依赖闭包随包发。
 */
export class ProxyService {
  private readonly pending = new Map<string, CompletedRequest>();
  private readonly pendingWebSockets = new Map<string, PendingWebSocketCapture>();
  /** 按 Mockttp request id 暂存规则命中，captureExchange 关联 exchange id 后落库。 */
  private readonly ruleHits = new Map<string, RuleHitRecord[]>();

  private server: Mockttp | null = null;
  private webSocketBridge: WebSocketBridge | null = null;
  private address: ProxyAddress | null = null;
  private host = DEFAULT_PROXY_HOST;
  private sessionId: string | null = null;
  private capturedExchanges = 0;
  private webSocketBreakpointsOn = false;
  private tlsConfig: ProxyTlsConfig = { ca: null, insecureHosts: [] };
  private diagnostics: DiagnosticsRecorder | null = null;

  constructor(
    private readonly storage: CaptureSink,
    private readonly events: CaptureEventSink,
    private readonly ruleEngine?: RuleEngine,
  ) {}

  /**
   * 注入数据面诊断汇；由 CoreApplication 在 diagnostics 装配后调用一次。
   * 未注入时所有记录降为 no-op，便于单测直接 new。
   */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /**
   * 启动 Mockttp 代理并登记捕获会话；重复调用先返回既有地址。
   * 调用方：proxy.start command handler（用户显式开始捕获）。
   */
  async start(options: ProxyStartOptions = {}): Promise<ProxyAddress> {
    if (this.server && this.address) {
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
    // http2:true —— 有 HTTPS(MITM) 时对经 ALPN 声明支持 h2 的客户端启用 HTTP/2，H1-only
    // 客户端按 ALPN 协商回落 http/1.1。上游由 Mockttp passthrough 按源站 ALPN 独立协商
    // h2/h1 并做四组协议转换。无 HTTPS(明文显式代理) 时不启用 h2（H2 需 TLS ALPN）。
    const server = this.tlsConfig.ca
      ? getLocal({
          https: {
            key: this.tlsConfig.ca.key,
            cert: this.tlsConfig.ca.cert,
          },
          http2: true,
        })
      : getLocal();
    this.registerCaptureListeners(server);
    // 默认验证源站证书（不关闭）；仅对显式不安全例外 host 忽略源站证书错误。
    // 接入规则引擎的 beforeRequest/beforeResponse 做匹配改写/短路/阻断/断点；
    // 无规则时回调快速返回 undefined，不影响转发。
    const ignoreHostHttpsErrors =
      this.tlsConfig.insecureHosts.length > 0
        ? [...this.tlsConfig.insecureHosts]
        : undefined;
    await server.forAnyRequest().thenPassThrough({
      ...(ignoreHostHttpsErrors ? { ignoreHostHttpsErrors } : {}),
      beforeRequest: (req) => this.applyRulesToRequest(req),
      beforeResponse: (res, req) => this.applyRulesToResponse(res, req),
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
    });
    await webSocketBridge.register(server);
    await server.start(port ?? undefined);
    this.webSocketBridge = webSocketBridge;
    this.server = server;
    return { host: this.host, port: server.port };
  }

  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.webSocketBridge?.close();
    this.webSocketBridge = null;
    this.pending.clear();
    for (const capture of this.pendingWebSockets.values()) {
      capture.resolveExchange(null);
    }
    this.pendingWebSockets.clear();
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
    this.address = null;
    this.diagnostics?.info('proxy.stopped');
  }

  /** 返回当前代理运行态快照。调用方：proxy.status command handler。 */
  status(): ProxyRuntimeStatus {
    return {
      listening: this.server !== null,
      host: this.address?.host ?? null,
      port: this.address?.port ?? null,
      sessionId: this.sessionId,
      capturedExchanges: this.capturedExchanges,
    };
  }

  get webSocketBreakpointsEnabled(): boolean {
    return this.webSocketBreakpointsOn;
  }

  setWebSocketBreakpointsEnabled(enabled: boolean): void {
    this.webSocketBreakpointsOn = enabled;
  }

  private registerCaptureListeners(server: Mockttp): void {
    void server.on('request', (request: CompletedRequest) => {
      this.pending.set(request.id, request);
    });
    void server.on('response', (response: CompletedResponse) => {
      const webSocketCapture = this.pendingWebSockets.get(response.id);
      if (webSocketCapture) {
        void this.captureExchange(webSocketCapture.request, response).then((exchangeId) => {
          webSocketCapture.resolveExchange(exchangeId);
          this.pendingWebSockets.delete(response.id);
        });
        return;
      }
      const request = this.pending.get(response.id);
      if (!request) {
        return;
      }
      this.pending.delete(response.id);
      void this.captureExchange(request, response);
    });
    void server.on('abort', (request: AbortedRequest) => {
      const webSocketCapture = this.pendingWebSockets.get(request.id);
      if (webSocketCapture) {
        this.pendingWebSockets.delete(request.id);
        void this.captureExchange(webSocketCapture.request, null, 'aborted').then(
          (exchangeId) => {
            webSocketCapture.resolveExchange(exchangeId);
          },
        );
        return;
      }
      const pendingRequest = this.pending.get(request.id) ?? request;
      this.pending.delete(request.id);
      void this.captureExchange(pendingRequest, null, 'aborted');
    });
    void server.on('websocket-request', (request: CompletedRequest) => {
      let resolveExchange!: (exchangeId: string | null) => void;
      const exchangeReady = new Promise<string | null>((resolve) => {
        resolveExchange = resolve;
      });
      this.pendingWebSockets.set(request.id, {
        request,
        exchangeReady,
        resolveExchange,
        writeTail: Promise.resolve(),
      });
    });
    void server.on('websocket-accepted', (response: CompletedResponse) => {
      const capture = this.pendingWebSockets.get(response.id);
      if (!capture) {
        return;
      }
      void this.captureExchange(
        capture.request,
        response,
        'request-complete',
      ).then((exchangeId) => {
        capture.resolveExchange(exchangeId);
      });
    });
    void server.on('websocket-message-received', (message: WebSocketMessage) => {
      this.enqueueWebSocketMessage(message);
    });
    void server.on('websocket-message-sent', (message: WebSocketMessage) => {
      this.enqueueWebSocketMessage(message);
    });
    void server.on('websocket-close', (close: WebSocketClose) => {
      const capture = this.pendingWebSockets.get(close.streamId);
      if (!capture) {
        return;
      }
      void capture.writeTail
        .then(async () => {
          const exchangeId = await capture.exchangeReady;
          if (!exchangeId) {
            return;
          }
          const completedAt = Date.now();
          await this.storage.updateExchange({
            id: exchangeId,
            completedAt,
            state: 'completed',
          });
          this.events.enqueue('exchange-updated', {
            id: exchangeId,
            method: capture.request.method.toUpperCase(),
            secure: capture.request.url.startsWith('wss:'),
            host: ProxyUtils.parseTarget(capture.request.url).hostname,
            path: ProxyUtils.parseTarget(capture.request.url).path,
            protocol: 'ws',
            statusCode: 101,
            state: 'completed',
            startedAt: capture.request.timingEvents?.startTime ?? completedAt,
            durationMs: Math.max(
              0,
              completedAt -
                (capture.request.timingEvents?.startTime ?? completedAt),
            ),
            requestBytes: 0,
            responseBytes: 0,
          });
        })
        .catch((error: unknown) => {
          this.diagnostics?.error('websocket.close-persist-failed', {
            errorCode: error instanceof Error ? error.name : 'unknown',
          });
        })
        .finally(() => {
          this.pendingWebSockets.delete(close.streamId);
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

  private async captureExchange(
    request: CompletedRequest | AbortedRequest,
    response: CompletedResponse | null,
    state: ExchangeInput['state'] = 'completed',
  ): Promise<string | null> {
    if (!this.sessionId) {
      return null;
    }
    const target = ProxyUtils.parseTarget(request.url);
    const startedAt = request.timingEvents?.startTime ?? Date.now();
    const headers: HeaderInput[] = [
      ...ProxyUtils.toHeaderInputs('request', request.rawHeaders),
      ...('rawTrailers' in request
        ? ProxyUtils.toHeaderInputs('request-trailer', request.rawTrailers)
        : []),
      ...(response
        ? ProxyUtils.toHeaderInputs('response', response.rawHeaders)
        : []),
      ...(response
        ? ProxyUtils.toHeaderInputs('response-trailer', response.rawTrailers)
        : []),
    ];
    const requestBody = await this.persistBody(
      'body' in request ? request.body : undefined,
      ProxyUtils.readHeader(request.headers, 'content-type'),
      ProxyUtils.readHeader(request.headers, 'content-encoding'),
    );
    const responseBody = response
      ? await this.persistBody(
          response.body,
          ProxyUtils.readHeader(response.headers, 'content-type'),
          ProxyUtils.readHeader(response.headers, 'content-encoding'),
        )
      : undefined;

    const exchange: ExchangeInput = {
      id: `ex-${ProxyUtils.cryptoRandomId()}`,
      sessionId: this.sessionId,
      method: request.method.toUpperCase(),
      scheme: target.scheme,
      host: target.hostname,
      port: target.port,
      path: target.path,
      url: request.url,
      protocol:
        target.scheme === 'ws' || target.scheme === 'wss'
          ? 'ws'
          : ProxyUtils.httpVersionToProtocol(request.httpVersion),
      statusCode: response?.statusCode,
      statusText: response?.statusMessage,
      requestMime: ProxyUtils.readHeader(request.headers, 'content-type'),
      responseMime: response
        ? ProxyUtils.readHeader(response.headers, 'content-type')
        : undefined,
      startedAt,
      responseStartedAt: response ? Date.now() : undefined,
      completedAt: state === 'request-complete' ? undefined : Date.now(),
      requestBytes: requestBody?.encodedSize ??
        ProxyUtils.readContentLength(request.headers),
      responseBytes: response
        ? responseBody?.encodedSize ??
          ProxyUtils.readContentLength(response.headers)
        : 0,
      state,
      headers,
      requestBody,
      responseBody,
    };
    let persisted = false;
    try {
      await this.storage.appendExchanges([exchange]);
      persisted = true;
      this.capturedExchanges += 1;
      const hits = this.ruleHits.get(request.id);
      if (hits && hits.length > 0) {
        await this.storage.appendRuleHits(exchange.id, hits);
      }
    } catch (error) {
      // 存储失败不得影响已完成的转发，但必须留痕以便排障。
      this.diagnostics?.error('capture.persist-failed', {
        attributes: { host: exchange.host ?? 'unknown', method: exchange.method },
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      this.ruleHits.delete(request.id);
    }
    if (state === 'aborted') {
      this.diagnostics?.warn('exchange.aborted', {
        attributes: {
          host: exchange.host ?? 'unknown',
          method: exchange.method,
          path: exchange.path ?? '',
        },
      });
    } else if (exchange.statusCode !== undefined && exchange.statusCode >= 500) {
      this.diagnostics?.warn('exchange.server-error', {
        attributes: {
          host: exchange.host ?? 'unknown',
          method: exchange.method,
          status: exchange.statusCode,
        },
      });
    }
    this.events.enqueue('exchange-added', {
      id: exchange.id,
      method: exchange.method,
      secure: exchange.scheme === 'https' || exchange.scheme === 'wss',
      host: exchange.host,
      path: exchange.path,
      protocol: exchange.protocol,
      statusCode: exchange.statusCode,
      responseMime: exchange.responseMime,
      state: exchange.state,
      startedAt: exchange.startedAt,
      durationMs:
        exchange.completedAt !== undefined
          ? Math.max(0, exchange.completedAt - exchange.startedAt)
          : undefined,
      requestBytes: exchange.requestBytes ?? 0,
      responseBytes: exchange.responseBytes ?? 0,
    });
    return persisted ? exchange.id : null;
  }

  /** 单 stream Promise 链保持 Mockttp 事件顺序，并等待 101 Exchange 先落库。 */
  private enqueueWebSocketMessage(message: WebSocketMessage): void {
    const capture = this.pendingWebSockets.get(message.streamId);
    if (!capture) {
      this.diagnostics?.warn('websocket.message-orphaned');
      return;
    }
    capture.writeTail = capture.writeTail
      .then(async () => {
        const exchangeId = await capture.exchangeReady;
        if (!exchangeId) {
          return;
        }
        const payload = await this.persistBody(
          { buffer: message.content },
          message.isBinary
            ? 'application/octet-stream'
            : 'text/plain; charset=utf-8',
          undefined,
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
   * 把一段正文写入内容寻址 Blob Store 并生成 body_ref 引用；超单体上限/配额时
   * 省略正文但保留元数据（size/mime）。注意：Mockttp 默认已在内存缓冲正文，真正的
   * 零内存流式（订阅 body-data 事件增量写盘）留待后续 T3.3 细化。
   */
  private async persistBody(
    body: { buffer?: Uint8Array } | undefined,
    mediaType: string | undefined,
    contentEncoding: string | undefined,
  ): Promise<BodyRefInput | undefined> {
    const buffer = body?.buffer;
    if (!buffer || buffer.byteLength === 0) {
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
        contentEncoding,
        decodeStatus: 'ok',
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return {
        id,
        encodedSize: buffer.byteLength,
        mediaType,
        contentEncoding,
        truncated: name === 'BlobTooLargeError',
        decodeStatus: 'skipped',
      };
    }
  }

  /**
   * 请求阶段套用规则引擎：无引擎/无规则快速跳过；命中则暂存审计、按需延迟，
   * 返回 Mockttp 短路响应 / 阻断 / 改写请求。引擎异常不得阻断转发。
   */
  private async applyRulesToRequest(
    request: CompletedRequest,
  ): Promise<ProxyRequestResult | undefined> {
    if (!this.ruleEngine || !this.ruleEngine.hasRules) {
      return undefined;
    }
    const state: MutableRequestState = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
    };
    try {
      const evaluation = await this.ruleEngine.evaluateRequest(
        ProxyUtils.buildRequestContext(request),
        state,
      );
      this.stashHits(request.id, evaluation.hits);
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
   * 响应阶段套用规则引擎：命中则暂存审计、按需延迟，返回 Mockttp 阻断 / 改写响应。
   */
  private async applyRulesToResponse(
    response: ProxyPassThroughResponse,
    request: CompletedRequest,
  ): Promise<ProxyResponseResult | undefined> {
    if (!this.ruleEngine || !this.ruleEngine.hasRules) {
      return undefined;
    }
    const state: MutableResponseState = {
      statusCode: response.statusCode,
      headers: { ...response.headers },
    };
    try {
      const evaluation = await this.ruleEngine.evaluateResponse(
        ProxyUtils.buildResponseContext(request, response),
        state,
      );
      this.stashHits(request.id, evaluation.hits);
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

  private stashHits(requestId: string, hits: readonly RuleHitRecord[]): void {
    if (hits.length === 0) {
      return;
    }
    const existing = this.ruleHits.get(requestId);
    if (existing) {
      existing.push(...hits);
    } else {
      this.ruleHits.set(requestId, [...hits]);
    }
  }
}
