import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import type { WebSocketBreakpointSettings } from '@interceptor/core-protocol';
import type { DiagnosticsRecorder } from '../../core-diagnostics';
import type { HttpInterceptionService } from '../../http-interception/entry';
import type { RuleService } from '../../rules/entry';
import type { InspectionCapability } from '../interfaces';
import type {
  InspectionPendingWebSocketMessage, InspectionWebSocketMessage, InspectionWebSocketProtocolMessage,
} from '../interfaces/websocket';
import { inspectionWebSocketOperationId } from '../utils/websocket-ids';
import { parseInspectionWebSocketProtocolMessage, validateWebSocketContent } from '../utils/websocket-protocol';
import type { HttpInterceptionRequestDecision, HttpInterceptionResponseDecision } from '../../http-interception/interfaces';
import type {
  InspectionBodyDecision,
  InspectionHeaders,
  InspectionHttpMessage,
  InspectionRequest,
  InspectionRequestDecision,
  InspectionResponseDecision,
} from '../interfaces/inspection';
import {
  decodeInspectionChunk,
  encodeInspectionChunk,
  inspectionFinalHeaders,
  inspectionHeaderBag,
  inspectionRequestContext,
  parseInspectionMessage,
} from '../utils/inspection-protocol';
import { CONNECT_TIMEOUT_MS, MAX_CHUNK_BYTES } from './constants';
import { InspectionProtocolError } from './errors';
import { HttpExchange } from './http-exchange';
import { WebSocketExchange } from './websocket-exchange';
import type { HttpRecording } from './http-recording';

/** 已认证WSS上的单个HTTP交互，拥有异步决定和取消。 */
export class HttpChannel {
  /** 首消息后固定的交互状态，不接受第二条exchange。 */
  private httpExchange: HttpExchange | null = null;
  /** 原WSS在显式升级确认后切换到WS状态，不建立另一个数据通道。 */
  private webSocketExchange: WebSocketExchange | null = null;
  /** 最多两个方向的当前原文，应用或断线后立即释放。 */
  private readonly webSocketMessagesByStageId = new Map<string, InspectionPendingWebSocketMessage>();
  /** 首消息固定的wire身份，仅用于当前会话回复。 */
  private exchangeId: string | null = null;
  /** 已通过请求决定并确认采纳的请求metadata。 */
  private request: InspectionRequest | null = null;
  /** 请求修改等到Android确认后才用于响应规则上下文。 */
  private pendingRequest: InspectionRequest | null = null;
  /** 请求头阶段身份，用于区分响应的应用确认。 */
  private requestStageId: string | null = null;
  /** 正文replacement按全方向单块窗口发送，最多请求和响应各一项。 */
  private readonly replacements: Array<{ bodyId: string; content: Uint8Array; offset: number }> = [];
  /** 一次只发送一个等待ack的正文块。 */
  private waitingChunk = false;
  /** end的异步记录和发送也占用pump，不能被另一阶段的决定抢先。 */
  private pumping = false;
  /** 异步规则与持久化工作均归通道，关闭前排空。 */
  private readonly operations = new Set<Promise<void>>();
  /** 记录保持wire接受顺序，不把断点等待放进此队列。 */
  private recordingTail: Promise<void> = Promise.resolve();
  /** 首帧/取消确认/关闭握手的期限，不限制规则断点等待。 */
  private timer: NodeJS.Timeout | null = null;
  /** 终止后不能发送迟到决定。 */
  private terminal = false;
  /** 正常关闭发起后不重复关闭。 */
  private closing = false;
  /** 资源名额只在实际close及异步收尾后释放一次。 */
  private released = false;
  /** 重复PC取消调用复用同一次操作，不分配新的取消ID。 */
  private cancellationRequested = false;
  /** 复制已协商能力，不因调用方后来改写数组而扩大授权。 */
  private readonly capabilities: ReadonlySet<InspectionCapability>;

  /** 建立后由入口注入认证会话及真实记录责任。 */
  constructor(
    private readonly webSocket: WebSocket,
    private readonly sessionId: string,
    capabilities: readonly InspectionCapability[],
    private readonly httpInterceptionService: HttpInterceptionService,
    private readonly ruleService: RuleService,
    private readonly getWebSocketBreakpointSettings: () => WebSocketBreakpointSettings | null,
    private readonly recording: HttpRecording,
    private readonly diagnostics: DiagnosticsRecorder,
    private readonly release: () => void,
  ) {
    this.capabilities = new Set(capabilities);
    this.timer = setTimeout(() => this.fail('request-timeout'), CONNECT_TIMEOUT_MS);
    webSocket.on('message', (data, binary) => this.receive(data, binary));
    webSocket.on('error', () => this.fail('network-error'));
    webSocket.once('close', () => {
      this.terminal = true;
      this.clearTimer();
      this.currentExchange?.disconnect();
      this.replacements.length = 0;
      this.webSocketMessagesByStageId.clear();
      void this.finish();
    });
  }

  /** 流控、取消与终态统一使用当前协议的唯一状态机。 */
  private get currentExchange(): HttpExchange | WebSocketExchange | null {
    return this.webSocketExchange ?? this.httpExchange;
  }

  /** PC操作取消真实手机交互，需要对端确认。 */
  cancel(): void {
    if (this.terminal || this.closing || this.cancellationRequested
      || this.currentExchange?.state === 'completed') return;
    this.cancellationRequested = true;
    if (!this.currentExchange) {
      this.close();
      return;
    }
    this.clearTimer();
    this.timer = setTimeout(() => this.fail('cancel-unconfirmed'), CONNECT_TIMEOUT_MS);
    this.track(async () => {
      await this.send({ ...this.envelope(), type: 'exchange.cancel', cancellationId: randomUUID(), reason: 'user' });
      this.replacements.length = 0;
    });
  }

  /** 控制会话撤销后立即取消本地等待并终止socket。 */
  close(): void {
    if (this.terminal) return;
    this.terminal = true;
    this.clearTimer();
    this.currentExchange?.disconnect();
    this.webSocket.terminate();
  }

  /** 同步校验状态，异步消费正文或求值；取消不排队等待断点。 */
  private receive(data: RawData, binary: boolean): void {
    if (this.terminal || this.closing) return;
    try {
      if (!Buffer.isBuffer(data)) throw new InspectionProtocolError();
      if (binary) {
        if (!this.currentExchange) throw new InspectionProtocolError();
        const chunk = decodeInspectionChunk(data);
        if (this.currentExchange.state === 'aborted') return;
        this.currentExchange.receiveChunk(chunk, 'android');
        if (this.webSocketExchange) {
          this.webSocketMessageForBody(chunk.bodyId).content.set(chunk.payload, chunk.offset);
        }
        this.track(async () => {
          if (!this.webSocketExchange) await this.record(() => this.recording.recordChunk(chunk));
          if (this.currentExchange?.state !== 'active') return;
          await this.send({ ...this.envelope(), type: 'body.ack', bodyId: chunk.bodyId, offset: chunk.offset + chunk.payload.byteLength });
        });
        return;
      }
      if (this.webSocketExchange) {
        this.receiveWebSocketMessage(parseInspectionWebSocketProtocolMessage(data.toString('utf8'), this.sessionId));
        return;
      }
      const message = parseInspectionMessage(data.toString('utf8'), this.sessionId);
      if (!this.httpExchange) {
        if (message.type !== 'http.request') throw new InspectionProtocolError();
        this.httpExchange = new HttpExchange(this.sessionId, message.exchangeId);
        this.exchangeId = message.exchangeId;
        this.clearTimer();
      }
      if (message.sessionId !== this.sessionId || message.exchangeId !== this.exchangeId) {
        throw new InspectionProtocolError();
      }
      if (this.httpExchange.state === 'aborted'
        && message.type !== 'exchange.cancel' && message.type !== 'exchange.cancelled') return;
      if (message.type === 'http.upgraded' && !this.capabilities.has('websocket')) throw new InspectionProtocolError();
      this.httpExchange.receive(message, 'android');
      const recorded = this.record(() => this.recording.recordMessage(message, 'android'));
      this.track(async () => {
        await recorded;
        await this.process(message);
      });
    } catch (error) {
      this.fail(error instanceof InspectionProtocolError ? 'invalid-message' : 'receive-failed');
    }
  }

  /** WS接纳、应用与原文收集仍由同一WSS串行校验，规则等待保持异步。 */
  private receiveWebSocketMessage(message: InspectionWebSocketProtocolMessage): void {
    const exchange = this.webSocketExchange!;
    if (exchange.state === 'aborted'
      && message.type !== 'exchange.cancel' && message.type !== 'exchange.cancelled') return;
    exchange.receive(message, 'android');
    switch (message.type) {
      case 'ws.message':
        this.webSocketMessagesByStageId.set(message.stageId, {
          message, content: Buffer.allocUnsafe(message.byteLength), timestamp: Date.now(),
        });
        return;
      case 'ws.applied': {
        this.webSocketMessagesByStageId.delete(message.stageId);
        const { requestBytes, responseBytes } = exchange;
        const recorded = this.record(() => this.recording.updateWebSocketTraffic(requestBytes, responseBytes));
        this.track(() => recorded);
        return;
      }
      case 'ws.decision':
        throw new InspectionProtocolError();
      case 'body.end':
        this.track(() => this.finishWebSocketOriginal(message));
        return;
      default: {
        const recorded = this.record(() => this.recording.recordMessage(message, 'android'));
        this.track(async () => {
          await recorded;
          await this.process(message);
        });
      }
    }
  }

  /** 原文完整消费并交给Capture后确认接收，再调用共享WS决定业务。 */
  private async finishWebSocketOriginal(message: Extract<InspectionHttpMessage, { type: 'body.end' }>): Promise<void> {
    const pending = this.webSocketMessageForBody(message.bodyId);
    let frameSequence: number | undefined;
    await this.record(async () => {
      frameSequence = await this.recording.recordWebSocketFrame(pending.message, pending.content, pending.timestamp);
    });
    if (this.terminal || this.webSocketExchange?.state !== 'active') return;
    await this.send({ ...this.envelope(), type: 'body.received', bodyId: message.bodyId, byteLength: message.byteLength });
    await this.decideWebSocketMessage(pending, frameSequence);
  }

  /** 两个方向使用同一RuleService和同一组产品断点设置，不在入口复制业务。 */
  private async decideWebSocketMessage(pending: InspectionPendingWebSocketMessage, frameSequence: number | undefined): Promise<void> {
    const message = pending.message;
    const frame = message.frame === 'text' || message.frame === 'binary' ? 'message' : message.frame;
    const exchangeId = this.recording.captureExchangeId;
    const result = await this.ruleService.evaluateWebSocketMessage({
      ...(exchangeId === undefined ? {} : { exchangeId }),
      url: this.request!.url, direction: message.direction, frame, content: pending.content,
      isBinary: message.frame === 'binary' || message.frame === 'ping' || message.frame === 'pong',
      ...(message.closeCode === null ? {} : { closeCode: message.closeCode }),
    }, this.getWebSocketBreakpointSettings(), Promise.resolve(frameSequence), this.webSocketExchange!.signal);
    if (this.terminal || this.webSocketExchange?.state !== 'active') return;
    let decision: Extract<InspectionWebSocketMessage, { type: 'ws.decision' }>['decision'];
    if (result.kind === 'replace') {
      const closeCode = result.closeCode ?? message.closeCode;
      validateWebSocketContent(message.frame, result.content.byteLength, closeCode);
      const bodyId = inspectionWebSocketOperationId(this.exchangeId!, message.direction, message.sequence, 'replacement');
      this.replacements.push({ bodyId, content: result.content, offset: 0 });
      decision = { action: 'replace', body: { bodyId, byteLength: result.content.byteLength }, closeCode };
    } else {
      decision = { action: result.kind === 'drop' || result.kind === 'aborted' ? 'drop' : 'bypass' };
    }
    await this.send({ ...this.envelope(), type: 'ws.decision', stageId: message.stageId,
      decisionId: inspectionWebSocketOperationId(this.exchangeId!, message.direction, message.sequence, 'decision'), decision });
    await this.pumpReplacement();
  }

  /** body身份只从当前两个方向查找，不建立随历史消息增长的索引。 */
  private webSocketMessageForBody(bodyId: string): InspectionPendingWebSocketMessage {
    const pending = [...this.webSocketMessagesByStageId.values()].find(item => item.message.bodyId === bodyId);
    if (!pending) throw new InspectionProtocolError();
    return pending;
  }

  /** 按消息类型推进业务，但绝不等待整个请求再接收取消。 */
  private async process(message: InspectionHttpMessage): Promise<void> {
    switch (message.type) {
      case 'http.request':
        this.request = message.request;
        this.requestStageId = message.stageId;
        await this.decideRequest(message);
        break;
      case 'http.response':
        await this.decideResponse(message);
        break;
      case 'http.applied':
        if (message.stageId === this.requestStageId && this.pendingRequest) {
          this.request = this.pendingRequest;
          this.pendingRequest = null;
        }
        if (this.httpExchange?.state === 'aborted') await this.closeNormally();
        break;
      case 'http.upgraded':
        await this.send({ ...this.envelope(), type: 'http.upgrade-ready',
          stageId: message.stageId, decisionId: message.decisionId });
        break;
      case 'body.ack':
        if (!this.webSocketExchange && this.httpExchange?.isReplacementDiscarded(message.bodyId)) break;
        this.waitingChunk = false;
        await this.pumpReplacement();
        break;
      case 'body.end':
      case 'body.stopped':
        if (this.currentExchange?.state !== 'active') break;
        await this.send({ ...this.envelope(), type: 'body.received', bodyId: message.bodyId, byteLength: message.byteLength });
        break;
      case 'body.discard':
        if (this.replacements[0]?.bodyId === message.bodyId) this.waitingChunk = false;
        await this.pumpReplacement();
        break;
      case 'exchange.cancel':
        this.replacements.length = 0;
        await this.send({ ...this.envelope(), type: 'exchange.cancelled', cancellationId: message.cancellationId });
        if (!this.currentExchange?.awaitingCancellationAcknowledgement) await this.closeNormally();
        break;
      case 'exchange.cancelled':
        if (!this.currentExchange?.awaitingCancellationAcknowledgement) await this.closeNormally();
        break;
      case 'exchange.complete':
        await this.recording.settle();
        if (this.currentExchange?.state !== 'completing') break;
        await this.send({ ...this.envelope(), type: 'exchange.completed' });
        await this.closeNormally();
        break;
    }
  }

  /** 请求求值仅访问规则与可信PC文件，不访问源站。 */
  private async decideRequest(message: Extract<InspectionHttpMessage, { type: 'http.request' }>): Promise<void> {
    const result = await this.httpInterceptionService.evaluateRequest(
      inspectionRequestContext(message.request), this.httpExchange!.signal, this.recording.captureExchangeId,
    );
    if (this.terminal || this.httpExchange?.state !== 'active' || result.decision.action === 'aborted') return;
    await this.record(() => this.recording.recordRuleOutcome(message.stageId, result));
    if (this.terminal || this.httpExchange?.state !== 'active') return;
    const decision = this.requestDecision(result.decision, message.request.headers);
    if (decision.action === 'intercept') {
      this.pendingRequest = {
        ...message.request, method: decision.method, url: decision.url, headers: decision.headers,
      };
    }
    await this.send({
      ...this.envelope(), type: 'http.decision', phase: 'request', stageId: message.stageId,
      decisionId: randomUUID(), decision,
    });
    await this.pumpReplacement();
  }

  /** 响应继续复用规则，使用Android已确认的最终请求metadata。 */
  private async decideResponse(message: Extract<InspectionHttpMessage, { type: 'http.response' }>): Promise<void> {
    if (!this.request) throw new InspectionProtocolError();
    const responseHeaders = inspectionHeaderBag(message.response.headers);
    const result = await this.httpInterceptionService.evaluateResponse({
      request: inspectionRequestContext(this.request),
      response: {
        statusCode: message.response.statusCode, headers: responseHeaders,
        ...(typeof responseHeaders['content-type'] === 'string' ? { mime: responseHeaders['content-type'] } : {}),
      },
    }, this.httpExchange!.signal, this.recording.captureExchangeId);
    if (this.terminal || this.httpExchange?.state !== 'active' || result.decision.action === 'aborted') return;
    await this.record(() => this.recording.recordRuleOutcome(message.stageId, result));
    if (this.terminal || this.httpExchange?.state !== 'active') return;
    await this.send({
      ...this.envelope(), type: 'http.decision', phase: 'response', stageId: message.stageId,
      decisionId: randomUUID(), decision: this.responseDecision(result.decision, message.response.headers),
    });
    await this.pumpReplacement();
  }

  /** 与网络无关的请求结果映射为严格wire决定。 */
  private requestDecision(
    decision: Exclude<HttpInterceptionRequestDecision, { action: 'aborted' }>, original: InspectionHeaders,
  ): InspectionRequestDecision {
    if (decision.action === 'bypass' || decision.action === 'abort') return decision;
    if (decision.action === 'respond') {
      return { action: 'respond', statusCode: decision.statusCode,
        headers: inspectionFinalHeaders([], decision.headers), body: this.replaceBody(decision.body.content) };
    }
    return {
      ...decision, headers: inspectionFinalHeaders(original, decision.headers),
      body: decision.body.action === 'keep' ? { action: 'keep' } : this.replaceBody(decision.body.content),
    };
  }

  /** 响应决定不允许携带request URL或本机路径。 */
  private responseDecision(
    decision: Exclude<HttpInterceptionResponseDecision, { action: 'aborted' }>, original: InspectionHeaders,
  ): InspectionResponseDecision {
    if (decision.action === 'bypass' || decision.action === 'abort') return decision;
    return {
      ...decision, headers: inspectionFinalHeaders(original, decision.headers),
      body: decision.body.action === 'keep' ? { action: 'keep' } : this.replaceBody(decision.body.content),
    };
  }

  /** replacement以有界块发送，不放进JSON或Base64。 */
  private replaceBody(content: Uint8Array): Extract<InspectionBodyDecision, { action: 'replace' }> {
    const bodyId = randomUUID();
    this.replacements.push({ bodyId, content, offset: 0 });
    return { action: 'replace', bodyId, byteLength: content.byteLength };
  }

  /** 全方向一次一个块，消费ack之前不发送下一块。 */
  private async pumpReplacement(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.terminal && !this.waitingChunk && this.currentExchange?.state === 'active') {
        const body = this.replacements[0];
        if (!body) return;
        if (!this.webSocketExchange && this.httpExchange!.isReplacementDiscarded(body.bodyId)) {
          this.replacements.shift();
          await this.send({ ...this.envelope(), type: 'body.stopped', bodyId: body.bodyId,
            byteLength: body.offset, reason: 'early-response' });
          continue;
        }
        if (body.offset === body.content.byteLength) {
          this.replacements.shift();
          await this.send({ ...this.envelope(), type: 'body.end', bodyId: body.bodyId, byteLength: body.offset, trailers: [] });
          continue;
        }
        const payload = body.content.subarray(body.offset, body.offset + MAX_CHUNK_BYTES);
        const chunk = { bodyId: body.bodyId, offset: body.offset, payload };
        this.currentExchange.receiveChunk(chunk, 'pc');
        body.offset += payload.byteLength;
        this.waitingChunk = true;
        await this.write(encodeInspectionChunk(chunk));
      }
    } finally {
      this.pumping = false;
    }
  }

  /** wire信封只来自首条已认证消息的固定身份。 */
  private envelope() {
    if (!this.httpExchange || !this.exchangeId) throw new InspectionProtocolError();
    return { protocolVersion: 2 as const, sessionId: this.sessionId, exchangeId: this.exchangeId };
  }

  /** 发送前验证schema及阶段，输出不合法决定时显式失败。 */
  private async send(message: InspectionHttpMessage | InspectionWebSocketMessage): Promise<void> {
    if (this.terminal) return;
    const text = JSON.stringify(message);
    if (this.webSocketExchange) {
      const parsed = parseInspectionWebSocketProtocolMessage(text, this.sessionId);
      this.webSocketExchange.receive(parsed, 'pc');
      if (parsed.type !== 'ws.message' && parsed.type !== 'ws.decision' && parsed.type !== 'ws.applied') {
        await this.record(() => this.recording.recordMessage(parsed, 'pc'));
      }
    } else {
      const parsed = parseInspectionMessage(text, this.sessionId);
      this.httpExchange!.receive(parsed, 'pc');
      if (parsed.type === 'http.upgrade-ready') {
        this.webSocketExchange = new WebSocketExchange(this.sessionId, this.exchangeId!, this.httpExchange!.webSocketHandshakeIds);
      }
      await this.record(() => this.recording.recordMessage(parsed, 'pc'));
    }
    if (!this.terminal) await this.write(text);
  }

  /** ws callback错误必须取消该交互，不能忽略发送失败。 */
  private write(data: string | Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.terminal || this.webSocket.readyState !== WebSocket.OPEN) {
        reject(new Error('HTTP channel is not open'));
        return;
      }
      this.webSocket.send(data, error => error ? reject(error) : resolve());
    });
  }

  /** 持久化顺序独立于规则等待，失败保持显式reject。 */
  private record(operation: () => Promise<void>): Promise<void> {
    const pending = this.recordingTail.then(operation);
    this.recordingTail = pending;
    return pending;
  }

  /** 所有异步操作归通道所有，异常记录固定原因后终止。 */
  private track(operation: () => Promise<void>): void {
    const promise = operation().catch(() => this.fail('operation-failed'));
    this.operations.add(promise);
    void promise.then(() => this.operations.delete(promise));
  }

  /** 明确日志而不包含URL、headers、token或正文。 */
  private fail(reason: string): void {
    if (this.terminal) return;
    this.diagnostics.warn('android.http-channel-failed', { attributes: { reason } });
    this.close();
  }

  /** 正常关闭仍占用名额，握手不完成则明确失败。 */
  private async closeNormally(): Promise<void> {
    if (this.terminal || this.closing) return;
    await this.recording.settle();
    if (this.terminal || this.closing) return;
    this.closing = true;
    this.clearTimer();
    this.timer = setTimeout(() => this.fail('close-unconfirmed'), CONNECT_TIMEOUT_MS);
    this.webSocket.close(1000);
  }

  /** 实际close之后排空异步工作与记录，最后归还入口名额。 */
  private async finish(): Promise<void> {
    try {
      await Promise.all([...this.operations]);
      await this.recordingTail;
    } catch {
      this.diagnostics.warn('android.http-recording-failed');
    } finally {
      try {
        await this.recording.settle();
      } catch {
        this.diagnostics.warn('android.http-recording-cleanup-failed');
      }
      if (!this.released) {
        this.released = true;
        this.release();
      }
    }
  }

  /** 重新设置阶段期限前释放旧timer。 */
  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
