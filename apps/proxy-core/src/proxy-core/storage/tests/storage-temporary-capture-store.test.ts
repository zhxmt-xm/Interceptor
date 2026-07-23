import { beforeEach, describe, expect, it } from 'vitest';

import type { ExchangeInput } from '../interfaces';
import { TemporaryCaptureStore } from '../storage-temporary-capture-store';

/** TemporaryCaptureStore 测试数据与生命周期夹具。 */
class TemporaryCaptureStoreFixture {
  /** 当前用例的 Store。 */
  readonly store = new TemporaryCaptureStore();

  /** 创建默认 Session。 */
  initialize(): void {
    this.store.ensureSession({
      id: 's1',
      name: 'Recording',
      startedAt: 1_000,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
  }

  /** 创建一条可覆盖字段的 Exchange。 */
  exchange(
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
      state: 'completed',
      ...overrides,
    };
  }
}

describe('TemporaryCaptureStore', () => {
  let fixture: TemporaryCaptureStoreFixture;

  beforeEach(() => {
    fixture = new TemporaryCaptureStoreFixture();
    fixture.initialize();
  });

  it('keeps one mutable record while preserving stable sequence order', () => {
    fixture.store.appendExchanges([
      fixture.exchange('a', { startedAt: 300 }),
      fixture.exchange('b', { startedAt: 100 }),
      fixture.exchange('c', { startedAt: 200 }),
    ]);
    fixture.store.updateExchangeResponse({
      id: 'b',
      statusCode: 204,
      completedAt: 140,
      state: 'completed',
    });

    const page = fixture.store.querySessions({
      limit: 10,
      sort: 'started_asc',
      filter: {},
    });
    expect(page.items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(page.items[0]).toMatchObject({ statusCode: 204, durationMs: 40 });
  });

  it('preserves public capture metadata without truncation', () => {
    const longPath = `/${'p'.repeat(12_000)}`;
    const longUrl = `https://data.bilibili.com${longPath}?${'q'.repeat(12_000)}`;
    const responseMime = 'm'.repeat(2_000);
    const requestMime = 'r'.repeat(2_000);
    const statusText = 's'.repeat(2_000);
    const headerName = 'n'.repeat(2_000);
    const headerValue = 'v'.repeat(20_000);
    fixture.store.appendExchanges([
      fixture.exchange('bounded', {
        path: longPath,
        url: longUrl,
        responseMime,
        requestMime,
        statusText,
        headers: [{
          kind: 'request',
          name: headerName,
          value: headerValue,
        }],
      }),
    ]);

    const page = fixture.store.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {},
    });
    const detail = fixture.store.getExchangeDetail('bounded');

    expect(page.items[0]?.path).toBe(longPath);
    expect(page.items[0]?.responseMime).toBe(responseMime);
    expect(detail?.url).toBe(longUrl);
    expect(detail?.requestMime).toBe(requestMime);
    expect(detail?.statusText).toBe(statusText);
    expect(detail?.requestHeaders[0]?.name).toBe(headerName);
    expect(detail?.requestHeaders[0]?.value).toBe(headerValue);
  });

  it('paginates from opaque cursors without duplicates or gaps', () => {
    fixture.store.appendExchanges(
      Array.from({ length: 25 }, (_, index) =>
        fixture.exchange(`e-${index}`, { startedAt: index }),
      ),
    );

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = fixture.store.querySessions({
        cursor,
        limit: 7,
        sort: 'started_desc',
        filter: {},
      });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(ids).toHaveLength(25);
    expect(new Set(ids)).toHaveLength(25);
    expect(ids[0]).toBe('e-24');
    expect(ids.at(-1)).toBe('e-0');
  });

  it('paginates equal timestamps in both directions using sequence order', () => {
    fixture.store.appendExchanges(
      Array.from({ length: 1_001 }, (_, index) =>
        fixture.exchange(`same-${index}`, { startedAt: 123 }),
      ),
    );

    for (const sort of ['started_asc', 'started_desc'] as const) {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = fixture.store.querySessions({
          cursor,
          limit: 37,
          sort,
          filter: {},
        });
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toHaveLength(1_001);
      expect(new Set(ids).size).toBe(1_001);
      expect(ids[0]).toBe(sort === 'started_asc' ? 'same-0' : 'same-1000');
      expect(ids.at(-1)).toBe(sort === 'started_asc' ? 'same-1000' : 'same-0');
    }
  });

  it('continues descending after the cursor record is removed', () => {
    fixture.store.ensureSession({
      id: 'cursor-session',
      name: 'Cursor',
      startedAt: 2,
      captureMode: 'archive-import',
      appVersion: '0.0.0',
    });
    fixture.store.appendExchanges([
      fixture.exchange('oldest', { startedAt: 1 }),
      fixture.exchange('cursor', { sessionId: 'cursor-session', startedAt: 2 }),
      fixture.exchange('newest', { startedAt: 3 }),
    ]);
    const first = fixture.store.querySessions({
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(first.items.map((item) => item.id)).toEqual(['newest', 'cursor']);

    fixture.store.cleanup({ kind: 'session', sessionId: 'cursor-session' });
    const second = fixture.store.querySessions({
      cursor: first.nextCursor,
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(second.items.map((item) => item.id)).toEqual(['oldest']);
  });

  it('filters by current session, structured fields, protocol and search', () => {
    fixture.store.ensureSession({
      id: 's2',
      name: 'Other',
      startedAt: 2_000,
      captureMode: 'archive-import',
      appVersion: '0.0.0',
    });
    fixture.store.appendExchanges([
      fixture.exchange('match', {
        sessionId: 's2',
        method: 'POST',
        host: 'search.test',
        url: 'https://search.test/orders/42',
        protocol: 'h2',
        statusCode: 201,
        responseMime: 'application/json; charset=utf-8',
        processName: 'browser.exe',
      }),
      fixture.exchange('other'),
    ]);

    const page = fixture.store.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {
        sessionId: 's2',
        method: 'post',
        host: 'search.test',
        status: 201,
        mime: 'application/json',
        process: 'browser.exe',
        protocol: 'h2',
        search: 'orders',
      },
    });
    expect(page.items.map((item) => item.id)).toEqual(['match']);
  });

  it('returns complete headers, body refs and websocket frame pages', () => {
    fixture.store.appendExchanges([
      fixture.exchange('ws', {
        protocol: 'ws',
        headers: [
          { kind: 'request', name: ':authority', value: 'api.example.com', isPseudo: true },
          { kind: 'response-trailer', name: 'grpc-status', value: '0' },
        ],
        responseBody: {
          id: 'response-body',
          blobHash: 'a'.repeat(64),
          encodedSize: 4,
          mediaType: 'application/octet-stream',
        },
      }),
    ]);
    fixture.store.appendWebSocketFrames('ws', [
      {
        direction: 'client-to-server',
        opcode: 1,
        payloadSize: 5,
        timestamp: 1_100,
        payload: {
          id: 'ws-body',
          blobHash: 'b'.repeat(64),
          encodedSize: 5,
          mediaType: 'text/plain',
        },
      },
    ]);

    expect(fixture.store.getExchangeDetail('ws')).toMatchObject({
      requestHeaders: [
        { name: ':authority', value: 'api.example.com', isPseudo: true },
      ],
      responseTrailers: [{ name: 'grpc-status', value: '0' }],
      responseBody: { bodyHash: 'a'.repeat(64), encodedSize: 4 },
    });
    expect(
      fixture.store.queryWebSocketFrames({ exchangeId: 'ws', limit: 10 }).items,
    ).toEqual([
      expect.objectContaining({
        seq: 1,
        payload: expect.objectContaining({ bodyHash: 'b'.repeat(64) }),
      }),
    ]);
  });

  it('preserves the active session shell while clearing all capture content', () => {
    fixture.store.appendExchanges([
      fixture.exchange('one', {
        responseBody: {
          id: 'body',
          blobHash: 'c'.repeat(64),
          encodedSize: 10,
        },
      }),
    ]);
    fixture.store.appendRuleHits('one', [
      {
        ruleId: 'rule-a',
        ruleRevision: 1,
        phase: 'request',
        action: 'header.set',
      },
    ]);

    const result = fixture.store.cleanup({
      kind: 'all-except-session',
      sessionId: 's1',
    });
    expect(result).toMatchObject({ removedSessions: 0, removedExchanges: 1 });
    expect(result.referencedBlobHashes).toEqual([]);
    expect(fixture.store.getStorageStats()).toMatchObject({
      sessionCount: 1,
      exchangeCount: 0,
      bodyRefCount: 0,
      databaseBytes: 0,
    });
    expect(fixture.store.countRuleHits()).toEqual([]);
  });

  it('handles 100k rows with stable complete pagination under the existing gate', () => {
    const startedAt = performance.now();
    fixture.store.appendExchanges(
      Array.from({ length: 100_000 }, (_, index) =>
        fixture.exchange(`e-${index}`, {
          startedAt: index,
          method: index % 2 === 0 ? 'GET' : 'POST',
        }),
      ),
    );

    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = fixture.store.querySessions({
        cursor,
        limit: 1_000,
        sort: 'started_asc',
        filter: {},
      });
      for (const item of page.items) {
        ids.add(item.id);
      }
      cursor = page.nextCursor;
    } while (cursor);

    expect(ids.size).toBe(100_000);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });
});
