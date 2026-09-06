import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addAbortSignal, type Readable } from 'node:stream';

import type {
  TransferJobSnapshot,
} from '@interceptor/core-protocol';

import { appVersion } from '../constants';
import type { CaptureService } from '../capture/entry';
import type {
  BodyRefInput,
  BodyRuleEffectInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../capture/interfaces';
import { TransferService } from '../transfer/entry';
import {
  ARCHIVE_EXTENSION,
  ARCHIVE_IMPORT_BATCH_SIZE,
  ARCHIVE_WORKER_BATCH_SIZE,
  BLOB_ENTRY_PREFIX,
  MANIFEST_ENTRY_NAME,
  SNAPSHOT_ENTRY_NAME,
} from './internal/constants';
import { InvalidArchiveError } from './internal/errors';
import { WorkerHost } from './host/entry';
import { ZipReader } from './internal/zip-reader';
import { ZipWriter } from './internal/zip-writer';
import type {
  ArchiveManifest,
  ArchiveManifestFile,
  ArchiveProgressListener,
  ArchiveTransferResult,
  ValidatedZipEntry,
} from './interfaces';
import * as ArchiveUtils from './utils';

export class ArchiveService {
  /** archive 转换所需的当前 Recording 抓包数据。 */
  private readonly captureService: CaptureService;
  /** 与 HAR 共用的异步文件任务管理器。 */
  private readonly transferService: TransferService;

  /** 绑定抓包数据与共享任务管理器；文件系统与正文始终留在 Core。 */
  constructor(captureService: CaptureService, transferService: TransferService) {
    this.captureService = captureService;
    this.transferService = transferService;
  }

  /** 启动原生 archive 导出任务并立即返回 running 快照。 */
  startExport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.transferService.start(
      jobId,
      'archive-export',
      filePath,
      (abortSignal, onProgress) => this.exportToFile(filePath, abortSignal, onProgress),
    );
  }

  /** 启动原生 archive 导入任务并立即返回 running 快照。 */
  startImport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.transferService.start(
      jobId,
      'archive-import',
      filePath,
      (abortSignal, onProgress) => this.importFromFile(filePath, abortSignal, onProgress),
    );
  }

  /**
  * 把当前 Capture 时间切面导出为固定格式 ZIP archive：一次性 Worker 生成 SQLite
  * snapshot，Body 逐个流式写入，manifest 最后列出全部文件的 size/sha256。
   */
  async exportToFile(
    filePath: string,
    abortSignal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<ArchiveTransferResult> {
    ArchiveUtils.assertTransferPath(filePath, ARCHIVE_EXTENSION);
    const token = randomUUID();
    const snapshotPath = `${filePath}.${token}.snapshot`;
    const zipPath = `${filePath}.${token}.tmp`;
    const snapshot = this.captureService.createArchiveSnapshot(
      ARCHIVE_WORKER_BATCH_SIZE,
    );
    const total = snapshot.bodyHashes.length + 1;
    let processed = 0;
    let handle: FileHandle | undefined;

    try {
      ArchiveUtils.throwIfAborted(abortSignal);
      const workerHost = new WorkerHost('export', snapshotPath);
      await workerHost.writeSnapshot(
        snapshot.batches,
        abortSignal,
      );
      handle = await open(zipPath, 'wx+');
      const zipWriter = new ZipWriter(handle);
      const files: ArchiveManifestFile[] = [];

      files.push(
        await this.addFileEntry(zipWriter, SNAPSHOT_ENTRY_NAME, () =>
          createReadStream(snapshotPath), abortSignal),
      );
      processed += 1;
      onProgress?.({ processed, total });

      for (const hash of snapshot.bodyHashes) {
        ArchiveUtils.throwIfAborted(abortSignal);
        files.push(
          await this.addFileEntry(zipWriter, `${BLOB_ENTRY_PREFIX}${hash}`, () =>
            this.captureService.openBlobStream(hash), abortSignal),
        );
        processed += 1;
        onProgress?.({ processed, total });
      }

      ArchiveUtils.throwIfAborted(abortSignal);
      const manifest = ArchiveUtils.buildManifest(
        appVersion,
        files,
      );
      await zipWriter.addStream(
        MANIFEST_ENTRY_NAME,
        ArchiveUtils.singleChunk(Buffer.from(JSON.stringify(manifest), 'utf8')),
      );
      await zipWriter.finalize();
      await handle.close();
      handle = undefined;
      ArchiveUtils.throwIfAborted(abortSignal);
      // 直接 rename 覆盖，不留旧文件已删、新文件未就位的窗口。
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
  * 校验并导入固定格式 ZIP archive；解压前完成全部安全校验，失败或取消回滚隔离 Session。
   */
  async importFromFile(
    filePath: string,
    abortSignal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<ArchiveTransferResult> {
    ArchiveUtils.assertTransferPath(filePath, ARCHIVE_EXTENSION);
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new InvalidArchiveError('Archive source must be a regular file.');
    }
    const extractDir = await mkdtemp(path.join(tmpdir(), 'interceptor-archive-'));
    const readHandle = await open(filePath, 'r');
    const sessionId = `archive-${randomUUID()}`;
    let sessionCreated = false;

    try {
      const zipReader = new ZipReader(readHandle, stats.size);
      await zipReader.open();
      const entries = zipReader.validate();
      const manifest = await this.extractManifest(zipReader, entries, extractDir);
      this.assertManifestConsistency(manifest, entries);
      await this.extractAndVerify(zipReader, entries, manifest, extractDir, abortSignal);

      const snapshotPath = path.join(extractDir, SNAPSHOT_ENTRY_NAME);
      await this.importBlobs(manifest, extractDir, abortSignal);

      await this.captureService.ensureSession({
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
        abortSignal,
        onProgress,
      );
      return { processed: result.processed, total: result.total, warnings: [] };
    } catch (error) {
      await this.captureService
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
    zipWriter: ZipWriter,
    name: string,
    openSource: () => Readable,
    abortSignal: AbortSignal,
  ): Promise<ArchiveManifestFile> {
    const hash = createHash('sha256');
    let size = 0;
    const source = (async function* (): AsyncGenerator<Uint8Array> {
      const stream = addAbortSignal(abortSignal, openSource());
      for await (const chunk of stream) {
        ArchiveUtils.throwIfAborted(abortSignal);
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        size += buffer.length;
        yield buffer;
      }
    })();
    await zipWriter.addStream(name, source);
    return { path: name, size, sha256: hash.digest('hex') };
  }

  /** 提取并解析 manifest；拒绝缺失、未知格式或不支持版本。 */
  private async extractManifest(
    zipReader: ZipReader,
    entries: readonly ValidatedZipEntry[],
    extractDir: string,
  ): Promise<ArchiveManifest> {
    const manifestEntry = entries.find(
      (entry) => entry.safeName === MANIFEST_ENTRY_NAME,
    );
    if (!manifestEntry) {
      throw new InvalidArchiveError('Archive is missing its manifest.');
    }
    const manifestPath = path.join(extractDir, MANIFEST_ENTRY_NAME);
    await zipReader.extractEntry(manifestEntry, manifestPath);
    const manifest = ArchiveUtils.parseManifest(await readFile(manifestPath));
    if (!manifest.files.some((file) => file.path === SNAPSHOT_ENTRY_NAME)) {
      throw new InvalidArchiveError('Archive manifest omits the database snapshot.');
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
        throw new InvalidArchiveError('Archive manifest references a missing entry.');
      }
      if (entry.uncompressedSize !== file.size) {
        throw new InvalidArchiveError('Archive manifest size does not match its entry.');
      }
    }
    for (const entry of entries) {
      if (entry.safeName !== MANIFEST_ENTRY_NAME && !manifestNames.has(entry.safeName)) {
        throw new InvalidArchiveError('Archive contains an entry absent from the manifest.');
      }
    }
  }

  /** 提取快照与全部 Blob 并逐文件校验 sha256/size 与 manifest 一致。 */
  private async extractAndVerify(
    zipReader: ZipReader,
    entries: readonly ValidatedZipEntry[],
    manifest: ArchiveManifest,
    extractDir: string,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const zipByName = new Map(entries.map((entry) => [entry.safeName, entry]));
    await mkdir(path.join(extractDir, 'blobs'), { recursive: true });
    for (const file of manifest.files) {
      ArchiveUtils.throwIfAborted(abortSignal);
      if (file.path === MANIFEST_ENTRY_NAME) {
        continue;
      }
      const entry = zipByName.get(file.path);
      if (!entry) {
        throw new InvalidArchiveError('Archive manifest references a missing entry.');
      }
      const destination = path.join(extractDir, file.path);
      await zipReader.extractEntry(entry, destination);
      const digest = await this.hashFile(destination);
      if (digest.size !== file.size || digest.hash !== file.sha256) {
        throw new InvalidArchiveError('Archive file failed manifest verification.');
      }
    }
  }

  /** 把已校验的 Blob 导入内容寻址 Store，并确认内容与其声明 hash 一致。 */
  private async importBlobs(
    manifest: ArchiveManifest,
    extractDir: string,
    abortSignal: AbortSignal,
  ): Promise<void> {
    for (const file of manifest.files) {
      if (!file.path.startsWith(BLOB_ENTRY_PREFIX)) {
        continue;
      }
      ArchiveUtils.throwIfAborted(abortSignal);
      const expectedHash = file.path.slice(BLOB_ENTRY_PREFIX.length);
      const stored = await this.captureService.writeBody(
        createReadStream(path.join(extractDir, file.path)),
      );
      if (stored.hash !== expectedHash) {
        throw new InvalidArchiveError('Archive blob content does not match its hash.');
      }
    }
  }

  /** 通过一次性 Worker 分批读取快照并把 Exchange 重插入隔离 Session。 */
  private async importSnapshot(
    snapshotPath: string,
    sessionId: string,
    abortSignal: AbortSignal,
    onProgress?: ArchiveProgressListener,
  ): Promise<{ processed: number; total: number }> {
    const workerHost = new WorkerHost('import', snapshotPath);
    let processed = 0;
    let total = 0;
    try {
      for await (const page of workerHost.readSnapshotBatches(abortSignal)) {
        ArchiveUtils.throwIfAborted(abortSignal);
        const exchanges: ExchangeInput[] = [];
        const framesByExchange = new Map<string, readonly WebSocketFrameInput[]>();
        total = page.total;
        for (const snapshot of page.exchanges) {
          const newId = `archive-exchange-${randomUUID()}`;
          exchanges.push(this.remapSnapshotExchange(snapshot.exchange, newId, sessionId));
          framesByExchange.set(newId, snapshot.frames);
        }
        await this.captureService.appendExchanges(exchanges);
        for (const exchange of exchanges) {
          const frames = framesByExchange.get(exchange.id) ?? [];
          if (frames.length > 0) {
            await this.captureService.appendWebSocketFrames(
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
      await workerHost.close();
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
      requestBodyEffect: this.remapBodyEffect(exchange.requestBodyEffect),
      responseBodyEffect: this.remapBodyEffect(exchange.responseBodyEffect),
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

  /** 保留effect语义，并为可用Original分配新的body id。 */
  private remapBodyEffect(
    effect: BodyRuleEffectInput | undefined,
  ): BodyRuleEffectInput | undefined {
    return effect
      ? {
          ...effect,
          originalBody: this.remapBodyRef(effect.originalBody),
        }
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
