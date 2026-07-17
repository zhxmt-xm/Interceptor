import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openDiagnosticsDatabase } from '../utils';
import { DIAGNOSTICS_SCHEMA_VERSION } from '../worker/worker-schema';
import { DiagnosticsStore } from '../worker/worker-store';

// 不向构造函数注入测试参数：直接把保留条数常量 mock 成小值来驱动淘汰。
vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  DIAGNOSTICS_MAX_RECORDS: 3,
}));

function record(
  sequence: number,
  overrides: Partial<DiagnosticLogRecord> = {},
): DiagnosticLogRecord {
  return {
    timestamp: new Date(1_700_000_000_000 + sequence).toISOString(),
    sequence,
    level: 'info',
    process: 'proxy-core',
    phase: 'command.completed',
    ...overrides,
  };
}

describe('DiagnosticsStore', () => {
  it('migrates the diagnostics database to the current version', () => {
    const { db, migration } = openDiagnosticsDatabase(':memory:');
    try {
      expect(migration.toVersion).toBe(DIAGNOSTICS_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  describe('with an open store', () => {
    let store: DiagnosticsStore;

    beforeEach(() => {
      const { db } = openDiagnosticsDatabase(':memory:');
      store = new DiagnosticsStore(db);
    });

    it('persists a batch and returns it newest-first', () => {
      store.insertBatch([record(1), record(2), record(3)]);
      const page = store.query({ limit: 10 });
      expect(page.records.map((r) => r.sequence)).toEqual([3, 2, 1]);
      expect(page.hasMore).toBe(false);
    });

    it('paginates by descending id cursor', () => {
      store.insertBatch([record(1), record(2), record(3)]);
      const first = store.query({ limit: 2 });
      expect(first.records.map((r) => r.sequence)).toEqual([3, 2]);
      expect(first.hasMore).toBe(true);

      const second = store.query({ limit: 2, cursor: first.nextCursor });
      expect(second.records.map((r) => r.sequence)).toEqual([1]);
      expect(second.hasMore).toBe(false);
    });

    it('filters by level and traceId', () => {
      store.insertBatch([
        record(1, { level: 'error', traceId: 't-1' }),
        record(2, { level: 'info', traceId: 't-2' }),
      ]);
      expect(
        store.query({ limit: 10, level: 'error' }).records.map((r) => r.sequence),
      ).toEqual([1]);
      expect(
        store.query({ limit: 10, traceId: 't-2' }).records.map((r) => r.sequence),
      ).toEqual([2]);
    });

    it('filters by outcome', () => {
      store.insertBatch([
        record(1, { outcome: 'failed' }),
        record(2, { outcome: 'success' }),
        record(3, { outcome: 'failed' }),
      ]);
      expect(
        store.query({ limit: 10, outcome: 'failed' }).records.map((r) => r.sequence),
      ).toEqual([3, 1]);
    });

      it('filters by command and duration range', () => {
        store.insertBatch([
          record(1, { command: 'echo', durationMs: 5 }),
          record(2, { command: 'echo', durationMs: 25 }),
          record(3, { command: 'proxy.start', durationMs: 50 }),
        ]);
        expect(
          store.query({
            limit: 10,
            command: 'echo',
            minDurationMs: 10,
            maxDurationMs: 30,
          }).records.map((item) => item.sequence),
        ).toEqual([2]);
      });

    it('preserves redacted attributes across a round trip', () => {
      store.insertBatch([
        record(1, { attributes: { action: 'echo.copy', count: 3 } }),
      ]);
      const page = store.query({ limit: 1 });
      expect(page.records[0]?.attributes).toEqual({
        action: 'echo.copy',
        count: 3,
      });
    });

    it('tracks an aggregate dropped count', () => {
      store.incrementDropped(5);
      store.incrementDropped(2);
      expect(store.query({ limit: 1 }).droppedCount).toBe(7);
    });
  });

  it('enforces the record-count retention policy', () => {
    const { db } = openDiagnosticsDatabase(':memory:');
    const store = new DiagnosticsStore(db);
    store.insertBatch([record(1), record(2), record(3), record(4), record(5)]);
    expect(store.count()).toBe(3);
    expect(store.query({ limit: 10 }).records.map((r) => r.sequence)).toEqual([
      5, 4, 3,
    ]);
  });
});
