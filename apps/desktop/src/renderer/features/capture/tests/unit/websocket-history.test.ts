import i18next from 'i18next';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import type {
  PendingBreakpoint,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../../shared/desktop-api';
import { resources } from '../../../../i18n/resources';
import { FramePayload } from '../../RequestInspector/FramePayload';
import { webSocketTimelineItems } from '../../utils';

vi.mock('../../RequestInspector/BodyView', () => ({ BodyView: () => null }));
vi.mock('../../../../components', () => ({
  Count: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  IconButton: () => null,
  sizeLabel: () => '4 B',
}));

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

describe('WebSocket payload title', () => {
  it.each([
    ['client-to-server', 1, 'Sent text'],
    ['server-to-client', 1, 'Received text'],
    ['client-to-server', 2, 'Sent binary'],
    ['server-to-client', 2, 'Received binary'],
  ] as const)('preserves the %s opcode %s title %s', async (direction, opcode, title) => {
    const instance = i18next.createInstance();
    await instance.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      initAsync: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
    });
    const markup = renderToStaticMarkup(createElement(
      I18nextProvider,
      { i18n: instance },
      createElement(FramePayload, {
        exchangeId: 'exchange-1',
        frame: { ...frame(1, direction), opcode },
      }),
    ));
    expect(markup).toContain(`<b>${title}</b>`);
    expect(markup).toContain('<span>4 B · message 1</span>');
    expect(markup).not.toContain('capture.text');
  });
});
