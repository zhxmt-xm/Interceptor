import type { WebSocketBreakpointFrame } from '@interceptor/core-protocol';

/** 会话列表视为终态、不得因队列容量压力静默丢弃的状态。 */
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'aborted',
]);

/** Core 可延迟解码的 content-encoding。 */
export const SUPPORTED_ENCODINGS: ReadonlySet<string> = new Set([
  'gzip',
  'x-gzip',
  'deflate',
  'br',
]);

/** WebSocket 断点快照的规则名；UI 直接展示这段文字。 */
export const WEBSOCKET_BREAKPOINT_RULE_NAME: Readonly<Record<WebSocketBreakpointFrame, string>> = {
  message: 'WebSocket message',
  ping: 'WebSocket ping',
  pong: 'WebSocket pong',
  close: 'WebSocket close',
};