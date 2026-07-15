import { beforeEach, describe, expect, it } from 'vitest';

import { openCaptureDatabase, IN_MEMORY_LOCATION } from '../worker/worker-database';
import { CaptureStore, InvalidCursorError } from '../worker/worker-store';
import type { ExchangeInput } from '../types';

function createStore(): CaptureStore {
  const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
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
  });
});
