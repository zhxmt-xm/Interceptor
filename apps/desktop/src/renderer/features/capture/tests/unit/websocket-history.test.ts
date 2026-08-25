import { describe, expect, it } from 'vitest';

import type {
  PendingBreakpoint,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../../shared/desktop-api';
import { webSocketTimelineItems } from '../../utils';

function frame(
  seq: number,
  direction: WebSocketFrameDirection = 'client-to-server',
): WebSocketFrameSummary {
  return {
    seq,
    direction,
    opcode: 1,
    timestamp: seq * 100,
    payloadSize: 4,
  };
}

function pendingFrame(
  id: string,
  webSocketFrameSequence?: number,
  direction: WebSocketFrameDirection = 'client-to-server',
): PendingBreakpoint {
  return {
    id,
    phase: 'websocket',
    queueKey: 'ws:exchange-1',
    createdAt: 0,
    ruleName: 'WebSocket message',
    exchangeId: 'exchange-1',
    direction,
    frame: 'message',
    opcode: 1,
    bodyFormat: 'text',
    headers: [],
    bodyAvailable: true,
    body: 'same',
    ...(webSocketFrameSequence === undefined ? {} : { webSocketFrameSequence }),
  };
}

describe('webSocketTimelineItems', () => {
  it('replaces a captured frame at its exact sequence position', () => {
    const frames = [frame(1), frame(2), frame(3)];
    const pending = pendingFrame('pending-2', 2);

    expect(webSocketTimelineItems(
      frames,
      [pending],
    )).toEqual([
      { kind: 'history', frame: frames[0] },
      { kind: 'pending', breakpoint: pending },
      { kind: 'history', frame: frames[2] },
    ]);
  });

  it('appends a control-frame pending item without removing history', () => {
    const frames = [frame(1), frame(2)];
    const pending = pendingFrame('pending-control');

    expect(webSocketTimelineItems(
      frames,
      [pending],
    )).toEqual([
      { kind: 'history', frame: frames[0] },
      { kind: 'history', frame: frames[1] },
      { kind: 'pending', breakpoint: pending },
    ]);
  });

  it('filters history and pending items by the same direction', () => {
    const sentFrame = frame(1);
    const receivedFrame = frame(2, 'server-to-client');
    const sentPending = pendingFrame('sent', 1);
    const receivedPending = pendingFrame('received', 2, 'server-to-client');

    expect(webSocketTimelineItems(
      [sentFrame, receivedFrame],
      [sentPending, receivedPending],
      'client-to-server',
    )).toEqual([{ kind: 'pending', breakpoint: sentPending }]);
  });
});
