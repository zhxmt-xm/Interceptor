import { describe, expect, it } from 'vitest';

import type { TlsCompatibilityEvent } from '@interceptor/core-protocol';

import { TlsCompatibilityEventQueue } from '../../internal/tls-compatibility-event-queue';

describe('TlsCompatibilityEventQueue', () => {
  it('deduplicates a generation and host while preserving insertion order', () => {
    const tlsCompatibilityEventQueue = new TlsCompatibilityEventQueue();
    tlsCompatibilityEventQueue.enqueue(event(1, 'a.example', 'reset'));
    tlsCompatibilityEventQueue.enqueue(event(1, 'a.example', 'closed'));
    tlsCompatibilityEventQueue.enqueue(event(1, 'b.example', 'cert-rejected'));

    expect(tlsCompatibilityEventQueue.drain(10)).toEqual([
      event(1, 'a.example', 'reset'),
      event(1, 'b.example', 'cert-rejected'),
    ]);
  });

  it('allows the same host in a new TLS generation and restores unsent events', () => {
    const tlsCompatibilityEventQueue = new TlsCompatibilityEventQueue();
    const first = event(1, 'a.example', 'reset');
    const second = event(2, 'a.example', 'reset');
    tlsCompatibilityEventQueue.enqueue(first);
    tlsCompatibilityEventQueue.enqueue(second);

    const drained = tlsCompatibilityEventQueue.drain(1);
    tlsCompatibilityEventQueue.restore(drained);

    expect(tlsCompatibilityEventQueue.drain(10)).toEqual([second, first]);
  });

  it('resets pending events when listener configuration changes', () => {
    const tlsCompatibilityEventQueue = new TlsCompatibilityEventQueue();
    tlsCompatibilityEventQueue.enqueue(event(1, 'a.example', 'closed'));

    tlsCompatibilityEventQueue.reset();

    expect(tlsCompatibilityEventQueue.pendingCount).toBe(0);
  });
});

function event(
  generation: number,
  host: string,
  reason: TlsCompatibilityEvent['reason'],
): TlsCompatibilityEvent {
  return { generation, host, reason, timestamp: 1_000 + generation };
}