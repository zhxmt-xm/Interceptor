import type {
  AbortedRequest,
  BodyData,
  CompletedRequest,
  InitiatedRequest,
  InitiatedResponse,
} from 'mockttp';

import type { CaptureExchangeSummary } from '@interceptor/core-protocol';

import type { DiagnosticsRecorder } from '../core-diagnostics';
import type { RuleHeaderEffect, RuleHitRecord } from '../rules/interfaces';
import type {
  BodyRefInput,
  ExchangeInput,
  ExchangePatch,
  HeaderInput,
} from '../storage/interfaces';
import type {
  CaptureEventSink,
  CaptureSink,
  OrphanRuleOutcome,
  TrackedExchange,
} from './interfaces';
import * as ProxyUtils from './utils';

/**
 * 按 Mockttp request id 聚合单条 Exchange 的完整生命周期。
 *
 * 设计前提：Mockttp 的 `request-initiated`、`*-body-data`、`*-trailers` 均经
 * `setImmediate` 异步发出，而规则钩子（`beforeRequestHead` / `beforeResponseHead`）
 * 走独立 Promise 链，两者顺序不保证。因此所有入口都是幂等 upsert；规则结果若先于
 * `request-initiated` 到达，先存入孤儿表，待 Exchange 建立后合并。
 *
 * 每条 Exchange 用自己的 `tail` Promise 串行化存储写入，保证顺序且不阻塞事件回调。
 */
export class ExchangeTracker {
  /** Mockttp request id 到进行中的 Exchange。 */
  private readonly entries = new Map<string, TrackedExchange>();
  /** Exchange 尚未建立时暂存的规则结果。 */
  private readonly orphanRuleOutcomes = new Map<string, OrphanRuleOutcome>();
  /** WebSocket frame 写入前等待 Exchange 落库的解析器。 */
  private readonly exchangeReady = new Map<
    string,
    { promise: Promise<string | null>; resolve: (id: string | null) => void }
  >();
  /** 当前 Capture Session；未启动时为 null。 */
  private sessionId: string | null = null;
  /** 当前 capture 代际；Clear 时递增。 */
  private generation = 0;
  /** 是否正在记录新流量。 */
  private recording = true;
  /** 当前代际已创建的 Exchange 总数。 */
  private captured = 0;
  /** 可选结构化诊断汇。 */
  private diagnostics: DiagnosticsRecorder | null = null;

  /** 绑定存储与事件出口。 */
  constructor(
    private readonly storage: CaptureSink,
    private readonly events: CaptureEventSink,
  ) {}

  /** 注入诊断汇；调用方：ProxyService.attachDiagnostics。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /** 绑定当前 Capture Session；调用方：ProxyService.start。 */
  setSession(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  /** 设置是否记录新流量；已在途 Exchange 不受影响。 */
  setRecording(enabled: boolean): void {
    this.recording = enabled;
  }

  /** 当前进行中的 Exchange 数量；供测试与诊断。 */
  get activeCount(): number {
    return this.entries.size;
  }

  /** 当前代际已创建的 Exchange 总数；供 proxy.status 上报。 */
  get totalCaptured(): number {
    return this.captured;
  }

  /**
   * 请求头到达：立即创建 Exchange、落库并推送，使请求在 UI 中即时可见。
   * 这是唯一的 Exchange 创建入口。
   */
  beginRequest(request: InitiatedRequest): void {
    if (!this.recording || !this.sessionId || this.entries.has(request.id)) {
      return;
    }
    const startedAt = request.timingEvents?.startTime ?? Date.now();
    const target = ProxyUtils.parseTarget(request.url);
    const entry: TrackedExchange = {
      exchangeId: `ex-${ProxyUtils.cryptoRandomId()}`,
      generation: this.generation,
      startedAt,
      secure: target.scheme === 'https' || target.scheme === 'wss',
      method: request.method.toUpperCase(),
      ...(target.hostname !== undefined ? { host: target.hostname } : {}),
      ...(target.path !== undefined ? { path: target.path } : {}),
      protocol:
        target.scheme === 'ws' || target.scheme === 'wss'
          ? 'ws'
          : ProxyUtils.httpVersionToProtocol(request.httpVersion),
      requestPhase: 'headers',
      responsePhase: 'none',
      terminal: false,
      requestWriter: null,
      responseWriter: null,
      requestBytes: 0,
      responseBytes: 0,
      ruleIds: new Set<string>(),
      tail: Promise.resolve(),
    };
    this.entries.set(request.id, entry);
    this.captured += 1;

    const headers = ProxyUtils.toHeaderInputs('request', request.rawHeaders);
    const orphan = this.orphanRuleOutcomes.get(request.id);
    this.orphanRuleOutcomes.delete(request.id);
    if (orphan) {
      for (const hit of orphan.hits) {
        entry.ruleIds.add(hit.ruleId);
      }
      headers.push(...orphan.headers);
    }

    const requestMime = ProxyUtils.readHeader(request.headers, 'content-type');
    const exchange: ExchangeInput = {
      id: entry.exchangeId,
      sessionId: this.sessionId,
      method: entry.method,
      scheme: target.scheme,
      ...(target.hostname !== undefined ? { host: target.hostname } : {}),
      ...(target.port !== undefined ? { port: target.port } : {}),
      ...(target.path !== undefined ? { path: target.path } : {}),
      url: request.url,
      protocol: entry.protocol,
      ...(requestMime !== undefined ? { requestMime } : {}),
      startedAt,
      requestBytes: 0,
      responseBytes: 0,
      state: 'pending',
      ...(entry.ruleIds.size > 0 ? { ruleIds: [...entry.ruleIds] } : {}),
      headers,
    };

    this.enqueue(entry, 'exchange-added');
    this.schedule(entry, async () => {
      await this.storage.appendExchanges([exchange]);
      if (orphan && orphan.hits.length > 0) {
        await this.storage.appendRuleHits(entry.exchangeId, orphan.hits);
      }
      this.resolveExchangeReady(request.id, entry.exchangeId);
    });
  }

  /** WebSocket Upgrade 请求：复用同一 Exchange 模型，protocol 固定为 ws。 */
  beginWebSocketRequest(request: CompletedRequest): void {
    this.beginRequest(request);
    const entry = this.entries.get(request.id);
    if (!entry) {
      return;
    }
    this.schedule(entry, async () => {
      await this.storage.updateExchange({
        id: entry.exchangeId,
        state: 'pending',
      });
    });
  }

  /** 请求正文增量：写入 writer 并更新已观察字节数。 */
  appendRequestBody(data: BodyData): void {
    const entry = this.entries.get(data.id);
    if (!entry || entry.generation !== this.generation) {
      return;
    }
    if (data.content.byteLength > 0) {
      entry.requestWriter ??= this.storage.createBodyWriter();
      entry.requestWriter.write(data.content);
      entry.requestBytes = entry.requestWriter.observedBytes;
    }
    if (!data.isEnded) {
      this.patch(entry, { requestBytes: entry.requestBytes });
      return;
    }
    if (entry.requestPhase === 'headers' || entry.requestPhase === 'body') {
      entry.requestPhase = 'complete';
    }
    this.finalizeRequestBody(entry);
  }

  /** 响应头到达：更新状态并转入 response-streaming。 */
  beginResponse(response: InitiatedResponse): void {
    const entry = this.entries.get(response.id);
    if (!entry || entry.generation !== this.generation || entry.terminal) {
      return;
    }
    entry.responsePhase = 'headers';
    entry.statusCode = response.statusCode;
    const responseMime = ProxyUtils.readHeader(response.headers, 'content-type');
    entry.responseMime = responseMime;
    const rawResponseStartedAt = ProxyUtils.timingEventToEpoch(
      response.timingEvents,
      response.timingEvents.headersSentTimestamp,
    );
    // Mockttp 的高精度时间戳是浮点毫秒，向下取整后才能与 Date.now() 单调比较。
    const responseStartedAt =
      rawResponseStartedAt !== undefined
        ? Math.floor(rawResponseStartedAt)
        : undefined;
    this.patch(entry, {
      state: 'response-streaming',
      statusCode: response.statusCode,
      ...(response.statusMessage ? { statusText: response.statusMessage } : {}),
      ...(responseMime !== undefined ? { responseMime } : {}),
      ...(responseStartedAt !== undefined ? { responseStartedAt } : {}),
      headers: ProxyUtils.toHeaderInputs('response', response.rawHeaders),
    });
    if (response.statusCode >= 500) {
      this.diagnostics?.warn('exchange.server-error', {
        attributes: {
          host: entry.host ?? 'unknown',
          method: entry.method,
          status: response.statusCode,
        },
      });
    }
  }

  /** 1xx 中间响应：作为附加 header 记录，不改变主状态。 */
  recordInformationalResponse(response: InitiatedResponse): void {
    const entry = this.entries.get(response.id);
    if (!entry || entry.generation !== this.generation) {
      return;
    }
    this.patch(entry, {
      headers: ProxyUtils.toHeaderInputs('response', response.rawHeaders),
    });
  }

  /** 响应正文增量：写入 writer；结束时 finalize 并进入终态。 */
  appendResponseBody(data: BodyData): void {
    const entry = this.entries.get(data.id);
    if (!entry || entry.generation !== this.generation) {
      return;
    }
    if (data.content.byteLength > 0) {
      entry.responseWriter ??= this.storage.createBodyWriter();
      entry.responseWriter.write(data.content);
      entry.responseBytes = entry.responseWriter.observedBytes;
      if (entry.responsePhase === 'headers') {
        entry.responsePhase = 'body';
      }
    }
    if (!data.isEnded) {
      this.patch(entry, { responseBytes: entry.responseBytes });
      return;
    }
    entry.responsePhase = 'complete';
    this.completeExchange(data.id, entry);
  }

  /** 请求中断：记录终态与原因。 */
  abortExchange(request: AbortedRequest): void {
    const entry = this.entries.get(request.id);
    if (!entry || entry.generation !== this.generation) {
      this.entries.delete(request.id);
      this.orphanRuleOutcomes.delete(request.id);
      this.resolveExchangeReady(request.id, null);
      return;
    }
    entry.requestPhase = 'aborted';
    entry.responsePhase = 'aborted';
    const completedAt =
      ProxyUtils.timingEventToEpoch(
        request.timingEvents,
        request.timingEvents.abortedTimestamp,
      ) ?? Date.now();
    this.diagnostics?.warn('exchange.aborted', {
      ...(request.error?.code ? { errorCode: request.error.code } : {}),
      attributes: {
        host: entry.host ?? 'unknown',
        method: entry.method,
        path: entry.path ?? '',
      },
    });
    this.finishExchange(request.id, entry, 'aborted', completedAt, {
      ...(request.error?.code ? { errorCode: request.error.code } : {}),
    });
  }

  /** 请求 trailer 到达：追加记录，不改变主状态。 */
  recordRequestTrailers(requestId: string, rawTrailers: [string, string][]): void {
    const entry = this.entries.get(requestId);
    if (!entry || entry.generation !== this.generation || rawTrailers.length === 0) {
      return;
    }
    this.patch(entry, {
      headers: ProxyUtils.toHeaderInputs('request-trailer', rawTrailers),
    });
  }

  /** 响应 trailer 到达；gRPC 的 grpc-status 依赖此路径。 */
  recordResponseTrailers(requestId: string, rawTrailers: [string, string][]): void {
    const entry = this.entries.get(requestId);
    if (!entry || entry.generation !== this.generation || rawTrailers.length === 0) {
      return;
    }
    this.patch(entry, {
      headers: ProxyUtils.toHeaderInputs('response-trailer', rawTrailers),
    });
  }

  /** 记录规则命中与 header 净效果；Exchange 未建立时暂存。 */
  recordRuleOutcome(
    requestId: string,
    hits: readonly RuleHitRecord[],
    effects: readonly RuleHeaderEffect[],
  ): void {
    if (hits.length === 0 && effects.length === 0) {
      return;
    }
    const headers = ProxyUtils.toRuleHeaderInputs(effects);
    const entry = this.entries.get(requestId);
    if (!entry) {
      const orphan = this.orphanRuleOutcomes.get(requestId) ?? {
        hits: [],
        headers: [],
      };
      orphan.hits.push(...hits);
      orphan.headers.push(...headers);
      this.orphanRuleOutcomes.set(requestId, orphan);
      return;
    }
    if (entry.generation !== this.generation) {
      return;
    }
    for (const hit of hits) {
      entry.ruleIds.add(hit.ruleId);
    }
    this.patch(entry, {
      ...(headers.length > 0 ? { headers } : {}),
      ruleIds: [...entry.ruleIds],
    });
    if (hits.length > 0) {
      this.schedule(entry, async () => {
        await this.storage.appendRuleHits(entry.exchangeId, hits);
      });
    }
  }

  /** 返回 Exchange 落库后的 id，供 WebSocket frame 写入前等待。 */
  whenExchangeReady(requestId: string): Promise<string | null> {
    const existing = this.exchangeReady.get(requestId);
    if (existing) {
      return existing.promise;
    }
    let resolve!: (id: string | null) => void;
    const promise = new Promise<string | null>((r) => {
      resolve = r;
    });
    this.exchangeReady.set(requestId, { promise, resolve });
    return promise;
  }

  /** WebSocket 101 已接受：转入 request-complete 并释放等待者。 */
  acceptWebSocket(requestId: string, statusCode: number): void {
    const entry = this.entries.get(requestId);
    if (!entry || entry.generation !== this.generation) {
      this.resolveExchangeReady(requestId, null);
      return;
    }
    entry.requestPhase = 'complete';
    entry.statusCode = statusCode;
    this.patch(entry, { state: 'request-complete', statusCode });
  }

  /** WebSocket 关闭：进入终态。 */
  closeWebSocket(requestId: string): void {
    const entry = this.entries.get(requestId);
    if (!entry || entry.generation !== this.generation) {
      return;
    }
    entry.requestPhase = 'complete';
    entry.responsePhase = 'complete';
    this.finishExchange(requestId, entry, 'completed', Date.now(), {});
  }

  /** 直接登记一条已完成的 Exchange（CONNECT 隧道）。 */
  async trackTunnel(exchange: ExchangeInput): Promise<string | null> {
    if (!this.recording || !this.sessionId) {
      return null;
    }
    const generation = this.generation;
    await this.storage.appendExchanges([exchange]);
    if (generation !== this.generation) {
      return null;
    }
    this.captured += 1;
    this.events.enqueue('exchange-added', {
      id: exchange.id,
      method: exchange.method,
      secure: true,
      ...(exchange.host !== undefined ? { host: exchange.host } : {}),
      protocol: exchange.protocol,
      ...(exchange.statusCode !== undefined
        ? { statusCode: exchange.statusCode }
        : {}),
      ...(exchange.responseMime !== undefined
        ? { responseMime: exchange.responseMime }
        : {}),
      state: exchange.state,
      startedAt: exchange.startedAt,
      requestBytes: 0,
      responseBytes: 0,
    });
    return exchange.id;
  }

  /** 更新已登记隧道的终态。 */
  async completeTunnel(
    exchangeId: string,
    startedAt: number,
    host: string,
    secure: boolean,
    protocol: string,
  ): Promise<void> {
    const generation = this.generation;
    const completedAt = Date.now();
    await this.storage.updateExchange({
      id: exchangeId,
      completedAt,
      state: 'completed',
    });
    if (generation !== this.generation) {
      return;
    }
    this.events.enqueue('exchange-updated', {
      id: exchangeId,
      method: 'CONNECT',
      secure,
      host,
      protocol,
      statusCode: 200,
      responseMime: 'application/x-encrypted-tunnel',
      state: 'completed',
      startedAt,
      durationMs: Math.max(0, completedAt - startedAt),
      requestBytes: 0,
      responseBytes: 0,
    });
  }

  /** 推进 generation 并放弃全部在途状态；调用方：Clear 与 Proxy 停止。 */
  reset(): void {
    this.generation += 1;
    this.captured = 0;
    for (const entry of this.entries.values()) {
      void entry.requestWriter?.abort();
      void entry.responseWriter?.abort();
    }
    this.entries.clear();
    this.orphanRuleOutcomes.clear();
    for (const waiter of this.exchangeReady.values()) {
      waiter.resolve(null);
    }
    this.exchangeReady.clear();
  }

  /** 等待全部在途存储写入结束；调用方：Proxy stop。 */
  async settle(): Promise<void> {
    await Promise.allSettled(
      [...this.entries.values()].map((entry) => entry.tail),
    );
  }

  /** 请求正文结束：finalize writer 并绑定 body 引用。 */
  private finalizeRequestBody(entry: TrackedExchange): void {
    const writer = entry.requestWriter;
    entry.requestWriter = null;
    this.schedule(entry, async () => {
      const result = writer ? await writer.finalize() : null;
      const body: BodyRefInput | undefined = result
        ? {
            id: `body-${ProxyUtils.cryptoRandomId()}`,
            blobHash: result.hash,
            encodedSize: result.size,
            decodeStatus: 'ok',
          }
        : undefined;
      await this.storage.updateExchange({
        id: entry.exchangeId,
        requestBytes: entry.requestBytes,
        ...(body ? { requestBody: body, requestBodyId: body.id } : {}),
      });
    });
    this.enqueue(entry, 'exchange-updated');
  }

  /** 响应正文结束：finalize writer、绑定 body 引用并进入终态。 */
  private completeExchange(requestId: string, entry: TrackedExchange): void {
    const writer = entry.responseWriter;
    entry.responseWriter = null;
    const completedAt = Date.now();
    entry.terminal = true;
    this.entries.delete(requestId);
    this.schedule(entry, async () => {
      const result = writer ? await writer.finalize() : null;
      const body: BodyRefInput | undefined = result
        ? {
            id: `body-${ProxyUtils.cryptoRandomId()}`,
            blobHash: result.hash,
            encodedSize: result.size,
            ...(entry.responseMime !== undefined
              ? { mediaType: entry.responseMime }
              : {}),
            decodeStatus: 'ok',
          }
        : undefined;
      await this.storage.updateExchange({
        id: entry.exchangeId,
        state: 'completed',
        completedAt,
        responseBytes: entry.responseBytes,
        ...(body ? { responseBody: body, responseBodyId: body.id } : {}),
      });
    });
    this.events.enqueue('exchange-updated', {
      ...this.toSummary(entry),
      state: 'completed',
      durationMs: Math.max(0, completedAt - entry.startedAt),
    });
    this.resolveExchangeReady(requestId, entry.exchangeId);
  }

  /** 统一的终态收尾：写入状态并清理在途资源。 */
  private finishExchange(
    requestId: string,
    entry: TrackedExchange,
    state: ExchangeInput['state'],
    completedAt: number,
    extra: Partial<ExchangePatch>,
  ): void {
    if (entry.terminal) {
      return;
    }
    entry.terminal = true;
    this.entries.delete(requestId);
    const requestWriter = entry.requestWriter;
    const responseWriter = entry.responseWriter;
    entry.requestWriter = null;
    entry.responseWriter = null;
    this.schedule(entry, async () => {
      const requestResult = requestWriter ? await requestWriter.finalize() : null;
      const responseResult = responseWriter
        ? await responseWriter.finalize()
        : null;
      await this.storage.updateExchange({
        id: entry.exchangeId,
        state,
        completedAt,
        requestBytes: entry.requestBytes,
        responseBytes: entry.responseBytes,
        ...(requestResult
          ? {
              requestBody: {
                id: `body-${ProxyUtils.cryptoRandomId()}`,
                blobHash: requestResult.hash,
                encodedSize: requestResult.size,
                decodeStatus: 'ok',
              },
            }
          : {}),
        ...(responseResult
          ? {
              responseBody: {
                id: `body-${ProxyUtils.cryptoRandomId()}`,
                blobHash: responseResult.hash,
                encodedSize: responseResult.size,
                decodeStatus: 'ok',
              },
            }
          : {}),
        ...extra,
      });
    });
    this.events.enqueue('exchange-updated', {
      ...this.toSummary(entry),
      state,
      durationMs: Math.max(0, completedAt - entry.startedAt),
    });
    this.resolveExchangeReady(requestId, entry.exchangeId);
  }

  /** 排入该 Exchange 的串行写入队列；失败只记录不冒泡。 */
  private schedule(
    entry: TrackedExchange,
    operation: () => Promise<void>,
  ): void {
    entry.tail = entry.tail
      .then(operation)
      .catch((error: unknown) => {
        this.diagnostics?.error('capture.persist-failed', {
          attributes: {
            host: entry.host ?? 'unknown',
            method: entry.method,
          },
          errorCode: error instanceof Error ? error.name : 'unknown',
        });
      });
  }

  /** 写入增量 patch 并推送最新摘要。 */
  private patch(entry: TrackedExchange, patch: Omit<ExchangePatch, 'id'>): void {
    this.schedule(entry, async () => {
      await this.storage.updateExchange({ id: entry.exchangeId, ...patch });
    });
    this.enqueue(entry, 'exchange-updated');
  }

  /** 推送当前聚合摘要。 */
  private enqueue(
    entry: TrackedExchange,
    kind: 'exchange-added' | 'exchange-updated',
  ): void {
    this.events.enqueue(kind, this.toSummary(entry));
  }

  /** 由聚合状态构造对外摘要。 */
  private toSummary(entry: TrackedExchange): CaptureExchangeSummary {
    return {
      id: entry.exchangeId,
      method: entry.method,
      secure: entry.secure,
      ...(entry.host !== undefined ? { host: entry.host } : {}),
      ...(entry.path !== undefined ? { path: entry.path } : {}),
      protocol: entry.protocol,
      ...(entry.statusCode !== undefined ? { statusCode: entry.statusCode } : {}),
      ...(entry.responseMime !== undefined
        ? { responseMime: entry.responseMime }
        : {}),
      state: this.toState(entry),
      startedAt: entry.startedAt,
      requestBytes: entry.requestBytes,
      responseBytes: entry.responseBytes,
      ...(entry.ruleIds.size > 0 ? { ruleIds: [...entry.ruleIds] } : {}),
    };
  }

  /** 由请求/响应两侧阶段推导对外聚合状态。 */
  private toState(entry: TrackedExchange): ExchangeInput['state'] {
    if (entry.responsePhase === 'aborted' || entry.requestPhase === 'aborted') {
      return 'aborted';
    }
    if (entry.responsePhase === 'complete') {
      return 'completed';
    }
    if (entry.responsePhase === 'headers' || entry.responsePhase === 'body') {
      return 'response-streaming';
    }
    if (entry.requestPhase === 'complete') {
      return 'request-complete';
    }
    return 'pending';
  }

  /** 释放 WebSocket frame 的等待者。 */
  private resolveExchangeReady(
    requestId: string,
    exchangeId: string | null,
  ): void {
    const waiter = this.exchangeReady.get(requestId);
    if (!waiter) {
      if (exchangeId) {
        this.exchangeReady.set(requestId, {
          promise: Promise.resolve(exchangeId),
          resolve: () => undefined,
        });
      }
      return;
    }
    waiter.resolve(exchangeId);
  }
}
