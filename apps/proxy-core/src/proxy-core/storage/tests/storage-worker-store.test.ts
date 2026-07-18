import { beforeEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

import { IN_MEMORY_LOCATION } from '../storage-constants';
import { openCaptureDatabase } from '../utils';
import { InvalidCursorError } from '../worker/worker-invalid-cursor-error';
import { RuleRevisionConflictError } from '../worker/worker-rule-revision-conflict-error';
import { CaptureStore } from '../worker/worker-store';
import type { ExchangeInput } from '../interfaces';

let database: ReturnType<typeof openCaptureDatabase>['db'];

function createStore(): CaptureStore {
  const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
  database = db;
  const store = new CaptureStore(db);
  store.ensureSession({
    id: 's1',
    name: 'Session 1',
    startedAt: 1_000,
    captureMode: 'explicit-proxy',
    appVersion: '0.0.0',
  });
  return store;
}

function exchange(
  id: string,
  overrides: Partial<ExchangeInput> = {},
): ExchangeInput {
  return {
    id,
    sessionId: 's1',
    method: 'GET',
    url: `https://api.example.com/${id}`,
    host: 'api.example.com',
    protocol: 'http/1.1',
    startedAt: 1_000,
    state: 'pending',
    ...overrides,
  };
}

describe('CaptureStore', () => {
  let store: CaptureStore;

  beforeEach(() => {
    store = createStore();
  });

  it('assigns monotonic sequence numbers to appended exchanges', () => {
    const assigned = store.appendExchanges([
      exchange('a'),
      exchange('b'),
      exchange('c'),
    ]);
    expect(assigned).toEqual([
      { id: 'a', seq: 1 },
      { id: 'b', seq: 2 },
      { id: 'c', seq: 3 },
    ]);
  });

  it('resumes the sequence counter from existing rows on reopen semantics', () => {
    store.appendExchanges([exchange('a'), exchange('b')]);
    const next = store.appendExchanges([exchange('c')]);
    expect(next).toEqual([{ id: 'c', seq: 3 }]);
  });

  it('appends ordered websocket frames with payload body references', () => {
    store.appendExchanges([exchange('ws-1')]);
    store.appendWebSocketFrames('ws-1', [
      {
        direction: 'client-to-server',
        opcode: 1,
        payloadSize: 5,
        timestamp: 1_010,
        payload: {
          id: 'ws-body-1',
          blobHash: 'b'.repeat(64),
          encodedSize: 5,
          mediaType: 'text/plain; charset=utf-8',
        },
      },
      {
        direction: 'server-to-client',
        opcode: 2,
        payloadSize: 3,
        timestamp: 1_020,
        payload: {
          id: 'ws-body-2',
          blobHash: 'c'.repeat(64),
          encodedSize: 3,
          mediaType: 'application/octet-stream',
        },
      },
    ]);
    store.appendWebSocketFrames('ws-1', [
      {
        direction: 'server-to-client',
        opcode: 8,
        payloadSize: 0,
        timestamp: 1_030,
      },
    ]);

    const rows = database
      .prepare(
        `SELECT seq, direction, opcode, payload_body_id AS payloadBodyId,
                payload_size AS payloadSize, timestamp
         FROM websocket_frame WHERE exchange_id = ? ORDER BY seq`,
      )
      .all('ws-1');
    expect(rows).toEqual([
      {
        seq: 1,
        direction: 'client-to-server',
        opcode: 1,
        payloadBodyId: 'ws-body-1',
        payloadSize: 5,
        timestamp: 1_010,
      },
      {
        seq: 2,
        direction: 'server-to-client',
        opcode: 2,
        payloadBodyId: 'ws-body-2',
        payloadSize: 3,
        timestamp: 1_020,
      },
      {
        seq: 3,
        direction: 'server-to-client',
        opcode: 8,
        payloadBodyId: null,
        payloadSize: 0,
        timestamp: 1_030,
      },
    ]);

    const firstPage = store.queryWebSocketFrames({
      exchangeId: 'ws-1',
      limit: 1,
    });
    expect(firstPage.items).toEqual([
      expect.objectContaining({
        seq: 1,
        direction: 'client-to-server',
        opcode: 1,
        payloadSize: 5,
        payload: expect.objectContaining({ bodyHash: 'b'.repeat(64) }),
      }),
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeDefined();
    const secondPage = store.queryWebSocketFrames({
      exchangeId: 'ws-1',
      cursor: firstPage.nextCursor,
      limit: 2,
    });
    expect(secondPage.items.map((frame) => frame.seq)).toEqual([2]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeDefined();

    const received = store.queryWebSocketFrames({
      exchangeId: 'ws-1',
      limit: 10,
      direction: 'server-to-client',
    });
    expect(received.items.map((frame) => frame.seq)).toEqual([2]);
  });

  it('returns full exchange detail with headers and body refs', () => {
    store.appendExchanges([
      exchange('e1', {
        method: 'POST',
        scheme: 'https',
        path: '/users?page=2',
        url: 'https://api.example.com/users?page=2',
        statusCode: 201,
        statusText: 'Created',
        responseMime: 'application/json',
        startedAt: 1_000,
        completedAt: 1_150,
        responseBytes: 42,
        state: 'completed',
        headers: [
          { kind: 'request', name: 'accept', value: 'application/json' },
          { kind: 'response', name: 'content-type', value: 'application/json' },
        ],
        responseBody: {
          id: 'body-1',
          blobHash: 'a'.repeat(64),
          encodedSize: 42,
          mediaType: 'application/json',
        },
      }),
    ]);

    const detail = store.getExchangeDetail('e1');
    expect(detail).not.toBeNull();
    expect(detail?.summary.method).toBe('POST');
    expect(detail?.summary.secure).toBe(true);
    expect(detail?.summary.durationMs).toBe(150);
    expect(detail?.url).toBe('https://api.example.com/users?page=2');
    expect(detail?.statusText).toBe('Created');
    expect(detail?.requestHeaders).toEqual([
      { name: 'accept', value: 'application/json' },
    ]);
    expect(detail?.responseHeaders).toEqual([
      { name: 'content-type', value: 'application/json' },
    ]);
    expect(detail?.responseBody).toEqual({
      bodyHash: 'a'.repeat(64),
      mediaType: 'application/json',
      encodedSize: 42,
      decodedSize: undefined,
      truncated: false,
      decodeStatus: 'ok',
    });
    expect(detail?.requestBody).toBeUndefined();
  });

  it('returns null exchange detail for an unknown id', () => {
    expect(store.getExchangeDetail('missing')).toBeNull();
  });

  it('paginates by keyset cursor without hydrating bodies', () => {
    store.appendExchanges([
      exchange('a', { startedAt: 100 }),
      exchange('b', { startedAt: 200 }),
      exchange('c', { startedAt: 300 }),
    ]);

    const first = store.querySessions({
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(first.items.map((item) => item.id)).toEqual(['c', 'b']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const second = store.querySessions({
      cursor: first.nextCursor,
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(second.items.map((item) => item.id)).toEqual(['a']);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeUndefined();
  });

  it('filters by host, method, status and mime prefix', () => {
    store.appendExchanges([
      exchange('json', {
        method: 'POST',
        host: 'a.test',
        statusCode: 200,
        responseMime: 'application/json; charset=utf-8',
      }),
      exchange('html', {
        method: 'GET',
        host: 'b.test',
        statusCode: 404,
        responseMime: 'text/html',
      }),
    ]);

    expect(
      store.querySessions({ limit: 10, sort: 'started_desc', filter: { method: 'post' } })
        .items.map((item) => item.id),
    ).toEqual(['json']);
    expect(
      store.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: { status: 404 },
      }).items.map((item) => item.id),
    ).toEqual(['html']);
    expect(
      store.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: { mime: 'application/json' },
      }).items.map((item) => item.id),
    ).toEqual(['json']);
  });

  it('filters exchanges to the active recording session', () => {
    store.ensureSession({
      id: 'current-recording',
      name: 'Current recording',
      startedAt: 2_000,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    store.appendExchanges([
      exchange('historical'),
      exchange('current', { sessionId: 'current-recording', startedAt: 2_000 }),
    ]);

    expect(store.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: { sessionId: 'current-recording' },
    }).items.map((item) => item.id)).toEqual(['current']);
  });

  it('preserves response metadata when a close update only changes state and time', () => {
    store.appendExchanges([
      exchange('tunnel', {
        protocol: 'tls',
        statusCode: 200,
        responseMime: 'application/x-encrypted-tunnel',
        responseBytes: 42,
        state: 'request-complete',
      }),
    ]);

    store.updateExchangeResponse({
      id: 'tunnel',
      completedAt: 2_000,
      state: 'completed',
    });

    expect(store.querySessions({ limit: 10, sort: 'started_desc', filter: {} }).items[0])
      .toMatchObject({
        id: 'tunnel',
        protocol: 'tls',
        statusCode: 200,
        responseMime: 'application/x-encrypted-tunnel',
        responseBytes: 42,
        state: 'completed',
      });
  });

  it('supports full-text search over url and host', () => {
    store.appendExchanges([
      exchange('users', { url: 'https://api.example.com/users/42' }),
      exchange('orders', { url: 'https://api.example.com/orders/7' }),
    ]);
    const page = store.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: { search: 'orders' },
    });
    expect(page.items.map((item) => item.id)).toEqual(['orders']);
  });

  it('filters protocol groups across normalized capture values', () => {
    store.appendExchanges([
      exchange('h1', { protocol: 'http/1.1' }),
      exchange('h2', { protocol: 'h2' }),
      exchange('ws', { protocol: 'ws' }),
    ]);

    for (const protocol of ['h1', 'h2', 'ws'] as const) {
      expect(store.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: { protocol },
      }).items.map((item) => item.id)).toEqual([protocol]);
    }
  });

  it('rejects malformed cursors', () => {
    expect(() =>
      store.querySessions({
        cursor: 'not a real cursor!!',
        limit: 10,
        sort: 'started_desc',
        filter: {},
      }),
    ).toThrow(InvalidCursorError);
  });

  it('reports storage statistics', () => {
    store.appendExchanges([exchange('a'), exchange('b')]);
    const stats = store.getStorageStats();
    expect(stats.sessionCount).toBe(1);
    expect(stats.exchangeCount).toBe(2);
    expect(stats.databaseBytes).toBeGreaterThan(0);
  });

  it('inserts a body_ref and binds it to the exchange', () => {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    const scoped = new CaptureStore(db);
    scoped.ensureSession({
      id: 's1',
      name: 'S1',
      startedAt: 1,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    scoped.appendExchanges([
      exchange('a', {
        requestBody: {
          id: 'body-1',
          blobHash: 'abc123',
          encodedSize: 12,
          mediaType: 'application/json',
          decodeStatus: 'ok',
        },
      }),
    ]);

    const bodyCount = (
      db.prepare('SELECT COUNT(*) AS v FROM body_ref').get() as { v: number }
    ).v;
    expect(bodyCount).toBe(1);
    const bound = db
      .prepare('SELECT request_body_id AS rid FROM exchange WHERE id = ?')
      .get('a') as { rid: string | null };
    expect(bound.rid).toBe('body-1');
    const stats = scoped.getStorageStats();
    expect(stats.bodyRefCount).toBe(1);
    expect(stats.referencedBodyBytes).toBe(12);
    db.close();
  });

  it('clears all capture data and reports no referenced blobs', () => {
    store.appendExchanges([exchange('a'), exchange('b')]);
    const result = store.cleanup({ kind: 'all' });
    expect(result.removedSessions).toBe(1);
    expect(result.removedExchanges).toBe(2);
    expect(result.referencedBlobHashes).toEqual([]);
    expect(store.getStorageStats().exchangeCount).toBe(0);
  });

  it('clears captured exchanges while preserving the active recording session', () => {
    store.ensureSession({
      id: 'active',
      name: 'Active recording',
      startedAt: 2_000,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    store.appendExchanges([
      exchange('old'),
      exchange('active-old', { sessionId: 'active' }),
    ]);

    const result = store.cleanup({
      kind: 'all-except-session',
      sessionId: 'active',
    });

    expect(result.removedSessions).toBe(1);
    expect(result.removedExchanges).toBe(2);
    expect(result.referencedBlobHashes).toEqual([]);
    expect(store.getStorageStats()).toMatchObject({
      sessionCount: 1,
      exchangeCount: 0,
      bodyRefCount: 0,
    });

    expect(() => {
      store.appendExchanges([
        exchange('after-clear', { sessionId: 'active', startedAt: 3_000 }),
      ]);
    }).not.toThrow();
    expect(store.getStorageStats().exchangeCount).toBe(1);
  });

  it('deletes a single session and its exchanges', () => {
    store.ensureSession({
      id: 's2',
      name: 'Session 2',
      startedAt: 2_000,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    store.appendExchanges([
      exchange('a'),
      exchange('b', { sessionId: 's2' }),
    ]);

    const result = store.cleanup({ kind: 'session', sessionId: 's1' });
    expect(result.removedSessions).toBe(1);
    expect(result.removedExchanges).toBe(1);

    const remaining = store.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {},
    });
    expect(remaining.items.map((item) => item.id)).toEqual(['b']);
  });

  it('paginates 100k rows without duplicates or gaps', () => {
    const startedAt = performance.now();
    const total = 100_000;
    const inputs: ExchangeInput[] = [];
    for (let index = 0; index < total; index += 1) {
      inputs.push(exchange(`e${index}`, { startedAt: index }));
    }
    store.appendExchanges(inputs);

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = store.querySessions({
        cursor,
        limit: 1_000,
        sort: 'started_asc',
        filter: {},
      });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
      pages += 1;
      if (pages > total) {
        throw new Error('pagination did not terminate');
      }
    } while (cursor);

    expect(seen.size).toBe(total);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it('returns an empty rule set for a fresh database', () => {
    expect(store.loadRuleSet()).toEqual({ revision: 0, rules: [] });
  });

  it('persists a rule set and bumps revision on each save', () => {
    const rule: RuleDefinition = {
      id: 'rule-1',
      name: 'Tag API',
      enabled: true,
      priority: 100,
      matchers: [{ type: 'host', value: 'api.test', mode: 'exact' }],
      actions: [
        {
          type: 'header',
          phase: 'request',
          op: 'set',
          name: 'x-tag',
          value: 'on',
        },
      ],
    };
    const saved = store.saveRuleSet(0, [rule]);
    expect(saved).toEqual({ revision: 1, rules: [rule] });
    expect(store.loadRuleSet()).toEqual({ revision: 1, rules: [rule] });

    const next = store.saveRuleSet(1, []);
    expect(next.revision).toBe(2);
    expect(store.loadRuleSet()).toEqual({ revision: 2, rules: [] });
  });

  it('rejects a stale expectedRevision without mutating state', () => {
    store.saveRuleSet(0, []);
    expect(() => store.saveRuleSet(0, [])).toThrow(RuleRevisionConflictError);
    expect(store.loadRuleSet().revision).toBe(1);
  });

  it('aggregates rule hit counts by rule id', () => {
    store.appendExchanges([exchange('e1'), exchange('e2')]);
    store.appendRuleHits('e1', [
      { ruleId: 'rule-a', ruleRevision: 1, phase: 'request', action: 'header.set' },
      { ruleId: 'rule-b', ruleRevision: 1, phase: 'response', action: 'block' },
    ]);
    store.appendRuleHits('e2', [
      { ruleId: 'rule-a', ruleRevision: 1, phase: 'request', action: 'header.set' },
    ]);
    const counts = store.countRuleHits();
    const byRule = Object.fromEntries(counts.map((entry) => [entry.ruleId, entry.count]));
    expect(byRule).toEqual({ 'rule-a': 2, 'rule-b': 1 });
  });

  it('returns no rule hit counts for a fresh database', () => {
    expect(store.countRuleHits()).toEqual([]);
  });
});
