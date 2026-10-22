import { randomUUID } from 'node:crypto';
import type { CaptureService } from '../../capture/entry';
import type { BodyRefInput, CaptureBodySide, ExchangePatch } from '../../capture/interfaces';
import type { DiagnosticsRecorder } from '../../core-diagnostics';
import type { CaptureEventQueue } from '../../proxy/internal/capture-event-queue';
import { httpVersionToProtocol, readHeader, toHeaderInputs, toRuleHeaderInputs } from '../../proxy/utils';
import type { RuleBodyEffect } from '../../rules/interfaces';
import type {
  InspectionBodyChunk, InspectionHeaders, InspectionHttpMessage, InspectionPeer, InspectionRequest, InspectionResponse,
} from '../interfaces/inspection';
import type {
  InspectionRecordingOptions, InspectionRuleOutcome, RecordedHttpBody, RecordedHttpStage,
} from '../interfaces/recording';
import { inspectionHeaderBag } from '../utils/inspection-protocol';
import type { InspectionWebSocketMessage } from '../interfaces/websocket';
import { MAX_CHUNK_BYTES } from './constants';

/** 单个Android HTTP交互的正式Capture记录，不负责网络转发。 */
export class HttpRecording {
  /** Core生成的Capture身份，与手机wire exchangeId分开。 */
  readonly exchangeId = randomUUID();
  /** 录制状态不改变HTTP是否继续处理；Clear后不允许迟到事件重建记录。 */
  private captureState: 'recording' | 'paused' | 'cleared' | 'settled';
  /** 手机原始请求，用于原始metadata与正文编码。 */
  private request: InspectionRequest | null = null;
  /** 源站原始响应，不提前冒充手机已应用的响应。 */
  private response: InspectionResponse | null = null;
  /** PC阶段决定与Android应用确认共用同一份状态。 */
  private readonly stagesById = new Map<string, RecordedHttpStage>();
  /** wire bodyId只定位当前交互的writer，不作为全局Capture引用ID。 */
  private readonly bodiesById = new Map<string, RecordedHttpBody>();
  /** 网络终态独立于存储队列是否排空。 */
  private terminal: 'active' | 'completed' | 'aborted' = 'active';
  /** 重复结算共享完成承诺，不重复提交正文或释放所有权。 */
  private settling: Promise<void> | null = null;

  /** 绑定当前Recording、真实存储及摘要事件队列。 */
  constructor(
    private readonly captureService: CaptureService,
    private readonly captureEventQueue: CaptureEventQueue,
    private readonly options: InspectionRecordingOptions,
    private readonly diagnostics: DiagnosticsRecorder,
  ) {
    this.captureState = options.recording ? 'recording' : 'paused';
    if (options.recording) {
      captureService.retainBodyCapture(this.exchangeId, options.sessionId, () => { this.captureState = 'cleared'; });
    }
  }

  /** 断点只关联已建档且未清除的记录，不为暂停流量提供不存在的Capture身份。 */
  get captureExchangeId(): string | undefined {
    return this.captureState === 'recording' && this.request !== null ? this.exchangeId : undefined;
  }

  /** 消费通过协议状态校验的metadata与实际应用确认。 */
  async recordMessage(message: InspectionHttpMessage, sender: InspectionPeer): Promise<void> {
    if (this.captureState !== 'recording') return;
    switch (message.type) {
      case 'http.request':
        await this.beginRequest(message);
        break;
      case 'http.response':
        this.response = message.response;
        this.stagesById.set(message.stageId, { phase: 'response', decision: null, outcome: null, applied: false });
        await this.patch({ responseStartedAt: Date.now() });
        break;
      case 'http.decision':
        this.stage(message.stageId).decision = message;
        break;
      case 'http.applied':
        await this.applyStage(message.stageId);
        break;
      case 'http.upgraded':
        await this.patch({ protocol: 'ws' });
        break;
      case 'body.open':
        this.openBody(message);
        break;
      case 'body.end':
      case 'body.stopped': {
        if (sender !== 'android') break;
        const body = this.body(message.bodyId);
        body.ended = true;
        body.truncated = message.type === 'body.stopped';
        body.trailers = message.type === 'body.end' ? message.trailers : [];
        await this.finishBody(body);
        break;
      }
      case 'exchange.complete':
        this.terminal = 'completed';
        await this.patch({ state: 'completed', requestBytes: message.requestBytes,
          responseBytes: message.responseBytes, completedAt: Date.now() });
        break;
      case 'exchange.cancel':
        await this.abortExchange(`android-${message.reason}`);
        break;
    }
  }

  /** 请求头到达立即建档，不等待决定、上传或源站响应。 */
  private async beginRequest(message: Extract<InspectionHttpMessage, { type: 'http.request' }>): Promise<void> {
    this.request = message.request;
    this.stagesById.set(message.stageId, { phase: 'request', decision: null, outcome: null, applied: false });
    const url = new URL(message.request.url);
    await this.captureService.appendExchanges([{
      id: this.exchangeId, sessionId: this.options.sessionId,
      method: message.request.method, scheme: url.protocol.slice(0, -1), host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
      path: `${url.pathname}${url.search}`, url: message.request.url,
      protocol: httpVersionToProtocol(message.request.httpVersion),
      requestMime: readHeader(inspectionHeaderBag(message.request.headers), 'content-type'),
      headers: toHeaderInputs('request', message.request.headers),
      startedAt: Date.now(), requestBytes: 0, responseBytes: 0, state: 'pending',
    }]);
    await this.publish('exchange-added');
  }

  /** 保留尚未被手机确认应用的规则结果。 */
  async recordRuleOutcome(stageId: string, outcome: InspectionRuleOutcome): Promise<void> {
    if (this.captureState !== 'recording') return;
    this.stage(stageId).outcome = outcome;
  }

  /** 保存完整原始应用消息，返回共享断点所需的真实Capture序号。 */
  async recordWebSocketFrame(
    message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }>,
    content: Uint8Array,
    timestamp: number,
  ): Promise<number | undefined> {
    if (this.captureState !== 'recording' || message.frame !== 'text' && message.frame !== 'binary') return undefined;
    const payload = await this.persistWebSocketBody(message, content);
    if (this.captureState !== 'recording') return undefined;
    const [sequence] = await this.captureService.appendWebSocketFrames(this.exchangeId, [{
      direction: message.direction, opcode: message.frame === 'binary' ? 2 : 1,
      payloadSize: content.byteLength, timestamp, ...(payload ? { payload } : {}),
    }]);
    await this.publish('exchange-updated');
    return sequence;
  }

  /** WS正文按既有writer阈值spill，Clear仍能找到并取消当前方向的写入。 */
  private async persistWebSocketBody(
    message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }>,
    content: Uint8Array,
  ): Promise<BodyRefInput | undefined> {
    if (content.byteLength === 0) return undefined;
    const bodyWriter = this.captureService.createWebSocketBodyWriter(this.exchangeId, message.direction);
    let result: Awaited<ReturnType<typeof bodyWriter.finalize>> = null;
    let failed = false;
    try {
      for (let offset = 0; offset < content.byteLength; offset += MAX_CHUNK_BYTES) {
        bodyWriter.write(content.subarray(offset, offset + MAX_CHUNK_BYTES));
        await bodyWriter.snapshot();
        if (this.captureState !== 'recording') {
          await bodyWriter.abort();
          return undefined;
        }
      }
      result = await bodyWriter.finalize();
    } catch (error) {
      failed = true;
      this.diagnostics.warn('android.websocket-body-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
      await bodyWriter.abort();
    }
    if (bodyWriter.degraded) this.diagnostics.warn('android.websocket-body-degraded');
    return {
      id: randomUUID(), ...(result ? { blobHash: result.hash } : {}),
      encodedSize: content.byteLength,
      mediaType: message.frame === 'binary' ? 'application/octet-stream' : 'text/plain; charset=utf-8',
      decodeStatus: failed ? 'failed' : bodyWriter.degraded ? 'skipped' : 'ok',
      truncated: failed || bodyWriter.degraded,
    };
  }

  /** 只有Android应用确认后更新WS实际转发字节，不累计drop。 */
  async updateWebSocketTraffic(requestBytes: number, responseBytes: number): Promise<void> {
    await this.patch({ requestBytes, responseBytes });
  }

  /** 只有实际应用确认后才发布规则效果和最终响应metadata。 */
  private async applyStage(stageId: string): Promise<void> {
    const stage = this.stage(stageId);
    const message = stage.decision;
    const outcome = stage.outcome;
    if (!message || !outcome) throw new Error('Applied recording stage has no decision or rule outcome');
    stage.applied = true;
    await this.captureService.appendRuleHits(this.exchangeId, outcome.hits);
    await this.patch({ ruleIds: outcome.hits.map(hit => hit.ruleId),
      headers: toRuleHeaderInputs(outcome.headerEffects) });
    if (message.decision.action === 'abort') {
      await this.abortExchange(`android-rule-${message.decision.mode}`);
    } else if (message.phase === 'response') {
      const response = message.decision.action === 'bypass' ? this.response! : message.decision;
      await this.applyResponse(response);
    } else if (message.decision.action === 'respond') {
      await this.applyResponse(message.decision);
    } else {
      await this.patch({ requestSentAt: Date.now() });
    }
    for (const body of this.bodiesById.values()) {
      if (body.phase === stage.phase && body.role === 'original' && body.ended) await this.finishBody(body);
    }
  }

  /** Capture显示Android确认后的响应，不写入PC尚未应用的replacement内容。 */
  private async applyResponse(response: InspectionResponse): Promise<void> {
    await this.patch({ state: 'response-streaming', statusCode: response.statusCode,
      responseMime: readHeader(inspectionHeaderBag(response.headers), 'content-type'),
      headers: toHeaderInputs('response', response.headers) });
  }

  /** Original和实际应用副本各有writer，不把PC的replacement发送流写作Final。 */
  private openBody(message: Extract<InspectionHttpMessage, { type: 'body.open' }>): void {
    this.bodiesById.set(message.bodyId, {
      phase: message.phase, role: message.role,
      writer: message.role === 'original'
        ? this.captureService.createOriginalBodyWriter(this.exchangeId, message.phase)
        : this.captureService.createBodyWriter(this.exchangeId, message.phase),
      headers: this.bodyHeaders(message.phase, message.role),
      ended: false, truncated: false, trailers: [], reference: null, finishing: null,
    });
  }

  /** 消费手机实际观察/应用的正文副本，等待存储处理后返回。 */
  async recordChunk(chunk: InspectionBodyChunk): Promise<void> {
    if (this.captureState !== 'recording') return;
    const body = this.body(chunk.bodyId);
    body.writer.write(chunk.payload);
    await body.writer.snapshot();
    if (body.writer.degraded) {
      this.diagnostics.warn('android.capture-body-degraded', { attributes: { phase: body.phase, role: body.role } });
    }
    if (body.role === 'applied') {
      await this.patch(body.phase === 'request'
        ? { requestBytes: body.writer.observedBytes } : { responseBytes: body.writer.observedBytes });
    }
  }

  /** Original可能先于决定结束；规则是否替换明确后才绑定或丢弃副本。 */
  private finishBody(body: RecordedHttpBody): Promise<void> {
    if (body.finishing) return body.finishing;
    if (body.role === 'original' && this.terminal === 'active' &&
      ![...this.stagesById.values()].some(stage => stage.phase === body.phase && stage.applied)) {
      return Promise.resolve();
    }
    body.finishing = this.commitBody(body);
    return body.finishing;
  }

  /** 复用当前BodyRuleEffect保存Original；存储失败显式留下不可用正文和诊断。 */
  private async commitBody(body: RecordedHttpBody): Promise<void> {
    if (body.role === 'original' && !this.bodyEffect(body.phase)) {
      await body.writer.abort();
      return;
    }
    let result: Awaited<ReturnType<typeof body.writer.finalize>> = null;
    let failed = false;
    try {
      result = await body.writer.finalize();
    } catch {
      failed = true;
      this.diagnostics.warn('android.capture-body-failed', { attributes: { phase: body.phase, role: body.role } });
      await body.writer.abort();
    }
    if (this.captureState !== 'recording') return;
    const headers = inspectionHeaderBag(body.headers);
    body.reference = {
      id: randomUUID(), encodedSize: body.writer.observedBytes,
      ...(result ? { blobHash: result.hash } : {}),
      mediaType: readHeader(headers, 'content-type'), contentEncoding: readHeader(headers, 'content-encoding'),
      truncated: body.truncated || failed || body.writer.degraded,
      decodeStatus: failed ? 'failed' : body.writer.degraded ? 'skipped' : 'ok',
    };
    if (body.role === 'applied') {
      await this.patch(body.phase === 'request'
        ? { requestBody: body.reference, requestBytes: body.writer.observedBytes,
          headers: toHeaderInputs('request-trailer', body.trailers) }
        : { responseBody: body.reference, responseBytes: body.writer.observedBytes,
          headers: toHeaderInputs('response-trailer', body.trailers) });
    }
    await this.bindBodyEffect(body.phase);
  }

  /** Original只在实际保存后声明available，停止前缀仍保留truncated。 */
  private async bindBodyEffect(phase: CaptureBodySide): Promise<void> {
    const effect = this.bodyEffect(phase);
    if (!effect) return;
    const original = [...this.bodiesById.values()].find(body => body.phase === phase && body.role === 'original');
    if (original && !original.reference && this.terminal === 'active') return;
    const reference = original?.reference;
    const originalState = reference?.blobHash ? 'available'
      : original?.ended && reference?.encodedSize === 0 && !reference.truncated ? 'empty' : 'unavailable';
    const bodyEffect = {
      ruleId: effect.ruleId, effect: effect.effect, source: effect.source, originalState,
      ...(originalState === 'available' && reference ? { originalBody: reference } : {}),
    } as const;
    await this.patch(phase === 'request' ? { requestBodyEffect: bodyEffect } : { responseBodyEffect: bodyEffect });
  }

  /** 完成或中断时封口正文，释放Capture清理所有权。 */
  async settle(): Promise<void> {
    this.settling ??= this.finish();
    return this.settling;
  }

  /** 封口所有已接受正文后解除清理关联，突然断线不能记为completed。 */
  private async finish(): Promise<void> {
    if (this.captureState !== 'recording') return;
    const failures: unknown[] = [];
    try {
      if (this.request && this.terminal === 'active') await this.abortExchange('android-disconnected');
      for (const body of this.bodiesById.values()) {
        if (!body.ended) body.truncated = true;
        await this.finishBody(body);
      }
      await this.bindBodyEffect('request');
      await this.bindBodyEffect('response');
    } catch (error) {
      failures.push(error);
    } finally {
      const closed = await Promise.allSettled([...this.bodiesById.values()].map(body => body.writer.abort()));
      for (const result of closed) if (result.status === 'rejected') failures.push(result.reason);
      if (this.captureState === 'recording') this.captureState = 'settled';
      this.captureService.releaseBodyCapture(this.exchangeId);
      this.bodiesById.clear();
    }
    if (failures.length) throw new AggregateError(failures, 'HTTP recording cleanup failed');
  }

  /** 保留首次中断原因，不覆盖已确认的网络完成。 */
  private async abortExchange(errorCode: string): Promise<void> {
    if (this.terminal !== 'active') return;
    this.terminal = 'aborted';
    await this.patch({ state: 'aborted', errorCode, completedAt: Date.now() });
  }

  /** metadata变更只作用于当前未清除的录制，不重建已删除记录。 */
  private async patch(patch: Omit<ExchangePatch, 'id'>): Promise<void> {
    if (this.captureState !== 'recording') return;
    await this.captureService.updateExchange({ id: this.exchangeId, ...patch });
    await this.publish('exchange-updated');
  }

  /** 复用Core的Capture队列，传递真实Store摘要而非另一份影子记录。 */
  private async publish(kind: 'exchange-added' | 'exchange-updated'): Promise<void> {
    const detail = await this.captureService.getExchangeDetail(this.exchangeId);
    if (this.captureState === 'recording' && detail) this.captureEventQueue.enqueue(kind, detail.summary);
  }

  /** 按当前阶段读取实际应用后的正文编码，原文继续使用原headers。 */
  private bodyHeaders(phase: CaptureBodySide, role: 'original' | 'applied'): InspectionHeaders {
    if (role === 'original') return phase === 'request' ? this.request!.headers : this.response!.headers;
    for (const stage of this.stagesById.values()) {
      const message = stage.decision;
      if (!stage.applied || !message) continue;
      if (phase === 'response' && message.phase === 'request' && message.decision.action === 'respond') {
        return message.decision.headers;
      }
      if (message.phase === phase && message.decision.action === 'intercept') return message.decision.headers;
    }
    return phase === 'request' ? this.request!.headers : this.response!.headers;
  }

  /** 已应用的最终正文规则，未确认决定不产出effect。 */
  private bodyEffect(phase: CaptureBodySide): RuleBodyEffect | undefined {
    for (const stage of this.stagesById.values()) {
      if (stage.applied && stage.outcome?.bodyEffect?.phase === phase) return stage.outcome.bodyEffect;
    }
    return undefined;
  }

  /** 通道已校验的阶段必须具有对应录制状态。 */
  private stage(stageId: string): RecordedHttpStage {
    const stage = this.stagesById.get(stageId);
    if (!stage) throw new Error('HTTP recording stage is not open');
    return stage;
  }

  /** 通道已校验的正文必须具有对应writer。 */
  private body(bodyId: string): RecordedHttpBody {
    const body = this.bodiesById.get(bodyId);
    if (!body) throw new Error('HTTP recording body is not open');
    return body;
  }
}
