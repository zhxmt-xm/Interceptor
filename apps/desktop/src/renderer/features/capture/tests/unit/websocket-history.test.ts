import { describe, expect, it } from 'vitest';

import type {
  PendingBreakpoint,
  WebSocketFrameSummary,
} from '../../../../../shared/desktop-api';
import { visibleWebSocketHistoryFrames } from '../../utils';

function frame(seq: number): WebSocketFrameSummary {
  return {
    seq,
    direction: 'client-to-server',
    opcode: 1,
    timestamp: seq * 100,
    payloadSize: 4,
  };
}

function pendingFrame(
  id: string,
  webSocketFrameSequence?: number,
): PendingBreakpoint {
  return {
    id,
    phase: 'websocket',
    queueKey: 'ws:exchange-1',
    createdAt: 0,
    ruleName: 'WebSocket message',
    exchangeId: 'exchange-1',
    direction: 'client-to-server',
    frame: 'message',
    opcode: 1,
    bodyFormat: 'text',
    headers: [],
    bodyAvailable: true,
    body: 'same',
    ...(webSocketFrameSequence === undefined ? {} : { webSocketFrameSequence }),
  };
}

describe('visibleWebSocketHistoryFrames', () => {
  it('lets pending rows replace only their exact captured frame sequence', () => {
    const frames = [frame(1), frame(2), frame(3)];

    expect(visibleWebSocketHistoryFrames(
      frames,
      [pendingFrame('pending-2', 2)],
    )).toEqual([frames[0], frames[2]]);
  });

  it('keeps all history when a control frame has no captured application sequence', () => {
    const frames = [frame(1), frame(2)];

    expect(visibleWebSocketHistoryFrames(
      frames,
      [pendingFrame('pending-control')],
    )).toEqual(frames);
  });
});
