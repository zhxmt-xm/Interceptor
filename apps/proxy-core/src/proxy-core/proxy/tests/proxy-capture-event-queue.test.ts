import { describe, expect, it } from 'vitest';

import type { CaptureExchangeSummary } from '@interceptor/core-protocol';

import { CaptureEventQueue } from '../proxy-capture-event-queue';

function summary(
  id: string,
  overrides: Partial<CaptureExchangeSummary> = {},
): CaptureExchangeSummary {
  return {
    id,
    method: 'GET',
    secure: true,
    host: 'api.test',
    path: `/${id}`,
    protocol: 'http/1.1',
    state: 'pending',
    startedAt: 0,
    requestBytes: 0,
    responseBytes: 0,
    ...overrides,
  };
}

describe('CaptureEventQueue', () => {
  it('assigns monotonic sequences and drains in order', () => {
    const queue = new CaptureEventQueue();
    queue.enqueue('exchange-added', summary('a'));
    queue.enqueue('exchange-added', summary('b'));
    queue.enqueue('exchange-added', summary('c'));

    const batch = queue.drain(10);
    expect(batch.map((e) => e.summary.id)).toEqual(['a', 'b', 'c']);
    expect(batch.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(queue.pendingCount).toBe(0);
  });

  it('coalesces repeated updates to the same exchange while pending', () => {
    const queue = new CaptureEventQueue();
    queue.enqueue('exchange-added', summary('a', { state: 'pending' }));
    queue.enqueue('exchange-updated', summary('a', { state: 'completed', statusCode: 200 }));

    expect(queue.pendingCount).toBe(1);
    const [event] = queue.drain(10);
    expect(event?.summary.state).toBe('completed');
    expect(event?.summary.statusCode).toBe(200);
    // 保留首次 sequence 以稳定顺序。
    expect(event?.sequence).toBe(1);
  });

  it('drains at most maxBatch per call', () => {
    const queue = new CaptureEventQueue();
    for (let i = 0; i < 5; i += 1) {
      queue.enqueue('exchange-added', summary(`e${i}`));
    }
    expect(queue.drain(2).map((e) => e.summary.id)).toEqual(['e0', 'e1']);
    expect(queue.drain(2).map((e) => e.summary.id)).toEqual(['e2', 'e3']);
    expect(queue.drain(2).map((e) => e.summary.id)).toEqual(['e4']);
  });

  it('drops every pending event when a capture clear establishes a new timeline', () => {
    const queue = new CaptureEventQueue();
    queue.enqueue('exchange-added', summary('old-pending'));
    queue.enqueue('exchange-updated', summary('old-complete', { state: 'completed' }));

    queue.reset();

    expect(queue.pendingCount).toBe(0);
    expect(queue.drain(10)).toEqual([]);
    queue.enqueue('exchange-added', summary('new'));
    expect(queue.drain(10).map((event) => event.summary.id)).toEqual(['new']);
  });

  it('retains every pending event until it is drained', () => {
    const queue = new CaptureEventQueue();
    queue.enqueue('exchange-added', summary('a', { state: 'pending' }));
    queue.enqueue('exchange-added', summary('b', { state: 'pending' }));
    queue.enqueue('exchange-added', summary('c', { state: 'pending' }));

    expect(queue.pendingCount).toBe(3);
    expect(queue.drain(10).map((e) => e.summary.id)).toEqual(['a', 'b', 'c']);
  });

  it('retains terminal events until they are drained', () => {
    const queue = new CaptureEventQueue();
    queue.enqueue('exchange-added', summary('done1', { state: 'completed' }));
    queue.enqueue('exchange-added', summary('done2', { state: 'failed' }));

    expect(queue.pendingCount).toBe(2);
    expect(queue.drain(10).map((e) => e.summary.id)).toEqual(['done1', 'done2']);
  });
});
