import type { WebSocketFrameDirection } from '@interceptor/core-protocol';
import type { InspectionEnvelope, InspectionHttpMessage, InspectionPeer } from './inspection';

/** 重组后的应用消息与独立控制帧，不传底层分片或mask。 */
export type InspectionWebSocketFrame = 'text' | 'binary' | 'ping' | 'pong' | 'close';

/** 每条消息固定四类ID，不用历史UUID集合维持长连接去重。 */
export type InspectionWebSocketOperation = 'message' | 'original' | 'decision' | 'replacement';

/** replacement声明内容身份，实际字节继续走有界binary窗口。 */
export interface InspectionWebSocketBody {
  bodyId: string;
  byteLength: number;
}

/** 消息决定不改变原frame类别；取消整条连接使用exchange.cancel。 */
export type InspectionWebSocketDecision =
  | { action: 'bypass' }
  | { action: 'drop' }
  | { action: 'replace'; body: InspectionWebSocketBody; closeCode: number | null };

/** 已完成HTTP升级后的WS metadata，实际内容不塞进JSON。 */
export type InspectionWebSocketMessage = InspectionEnvelope & (
  | {
      type: 'ws.message';
      stageId: string;
      direction: WebSocketFrameDirection;
      sequence: number;
      frame: InspectionWebSocketFrame;
      bodyId: string;
      byteLength: number;
      closeCode: number | null;
    }
  | { type: 'ws.decision'; stageId: string; decisionId: string; decision: InspectionWebSocketDecision }
  | { type: 'ws.applied'; stageId: string; decisionId: string }
);

/** 升级后只复用独立的body确认及exchange关闭消息，不接收新的HTTP阶段。 */
export type InspectionWebSocketProtocolMessage = InspectionWebSocketMessage | Extract<InspectionHttpMessage, {
  type: 'body.ack' | 'body.end' | 'body.received' | 'exchange.cancel' | 'exchange.cancelled' |
    'exchange.complete' | 'exchange.completed';
}>;

/** 一个方向当前完整原文；决定应用后释放，不保留消息历史buffer。 */
export interface InspectionPendingWebSocketMessage {
  message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }>;
  content: Buffer;
  timestamp: number;
}

/** WS内容长度在message或replacement声明时已知。 */
export interface InspectionWebSocketBodyState {
  owner: InspectionPeer;
  byteLength: number;
  offset: number;
  ended: boolean;
  received: boolean;
}

/** 一个方向最多保留当前一条待决定或待应用消息。 */
export interface InspectionWebSocketDirectionState {
  nextSequence: number;
  forwardedBytes: number;
  closed: boolean;
  stage: {
    message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }>;
    decision: InspectionWebSocketDecision | null;
  } | null;
}
