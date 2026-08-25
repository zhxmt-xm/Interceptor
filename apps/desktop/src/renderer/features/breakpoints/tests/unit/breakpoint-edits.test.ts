import { describe, expect, it } from 'vitest';

import type { PendingBreakpoint } from '../../../../../shared/desktop-api';
import {
  breakpointBodyBytes,
  breakpointBodyMediaType,
  breakpointQueuePosition,
  buildEdit,
  draftFromBreakpoint,
  expectsBody,
  isBreakpointQueueHead,
  nextQueueHeadExchangeId,
  webSocketQueueBreakpoints,
} from '../../utils';

function pending(overrides: Partial<PendingBreakpoint> = {}): PendingBreakpoint {
  return {
    id: 'bp-1',
    phase: 'request',
    queueKey: 'http',
    createdAt: 0,
    ruleName: 'Pause on request',
    method: 'POST',
    url: 'https://api.test/upload',
    headers: [{ name: 'content-type', value: 'text/plain' }],
    bodyAvailable: false,
    ...overrides,
  };
}

describe('breakpoint edits', () => {
  it('never clears the real body when the original was never shown', () => {
    // 头部阶段挂起时 UI 只能给出一个空输入框；用户没输入就 Continue，
    // 绝不能把它当成“把正文改成空”，否则真实上传/响应正文会被抹掉。
    const draft = draftFromBreakpoint(pending());
    expect(draft.bodyAvailable).toBe(false);
    expect(draft.body).toBe('');

    expect(buildEdit(draft)).toEqual({
      method: 'POST',
      url: 'https://api.test/upload',
      headers: [{ name: 'content-type', value: 'text/plain' }],
    });
  });

  it('sends a replacement body once the user switches to text and types one', () => {
    const draft = {
      ...draftFromBreakpoint(pending()),
      replacement: 'text' as const,
      body: 'replaced',
    };

    expect(buildEdit(draft)).toMatchObject({ body: 'replaced' });
  });

  it('includes the header names explicitly edited by the user', () => {
    const draft = {
      ...draftFromBreakpoint(pending()),
      editedHeaderNames: ['content-length', 'content-encoding'],
      replacement: 'text' as const,
      body: 'replaced',
    };

    expect(buildEdit(draft)).toMatchObject({
      editedHeaderNames: ['content-length', 'content-encoding'],
    });
  });

  it('leaves the real body alone while the text replacement is still empty', () => {
    // 设计稿的空 Text 态就是 Using original；切了模式但没写内容不能抹掉原文。
    const draft = { ...draftFromBreakpoint(pending()), replacement: 'text' as const };

    expect(buildEdit(draft)).not.toHaveProperty('body');
  });

  it('keeps an intentionally emptied body when the original was visible', () => {
    // WebSocket 消息断点持有完整 payload，清空就是用户的真实意图。
    const draft = {
      ...draftFromBreakpoint(pending({ phase: 'websocket', bodyAvailable: true, body: 'hello' })),
      replacement: 'text' as const,
      body: '',
    };

    expect(buildEdit(draft)).toEqual({ body: '' });
  });

  it('starts a visible WebSocket payload in Off mode', () => {
    const draft = draftFromBreakpoint(
      pending({ phase: 'websocket', bodyAvailable: true, body: 'hello' }),
    );

    expect(draft.replacement).toBe('off');
    expect(buildEdit(draft)).toEqual({});
  });

  it('converts text and hex snapshots for the shared body viewer', () => {
    expect([...breakpointBodyBytes('Hi', 'text')]).toEqual([72, 105]);
    expect([...breakpointBodyBytes('48 69', 'hex')]).toEqual([72, 105]);
    expect(breakpointBodyMediaType('{"ok":true}', 'text')).toBe('application/json');
    expect(breakpointBodyMediaType('hello', 'text')).toBe('text/plain; charset=utf-8');
    expect(breakpointBodyMediaType('48 69', 'hex')).toBe('application/octet-stream');
  });

  it('sends the file path so Core reads it directly', () => {
    const draft = {
      ...draftFromBreakpoint(pending()),
      replacement: 'file' as const,
      file: {
        path: 'C:/fixtures/checkout.json',
        name: 'checkout.json',
        size: 12,
        mediaType: 'application/json',
        text: '{"ok":true}',
      },
    };

    expect(buildEdit(draft)).toMatchObject({ bodyFilePath: 'C:/fixtures/checkout.json' });
    expect(buildEdit(draft)).not.toHaveProperty('body');
  });

  it('still replaces from a file that was too large to preview', () => {
    // 无法预览不等于不能用；Core 按路径直读，大文件与二进制同样生效。
    const draft = {
      ...draftFromBreakpoint(pending()),
      replacement: 'file' as const,
      file: {
        path: 'C:/fixtures/payload.bin',
        name: 'payload.bin',
        size: 8_000_000,
        mediaType: 'text/plain',
      },
    };

    expect(buildEdit(draft)).toMatchObject({ bodyFilePath: 'C:/fixtures/payload.bin' });
  });
});

describe('breakpoint logical queues', () => {
  it('preserves Core request order independently within each logical queue', () => {
    const websocketHead = pending({
      id: 'bp-ws',
      phase: 'websocket',
      queueKey: 'ws:exchange-1',
      createdAt: 1,
    });
    const httpSecond = pending({ id: 'bp-http-b', createdAt: 3 });
    const httpHead = pending({ id: 'bp-http-a', createdAt: 3 });
    const breakpoints = [httpSecond, websocketHead, httpHead];

    expect(breakpointQueuePosition(breakpoints, httpSecond)).toBe(1);
    expect(breakpointQueuePosition(breakpoints, httpHead)).toBe(2);
    expect(breakpointQueuePosition(breakpoints, websocketHead)).toBe(1);
    expect(isBreakpointQueueHead(breakpoints, httpSecond)).toBe(true);
    expect(isBreakpointQueueHead(breakpoints, httpHead)).toBe(false);
    expect(isBreakpointQueueHead(breakpoints, websocketHead)).toBe(true);
  });

  it('advances only while Capture still shows the resolved queue head', () => {
    const resolved = pending({ id: 'bp-a', exchangeId: 'exchange-a' });
    const next = pending({ id: 'bp-b', exchangeId: 'exchange-b', createdAt: 2 });
    const otherQueue = pending({
      id: 'bp-ws',
      phase: 'websocket',
      queueKey: 'ws:exchange-ws',
      exchangeId: 'exchange-ws',
      createdAt: 1,
    });

    expect(nextQueueHeadExchangeId(resolved, [otherQueue, next], 'exchange-a'))
      .toBe('exchange-b');
    expect(nextQueueHeadExchangeId(resolved, [otherQueue, next], 'ordinary-exchange'))
      .toBeUndefined();
    expect(nextQueueHeadExchangeId(resolved, [otherQueue], 'exchange-a'))
      .toBeUndefined();
    expect(nextQueueHeadExchangeId(
      resolved,
      [pending({ id: 'bp-response', phase: 'response', exchangeId: 'exchange-a' })],
      'exchange-a',
    )).toBeUndefined();
  });

  it('lists every pending frame for one WebSocket connection in queue order', () => {
    const second = pending({
      id: 'bp-ws-b',
      phase: 'websocket',
      queueKey: 'ws:exchange-ws',
      exchangeId: 'exchange-ws',
      createdAt: 2,
    });
    const first = pending({
      id: 'bp-ws-a',
      phase: 'websocket',
      queueKey: 'ws:exchange-ws',
      exchangeId: 'exchange-ws',
      createdAt: 1,
    });
    const otherConnection = pending({
      id: 'bp-ws-other',
      phase: 'websocket',
      queueKey: 'ws:exchange-other',
      exchangeId: 'exchange-other',
      createdAt: 0,
    });

    expect(webSocketQueueBreakpoints(
      [second, otherConnection, pending(), first],
      'exchange-ws',
    ).map((breakpoint) => breakpoint.id)).toEqual(['bp-ws-b', 'bp-ws-a']);
  });
});

describe('expectsBody', () => {
  it('says a GET without content-length carries no body', () => {
    // 否则 GET 会永远停在「接收中」，因为 Capture 永远给不出 body 引用。
    expect(expectsBody([{ id: 'h1', name: 'accept', value: '*/*' }])).toBe(false);
  });

  it('treats an explicit zero content-length as no body', () => {
    expect(expectsBody([{ id: 'h1', name: 'Content-Length', value: '0' }])).toBe(false);
  });

  it('expects a body for a positive content-length or chunked transfer', () => {
    expect(expectsBody([{ id: 'h1', name: 'content-length', value: '32' }])).toBe(true);
    expect(
      expectsBody([{ id: 'h1', name: 'Transfer-Encoding', value: 'chunked' }]),
    ).toBe(true);
  });
});
