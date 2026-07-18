import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArchiveService } from '../entry';
import { ArchiveZipWriter } from '../archive-zip-writer';
import type {
  ArchiveSnapshotPage,
  ArchiveStorage,
} from '../interfaces';
import { TransferJobManager } from '../../transfer/entry';
import type {
  CaptureArchiveSnapshot,
  CaptureSnapshotBatch,
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';
import { TemporaryCaptureStore } from '../../storage/storage-temporary-capture-store';

vi.mock('../host/entry', async () => {
  const { ArchiveSnapshotStore } = await import(
    '../worker/worker-snapshot-store.js'
  );

  /** 测试内同步使用真实 SQLite 编解码 Store，生产代码仍启动一次性 Worker。 */
  class InProcessArchiveWorkerHost {
    /** 当前测试任务模式。 */
    private readonly mode: 'export' | 'import';
    /** 当前测试 snapshot 路径。 */
    private readonly snapshotPath: string;

    /** 保存任务模式与 snapshot 路径。 */
    constructor(mode: 'export' | 'import', snapshotPath: string) {
      this.mode = mode;
      this.snapshotPath = snapshotPath;
    }

    /** 逐批写入真实兼容 SQLite Store。 */
    async writeSnapshot(
      batches: AsyncIterable<CaptureSnapshotBatch>,
      signal: AbortSignal,
    ): Promise<void> {
      const store = new ArchiveSnapshotStore(this.snapshotPath, this.mode);
      try {
        for await (const batch of batches) {
          if (signal.aborted) {
            throw signal.reason;
          }
          store.appendBatch(batch);
        }
      } finally {
        store.close();
      }
    }

    /** 逐批读取真实兼容 SQLite Store。 */
    async *readSnapshotBatches(
      signal: AbortSignal,
    ): AsyncIterable<ArchiveSnapshotPage> {
      const store = new ArchiveSnapshotStore(this.snapshotPath, this.mode);
      let cursor: string | undefined;
      try {
        do {
          if (signal.aborted) {
            throw signal.reason;
          }
          const page = store.readBatch(cursor, 100);
          yield page;
          cursor = page.nextCursor;
          if (!page.hasMore || !cursor) {
            break;
          }
        } while (true);
      } finally {
        store.close();
      }
    }

    /** 测试内没有独立线程需要终止。 */
    async close(): Promise<void> {}
  }

  return { ArchiveWorkerHost: InProcessArchiveWorkerHost };
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

/** 建立一个含 pseudo-header、trailer、认证头与正文引用的内存 Capture。 */
function buildSourceCapture(): TemporaryCaptureStore {
  const store = new TemporaryCaptureStore();
  store.ensureSession({
    id: 'session-1',
    name: 'source',
    startedAt: 1000,
    captureMode: 'live',
    appVersion: '1.0.0',
  });
  store.appendExchanges([
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
      headers: [
        { kind: 'request', name: ':method', value: 'POST', isPseudo: true },
        { kind: 'request', name: 'authorization', value: 'Bearer secret' },
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
    },
  ]);
  return store;
}

/** 导出侧存储替身：从内存 Capture 生成批次并流式提供引用 Body。 */
class ExportFake implements ArchiveStorage {
  constructor(
    private readonly capture: TemporaryCaptureStore,
    private readonly blobs: Map<string, Buffer>,
  ) {}

  /** 一次捕获内存 Capture 的 Exchange/Body hash 时间切面。 */
  createArchiveSnapshot(batchSize: number): CaptureArchiveSnapshot {
    const source = this.capture.createSnapshotSource(batchSize);
    return {
      bodyHashes: source.bodyHashes,
      batches: source.batches,
    };
  }

  openBlobStream(hash: string): AsyncIterable<Uint8Array> {
    return Readable.from([this.blobs.get(hash)!]);
  }

  writeBody(): never {
    throw new Error('unused');
  }
  async ensureSession(): Promise<void> {}
  async appendExchanges(): Promise<{ id: string; seq: number }[]> {
    return [];
  }
  async appendWebSocketFrames(): Promise<void> {}
  async cleanup(): Promise<unknown> {
    return undefined;
  }
}

/** 导入侧存储替身：记录写入并按内容重算 hash（内容寻址）。 */
class ImportFake implements ArchiveStorage {
  readonly sessions: CaptureSessionInput[] = [];
  readonly imported: ExchangeInput[] = [];
  readonly frames = new Map<string, WebSocketFrameInput[]>();
  readonly blobs = new Map<string, Buffer>();
  cleaned: CleanupScope | null = null;

  constructor(private readonly failAppend = false) {}

  /** 导入侧不产生 Capture 快照。 */
  createArchiveSnapshot(): CaptureArchiveSnapshot {
    return {
      bodyHashes: [],
      batches: (async function* (): AsyncIterable<CaptureSnapshotBatch> {})(),
    };
  }
  openBlobStream(): AsyncIterable<Uint8Array> {
    throw new Error('unused');
  }
  async writeBody(
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
  async ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
  }
  async appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    if (this.failAppend) {
      throw new Error('simulated append failure');
    }
    this.imported.push(...exchanges);
    return exchanges.map((exchange, index) => ({ id: exchange.id, seq: index }));
  }
  async appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    this.frames.set(exchangeId, [...frames]);
  }
  async cleanup(scope: CleanupScope): Promise<unknown> {
    this.cleaned = scope;
    return undefined;
  }
}

async function exportArchive(capture: TemporaryCaptureStore): Promise<string> {
  const directory = await tempDir();
  const archivePath = path.join(directory, 'capture.iarchive');
  const blobs = new Map<string, Buffer>([[BODY_HASH, BODY_BYTES]]);
  const service = new ArchiveService(
    new ExportFake(capture, blobs),
    new TransferJobManager(),
  );
  const result = await service.exportToFile(
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
    const importer = new ArchiveService(importFake, new TransferJobManager());
    const result = await importer.importFromFile(
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
    });
    const headerNames = exchange?.headers?.map((header) => `${header.kind}:${header.name}`);
    expect(headerNames).toContain('request::method');
    expect(headerNames).toContain('request:authorization');
    expect(headerNames).toContain('response-trailer:grpc-status');
    const pseudo = exchange?.headers?.find((header) => header.name === ':method');
    expect(pseudo?.isPseudo).toBe(true);
    expect(exchange?.requestBody?.blobHash).toBe(BODY_HASH);
    expect(importFake.blobs.get(BODY_HASH)?.equals(BODY_BYTES)).toBe(true);
  });

  it('rolls back the imported session when persistence fails', async () => {
    const archivePath = await exportArchive(buildSourceCapture());
    const importFake = new ImportFake(true);
    const importer = new ArchiveService(importFake, new TransferJobManager());

    await expect(
      importer.importFromFile(archivePath, new AbortController().signal),
    ).rejects.toThrow('simulated append failure');
    expect(importFake.cleaned).toMatchObject({ kind: 'session' });
  });

  it('rejects an archive missing its manifest', async () => {
    const directory = await tempDir();
    const archivePath = path.join(directory, 'no-manifest.iarchive');
    const handle = await open(archivePath, 'wx+');
    const writer = new ArchiveZipWriter(handle);
    await writer.addStream('capture.sqlite', (async function* () {
      yield Buffer.from('not a real database');
    })());
    await writer.finalize();
    await handle.close();

    await expect(
      new ArchiveService(new ImportFake(), new TransferJobManager()).importFromFile(
        archivePath,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/missing its manifest/);
  });

  it('rejects an archive from an unsupported version', async () => {
    const directory = await tempDir();
    const archivePath = path.join(directory, 'future.iarchive');
    const handle = await open(archivePath, 'wx+');
    const writer = new ArchiveZipWriter(handle);
    const manifest = Buffer.from(
      JSON.stringify({
        format: 'interceptor-capture-archive',
        archiveVersion: 999,
        schemaVersion: 2,
        appVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        files: [],
      }),
    );
    await writer.addStream('manifest.json', (async function* () {
      yield manifest;
    })());
    await writer.addStream('capture.sqlite', (async function* () {
      yield Buffer.from('db');
    })());
    await writer.finalize();
    await handle.close();

    await expect(
      new ArchiveService(new ImportFake(), new TransferJobManager()).importFromFile(
        archivePath,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/Unsupported archive version/);
  });

  it('generates unique job identifiers', () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});
