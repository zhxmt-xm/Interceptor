import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakpointQueue as CurrentBreakpointQueue } from '../../internal/breakpoint-queue';

type LogicalBreakpointQueue = Omit<CurrentBreakpointQueue, 'suspend'> & {
  suspend(
    phase: Parameters<CurrentBreakpointQueue['suspend']>[0],
    queueKey: 'http' | `ws:${string}`,
    ruleId: string | undefined,
    snapshot?: Parameters<CurrentBreakpointQueue['suspend']>[3],
    requestId?: string,
  ): ReturnType<CurrentBreakpointQueue['suspend']>;
  continueQueue(queueKey: 'http' | `ws:${string}`): number;
  dropQueue(queueKey: 'http' | `ws:${string}`): number;
  continueRule(ruleId: string): number;
  abortQueue(queueKey: 'http' | `ws:${string}`): number;
};

// 测试先声明目标契约；产品实现前运行时仍会精确失败，不给生产类增加兼容签名。
const BreakpointQueue = CurrentBreakpointQueue as unknown as new () => LogicalBreakpointQueue;

const snapshot = (ruleName: string, exchangeId?: string) => ({
  ruleName,
  ...(exchangeId === undefined ? {} : { exchangeId }),
  headers: [],
  bodyAvailable: false,
});

describe('BreakpointQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a suspended breakpoint as continued', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;
    expect(breakpointQueue.size).toBe(1);
    expect(breakpointQueue.resolve(id, 'continue')).toBe('continued');
    await expect(outcome).resolves.toEqual({ state: 'continued' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('resolves with an edit as edited', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;
    const edit = { headers: [{ name: 'x', value: '1' }] };
    expect(breakpointQueue.resolve(id, 'continue', edit)).toBe('edited');
    await expect(outcome).resolves.toEqual({ state: 'edited', edit });
  });

  it('resolves as dropped', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend(
      'response',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;
    expect(breakpointQueue.resolve(id, 'drop')).toBe('dropped');
    await expect(outcome).resolves.toEqual({ state: 'dropped' });
  });

  it('keeps breakpoints pending without a timer', async () => {
    const breakpointQueue = new BreakpointQueue();
    const suspension = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;

    vi.advanceTimersByTime(24 * 60 * 60 * 1_000);
    expect(breakpointQueue.size).toBe(1);
    expect(breakpointQueue.list()[0]).not.toHaveProperty('deadline');

    breakpointQueue.resolve(suspension.id, 'continue');
    await expect(suspension.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('closeAll resolves every pending breakpoint as aborted', async () => {
    const breakpointQueue = new BreakpointQueue();
    const a = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;
    const b = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-b',
      'rule-b',
      snapshot('WebSocket message', 'exchange-b'),
    )!;
    breakpointQueue.closeAll();
    await expect(a.outcome).resolves.toEqual({ state: 'aborted' });
    await expect(b.outcome).resolves.toEqual({ state: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('aborts only breakpoints attached to the disconnected request', async () => {
    const breakpointQueue = new BreakpointQueue();
    const aborted = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
      'request-a',
    )!;
    const untouched = breakpointQueue.suspend(
      'response',
      'http',
      'rule-b',
      snapshot('Rule B'),
      'request-b',
    )!;

    expect(breakpointQueue.abortRequest('request-a')).toBe(1);
    await expect(aborted.outcome).resolves.toEqual({ state: 'aborted' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([untouched.id]);

    breakpointQueue.resolve(untouched.id, 'continue');
    await expect(untouched.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('aborts only breakpoints attached to the disconnected logical queue', async () => {
    const breakpointQueue = new BreakpointQueue();
    const first = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-a',
      undefined,
      snapshot('First WebSocket frame', 'exchange-a'),
    );
    const second = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-a',
      undefined,
      snapshot('Second WebSocket frame', 'exchange-a'),
    );
    const untouched = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-b',
      undefined,
      snapshot('Other WebSocket frame', 'exchange-b'),
    );

    expect(breakpointQueue.abortQueue('ws:exchange-a')).toBe(2);
    await expect(first.outcome).resolves.toEqual({ state: 'aborted' });
    await expect(second.outcome).resolves.toEqual({ state: 'aborted' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([untouched.id]);

    breakpointQueue.resolve(untouched.id, 'continue');
    await expect(untouched.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('returns null for an unknown or already-resolved breakpoint', () => {
    const breakpointQueue = new BreakpointQueue();
    const { id } = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    )!;
    expect(breakpointQueue.resolve('missing', 'continue')).toBeNull();
    expect(breakpointQueue.resolve(id, 'continue')).toBe('continued');
    expect(breakpointQueue.resolve(id, 'continue')).toBeNull();
  });

  it('leaves a breakpoint pending when a runtime caller supplies an invalid action', () => {
    const breakpointQueue = new BreakpointQueue();
    const { id } = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Rule A'),
    );

    expect(breakpointQueue.resolve(
      id,
      'invalid' as Parameters<CurrentBreakpointQueue['resolve']>[1],
    )).toBeNull();
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([id]);
  });

  it('keeps every breakpoint pending without a hidden queue limit', () => {
    const breakpointQueue = new BreakpointQueue();
    const suspensions = Array.from({ length: 25 }, (_, index) =>
      breakpointQueue.suspend(
        'request',
        'http',
        `rule-${index}`,
        snapshot(`Rule ${index}`),
      ),
    );

    expect(suspensions).not.toContain(null);
    expect(breakpointQueue.size).toBe(25);
    expect(breakpointQueue.list().map((entry) => entry.snapshot.ruleName)).toEqual(
      Array.from({ length: 25 }, (_, index) => `Rule ${index}`),
    );
  });

  it('lists queue and rule identity in stable queue order', () => {
    const breakpointQueue = new BreakpointQueue();
    vi.setSystemTime(1_000);
    const request = breakpointQueue.suspend(
      'request',
      'http',
      'rule-http',
      snapshot('HTTP request'),
    )!;
    const websocket = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-ws',
      'rule-ws',
      snapshot('WebSocket message', 'exchange-ws'),
    )!;
    const response = breakpointQueue.suspend(
      'response',
      'http',
      'rule-http',
      snapshot('HTTP response'),
    )!;

    expect(breakpointQueue.list()).toMatchObject([
      { id: request.id, queueKey: 'http', ruleId: 'rule-http' },
      { id: websocket.id, queueKey: 'ws:exchange-ws', ruleId: 'rule-ws' },
      { id: response.id, queueKey: 'http', ruleId: 'rule-http' },
    ]);
  });

  it('preserves request insertion order when the system clock moves backward', () => {
    const breakpointQueue = new BreakpointQueue();
    vi.setSystemTime(2_000);
    const later = breakpointQueue.suspend(
      'request',
      'http',
      'rule-later',
      snapshot('Later'),
    )!;
    vi.setSystemTime(1_000);
    const earlier = breakpointQueue.suspend(
      'request',
      'http',
      'rule-earlier',
      snapshot('Earlier'),
    )!;

    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([
      later.id,
      earlier.id,
    ]);
  });

  it('resolves a non-head breakpoint without changing the queue head', async () => {
    const breakpointQueue = new BreakpointQueue();
    const head = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('Head'),
    )!;
    const queued = breakpointQueue.suspend(
      'response',
      'http',
      'rule-b',
      snapshot('Queued'),
    )!;

    expect(breakpointQueue.resolve(queued.id, 'drop')).toBe('dropped');
    await expect(queued.outcome).resolves.toEqual({ state: 'dropped' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([head.id]);

    breakpointQueue.resolve(head.id, 'continue');
    await expect(head.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('continues only the queue entries captured when the command starts', async () => {
    const breakpointQueue = new BreakpointQueue();
    const a = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('A'),
    )!;
    const b = breakpointQueue.suspend(
      'response',
      'http',
      'rule-b',
      snapshot('B'),
    )!;
    let futureId = '';
    void a.outcome.then(() => {
      futureId = breakpointQueue.suspend(
        'request',
        'http',
        'rule-a',
        snapshot('Future'),
      )!.id;
    });

    expect(breakpointQueue.continueQueue('http')).toBe(2);
    await expect(a.outcome).resolves.toEqual({ state: 'continued' });
    await expect(b.outcome).resolves.toEqual({ state: 'continued' });
    await Promise.resolve();
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([futureId]);
  });

  it('drops only the selected logical queue', async () => {
    const breakpointQueue = new BreakpointQueue();
    const http = breakpointQueue.suspend(
      'request',
      'http',
      'rule-a',
      snapshot('HTTP'),
    )!;
    const websocket = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-ws',
      'rule-a',
      snapshot('WebSocket', 'exchange-ws'),
    )!;

    expect(breakpointQueue.dropQueue('http')).toBe(1);
    await expect(http.outcome).resolves.toEqual({ state: 'dropped' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([websocket.id]);

    breakpointQueue.resolve(websocket.id, 'continue');
    await expect(websocket.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('continues one rule across logical queues', async () => {
    const breakpointQueue = new BreakpointQueue();
    const http = breakpointQueue.suspend(
      'request',
      'http',
      'rule-shared',
      snapshot('HTTP'),
    )!;
    const websocket = breakpointQueue.suspend(
      'websocket',
      'ws:exchange-ws',
      'rule-shared',
      snapshot('WebSocket', 'exchange-ws'),
    )!;
    const other = breakpointQueue.suspend(
      'response',
      'http',
      'rule-other',
      snapshot('Other'),
    )!;

    expect(breakpointQueue.continueRule('rule-shared')).toBe(2);
    await expect(http.outcome).resolves.toEqual({ state: 'continued' });
    await expect(websocket.outcome).resolves.toEqual({ state: 'continued' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([other.id]);

    breakpointQueue.resolve(other.id, 'continue');
    await expect(other.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('preserves websocket message metadata and editable body snapshots', () => {
    const breakpointQueue = new BreakpointQueue();
    breakpointQueue.suspend('websocket', 'ws:exchange-ws', 'rule-ws', {
      ruleName: 'WebSocket message',
      exchangeId: 'exchange-ws',
      url: 'ws://example.test/socket',
      direction: 'client-to-server',
      opcode: 1,
      bodyFormat: 'text',
      headers: [],
      bodyAvailable: true,
      body: 'hello',
    });
    expect(breakpointQueue.list()[0]).toMatchObject({
      phase: 'websocket',
      queueKey: 'ws:exchange-ws',
      ruleId: 'rule-ws',
      snapshot: {
        direction: 'client-to-server',
        opcode: 1,
        bodyFormat: 'text',
        body: 'hello',
      },
    });
  });

});
