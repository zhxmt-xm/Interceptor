import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  CaptureExchangeDetail,
  TransferJobSnapshot,
} from '@interceptor/core-protocol';

import { appVersion } from '../constants';
import { openCaptureDatabase } from '../storage/utils';
import { CaptureStore } from '../storage/worker/worker-store';
import { CAPTURE_SCHEMA_VERSION } from '../storage/worker/worker-schema';
import type {
  BodyRefInput,
  ExchangeInput,
  ExchangeState,
  HeaderInput,
  WebSocketFrameInput,
} from '../storage/interfaces';
import { TransferJobManager } from '../transfer/entry';
import {
  ARCHIVE_EXTENSION,
  ARCHIVE_IMPORT_BATCH_SIZE,
  ARCHIVE_WS_FRAME_PAGE_SIZE,
  BLOB_ENTRY_PREFIX,
  MANIFEST_ENTRY_NAME,
  MAX_ARCHIVE_BYTES,
  SNAPSHOT_ENTRY_NAME,
} from './archive-constants';
import { ArchiveInvalidError } from './archive-invalid-error';
import { ArchiveZipReader } from './archive-zip-reader';
import { ArchiveZipWriter } from './archive-zip-writer';
import type {
  ArchiveManifest,
  ArchiveManifestFile,
  ArchiveProgressListener,
  ArchiveStorage,
  ArchiveTransferResult,
  ValidatedZipEntry,
} from './interfaces';
import * as ArchiveUtils from './utils';

const EXCHANGE_STATES: readonly ExchangeState[] = [
  'pending',
  'request-complete',
  'completed',
  'failed',
  'aborted',
];

export class ArchiveService {
  /** archive 转换所需的 Storage 门面。 */
  private readonly storage: ArchiveStorage;
  /** 与 HAR 共用的异步文件任务管理器。 */
  private readonly jobs: TransferJobManager;

  /** 绑定 Core 内存储门面与共享任务管理器；文件系统与正文始终留在 Core。 */
  constructor(storage: ArchiveStorage, jobs: TransferJobManager) {
    this.storage = storage;
    this.jobs = jobs;
  }

  /** 启动原生 archive 导出任务并立即返回 running 快照。 */
  startExport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.jobs.start(
      jobId,
      'archive-export',
      filePath,
      (signal, onProgress) => this.exportToFile(filePath, signal, onProgress),
    );
  }

  /** 启动原生 archive 导入任务并立即返回 running 快照。 */
  startImport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.jobs.start(
      jobId,
      'archive-import',
      filePath,
      (signal, onProgress) => this.importFromFile(filePath, signal, onProgress),
    );
  }

  /**
   * 把整个 Capture 库原子导出为版本化 ZIP archive：一致 SQLite 快照 + 引用 Blob + manifest。
   * 快照经 VACUUM INTO 生成，Blob 逐个流式写入，manifest 最后写并列出全部文件的 size/sha256。
   */
  async exportToFile(
    filePath: string,
    signal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<ArchiveTransferResult> {
    ArchiveUtils.assertTransferPath(filePath, ARCHIVE_EXTENSION);
    const token = randomUUID();
    const snapshotPath = `${filePath}.${token}.snapshot`;
    const zipPath = `${filePath}.${token}.tmp`;
    const hashes = await this.storage.referencedBlobHashes();
    const total = hashes.length + 1;
    let processed = 0;
    let handle: FileHandle | undefined;

    try {
      ArchiveUtils.throwIfAborted(signal);
      await this.storage.snapshot(snapshotPath);
      handle = await open(zipPath, 'wx+');
      const writer = new ArchiveZipWriter(handle);
      const files: ArchiveManifestFile[] = [];

      files.push(
        await this.addFileEntry(writer, SNAPSHOT_ENTRY_NAME, () =>
          createReadStream(snapshotPath)),
      );
      processed += 1;
      onProgress?.({ processed, total });

      for (const hash of hashes) {
        ArchiveUtils.throwIfAborted(signal);
        files.push(
          await this.addFileEntry(writer, `${BLOB_ENTRY_PREFIX}${hash}`, () =>
            this.storage.openBlobStream(hash)),
        );
        processed += 1;
        onProgress?.({ processed, total });
      }

      const manifest = ArchiveUtils.buildManifest(
        CAPTURE_SCHEMA_VERSION,
        appVersion,
        files,
      );
      await writer.addStream(
        MANIFEST_ENTRY_NAME,
        ArchiveUtils.singleChunk(Buffer.from(JSON.stringify(manifest), 'utf8')),
      );
      await writer.finalize();
      await handle.close();
      handle = undefined;
      await rm(filePath, { force: true });
      await rename(zipPath, filePath);
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await rm(zipPath, { force: true });
      throw error;
    } finally {
      await rm(snapshotPath, { force: true });
    }

    return { processed, total, warnings: [] };
  }

  /**
   * 校验并导入版本化 ZIP archive；解压前完成全部安全校验，失败或取消回滚隔离 Session。
   */
  async importFromFile(
    filePath: string,
    signal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<ArchiveTransferResult> {
    ArchiveUtils.assertTransferPath(filePath, ARCHIVE_EXTENSION);
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new ArchiveInvalidError('Archive source must be a regular file.');
    }
    if (stats.size > MAX_ARCHIVE_BYTES) {
      throw new ArchiveInvalidError('Archive file exceeds the size limit.');
    }

    const extractDir = await mkdtemp(path.join(tmpdir(), 'interceptor-archive-'));
    const readHandle = await open(filePath, 'r');
    const sessionId = `archive-${randomUUID()}`;
    let sessionCreated = false;

    try {
      const reader = new ArchiveZipReader(readHandle, stats.size);
      await reader.open();
      const entries = reader.validate();
      const manifest = await this.extractManifest(reader, entries, extractDir);
      this.assertManifestConsistency(manifest, entries);
      await this.extractAndVerify(reader, entries, manifest, extractDir, signal);

      const snapshotPath = path.join(extractDir, SNAPSHOT_ENTRY_NAME);
      await this.importBlobs(manifest, extractDir, signal);

      await this.storage.ensureSession({
        id: sessionId,
        name: `Imported archive - ${path.basename(filePath)}`,
        startedAt: Date.now(),
        captureMode: 'archive-import',
        appVersion,
      });
      sessionCreated = true;
      const result = await this.importSnapshot(
        snapshotPath,
        sessionId,
        signal,
        onProgress,
      );
      return { processed: result.processed, total: result.total, warnings: [] };
    } catch (error) {
      if (sessionCreated) {
        await this.storage
          .cleanup({ kind: 'session', sessionId })
          .catch(() => undefined);
      }
      throw error;
    } finally {
      await readHandle.close().catch(() => undefined);
      await rm(extractDir, { recursive: true, force: true });
    }
  }

  /** 流式写入一个 ZIP 条目并同时算出 manifest 需要的 size/sha256。 */
  private async addFileEntry(
    writer: ArchiveZipWriter,
    name: string,
    openSource: () => AsyncIterable<Uint8Array>,
  ): Promise<ArchiveManifestFile> {
    const hash = createHash('sha256');
    let size = 0;
    const source = (async function* (): AsyncGenerator<Uint8Array> {
      for await (const chunk of openSource()) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        size += buffer.length;
        yield buffer;
      }
    })();
    await writer.addStream(name, source);
    return { path: name, size, sha256: hash.digest('hex') };
  }

  /** 提取并解析 manifest；拒绝缺失、未知格式或不支持版本。 */
  private async extractManifest(
    reader: ArchiveZipReader,
    entries: readonly ValidatedZipEntry[],
    extractDir: string,
  ): Promise<ArchiveManifest> {
    const manifestEntry = entries.find(
      (entry) => entry.safeName === MANIFEST_ENTRY_NAME,
    );
    if (!manifestEntry) {
      throw new ArchiveInvalidError('Archive is missing its manifest.');
    }
    const manifestPath = path.join(extractDir, MANIFEST_ENTRY_NAME);
    await reader.extractEntry(manifestEntry, manifestPath);
    const manifest = ArchiveUtils.parseManifest(await readFile(manifestPath));
    if (manifest.schemaVersion > CAPTURE_SCHEMA_VERSION) {
      throw new ArchiveInvalidError(
        'Archive was created by a newer, unsupported version.',
      );
    }
    if (!manifest.files.some((file) => file.path === SNAPSHOT_ENTRY_NAME)) {
      throw new ArchiveInvalidError('Archive manifest omits the database snapshot.');
    }
    return manifest;
  }

  /** 交叉校验 manifest 与 central directory 条目一一对应且大小一致。 */
  private assertManifestConsistency(
    manifest: ArchiveManifest,
    entries: readonly ValidatedZipEntry[],
  ): void {
    const zipByName = new Map(entries.map((entry) => [entry.safeName, entry]));
    const manifestNames = new Set<string>();
    for (const file of manifest.files) {
      manifestNames.add(file.path);
      const entry = zipByName.get(file.path);
      if (!entry) {
        throw new ArchiveInvalidError('Archive manifest references a missing entry.');
      }
      if (entry.uncompressedSize !== file.size) {
        throw new ArchiveInvalidError('Archive manifest size does not match its entry.');
      }
    }
    for (const entry of entries) {
      if (entry.safeName !== MANIFEST_ENTRY_NAME && !manifestNames.has(entry.safeName)) {
        throw new ArchiveInvalidError('Archive contains an entry absent from the manifest.');
      }
    }
  }

  /** 提取快照与全部 Blob 并逐文件校验 sha256/size 与 manifest 一致。 */
  private async extractAndVerify(
    reader: ArchiveZipReader,
    entries: readonly ValidatedZipEntry[],
    manifest: ArchiveManifest,
    extractDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    const zipByName = new Map(entries.map((entry) => [entry.safeName, entry]));
    await mkdir(path.join(extractDir, 'blobs'), { recursive: true });
    for (const file of manifest.files) {
      ArchiveUtils.throwIfAborted(signal);
      if (file.path === MANIFEST_ENTRY_NAME) {
        continue;
      }
      const entry = zipByName.get(file.path);
      if (!entry) {
        throw new ArchiveInvalidError('Archive manifest references a missing entry.');
      }
      const destination = path.join(extractDir, file.path);
      await reader.extractEntry(entry, destination);
      const digest = await this.hashFile(destination);
      if (digest.size !== file.size || digest.hash !== file.sha256) {
        throw new ArchiveInvalidError('Archive file failed manifest verification.');
      }
    }
  }

  /** 把已校验的 Blob 导入内容寻址 Store，并确认内容与其声明 hash 一致。 */
  private async importBlobs(
    manifest: ArchiveManifest,
    extractDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    for (const file of manifest.files) {
      if (!file.path.startsWith(BLOB_ENTRY_PREFIX)) {
        continue;
      }
      ArchiveUtils.throwIfAborted(signal);
      const expectedHash = file.path.slice(BLOB_ENTRY_PREFIX.length);
      const stored = await this.storage.writeBody(
        createReadStream(path.join(extractDir, file.path)),
      );
      if (stored.hash !== expectedHash) {
        throw new ArchiveInvalidError('Archive blob content does not match its hash.');
      }
    }
  }

  /** 打开快照库、做完整性检查并把其 Exchange 重插入隔离 Session。 */
  private async importSnapshot(
    snapshotPath: string,
    sessionId: string,
    signal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<{ processed: number; total: number }> {
    const { db } = openCaptureDatabase(snapshotPath);
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all() as {
        integrity_check?: string;
      }[];
      if (integrity[0]?.integrity_check !== 'ok') {
        throw new ArchiveInvalidError('Archive database failed its integrity check.');
      }
      const store = new CaptureStore(db);
      const exchangeIds = this.listSnapshotExchangeIds(store);
      let processed = 0;
      const total = exchangeIds.length;

      for (let offset = 0; offset < exchangeIds.length; offset += ARCHIVE_IMPORT_BATCH_SIZE) {
        ArchiveUtils.throwIfAborted(signal);
        const batchIds = exchangeIds.slice(offset, offset + ARCHIVE_IMPORT_BATCH_SIZE);
        const exchanges: ExchangeInput[] = [];
        const wsSources: { newId: string; oldId: string; protocol: string }[] = [];
        for (const oldId of batchIds) {
          const detail = store.getExchangeDetail(oldId);
          if (!detail) {
            continue;
          }
          const newId = `archive-exchange-${randomUUID()}`;
          exchanges.push(this.toExchange(detail, newId, sessionId));
          wsSources.push({ newId, oldId, protocol: detail.summary.protocol });
        }
        await this.storage.appendExchanges(exchanges);
        for (const source of wsSources) {
          if (source.protocol === 'ws') {
            await this.importWebSocketFrames(store, source.oldId, source.newId);
          }
        }
        processed += exchanges.length;
        onProgress?.({ processed, total });
      }
      return { processed, total };
    } finally {
      db.close();
    }
  }

  /** 枚举快照中全部 Exchange ID（按开始时间升序）。 */
  private listSnapshotExchangeIds(store: CaptureStore): string[] {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = store.querySessions({
        cursor,
        limit: ARCHIVE_WS_FRAME_PAGE_SIZE,
        sort: 'started_asc',
        filter: {},
      });
      ids.push(...page.items.map((item) => item.id));
      if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) {
        break;
      }
      cursor = page.nextCursor;
    } while (true);
    return ids;
  }

  /** 从快照读取一条 Exchange 的 WebSocket 帧并重插入到新 Exchange。 */
  private async importWebSocketFrames(
    store: CaptureStore,
    oldExchangeId: string,
    newExchangeId: string,
  ): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = store.queryWebSocketFrames({
        exchangeId: oldExchangeId,
        cursor,
        limit: ARCHIVE_WS_FRAME_PAGE_SIZE,
      });
      const frames: WebSocketFrameInput[] = page.items.map((item) => ({
        direction: item.direction,
        opcode: item.opcode,
        payloadSize: item.payloadSize,
        timestamp: item.timestamp,
        ...(item.payload?.bodyHash
          ? {
              payload: {
                id: `archive-ws-${randomUUID()}`,
                blobHash: item.payload.bodyHash,
                encodedSize: item.payload.encodedSize,
                decodedSize: item.payload.decodedSize,
                contentEncoding: item.payload.contentEncoding,
                mediaType: item.payload.mediaType,
                truncated: item.payload.truncated,
                decodeStatus: item.payload.decodeStatus as BodyRefInput['decodeStatus'],
              },
            }
          : {}),
      }));
      if (frames.length > 0) {
        await this.storage.appendWebSocketFrames(newExchangeId, frames);
      }
      if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) {
        break;
      }
      cursor = page.nextCursor;
    } while (true);
  }

  /** 把快照 Exchange 详情映射成可持久化的 ExchangeInput（保留 pseudo/trailer/正文引用）。 */
  private toExchange(
    detail: CaptureExchangeDetail,
    newId: string,
    sessionId: string,
  ): ExchangeInput {
    const headers: HeaderInput[] = [
      ...detail.requestHeaders.map((header) => ({
        kind: 'request' as const,
        name: header.name,
        value: header.value,
        isPseudo: header.isPseudo,
      })),
      ...detail.responseHeaders.map((header) => ({
        kind: 'response' as const,
        name: header.name,
        value: header.value,
        isPseudo: header.isPseudo,
      })),
      ...detail.requestTrailers.map((header) => ({
        kind: 'request-trailer' as const,
        name: header.name,
        value: header.value,
      })),
      ...detail.responseTrailers.map((header) => ({
        kind: 'response-trailer' as const,
        name: header.name,
        value: header.value,
      })),
    ];
    const startedAt = detail.summary.startedAt;
    return {
      id: newId,
      sessionId,
      streamId: detail.streamId,
      method: detail.summary.method,
      scheme: detail.scheme,
      host: detail.summary.host,
      port: detail.port,
      path: detail.summary.path,
      url: detail.url,
      protocol: detail.summary.protocol,
      statusCode: detail.summary.statusCode,
      statusText: detail.statusText,
      requestMime: detail.requestMime,
      responseMime: detail.summary.responseMime,
      startedAt,
      completedAt:
        detail.summary.durationMs !== undefined
          ? startedAt + detail.summary.durationMs
          : undefined,
      requestBytes: detail.summary.requestBytes,
      responseBytes: detail.summary.responseBytes,
      state: this.toExchangeState(detail.summary.state),
      errorCode: detail.errorCode,
      headers,
      requestBody: this.toBodyRef(detail.requestBody),
      responseBody: this.toBodyRef(detail.responseBody),
    };
  }

  /** 把快照正文引用映射成新的 body_ref 输入（Blob 已在 importBlobs 导入）。 */
  private toBodyRef(
    body: CaptureExchangeDetail['requestBody'],
  ): BodyRefInput | undefined {
    if (!body?.bodyHash) {
      return undefined;
    }
    return {
      id: `archive-body-${randomUUID()}`,
      blobHash: body.bodyHash,
      encodedSize: body.encodedSize,
      decodedSize: body.decodedSize,
      contentEncoding: body.contentEncoding,
      mediaType: body.mediaType,
      truncated: body.truncated,
      decodeStatus: body.decodeStatus as BodyRefInput['decodeStatus'],
    };
  }

  /** 把快照中的 state 字符串收敛为已知 ExchangeState。 */
  private toExchangeState(value: string): ExchangeState {
    return EXCHANGE_STATES.includes(value as ExchangeState)
      ? (value as ExchangeState)
      : 'completed';
  }

  /** 流式计算一个文件的 sha256 与字节数。 */
  private async hashFile(filePath: string): Promise<{ hash: string; size: number }> {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of createReadStream(filePath)) {
      const buffer = chunk as Buffer;
      hash.update(buffer);
      size += buffer.length;
    }
    return { hash: hash.digest('hex'), size };
  }
}
