import { describe, expect, it } from 'vitest';

import type { CaptureExchangeSummary } from '@interceptor/core-protocol';

import { CaptureEventQueue } from '../internal/capture-event-queue';

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
    const captureEventQueue = new CaptureEventQueue();
    captureEventQueue.enqueue('exchange-added', summary('a'));
    captureEventQueue.enqueue('exchange-added', summary('b'));
    captureEventQueue.enqueue('exchange-added', summary('c'));

    const batch = captureEventQueue.drain(10);
    expect(batch.map((e) => e.summary.id)).toEqual(['a', 'b', 'c']);
    expect(batch.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(captureEventQueue.pendingCount).toBe(0);
  });

  it('coalesces repeated updates to the same exchange while pending', () => {
    const captureEventQueue = new CaptureEventQueue();
    captureEventQueue.enqueue('exchange-added', summary('a', { state: 'pending' }));
    captureEventQueue.enqueue('exchange-updated', summary('a', { state: 'completed', statusCode: 200 }));

    expect(captureEventQueue.pendingCount).toBe(1);
    const [event] = captureEventQueue.drain(10);
    expect(event?.summary.state).toBe('completed');
    expect(event?.summary.statusCode).toBe(200);
    // 保留首次 sequence 以稳定顺序。
    expect(event?.sequence).toBe(1);
  });

  it('drains at most maxBatch per call', () => {
    const captureEventQueue = new CaptureEventQueue();
    for (let i = 0; i < 5; i += 1) {
      captureEventQueue.enqueue('exchange-added', summary(`e${i}`));
    }
    expect(captureEventQueue.drain(2).map((e) => e.summary.id)).toEqual(['e0', 'e1']);
    expect(captureEventQueue.drain(2).map((e) => e.summary.id)).toEqual(['e2', 'e3']);
    expect(captureEventQueue.drain(2).map((e) => e.summary.id)).toEqual(['e4']);
  });

  it('drops every pending event when a capture clear establishes a new timeline', () => {
    const captureEventQueue = new CaptureEventQueue();
    captureEventQueue.enqueue('exchange-added', summary('old-pending'));
    captureEventQueue.enqueue('exchange-updated', summary('old-complete', { state: 'completed' }));

    captureEventQueue.reset();

    expect(captureEventQueue.pendingCount).toBe(0);
    expect(captureEventQueue.drain(10)).toEqual([]);
    captureEventQueue.enqueue('exchange-added', summary('new'));
    expect(captureEventQueue.drain(10).map((event) => event.summary.id)).toEqual(['new']);
  });

  it('retains every pending event until it is drained', () => {
    const captureEventQueue = new CaptureEventQueue();
    captureEventQueue.enqueue('exchange-added', summary('a', { state: 'pending' }));
    captureEventQueue.enqueue('exchange-added', summary('b', { state: 'pending' }));
    captureEventQueue.enqueue('exchange-added', summary('c', { state: 'pending' }));

    expect(captureEventQueue.pendingCount).toBe(3);
    expect(captureEventQueue.drain(10).map((e) => e.summary.id)).toEqual(['a', 'b', 'c']);
  });

  it('retains terminal events until they are drained', () => {
    const captureEventQueue = new CaptureEventQueue();
    captureEventQueue.enqueue('exchange-added', summary('done1', { state: 'completed' }));
    captureEventQueue.enqueue('exchange-added', summary('done2', { state: 'failed' }));

    expect(captureEventQueue.pendingCount).toBe(2);
    expect(captureEventQueue.drain(10).map((e) => e.summary.id)).toEqual(['done1', 'done2']);
  });
});
