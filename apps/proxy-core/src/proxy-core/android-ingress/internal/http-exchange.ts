import type {
  InspectionBodyChunk,
  InspectionBodyState,
  InspectionCancellationReason,
  InspectionExchangeState,
  InspectionHttpMessage,
  InspectionHttpStage,
  InspectionPeer,
} from '../interfaces/inspection';
import { MAX_CHUNK_BYTES } from './constants';
import { InspectionProtocolError } from './errors';

/** 单个HTTP副本交互的阶段、决定确认、正文窗口与取消所有权。 */
export class HttpExchange {
  /** 只取消本exchange的规则求值，不影响共享断点队列的其他请求。 */
  private readonly abortController = new AbortController();
  /** 外部不能直接修改终态或重新开始交互。 */
  private currentState: InspectionExchangeState = 'active';
  /** 请求与响应分别等待决定和应用，正文结束不推进另一方向。 */
  private requestStage: InspectionHttpStage | null = null;
  /** 源站最终响应的独立头部阶段。 */
  private responseStage: InspectionHttpStage | null = null;
  /** 源站101是协议切换前提，PC不能从普通响应制造升级。 */
  private originSwitchingProtocols = false;
  /** PC保留101时仍需应用确认，不能按普通HTTP完成。 */
  private responseSwitchingProtocols = false;
  /** 不同操作不得复用ID触发重复执行。 */
  private readonly usedIds = new Set<string>();
  /** 已声明的有界正文集合，最多每阶段original/applied/replacement各一个。 */
  private readonly bodiesById = new Map<string, InspectionBodyState>();
  /** 每方向只允许一个尚未被消费确认的块。 */
  private readonly pendingChunksBySender = new Map<InspectionPeer, { bodyId: string; offset: number }>();
  /** 记录各方取消，支持重发确认和交叉取消但不重复业务效果。 */
  private readonly cancellationsBySender = new Map<
    InspectionPeer, { id: string; reason: InspectionCancellationReason; acknowledged: boolean }
  >();

  /** 将交互绑定到已认证会话，不能跨设备复用。 */
  constructor(private readonly sessionId: string, private readonly exchangeId: string) {}

  /** 当前阶段供入口决定关闭与记录真实终态。 */
  get state(): InspectionExchangeState {
    return this.currentState;
  }

  /** 传给HTTP决定入口的取消信号。 */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /** 入口不能在对端确认取消前把发送cancel当作清理成功。 */
  get awaitingCancellationAcknowledgement(): boolean {
    return [...this.cancellationsBySender.values()].some(cancellation => !cancellation.acknowledged);
  }

  /** 升级确认后将HTTP已占用身份交给WS状态，调用方不能改写原集合。 */
  get webSocketHandshakeIds(): readonly string[] {
    requireValid(this.currentState === 'upgraded');
    return [...this.usedIds];
  }

  /** 已被接收方放弃的replacement不再发送或用迟到ACK推进另一正文。 */
  isReplacementDiscarded(bodyId: string): boolean {
    const body = this.bodiesById.get(bodyId);
    requireValid(body && body.owner === 'pc' && body.role === 'replacement');
    return body.discardRequested;
  }

  /** 接收已通过schema校验的消息并检查方向与阶段。 */
  receive(message: InspectionHttpMessage, sender: InspectionPeer): void {
    this.guard(() => {
      requireValid(message.protocolVersion === 2
        && message.sessionId === this.sessionId && message.exchangeId === this.exchangeId);
      if (message.type === 'exchange.cancel') {
        this.cancel(message, sender);
        return;
      }
      if (message.type === 'exchange.cancelled') {
        const cancellation = this.cancellationsBySender.get(this.opposite(sender));
        requireValid(cancellation?.id === message.cancellationId);
        cancellation.acknowledged = true;
        return;
      }
      if (message.type === 'exchange.completed') {
        requireValid(sender === 'pc' && this.currentState === 'completing');
        this.currentState = 'completed';
        return;
      }
      if (message.type === 'http.upgrade-ready') {
        requireValid(sender === 'pc' && this.currentState === 'upgrading'
          && this.responseStage?.id === message.stageId && this.responseStage.decisionId === message.decisionId);
        this.currentState = 'upgraded';
        return;
      }
      requireValid(this.currentState === 'active');
      switch (message.type) {
        case 'http.request':
          requireValid(sender === 'android' && this.requestStage === null);
          this.requestStage = this.newStage(message.stageId);
          break;
        case 'http.response':
          requireValid(sender === 'android' && this.requestStage?.applied && this.responseStage === null
            && this.requestStage.action !== 'respond');
          this.responseStage = this.newStage(message.stageId);
          this.originSwitchingProtocols = message.response.statusCode === 101;
          break;
        case 'http.informational':
          requireValid(sender === 'android' && this.requestStage?.applied && this.responseStage === null
            && this.requestStage.action !== 'respond');
          break;
        case 'http.decision':
          requireValid(sender === 'pc');
          this.decide(message);
          break;
        case 'http.applied':
          requireValid(sender === 'android');
          this.apply(message);
          break;
        case 'http.upgraded':
          requireValid(sender === 'android');
          this.upgrade(message);
          break;
        case 'exchange.complete':
          requireValid(sender === 'android' && this.requestStage?.applied && !this.responseSwitchingProtocols
            && (this.requestStage.action === 'respond' || this.responseStage?.applied));
          requireValid([...this.bodiesById.values()].every(body => body.received));
          for (const body of this.bodiesById.values()) {
            if (body.role === 'applied') {
              requireValid(body.offset === (body.phase === 'request' ? message.requestBytes : message.responseBytes));
            }
          }
          this.currentState = 'completing';
          break;
        case 'body.open':
          this.openBody(message, sender);
          break;
        case 'body.ack':
          this.acknowledge(message, sender);
          break;
        case 'body.end':
        case 'body.received':
          this.endBody(message, sender);
          break;
        case 'body.stopped':
          this.stopBody(message, sender);
          break;
        case 'body.discard':
          this.discardReplacement(message.bodyId, sender);
          break;
      }
    });
  }

  /** 检查正文归属、顺序与每方向单块窗口。 */
  receiveChunk(chunk: InspectionBodyChunk, sender: InspectionPeer): void {
    this.guard(() => {
      requireValid(this.currentState === 'active');
      const body = this.bodiesById.get(chunk.bodyId);
      const length = chunk.payload.byteLength;
      requireValid(body && body.owner === sender && body.termination === 'open'
        && !body.discardRequested && !this.pendingChunksBySender.has(sender));
      requireValid(sender !== 'pc' || ![...this.bodiesById.values()].some(
        item => item.discardRequested && item.termination === 'open',
      ));
      requireValid(length > 0 && length <= MAX_CHUNK_BYTES && chunk.offset === body.offset);
      const next = chunk.offset + length;
      requireValid(Number.isSafeInteger(next) && next >= 0 && (body.byteLength === null || next <= body.byteLength));
      body.offset = next;
      this.pendingChunksBySender.set(sender, { bodyId: chunk.bodyId, offset: next });
    });
  }

  /** 断线时本地取消，不等待已不可达对端。 */
  disconnect(): void {
    if (this.currentState !== 'active' && this.currentState !== 'upgrading'
      && this.currentState !== 'upgraded' && this.currentState !== 'completing') return;
    this.currentState = 'failed';
    this.abortController.abort();
    this.pendingChunksBySender.clear();
  }

  /** 相反方向用于ack归属，不把自己的发送当消费确认。 */
  private opposite(peer: InspectionPeer): InspectionPeer {
    return peer === 'android' ? 'pc' : 'android';
  }

  /** 身份只分配一次，重复消息不能重新产生副作用。 */
  private claimId(id: string): void {
    requireValid(!this.usedIds.has(id));
    this.usedIds.add(id);
  }

  /** 头部阶段从等待决定开始，不默认bypass。 */
  private newStage(id: string): InspectionHttpStage {
    this.claimId(id);
    return { id, decisionId: null, action: null, applied: false };
  }

  /** 决定只登记待应用状态，PC发送不代表Android已修改流量。 */
  private decide(message: Extract<InspectionHttpMessage, { type: 'http.decision' }>): void {
    const stage = message.phase === 'request' ? this.requestStage : this.responseStage;
    requireValid(stage && stage.id === message.stageId && stage.decisionId === null);
    if (message.phase === 'response') {
      const decision = message.decision;
      this.responseSwitchingProtocols = decision.action === 'bypass'
        ? this.originSwitchingProtocols : decision.action === 'intercept' && decision.statusCode === 101;
      requireValid(!this.responseSwitchingProtocols || this.originSwitchingProtocols);
    }
    this.claimId(message.decisionId);
    stage.decisionId = message.decisionId;
    stage.action = message.decision.action;
    const decision = message.decision;
    if ((decision.action === 'intercept' || decision.action === 'respond') && decision.body.action === 'replace') {
      this.declareBody(decision.body.bodyId, {
        owner: 'pc', phase: decision.action === 'respond' ? 'response' : message.phase,
        role: 'replacement', byteLength: decision.body.byteLength, offset: 0,
        termination: 'open', received: false, discardRequested: false,
      });
    }
  }

  /** 确认只能应用当前阶段的唯一决定；abort确认就是中断终态。 */
  private apply(message: Extract<InspectionHttpMessage, { type: 'http.applied' }>): void {
    const stage = this.requestStage?.id === message.stageId ? this.requestStage : this.responseStage;
    requireValid(stage && stage.id === message.stageId && stage.decisionId === message.decisionId && !stage.applied);
    stage.applied = true;
    if (stage.action === 'abort') {
      this.currentState = 'aborted';
      this.abortController.abort();
      this.pendingChunksBySender.clear();
    }
  }

  /** HTTP副本全部完整消费后才交接；停止前缀或有正文的101不能进入WS。 */
  private upgrade(message: Extract<InspectionHttpMessage, { type: 'http.upgraded' }>): void {
    requireValid(this.requestStage?.applied && this.originSwitchingProtocols && this.responseSwitchingProtocols
      && this.responseStage?.applied && this.responseStage.id === message.stageId
      && this.responseStage.decisionId === message.decisionId);
    requireValid(this.pendingChunksBySender.size === 0 && [...this.bodiesById.values()].every(body =>
      body.received && body.termination === 'complete' && (body.phase !== 'response' || body.offset === 0)));
    this.currentState = 'upgrading';
  }

  /** 副本仅由Android发送，不能冒充PC replacement或无限声明body。 */
  private openBody(message: Extract<InspectionHttpMessage, { type: 'body.open' }>, sender: InspectionPeer): void {
    requireValid(sender === 'android');
    const synthetic = message.phase === 'response' && this.requestStage?.action === 'respond';
    const stage = message.phase === 'request' || synthetic ? this.requestStage : this.responseStage;
    requireValid(stage?.applied && (!synthetic || message.role === 'applied'));
    this.declareBody(message.bodyId, {
      owner: 'android', phase: message.phase, role: message.role,
      byteLength: message.byteLength, offset: 0, termination: 'open', received: false, discardRequested: false,
    });
  }

  /** bodyId和phase/role均唯一，固定阶段数形成内存上限。 */
  private declareBody(id: string, body: InspectionBodyState): void {
    requireValid(![...this.bodiesById.values()].some(existing => existing.phase === body.phase && existing.role === body.role));
    this.claimId(id);
    this.bodiesById.set(id, body);
  }

  /** 只有消费方精确确认下一offset才能释放全方向发送窗口。 */
  private acknowledge(message: Extract<InspectionHttpMessage, { type: 'body.ack' }>, sender: InspectionPeer): void {
    const owner = this.opposite(sender);
    const body = this.bodiesById.get(message.bodyId);
    requireValid(body && body.owner === owner);
    if (body.discardRequested) {
      requireValid(owner === 'pc' && message.offset === body.offset);
      return;
    }
    const pending = this.pendingChunksBySender.get(owner);
    requireValid(pending && pending.bodyId === message.bodyId && pending.offset === message.offset);
    this.pendingChunksBySender.delete(owner);
  }

  /** end与received分别代表发送完和消费完，两者不能替代实际网络完成。 */
  private endBody(
    message: Extract<InspectionHttpMessage, { type: 'body.end' | 'body.received' }>,
    sender: InspectionPeer,
  ): void {
    const body = this.bodyAtOffset(message.bodyId, message.byteLength);
    if (message.type === 'body.end') {
      requireValid(sender === body.owner && body.termination === 'open' && !this.pendingChunksBySender.has(sender)
        && (body.byteLength === null || body.byteLength === message.byteLength));
      requireValid(body.role !== 'replacement' || message.trailers.length === 0);
      body.termination = 'complete';
    } else {
      requireValid(sender !== body.owner && body.termination !== 'open' && !body.received);
      body.received = true;
    }
  }

  /** 显式结算已停止的原文/上传前缀，不放宽正常end或取消成功的替换响应。 */
  private stopBody(message: Extract<InspectionHttpMessage, { type: 'body.stopped' }>, sender: InspectionPeer): void {
    const body = this.bodyAtOffset(message.bodyId, message.byteLength);
    requireValid(body.owner === sender && body.termination === 'open' && !this.pendingChunksBySender.has(sender));
    if (message.reason === 'response-replaced') {
      requireValid(sender === 'android' && body.phase === 'response' && body.role === 'original'
        && this.responseStage?.applied && !this.responseSwitchingProtocols
        && [...this.bodiesById.values()].some(replacement => replacement.owner === 'pc'
          && replacement.phase === 'response' && replacement.role === 'replacement' && replacement.received));
    } else {
      requireValid(body.phase === 'request');
      if (sender === 'pc') {
        requireValid(body.role === 'replacement' && body.discardRequested && message.reason === 'early-response');
      } else if (message.reason === 'early-response') {
        requireValid(this.responseStage !== null);
      } else {
        requireValid(message.reason === 'synthetic-response' && this.requestStage?.action === 'respond' && body.role === 'original');
      }
    }
    body.termination = 'stopped';
  }

  /** 接收方只可停止提前响应后的请求replacement；与已发end交错时仍确认原end。 */
  private discardReplacement(bodyId: string, sender: InspectionPeer): void {
    const body = this.bodiesById.get(bodyId);
    requireValid(sender === 'android' && this.responseStage !== null
      && body && body.owner === 'pc' && body.role === 'replacement' && body.phase === 'request');
    body.discardRequested = true;
    if (this.pendingChunksBySender.get('pc')?.bodyId === bodyId) this.pendingChunksBySender.delete('pc');
  }

  /** 两种终态都必须精确匹配已复制前缀，完整性由end单独校验。 */
  private bodyAtOffset(bodyId: string, byteLength: number): InspectionBodyState {
    const body = this.bodiesById.get(bodyId);
    requireValid(body && body.offset === byteLength && (body.byteLength === null || byteLength <= body.byteLength));
    return body;
  }

  /** 取消立即释放本地等待；重发和交叉取消只追加各自确认记录。 */
  private cancel(message: Extract<InspectionHttpMessage, { type: 'exchange.cancel' }>, sender: InspectionPeer): void {
    requireValid(this.currentState === 'active' || this.currentState === 'upgrading'
      || this.currentState === 'upgraded' || this.currentState === 'completing' || this.currentState === 'aborted');
    const previous = this.cancellationsBySender.get(sender);
    if (previous) {
      requireValid(previous.id === message.cancellationId && previous.reason === message.reason);
      return;
    }
    this.claimId(message.cancellationId);
    this.cancellationsBySender.set(sender, { id: message.cancellationId, reason: message.reason, acknowledged: false });
    this.currentState = 'aborted';
    this.abortController.abort();
    this.pendingChunksBySender.clear();
  }

  /** 非法阶段必须取消规则等待，不能只抛错却保留pending。 */
  private guard(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      if (error instanceof InspectionProtocolError) this.disconnect();
      throw error;
    }
  }
}

/** 状态错误只暴露固定协议错误。 */
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new InspectionProtocolError();
}
