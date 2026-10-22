import type { WebSocketFrameDirection } from '@interceptor/core-protocol';
import type { InspectionBodyChunk, InspectionCancellationReason, InspectionExchangeState, InspectionPeer } from '../interfaces/inspection';
import type {
  InspectionWebSocketBodyState, InspectionWebSocketDirectionState, InspectionWebSocketOperation, InspectionWebSocketProtocolMessage,
} from '../interfaces/websocket';
import { count, requireValid, uuid } from '../utils/inspection-protocol';
import { inspectionWebSocketOperationId } from '../utils/websocket-ids';
import { validateWebSocketContent } from '../utils/websocket-protocol';
import { MAX_CHUNK_BYTES } from './constants';
import { InspectionProtocolError } from './errors';

/** 已确认HTTP升级后的单连接WS消息、正文窗口与取消状态。 */
export class WebSocketExchange {
  /** 只取消当前WS连接的决定等待。 */
  private readonly abortController = new AbortController();
  /** 连接与消息完成分别管理。 */
  private currentState: InspectionExchangeState = 'active';
  /** 固定两个方向，各自串行，但不互相阻塞决定。 */
  private readonly statesByDirection: Record<WebSocketFrameDirection, InspectionWebSocketDirectionState> = {
    'client-to-server': { nextSequence: 0, forwardedBytes: 0, closed: false, stage: null },
    'server-to-client': { nextSequence: 0, forwardedBytes: 0, closed: false, stage: null },
  };
  /** 仅保存当前消息的original/replacement，应用后立即移除。 */
  private readonly bodiesById = new Map<string, InspectionWebSocketBodyState>();
  /** 每个发送方只有一个未确认块，两个方向不能各占一个窗口。 */
  private readonly pendingChunksBySender = new Map<InspectionPeer, { bodyId: string; offset: number }>();
  /** HTTP握手占用的固定身份不能用于后续WS操作。 */
  private readonly handshakeIds: ReadonlySet<string>;
  /** 交叉取消分别确认，重发不重复业务效果。 */
  private readonly cancellationsBySender = new Map<InspectionPeer, {
    id: string; reason: InspectionCancellationReason; acknowledged: boolean;
  }>();

  /** 调用方先完成真实HTTP升级，保留握手已占用的有限ID。 */
  constructor(
    private readonly sessionId: string,
    private readonly exchangeId: string,
    handshakeIds: readonly string[] = [],
  ) {
    this.handshakeIds = new Set(handshakeIds);
  }

  /** 当前连接状态。 */
  get state(): InspectionExchangeState { return this.currentState; }

  /** 当前连接的取消信号。 */
  get signal(): AbortSignal { return this.abortController.signal; }

  /** Android已实际应用的两个方向content字节，drop和framing不累计。 */
  get requestBytes(): number { return this.statesByDirection['client-to-server'].forwardedBytes; }

  /** 当前实际server-to-client content总量供Capture和完成校验共用。 */
  get responseBytes(): number { return this.statesByDirection['server-to-client'].forwardedBytes; }

  /** 供channel核对取消确认是否全部收到。 */
  get awaitingCancellationAcknowledgement(): boolean {
    return [...this.cancellationsBySender.values()].some(cancellation => !cancellation.acknowledged);
  }

  /** 当前等待决定或应用的方向数量。 */
  get pendingMessageCount(): number {
    return Object.values(this.statesByDirection).filter(state => state.stage !== null).length;
  }

  /** 诊断当前仍保留的操作身份，不保存已完成消息的历史集合。 */
  get retainedIdentifierCount(): number {
    return this.handshakeIds.size + this.bodiesById.size + this.pendingMessageCount + this.cancellationsBySender.size;
  }

  /** 接收已经通过schema校验的控制消息。 */
  receive(message: InspectionWebSocketProtocolMessage, sender: InspectionPeer): void {
    this.guard(() => {
      requireValid(message.protocolVersion === 2 && message.sessionId === this.sessionId && message.exchangeId === this.exchangeId);
      if (message.type === 'exchange.cancel') return this.cancel(message, sender);
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
      requireValid(this.currentState === 'active');
      switch (message.type) {
        case 'ws.message':
          requireValid(sender === 'android');
          this.beginMessage(message);
          break;
        case 'ws.decision':
          requireValid(sender === 'pc');
          this.decide(message);
          break;
        case 'ws.applied':
          requireValid(sender === 'android');
          this.apply(message);
          break;
        case 'body.ack': {
          const owner = this.opposite(sender);
          const body = this.bodiesById.get(message.bodyId);
          const pending = this.pendingChunksBySender.get(owner);
          requireValid(body?.owner === owner && pending?.bodyId === message.bodyId && pending.offset === message.offset);
          this.pendingChunksBySender.delete(owner);
          break;
        }
        case 'body.end':
        case 'body.received':
          this.endBody(message, sender);
          break;
        case 'exchange.complete':
          requireValid(sender === 'android' && this.pendingMessageCount === 0 && this.bodiesById.size === 0
            && this.statesByDirection['client-to-server'].closed && this.statesByDirection['server-to-client'].closed
            && message.requestBytes === this.statesByDirection['client-to-server'].forwardedBytes
            && message.responseBytes === this.statesByDirection['server-to-client'].forwardedBytes);
          this.currentState = 'completing';
          break;
      }
    });
  }

  /** 序号与派生ID共同区分操作，完成后无需保留旧UUID。 */
  private beginMessage(message: Extract<InspectionWebSocketProtocolMessage, { type: 'ws.message' }>): void {
    const state = this.statesByDirection[message.direction];
    requireValid(!state.closed && state.stage === null && message.sequence === state.nextSequence
      && message.stageId === this.operationId(message, 'message')
      && message.bodyId === this.operationId(message, 'original'));
    validateWebSocketContent(message.frame, message.byteLength, message.closeCode);
    state.stage = { message: { ...message }, decision: null };
    this.bodiesById.set(message.bodyId, {
      owner: 'android', byteLength: message.byteLength, offset: 0, ended: false, received: false,
    });
  }

  /** 先消费完整原文，再决定；replacement保持原frame类别的长度与close语义。 */
  private decide(message: Extract<InspectionWebSocketProtocolMessage, { type: 'ws.decision' }>): void {
    const stage = this.stage(message.stageId);
    requireValid(stage.decision === null && this.bodiesById.get(stage.message.bodyId)?.received
      && message.decisionId === this.operationId(stage.message, 'decision'));
    const decision = message.decision;
    if (decision.action === 'replace') {
      requireValid(decision.body.bodyId === this.operationId(stage.message, 'replacement'));
      validateWebSocketContent(stage.message.frame, decision.body.byteLength, decision.closeCode);
      this.bodiesById.set(decision.body.bodyId, {
        owner: 'pc', byteLength: decision.body.byteLength, offset: 0, ended: false, received: false,
      });
    }
    stage.decision = structuredClone(decision);
  }

  /** 整帧写入或drop确认后才释放该方向，不以PC发出决定代替实际应用。 */
  private apply(message: Extract<InspectionWebSocketProtocolMessage, { type: 'ws.applied' }>): void {
    const stage = this.stage(message.stageId);
    const decision = stage.decision;
    requireValid(decision && message.decisionId === this.operationId(stage.message, 'decision')
      && this.bodiesById.get(stage.message.bodyId)?.received);
    if (decision.action === 'replace') requireValid(this.bodiesById.get(decision.body.bodyId)?.received);
    const state = this.statesByDirection[stage.message.direction];
    if (decision.action !== 'drop') {
      const byteLength = decision.action === 'replace' ? decision.body.byteLength : stage.message.byteLength;
      state.forwardedBytes = count(state.forwardedBytes + byteLength);
      if (stage.message.frame === 'close') state.closed = true;
    }
    this.bodiesById.delete(stage.message.bodyId);
    if (decision.action === 'replace') this.bodiesById.delete(decision.body.bodyId);
    state.stage = null;
    state.nextSequence++;
  }

  /** 操作只能指向当前两个方向之一的待处理消息。 */
  private stage(stageId: string): NonNullable<InspectionWebSocketDirectionState['stage']> {
    const stage = Object.values(this.statesByDirection).map(state => state.stage)
      .find(stage => stage?.message.stageId === stageId);
    requireValid(stage);
    return stage;
  }

  /** 固定的HTTP握手ID不能成为任何后续派生操作。 */
  private operationId(
    message: Extract<InspectionWebSocketProtocolMessage, { type: 'ws.message' }>, operation: InspectionWebSocketOperation,
  ): string {
    const id = inspectionWebSocketOperationId(this.exchangeId, message.direction, message.sequence, operation);
    requireValid(!this.handshakeIds.has(id));
    return id;
  }

  /** 接收一个有界内容副本。 */
  receiveChunk(chunk: InspectionBodyChunk, sender: InspectionPeer): void {
    this.guard(() => {
      const body = this.bodiesById.get(chunk.bodyId);
      requireValid(this.currentState === 'active' && body?.owner === sender && !body.ended
        && !this.pendingChunksBySender.has(sender) && chunk.offset === body.offset
        && chunk.payload.byteLength > 0 && chunk.payload.byteLength <= MAX_CHUNK_BYTES
        && body.offset + chunk.payload.byteLength <= body.byteLength);
      body.offset += chunk.payload.byteLength;
      this.pendingChunksBySender.set(sender, { bodyId: chunk.bodyId, offset: body.offset });
    });
  }

  /** WS无HTTP trailers，end与接收确认都必须精确匹配已声明长度。 */
  private endBody(
    message: Extract<InspectionWebSocketProtocolMessage, { type: 'body.end' | 'body.received' }>, sender: InspectionPeer,
  ): void {
    const body = this.bodiesById.get(message.bodyId);
    requireValid(body && body.offset === message.byteLength && body.byteLength === message.byteLength);
    if (message.type === 'body.end') {
      requireValid(body.owner === sender && !body.ended && message.trailers.length === 0
        && !this.pendingChunksBySender.has(sender));
      body.ended = true;
    } else {
      requireValid(body.owner !== sender && body.ended && !body.received);
      body.received = true;
    }
  }

  /** 取消立即解除本连接等待，重发与对向取消分别保留确认。 */
  private cancel(
    message: Extract<InspectionWebSocketProtocolMessage, { type: 'exchange.cancel' }>, sender: InspectionPeer,
  ): void {
    requireValid(this.currentState === 'active' || this.currentState === 'completing' || this.currentState === 'aborted');
    const previous = this.cancellationsBySender.get(sender);
    if (previous) {
      requireValid(previous.id === message.cancellationId && previous.reason === message.reason);
      return;
    }
    const id = uuid(message.cancellationId);
    requireValid(id[14] === '4' && /^[89ab]$/.test(id[19]!) && !this.handshakeIds.has(id)
      && ![...this.cancellationsBySender.values()].some(cancellation => cancellation.id === id));
    this.cancellationsBySender.set(sender, { id, reason: message.reason, acknowledged: false });
    this.currentState = 'aborted';
    this.releasePendingMessages();
    this.abortController.abort();
  }

  /** 传输失效不能留下决定等待。 */
  disconnect(): void {
    if (this.currentState === 'active' || this.currentState === 'completing') this.currentState = 'failed';
    this.releasePendingMessages();
    this.abortController.abort();
  }

  /** 丢弃当前消息元数据与窗口，不保留已结束流的body引用。 */
  private releasePendingMessages(): void {
    this.bodiesById.clear();
    this.pendingChunksBySender.clear();
    for (const state of Object.values(this.statesByDirection)) state.stage = null;
  }

  /** 返回当前消息的接收方。 */
  private opposite(peer: InspectionPeer): InspectionPeer {
    return peer === 'android' ? 'pc' : 'android';
  }

  /** 协议失败同时取消等待，不能只抛错而保留悬挂状态。 */
  private guard(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      if (error instanceof InspectionProtocolError) this.disconnect();
      throw error;
    }
  }
}
