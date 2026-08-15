import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it } from 'vitest';

import { openDiagnosticsDatabase } from '../../utils';
import { RecordStore } from '../../worker/record-store';

function record(
  sequence: number,
  overrides: Partial<DiagnosticLogRecord> = {},
): DiagnosticLogRecord {
  return {
    timestamp: new Date(1_700_000_000_000 + sequence).toISOString(),
    sequence,
    level: 'info',
    process: 'core',
    phase: 'command.completed',
    ...overrides,
  };
}

describe('RecordStore', () => {
  it('creates the current diagnostics schema', () => {
    const { databaseSync: db } = openDiagnosticsDatabase(':memory:');
    try {
      expect(
        db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'log_record'",
        ).get(),
      ).toEqual({ name: 'log_record' });
    } finally {
      db.close();
    }
  });

  describe('with an open store', () => {
    let recordStore: RecordStore;

    beforeEach(() => {
      const { databaseSync: db } = openDiagnosticsDatabase(':memory:');
      recordStore = new RecordStore(db);
    });

    it('persists a batch and returns it newest-first', () => {
      recordStore.insertBatch([record(1), record(2), record(3)]);
      const page = recordStore.query({ limit: 10 });
      expect(page.records.map((r) => r.sequence)).toEqual([3, 2, 1]);
      expect(page.hasMore).toBe(false);
    });

    it('paginates by descending id cursor', () => {
      recordStore.insertBatch([record(1), record(2), record(3)]);
      const first = recordStore.query({ limit: 2 });
      expect(first.records.map((r) => r.sequence)).toEqual([3, 2]);
      expect(first.hasMore).toBe(true);

      const second = recordStore.query({ limit: 2, cursor: first.nextCursor });
      expect(second.records.map((r) => r.sequence)).toEqual([1]);
      expect(second.hasMore).toBe(false);
    });

    it('filters by level and traceId', () => {
      recordStore.insertBatch([
        record(1, { level: 'error', traceId: 't-1' }),
        record(2, { level: 'info', traceId: 't-2' }),
      ]);
      expect(
        recordStore.query({ limit: 10, level: 'error' }).records.map((r) => r.sequence),
      ).toEqual([1]);
      expect(
        recordStore.query({ limit: 10, traceId: 't-2' }).records.map((r) => r.sequence),
      ).toEqual([2]);
    });

    it('filters by outcome', () => {
      recordStore.insertBatch([
        record(1, { outcome: 'failed' }),
        record(2, { outcome: 'success' }),
        record(3, { outcome: 'failed' }),
      ]);
      expect(
        recordStore.query({ limit: 10, outcome: 'failed' }).records.map((r) => r.sequence),
      ).toEqual([3, 1]);
    });

    it('filters by process', () => {
      recordStore.insertBatch([
        record(1, { process: 'core' }),
        record(2, { process: 'main' }),
        record(3, { process: 'renderer' }),
      ]);
      expect(
        recordStore.query({ limit: 10, process: 'main' }).records.map((item) =>
          item.sequence),
      ).toEqual([2]);
      expect(
        recordStore.query({ limit: 10, process: 'core' }).records.map((item) =>
          item.sequence),
      ).toEqual([1]);
    });

      it('filters by command and duration range', () => {
        recordStore.insertBatch([
          record(1, { command: 'echo', durationMs: 5 }),
          record(2, { command: 'echo', durationMs: 25 }),
          record(3, { command: 'proxy.start', durationMs: 50 }),
        ]);
        expect(
          recordStore.query({
            limit: 10,
            command: 'echo',
            minDurationMs: 10,
            maxDurationMs: 30,
          }).records.map((item) => item.sequence),
        ).toEqual([2]);
      });

    it('preserves redacted attributes across a round trip', () => {
      recordStore.insertBatch([
        record(1, { attributes: { action: 'echo.copy', count: 3 } }),
      ]);
      const page = recordStore.query({ limit: 1 });
      expect(page.records[0]?.attributes).toEqual({
        action: 'echo.copy',
        count: 3,
      });
    });

    it('tracks an aggregate dropped count', () => {
      recordStore.incrementDropped(5);
      recordStore.incrementDropped(2);
      expect(recordStore.query({ limit: 1 }).droppedCount).toBe(7);
    });
  });

  it('retains every inserted record', () => {
    const { databaseSync: db } = openDiagnosticsDatabase(':memory:');
    const recordStore = new RecordStore(db);
    recordStore.insertBatch([record(1), record(2), record(3), record(4), record(5)]);
    expect(recordStore.count()).toBe(5);
    expect(recordStore.query({ limit: 10 }).records.map((r) => r.sequence)).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });
});
