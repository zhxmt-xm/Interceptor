import { beforeEach, describe, expect, it } from 'vitest';

import type { ExchangeInput } from '../../interfaces';
import { ExchangeStore } from '../../internal/exchange-store';

/** ExchangeStore 测试数据与生命周期夹具。 */
class ExchangeStoreFixture {
  /** 当前用例的 Store。 */
  readonly exchangeStore = new ExchangeStore();

  /** 创建默认 Session。 */
  initialize(): void {
    this.exchangeStore.ensureSession({
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

describe('ExchangeStore', () => {
  let exchangeStoreFixture: ExchangeStoreFixture;

  beforeEach(() => {
    exchangeStoreFixture = new ExchangeStoreFixture();
    exchangeStoreFixture.initialize();
  });

  it('keeps one mutable record while preserving stable sequence order', () => {
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('a', { startedAt: 300 }),
      exchangeStoreFixture.exchange('b', { startedAt: 100 }),
      exchangeStoreFixture.exchange('c', { startedAt: 200 }),
    ]);
    exchangeStoreFixture.exchangeStore.updateExchange({
      id: 'b',
      statusCode: 204,
      completedAt: 140,
      state: 'completed',
    });

    const page = exchangeStoreFixture.exchangeStore.querySessions({
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
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('bounded', {
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

    const page = exchangeStoreFixture.exchangeStore.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {},
    });
    const detail = exchangeStoreFixture.exchangeStore.getExchangeDetail('bounded');

    expect(page.items[0]?.path).toBe(longPath);
    expect(page.items[0]?.responseMime).toBe(responseMime);
    expect(detail?.url).toBe(longUrl);
    expect(detail?.requestMime).toBe(requestMime);
    expect(detail?.statusText).toBe(statusText);
    expect(detail?.requestHeaders[0]?.name).toBe(headerName);
    expect(detail?.requestHeaders[0]?.value).toBe(headerValue);
  });

  it('paginates from opaque cursors without duplicates or gaps', () => {
    exchangeStoreFixture.exchangeStore.appendExchanges(
      Array.from({ length: 25 }, (_, index) =>
        exchangeStoreFixture.exchange(`e-${index}`, { startedAt: index }),
      ),
    );

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = exchangeStoreFixture.exchangeStore.querySessions({
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
    exchangeStoreFixture.exchangeStore.appendExchanges(
      Array.from({ length: 1_001 }, (_, index) =>
        exchangeStoreFixture.exchange(`same-${index}`, { startedAt: 123 }),
      ),
    );

    for (const sort of ['started_asc', 'started_desc'] as const) {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = exchangeStoreFixture.exchangeStore.querySessions({
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
    exchangeStoreFixture.exchangeStore.ensureSession({
      id: 'cursor-session',
      name: 'Cursor',
      startedAt: 2,
      captureMode: 'archive-import',
      appVersion: '0.0.0',
    });
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('oldest', { startedAt: 1 }),
      exchangeStoreFixture.exchange('cursor', { sessionId: 'cursor-session', startedAt: 2 }),
      exchangeStoreFixture.exchange('newest', { startedAt: 3 }),
    ]);
    const first = exchangeStoreFixture.exchangeStore.querySessions({
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(first.items.map((item) => item.id)).toEqual(['newest', 'cursor']);

    exchangeStoreFixture.exchangeStore.cleanup({ kind: 'session', sessionId: 'cursor-session' });
    const second = exchangeStoreFixture.exchangeStore.querySessions({
      cursor: first.nextCursor,
      limit: 2,
      sort: 'started_desc',
      filter: {},
    });
    expect(second.items.map((item) => item.id)).toEqual(['oldest']);
  });

  it('filters by current session, structured fields, protocol and search', () => {
    exchangeStoreFixture.exchangeStore.ensureSession({
      id: 's2',
      name: 'Other',
      startedAt: 2_000,
      captureMode: 'archive-import',
      appVersion: '0.0.0',
    });
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('match', {
        sessionId: 's2',
        method: 'POST',
        host: 'search.test',
        url: 'https://search.test/orders/42',
        protocol: 'h2',
        statusCode: 201,
        responseMime: 'application/json; charset=utf-8',
        appName: 'browser.exe',
      }),
      exchangeStoreFixture.exchange('other'),
    ]);

    const page = exchangeStoreFixture.exchangeStore.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {
        sessionId: 's2',
        method: 'post',
        host: 'search.test',
        status: 201,
        mime: 'application/json',
        appName: 'browser.exe',
        protocol: 'h2',
        search: 'orders',
      },
    });
    expect(page.items.map((item) => item.id)).toEqual(['match']);
  });

  it('returns complete headers, body refs and websocket frame pages', () => {
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('ws', {
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
    exchangeStoreFixture.exchangeStore.appendWebSocketFrames('ws', [
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

    expect(exchangeStoreFixture.exchangeStore.getExchangeDetail('ws')).toMatchObject({
      requestHeaders: [
        { name: ':authority', value: 'api.example.com', isPseudo: true },
      ],
      responseTrailers: [{ name: 'grpc-status', value: '0' }],
      responseBody: { bodyHash: 'a'.repeat(64), encodedSize: 4 },
    });
    expect(
      exchangeStoreFixture.exchangeStore.queryWebSocketFrames({ exchangeId: 'ws', limit: 10 }).items,
    ).toEqual([
      expect.objectContaining({
        seq: 1,
        payload: expect.objectContaining({ bodyHash: 'b'.repeat(64) }),
      }),
    ]);
  });

  it('preserves the active session shell while clearing all capture content', () => {
    exchangeStoreFixture.exchangeStore.appendExchanges([
      exchangeStoreFixture.exchange('one', {
        responseBody: {
          id: 'body',
          blobHash: 'c'.repeat(64),
          encodedSize: 10,
        },
      }),
    ]);
    exchangeStoreFixture.exchangeStore.appendRuleHits('one', [
      {
        ruleId: 'rule-a',
        ruleRevision: 1,
        phase: 'request',
        action: 'header.set',
      },
    ]);

    const result = exchangeStoreFixture.exchangeStore.cleanup({
      kind: 'all-except-session',
      sessionId: 's1',
    });
    expect(result).toMatchObject({ removedSessions: 0, removedExchanges: 1 });
    expect(result.referencedBlobHashes).toEqual([]);
    expect(exchangeStoreFixture.exchangeStore.getStorageStats()).toMatchObject({
      sessionCount: 1,
      exchangeCount: 0,
      bodyRefCount: 0,
      databaseBytes: 0,
    });
    expect(exchangeStoreFixture.exchangeStore.countRuleHits()).toEqual([]);
  });

  it('exposes unique rule ids on summary and detail after recording hits', () => {
    exchangeStoreFixture.exchangeStore.appendExchanges([exchangeStoreFixture.exchange('one')]);
    exchangeStoreFixture.exchangeStore.appendRuleHits('one', [
      {
        ruleId: 'rule-a',
        ruleRevision: 1,
        phase: 'request',
        action: 'header.set',
      },
      {
        ruleId: 'rule-a',
        ruleRevision: 1,
        phase: 'request',
        action: 'query.set',
      },
      {
        ruleId: 'rule-b',
        ruleRevision: 1,
        phase: 'response',
        action: 'delay',
      },
    ]);

    const page = exchangeStoreFixture.exchangeStore.querySessions({
      limit: 10,
      sort: 'started_asc',
      filter: {},
    });
    expect(page.items[0]?.ruleIds).toEqual(['rule-a', 'rule-b']);
    expect(exchangeStoreFixture.exchangeStore.getExchangeDetail('one')?.summary.ruleIds).toEqual([
      'rule-a',
      'rule-b',
    ]);
  });

  it('handles 100k rows with stable complete pagination under the existing gate', () => {
    const startedAt = performance.now();
    exchangeStoreFixture.exchangeStore.appendExchanges(
      Array.from({ length: 100_000 }, (_, index) =>
        exchangeStoreFixture.exchange(`e-${index}`, {
          startedAt: index,
          method: index % 2 === 0 ? 'GET' : 'POST',
        }),
      ),
    );

    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = exchangeStoreFixture.exchangeStore.querySessions({
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
