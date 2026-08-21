import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArchiveService } from '../../entry';
import { ZipWriter } from '../../internal/zip-writer';
import type {
  ArchiveSnapshotPage,
} from '../../interfaces';
import { TransferService } from '../../../transfer/entry';
import type {
  CaptureArchiveSnapshot,
  CaptureSnapshotBatch,
  CaptureStatusReport,
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../../capture/interfaces';
import { ExchangeStore } from '../../../capture/internal/exchange-store';
import { CaptureService } from '../../../capture/entry';

vi.mock('../../host/entry', async () => {
  const { SnapshotStore } = await import(
    '../../worker/snapshot-store.js'
  );

  /** 测试内同步使用真实 SQLite 编解码 Store，生产代码仍启动一次性 Worker。 */
  class InProcessWorkerHost {
    /** 当前测试任务模式。 */
    private readonly mode: 'export' | 'import';
    /** 当前测试 snapshot 路径。 */
    private readonly snapshotPath: string;

    /** 保存任务模式与 snapshot 路径。 */
    constructor(mode: 'export' | 'import', snapshotPath: string) {
      this.mode = mode;
      this.snapshotPath = snapshotPath;
    }

    /** 逐批写入真实 SQLite Store。 */
    async writeSnapshot(
      batches: AsyncIterable<CaptureSnapshotBatch>,
      abortSignal: AbortSignal,
    ): Promise<void> {
      const snapshotStore = new SnapshotStore(this.snapshotPath, this.mode);
      try {
        for await (const batch of batches) {
          if (abortSignal.aborted) {
            throw abortSignal.reason;
          }
          snapshotStore.appendBatch(batch);
        }
      } finally {
        snapshotStore.close();
      }
    }

    /** 逐批读取真实 SQLite Store。 */
    async *readSnapshotBatches(
      abortSignal: AbortSignal,
    ): AsyncIterable<ArchiveSnapshotPage> {
      const snapshotStore = new SnapshotStore(this.snapshotPath, this.mode);
      let cursor: string | undefined;
      try {
        do {
          if (abortSignal.aborted) {
            throw abortSignal.reason;
          }
          const page = snapshotStore.readBatch(cursor, 100);
          yield page;
          cursor = page.nextCursor;
          if (!page.hasMore || !cursor) {
            break;
          }
        } while (true);
      } finally {
        snapshotStore.close();
      }
    }

    /** 测试内没有独立线程需要终止。 */
    async close(): Promise<void> {}
  }

  return { WorkerHost: InProcessWorkerHost };
});

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-archive-'));
  tempDirectories.push(directory);
  return directory;
}

const BODY_BYTES = Buffer.from('<script>notExecuted()</script>');
const BODY_HASH = createHash('sha256').update(BODY_BYTES).digest('hex');
const ORIGINAL_BODY_BYTES = Buffer.from('original request body');
const ORIGINAL_BODY_HASH = createHash('sha256').update(ORIGINAL_BODY_BYTES).digest('hex');

/** 建立一个含 pseudo-header、trailer、认证头与正文引用的内存 Capture。 */
function buildSourceCapture(): ExchangeStore {
  const exchangeStore = new ExchangeStore();
  exchangeStore.ensureSession({
    id: 'session-1',
    name: 'source',
    startedAt: 1000,
    captureMode: 'live',
    appVersion: '1.0.0',
  });
  exchangeStore.appendExchanges([
    {
      id: 'ex-1',
      sessionId: 'session-1',
      method: 'POST',
      scheme: 'https',
      host: 'api.test',
      path: '/v1/items',
      url: 'https://api.test/v1/items',
      protocol: 'h2',
      statusCode: 201,
      statusText: 'Created',
      startedAt: 1000,
      completedAt: 1012,
      requestBytes: BODY_BYTES.length,
      responseBytes: 0,
      state: 'completed',
      ruleIds: ['rule-a'],
      headers: [
        { kind: 'request', name: ':method', value: 'POST', isPseudo: true },
        { kind: 'request', name: 'authorization', value: 'Bearer secret' },
        { kind: 'request', name: 'x-rule', value: 'new', ruleEffect: 'set', ruleId: 'rule-a' },
        { kind: 'response', name: 'content-type', value: 'application/json' },
        { kind: 'response-trailer', name: 'grpc-status', value: '0' },
      ],
      requestBody: {
        id: 'body-1',
        blobHash: BODY_HASH,
        encodedSize: BODY_BYTES.length,
        decodedSize: BODY_BYTES.length,
        mediaType: 'text/html',
        truncated: false,
        decodeStatus: 'ok',
      },
      requestBodyEffect: {
        ruleId: 'rule-body',
        effect: 'replace',
        source: 'file',
        originalState: 'available',
        originalBody: {
          id: 'body-original',
          blobHash: ORIGINAL_BODY_HASH,
          encodedSize: ORIGINAL_BODY_BYTES.length,
          mediaType: 'text/plain',
          decodeStatus: 'ok',
        },
      },
    },
  ]);
  return exchangeStore;
}

/** 替身 cleanup 不参与断言，返回一份空用量报表满足签名。 */
const EMPTY_STATUS: CaptureStatusReport = {
  sessionCount: 0,
  exchangeCount: 0,
  bodyCount: 0,
  databaseBytes: 0,
  blobBytes: 0,
  totalBytes: 0,
};

/** 导出侧存储替身：从内存 Capture 生成批次并流式提供引用 Body。 */
class ExportFake extends CaptureService {
  constructor(
    private readonly sourceExchangeStore: ExchangeStore,
    private readonly blobs: Map<string, Buffer>,
  ) {
    super();
  }

  /** 一次捕获内存 Capture 的 Exchange/Body hash 时间切面。 */
  override createArchiveSnapshot(batchSize: number): CaptureArchiveSnapshot {
    const source = this.sourceExchangeStore.createSnapshotSource(batchSize);
    return {
      bodyHashes: source.bodyHashes,
      batches: source.batches,
    };
  }

  override openBlobStream(hash: string): Readable {
    return Readable.from([this.blobs.get(hash)!]);
  }

  override writeBody(): never {
    throw new Error('unused');
  }
  override async ensureSession(): Promise<void> {}
  override async appendExchanges(): Promise<{ id: string; seq: number }[]> {
    return [];
  }
  override async appendWebSocketFrames(): Promise<void> {}
  override async cleanup(): Promise<CaptureStatusReport> {
    return EMPTY_STATUS;
  }
}

/** 导入侧存储替身：记录写入并按内容重算 hash（内容寻址）。 */
class ImportFake extends CaptureService {
  readonly sessions: CaptureSessionInput[] = [];
  readonly imported: ExchangeInput[] = [];
  readonly frames = new Map<string, WebSocketFrameInput[]>();
  readonly blobs = new Map<string, Buffer>();
  cleaned: CleanupScope | null = null;

  constructor(private readonly failAppend = false) {
    super();
  }

  /** 导入侧不产生 Capture 快照。 */
  override createArchiveSnapshot(): CaptureArchiveSnapshot {
    return {
      bodyHashes: [],
      batches: (async function* (): AsyncIterable<CaptureSnapshotBatch> {})(),
    };
  }
  override openBlobStream(): Readable {
    throw new Error('unused');
  }
  override async writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const hash = createHash('sha256').update(buffer).digest('hex');
    this.blobs.set(hash, buffer);
    return { hash, size: buffer.length, deduplicated: false };
  }
  override async ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
  }
  override async appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    if (this.failAppend) {
      throw new Error('simulated append failure');
    }
    this.imported.push(...exchanges);
    return exchanges.map((exchange, index) => ({ id: exchange.id, seq: index }));
  }
  override async appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    this.frames.set(exchangeId, [...frames]);
  }
  override async cleanup(scope: CleanupScope): Promise<CaptureStatusReport> {
    this.cleaned = scope;
    return EMPTY_STATUS;
  }
}

async function exportArchive(exchangeStore: ExchangeStore): Promise<string> {
  const directory = await tempDir();
  const archivePath = path.join(directory, 'capture.iarchive');
  const blobs = new Map<string, Buffer>([
    [BODY_HASH, BODY_BYTES],
    [ORIGINAL_BODY_HASH, ORIGINAL_BODY_BYTES],
  ]);
  const archiveService = new ArchiveService(
    new ExportFake(exchangeStore, blobs),
    new TransferService(),
  );
  const result = await archiveService.exportToFile(
    archivePath,
    new AbortController().signal,
  );
  expect(result.total).toBeGreaterThanOrEqual(1);
  return archivePath;
}

describe('ArchiveService', () => {
  it('round-trips a native archive preserving pseudo-headers, trailers, and bodies', async () => {
    const archivePath = await exportArchive(buildSourceCapture());

    const importFake = new ImportFake();
    const archiveService = new ArchiveService(importFake, new TransferService());
    const result = await archiveService.importFromFile(
      archivePath,
      new AbortController().signal,
    );

    expect(result.processed).toBe(1);
    expect(importFake.sessions).toHaveLength(1);
    expect(importFake.sessions[0]?.captureMode).toBe('archive-import');
    const exchange = importFake.imported[0];
    expect(exchange).toMatchObject({
      method: 'POST',
      protocol: 'h2',
      statusCode: 201,
      statusText: 'Created',
      state: 'completed',
      ruleIds: ['rule-a'],
    });
    const headerNames = exchange?.headers?.map((header) => `${header.kind}:${header.name}`);
    expect(headerNames).toContain('request::method');
    expect(headerNames).toContain('request:authorization');
    expect(headerNames).toContain('response-trailer:grpc-status');
    const pseudo = exchange?.headers?.find((header) => header.name === ':method');
    expect(pseudo?.isPseudo).toBe(true);
    expect(
      exchange?.headers?.find((header) => header.name === 'x-rule')?.ruleEffect,
    ).toBe('set');
    expect(
      exchange?.headers?.find((header) => header.name === 'x-rule')?.ruleId,
    ).toBe('rule-a');
    expect(exchange?.requestBody?.blobHash).toBe(BODY_HASH);
    expect(importFake.blobs.get(BODY_HASH)?.equals(BODY_BYTES)).toBe(true);
    expect(exchange?.requestBodyEffect).toMatchObject({
      ruleId: 'rule-body',
      effect: 'replace',
      source: 'file',
      originalState: 'available',
      originalBody: {
        blobHash: ORIGINAL_BODY_HASH,
        encodedSize: ORIGINAL_BODY_BYTES.length,
      },
    });
    expect(importFake.blobs.get(ORIGINAL_BODY_HASH)?.equals(ORIGINAL_BODY_BYTES)).toBe(true);
  });

  it('rolls back the imported session when persistence fails', async () => {
    const archivePath = await exportArchive(buildSourceCapture());
    const importFake = new ImportFake(true);
    const archiveService = new ArchiveService(importFake, new TransferService());

    await expect(
      archiveService.importFromFile(archivePath, new AbortController().signal),
    ).rejects.toThrow('simulated append failure');
    expect(importFake.cleaned).toMatchObject({ kind: 'session' });
  });

  it('rejects an archive missing its manifest', async () => {
    const directory = await tempDir();
    const archivePath = path.join(directory, 'no-manifest.iarchive');
    const handle = await open(archivePath, 'wx+');
    const zipWriter = new ZipWriter(handle);
    await zipWriter.addStream('capture.sqlite', (async function* () {
      yield Buffer.from('not a real database');
    })());
    await zipWriter.finalize();
    await handle.close();

    await expect(
      new ArchiveService(new ImportFake(), new TransferService()).importFromFile(
        archivePath,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/missing its manifest/);
  });

  it('rejects a manifest with unexpected fields', async () => {
    const directory = await tempDir();
    const archivePath = path.join(directory, 'future.iarchive');
    const handle = await open(archivePath, 'wx+');
    const zipWriter = new ZipWriter(handle);
    const manifest = Buffer.from(
      JSON.stringify({
        format: 'interceptor-capture-archive',
        appVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        files: [],
        unexpected: true,
      }),
    );
    await zipWriter.addStream('manifest.json', (async function* () {
      yield manifest;
    })());
    await zipWriter.addStream('capture.sqlite', (async function* () {
      yield Buffer.from('db');
    })());
    await zipWriter.finalize();
    await handle.close();

    await expect(
      new ArchiveService(new ImportFake(), new TransferService()).importFromFile(
        archivePath,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/unexpected fields/);
  });

  it('generates unique job identifiers', () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});
