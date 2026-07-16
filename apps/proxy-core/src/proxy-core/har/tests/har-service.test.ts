import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it } from 'vitest';

import {
  HarService,
} from '../entry';
import type { HarStorage } from '../interfaces';
import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  SessionQuery,
} from '../../storage/interfaces';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

class FakeHarStorage implements HarStorage {
  /** 测试中建立的导入 Session。 */
  readonly sessions: CaptureSessionInput[] = [];
  /** 测试中批量写入的 Exchange。 */
  readonly imported: ExchangeInput[] = [];
  /** 以内存 hash 模拟内容寻址 Blob Store。 */
  readonly bodies = new Map<string, Buffer>();
  /** 最近一次回滚 cleanup scope。 */
  cleaned: CleanupScope | null = null;
  /** 导出侧可读取的 Exchange detail fixtures。 */
  private readonly details: CaptureExchangeDetail[];
  /** 是否在 appendExchanges 模拟持久化失败。 */
  private readonly failAppend: boolean;

  /** 初始化导出 fixtures 和两段预置正文。 */
  constructor(details: CaptureExchangeDetail[] = [], failAppend = false) {
    this.details = details;
    this.failAppend = failAppend;
    this.bodies.set('request-hash', Buffer.from('<script>notExecuted()</script>'));
    this.bodies.set('response-hash', Buffer.from('{"created":true}'));
  }

  /** 返回全部 fixture 摘要作为单页查询结果。 */
  querySessions(_query: SessionQuery) {
    return Promise.resolve({
      items: this.details.map((detail) => detail.summary),
      hasMore: false,
    });
  }

  /** 按 ID 查找 fixture detail。 */
  getExchangeDetail(exchangeId: string) {
    return Promise.resolve(
      this.details.find((detail) => detail.summary.id === exchangeId) ?? null,
    );
  }

  /** 从内存 Blob Map 读取指定范围。 */
  readBodyRange(hash: string, offset: number, length: number) {
    const body = this.bodies.get(hash) ?? Buffer.alloc(0);
    return Promise.resolve(body.subarray(offset, offset + length));
  }

  /** 将异步字节序列写入内存 Blob Map。 */
  async writeBody(source: AsyncIterable<Uint8Array>) {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const hash = createHash('sha256').update(body).digest('hex');
    this.bodies.set(hash, body);
    return { hash, size: body.byteLength, deduplicated: false };
  }

  /** 记录 HAR import 建立的 Session。 */
  ensureSession(session: CaptureSessionInput) {
    this.sessions.push(session);
    return Promise.resolve();
  }

  /** 记录 HAR import 批量追加的 Exchange。 */
  appendExchanges(exchanges: ExchangeInput[]) {
    if (this.failAppend) {
      return Promise.reject(new Error('simulated append failure'));
    }
    this.imported.push(...exchanges);
    return Promise.resolve(exchanges.map((exchange, index) => ({
      id: exchange.id,
      seq: index + 1,
    })));
  }

  /** 记录失败回滚 scope 并返回空存储状态。 */
  cleanup(scope: CleanupScope) {
    this.cleaned = scope;
    return Promise.resolve({
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 0,
      blobBytes: 0,
      totalBytes: 0,
      quotaBytes: 0,
    });
  }

  /** 构造包含 pseudo-header、trailer 与双向正文的 Capture detail。 */
  static capturedDetail(): CaptureExchangeDetail {
    return {
      summary: {
        id: 'exchange-1',
        method: 'POST',
        secure: true,
        host: 'api.example.test',
        path: '/v1/items?draft=1',
        protocol: 'h2',
        statusCode: 201,
        responseMime: 'application/json',
        state: 'completed',
        startedAt: Date.parse('2026-07-17T10:00:00.000Z'),
        durationMs: 12,
        requestBytes: 30,
        responseBytes: 16,
      },
      url: 'https://api.example.test/v1/items?draft=1',
      statusText: 'Created',
      requestMime: 'text/html',
      requestHeaders: [
        { name: ':method', value: 'POST', isPseudo: true },
        { name: 'content-type', value: 'text/html' },
        { name: 'authorization', value: 'Bearer secret' },
        { name: 'cookie', value: 'session=secret' },
      ],
      responseHeaders: [
        { name: ':status', value: '201', isPseudo: true },
        { name: 'content-type', value: 'application/json' },
        { name: 'set-cookie', value: 'session=secret' },
      ],
      requestTrailers: [],
      responseTrailers: [{ name: 'grpc-status', value: '0' }],
      requestBody: {
        bodyHash: 'request-hash',
        mediaType: 'text/html',
        encodedSize: 30,
        truncated: false,
        decodeStatus: 'ok',
      },
      responseBody: {
        bodyHash: 'response-hash',
        mediaType: 'application/json',
        encodedSize: 16,
        truncated: false,
        decodeStatus: 'ok',
      },
    };
  }
}

describe('HarService', () => {
  it('exports interoperable HAR 1.2 and imports it as inert capture data', async () => {
    delete (globalThis as { notExecuted?: () => void }).notExecuted;
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-har-'));
    tempDirectories.push(directory);
    const filePath = path.join(directory, 'capture.har');
    const exporter = new HarService(
      new FakeHarStorage([FakeHarStorage.capturedDetail()]),
    );

    const exported = await exporter.exportToFile(
      filePath,
      {
        scope: { kind: 'all' },
        redaction: { authorization: false, cookies: false, bodies: false },
      },
      new AbortController().signal,
    );

    const har = JSON.parse(await readFile(filePath, 'utf8')) as {
      log: { version: string; entries: Array<Record<string, unknown>> };
    };
    expect(exported.processed).toBe(1);
    expect(har.log.version).toBe('1.2');
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0]).toMatchObject({
      startedDateTime: '2026-07-17T10:00:00.000Z',
      time: 12,
      request: {
        method: 'POST',
        url: 'https://api.example.test/v1/items?draft=1',
        httpVersion: 'HTTP/2',
      },
      response: {
        status: 201,
        statusText: 'Created',
        httpVersion: 'HTTP/2',
      },
    });

    const importedStorage = new FakeHarStorage();
    const imported = await new HarService(importedStorage).importFromFile(
      filePath,
      new AbortController().signal,
    );

    expect(imported.processed).toBe(1);
    expect(importedStorage.sessions).toHaveLength(1);
    expect(importedStorage.imported[0]).toMatchObject({
      method: 'POST',
      protocol: 'h2',
      statusCode: 201,
      state: 'completed',
    });
    const requestHash = importedStorage.imported[0]?.requestBody?.blobHash;
    expect(requestHash && importedStorage.bodies.get(requestHash)?.toString()).toBe(
      '<script>notExecuted()</script>',
    );
    expect((globalThis as { notExecuted?: () => void }).notExecuted).toBeUndefined();
  });

  it('redacts sensitive headers and strips bodies before writing HAR', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-har-'));
    tempDirectories.push(directory);
    const filePath = path.join(directory, 'redacted.har');
    const service = new HarService(
      new FakeHarStorage([FakeHarStorage.capturedDetail()]),
    );

    await service.exportToFile(
      filePath,
      {
        scope: { kind: 'all' },
        redaction: { authorization: true, cookies: true, bodies: true },
      },
      new AbortController().signal,
    );

    const text = await readFile(filePath, 'utf8');
    expect(text).not.toContain('Bearer secret');
    expect(text).not.toContain('session=secret');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('{"created":true}');
    expect(text).toContain('[REDACTED]');
  });

  it('rolls back the imported session when persistence fails', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-har-'));
    tempDirectories.push(directory);
    const filePath = path.join(directory, 'capture.har');
    await new HarService(
      new FakeHarStorage([FakeHarStorage.capturedDetail()]),
    ).exportToFile(
      filePath,
      {
        scope: { kind: 'all' },
        redaction: { authorization: false, cookies: false, bodies: false },
      },
      new AbortController().signal,
    );
    const storage = new FakeHarStorage([], true);

    await expect(
      new HarService(storage).importFromFile(
        filePath,
        new AbortController().signal,
      ),
    ).rejects.toThrow('simulated append failure');
    expect(storage.cleaned).toEqual({
      kind: 'session',
      sessionId: storage.sessions[0]?.id,
    });
  });
});