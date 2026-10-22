import type {
  InspectionWebSocketDecision, InspectionWebSocketFrame, InspectionWebSocketMessage, InspectionWebSocketProtocolMessage,
} from '../interfaces/websocket';
import { InspectionProtocolError } from '../internal/errors';
import { MAX_WEBSOCKET_MESSAGE_BYTES } from '../internal/constants';
import { count, exact, parseInspectionEnvelope, parseInspectionMessage, record, requireValid, uuid } from './inspection-protocol';

/** 升级后的同一WSS只接收WS操作和共用流控/取消，不接受新HTTP阶段。 */
export function parseInspectionWebSocketProtocolMessage(text: string, sessionId: string): InspectionWebSocketProtocolMessage {
  const { message } = parseInspectionEnvelope(text, sessionId);
  if (message.type === 'ws.message' || message.type === 'ws.decision' || message.type === 'ws.applied') {
    return parseInspectionWebSocketMessage(text, sessionId);
  }
  const shared = parseInspectionMessage(text, sessionId);
  switch (shared.type) {
    case 'body.ack':
    case 'body.end':
    case 'body.received':
    case 'exchange.cancel':
    case 'exchange.cancelled':
    case 'exchange.complete':
    case 'exchange.completed':
      return shared;
    default:
      throw new InspectionProtocolError();
  }
}

/** 解析已认证exchange上的WS metadata，不在这里操作网络或授予能力。 */
export function parseInspectionWebSocketMessage(
  text: string, sessionId: string,
): InspectionWebSocketMessage {
  const { message, envelope } = parseInspectionEnvelope(text, sessionId);
  const fields = (...names: string[]) =>
    exact(message, ['type', 'protocolVersion', 'sessionId', 'exchangeId', ...names]);
  switch (message.type) {
    case 'ws.message': {
      fields('stageId', 'direction', 'sequence', 'frame', 'bodyId', 'byteLength', 'closeCode');
      requireValid(message.direction === 'client-to-server' || message.direction === 'server-to-client');
      const frame = message.frame;
      requireValid(frame === 'text' || frame === 'binary' || frame === 'ping' || frame === 'pong' || frame === 'close');
      const byteLength = count(message.byteLength);
      const code = closeCode(message.closeCode);
      validateWebSocketContent(frame, byteLength, code);
      return {
        ...envelope, type: message.type, stageId: uuid(message.stageId), direction: message.direction,
        sequence: count(message.sequence), frame, bodyId: uuid(message.bodyId), byteLength, closeCode: code,
      };
    }
    case 'ws.decision':
      fields('stageId', 'decisionId', 'decision');
      return { ...envelope, type: message.type, stageId: uuid(message.stageId),
        decisionId: uuid(message.decisionId), decision: decision(message.decision) };
    case 'ws.applied':
      fields('stageId', 'decisionId');
      return { ...envelope, type: message.type, stageId: uuid(message.stageId), decisionId: uuid(message.decisionId) };
    default:
      throw new InspectionProtocolError();
  }
}

/** control限额包括close code；无code的close不能携带reason。 */
export function validateWebSocketContent(
  frame: InspectionWebSocketFrame, byteLength: number, code: number | null,
): void {
  requireValid(count(byteLength) <= MAX_WEBSOCKET_MESSAGE_BYTES);
  if (frame === 'close') {
    requireValid(code === null ? byteLength === 0 : byteLength <= 123);
  } else {
    requireValid(code === null);
    if (frame === 'ping' || frame === 'pong') requireValid(byteLength <= 125);
  }
}

/** 不把本地状态码或保留区间作为可发送的close code。 */
function closeCode(value: unknown): number | null {
  if (value === null) return null;
  const code = count(value);
  requireValid((code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006)
    || (code >= 3000 && code <= 4999));
  return code;
}

/** replacement仅声明流式内容；原frame类别的匹配由exchange状态机负责。 */
function decision(value: unknown): InspectionWebSocketDecision {
  const result = record(value);
  if (result.action === 'bypass' || result.action === 'drop') {
    exact(result, ['action']);
    return { action: result.action };
  }
  exact(result, ['action', 'body', 'closeCode']);
  requireValid(result.action === 'replace');
  const body = record(result.body);
  exact(body, ['bodyId', 'byteLength']);
  const byteLength = count(body.byteLength);
  requireValid(byteLength <= MAX_WEBSOCKET_MESSAGE_BYTES);
  const code = closeCode(result.closeCode);
  if (code !== null) requireValid(byteLength <= 123);
  return { action: 'replace', body: { bodyId: uuid(body.bodyId), byteLength }, closeCode: code };
}
