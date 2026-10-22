import type { WebSocketBreakpointFrame } from '@interceptor/core-protocol';

/** 既有WS断点快照名称，不随协议入口改变。 */
export const WEBSOCKET_BREAKPOINT_RULE_NAME: Readonly<Record<WebSocketBreakpointFrame, string>> = {
  message: 'WebSocket message',
  ping: 'WebSocket ping',
  pong: 'WebSocket pong',
  close: 'WebSocket close',
};
