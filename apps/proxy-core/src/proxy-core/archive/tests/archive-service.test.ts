import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadStream } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { ArchiveService } from '../entry';
import { ArchiveZipWriter } from '../archive-zip-writer';
import type { ArchiveStorage } from '../interfaces';
import { TransferJobManager } from '../../transfer/entry';
import { openCaptureDatabase } from '../../storage/utils';
import { CaptureStore } from '../../storage/worker/worker-store';
import type {
  CaptureSessionInput,
  CleanupScope,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';

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

/** 建立一个含 pseudo-header、trailer、认证头与正文引用的真实源 capture.sqlite。 */
async function buildSourceDatabase(): Promise<string> {
  const directory = await tempDir();
  const dbPath = path.join(directory, 'capture.sqlite');
  const { db } = openCaptureDatabase(dbPath);
  const store = new CaptureStore(db);
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
  db.close();
  return dbPath;
}

/** 导出侧存储替身：从真实源库生成快照并流式提供引用 Blob。 */
class ExportFake implements ArchiveStorage {
  constructor(
    private readonly sourceDbPath: string,
    private readonly blobs: Map<string, Buffer>,
  ) {}

  async snapshot(targetPath: string): Promise<void> {
    const { db } = openCaptureDatabase(this.sourceDbPath);
    new CaptureStore(db).snapshotInto(targetPath);
    db.close();
  }

  async referencedBlobHashes(): Promise<string[]> {
    const { db } = openCaptureDatabase(this.sourceDbPath);
    const hashes = new CaptureStore(db).referencedBlobHashes();
    db.close();
    return hashes;
  }

  openBlobStream(hash: string): ReadStream {
    return Readable.from([this.blobs.get(hash)!]) as unknown as ReadStream;
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

  async snapshot(): Promise<void> {}
  async referencedBlobHashes(): Promise<string[]> {
    return [];
  }
  openBlobStream(): ReadStream {
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

async function exportArchive(sourceDbPath: string): Promise<string> {
  const directory = await tempDir();
  const archivePath = path.join(directory, 'capture.iarchive');
  const blobs = new Map<string, Buffer>([[BODY_HASH, BODY_BYTES]]);
  const service = new ArchiveService(
    new ExportFake(sourceDbPath, blobs),
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
    const sourceDbPath = await buildSourceDatabase();
    const archivePath = await exportArchive(sourceDbPath);

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
    const sourceDbPath = await buildSourceDatabase();
    const archivePath = await exportArchive(sourceDbPath);
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
