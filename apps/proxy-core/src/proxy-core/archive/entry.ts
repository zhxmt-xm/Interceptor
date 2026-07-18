import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  TransferJobSnapshot,
} from '@interceptor/core-protocol';

import { appVersion } from '../constants';
import type {
  BodyRefInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../storage/interfaces';
import { TransferJobManager } from '../transfer/entry';
import {
  ARCHIVE_EXTENSION,
  ARCHIVE_IMPORT_BATCH_SIZE,
  ARCHIVE_WORKER_BATCH_SIZE,
  BLOB_ENTRY_PREFIX,
  MANIFEST_ENTRY_NAME,
  MAX_ARCHIVE_BYTES,
  SNAPSHOT_ENTRY_NAME,
} from './archive-constants';
import { ArchiveInvalidError } from './archive-invalid-error';
import { ARCHIVE_CAPTURE_SCHEMA_VERSION } from './archive-snapshot-schema';
import { ArchiveWorkerHost } from './host/entry';
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
  * 把当前 Capture 时间切面导出为版本化 ZIP archive：一次性 Worker 生成兼容 SQLite
  * snapshot，Body 逐个流式写入，manifest 最后列出全部文件的 size/sha256。
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
    const snapshot = this.storage.createArchiveSnapshot(
      ARCHIVE_WORKER_BATCH_SIZE,
    );
    const total = snapshot.bodyHashes.length + 1;
    let processed = 0;
    let handle: FileHandle | undefined;

    try {
      ArchiveUtils.throwIfAborted(signal);
      const worker = new ArchiveWorkerHost('export', snapshotPath);
      await worker.writeSnapshot(
        snapshot.batches,
        signal,
      );
      handle = await open(zipPath, 'wx+');
      const writer = new ArchiveZipWriter(handle);
      const files: ArchiveManifestFile[] = [];

      files.push(
        await this.addFileEntry(writer, SNAPSHOT_ENTRY_NAME, () =>
          createReadStream(snapshotPath)),
      );
      processed += 1;
      onProgress?.({ processed, total });

      for (const hash of snapshot.bodyHashes) {
        ArchiveUtils.throwIfAborted(signal);
        files.push(
          await this.addFileEntry(writer, `${BLOB_ENTRY_PREFIX}${hash}`, () =>
            this.storage.openBlobStream(hash)),
        );
        processed += 1;
        onProgress?.({ processed, total });
      }

      const manifest = ArchiveUtils.buildManifest(
        ARCHIVE_CAPTURE_SCHEMA_VERSION,
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
      snapshot.release();
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
      await this.storage
        .cleanup({ kind: 'session', sessionId })
        .catch(() => undefined);
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
    if (manifest.schemaVersion > ARCHIVE_CAPTURE_SCHEMA_VERSION) {
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

  /** 通过一次性 Worker 分批读取快照并把 Exchange 重插入隔离 Session。 */
  private async importSnapshot(
    snapshotPath: string,
    sessionId: string,
    signal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<{ processed: number; total: number }> {
    const worker = new ArchiveWorkerHost('import', snapshotPath);
    let processed = 0;
    let total = 0;
    try {
      for await (const page of worker.readSnapshotBatches(signal)) {
        ArchiveUtils.throwIfAborted(signal);
        const exchanges: ExchangeInput[] = [];
        const framesByExchange = new Map<string, readonly WebSocketFrameInput[]>();
        total = page.total;
        for (const snapshot of page.exchanges) {
          const newId = `archive-exchange-${randomUUID()}`;
          exchanges.push(this.remapSnapshotExchange(snapshot.exchange, newId, sessionId));
          framesByExchange.set(newId, snapshot.frames);
        }
        await this.storage.appendExchanges(exchanges);
        for (const exchange of exchanges) {
          const frames = framesByExchange.get(exchange.id) ?? [];
          if (frames.length > 0) {
            await this.storage.appendWebSocketFrames(
              exchange.id,
              frames.map((frame) => this.remapFrame(frame)),
            );
          }
        }
        processed += exchanges.length;
        onProgress?.({ processed, total });
      }
      return { processed, total };
    } catch (error) {
      await worker.close();
      throw error;
    }
  }

  /** 把 archive snapshot Exchange 改写到本次隔离 Session，并为 body ref 分配新 id。 */
  private remapSnapshotExchange(
    exchange: ExchangeInput,
    id: string,
    sessionId: string,
  ): ExchangeInput {
    return {
      ...exchange,
      id,
      sessionId,
      headers: exchange.headers?.map((header) => ({ ...header })),
      requestBody: this.remapBodyRef(exchange.requestBody),
      responseBody: this.remapBodyRef(exchange.responseBody),
      requestBodyId: undefined,
      responseBodyId: undefined,
    };
  }

  /** 为导入的 WebSocket frame 与 payload 分配当前 Session 内的新 body id。 */
  private remapFrame(frame: WebSocketFrameInput): WebSocketFrameInput {
    return {
      direction: frame.direction,
      opcode: frame.opcode,
      payloadSize: frame.payloadSize,
      timestamp: frame.timestamp,
      payload: this.remapBodyRef(frame.payload),
    };
  }

  /** 保留 body hash/metadata，但替换 archive 内部 body id。 */
  private remapBodyRef(body: BodyRefInput | undefined): BodyRefInput | undefined {
    return body
      ? { ...body, id: `archive-body-${randomUUID()}` }
      : undefined;
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
