import type { TlsCompatibilityEvent } from '@interceptor/core-protocol';

/** Small FIFO queue for deduplicated TLS compatibility signals. */
export class TlsCompatibilityEventQueue {
  /** Pending event by TLS generation and normalized host. */
  private readonly pendingByKey = new Map<string, TlsCompatibilityEvent>();

  /** Enqueue one event once while it remains pending. */
  enqueue(event: TlsCompatibilityEvent): void {
    const key = TlsCompatibilityEventQueue.key(event);
    if (!this.pendingByKey.has(key)) {
      this.pendingByKey.set(key, event);
    }
  }

  /** Drain up to maxBatch events in insertion order. */
  drain(maxBatch: number): TlsCompatibilityEvent[] {
    if (maxBatch <= 0) {
      return [];
    }
    const events = [...this.pendingByKey.values()].slice(0, maxBatch);
    for (const event of events) {
      this.pendingByKey.delete(TlsCompatibilityEventQueue.key(event));
    }
    return events;
  }

  /** Restore an unsent batch without replacing newer pending entries. */
  restore(events: readonly TlsCompatibilityEvent[]): void {
    for (const event of events) {
      const key = TlsCompatibilityEventQueue.key(event);
      if (!this.pendingByKey.has(key)) {
        this.pendingByKey.set(key, event);
      }
    }
  }

  /** Drop signals from an obsolete listener generation. */
  reset(): void {
    this.pendingByKey.clear();
  }

  /** Number of pending compatibility signals. */
  get pendingCount(): number {
    return this.pendingByKey.size;
  }

  /** Stable deduplication key. */
  private static key(event: TlsCompatibilityEvent): string {
    return `${event.generation}:${event.host}`;
  }
}