import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Readable as NodeReadable } from 'node:stream';

import {
  BODY_MEMORY_THRESHOLD_BYTES,
  GLOBAL_QUOTA_BYTES,
  MAX_BODY_BYTES,
  blobDirectory,
  captureTempDirectory,
} from '../constants';
import type {
  BlobGcResult,
  BlobWriteResult,
  TemporaryBodyEntry,
} from './interfaces';
import { BodyQuotaExceededError } from './storage-body-quota-exceeded-error';
import { BodyTooLargeError } from './storage-body-too-large-error';

/** 当前 Core 代际的内容寻址 Body Store；小正文驻内存，大正文异步 spill。 */
export class TemporaryBodyStore {
  /** 当前 Core 的临时 spill 根目录。 */
  private readonly rootDir = captureTempDirectory;
  /** 旧版本持久 Blob 目录，初始化时一次性删除。 */
  private readonly legacyBlobDir = blobDirectory;
  /** 单条正文上限。 */
  private readonly maxBodyBytes = MAX_BODY_BYTES;
  /** 全部临时正文配额。 */
  private readonly quotaBytes = GLOBAL_QUOTA_BYTES;
  /** 正文从内存切换到 spill 的阈值。 */
  private readonly memoryThresholdBytes = BODY_MEMORY_THRESHOLD_BYTES;
  /** hash 到内存或 spill 位置。 */
  private readonly entries = new Map<string, TemporaryBodyEntry>();
  /** archive 时间切面对正文的临时保留计数。 */
  private readonly leases = new Map<string, number>();
  /** 当前去重正文总字节数。 */
  private totalBytes = 0;
  /** 当前生命周期代际；reset 后旧写入不得提交。 */
  private generation = 0;
  /** 当前正在进行的正文写入。 */
  private readonly activeWrites = new Set<Promise<BlobWriteResult>>();
  /** reset barrier；新写入必须等待目录重建完成。 */
  private resetBarrier: Promise<void> = Promise.resolve();
  /** 写入登记与 reset 切换 generation 的串行门闩。 */
  private lifecycleTail: Promise<void> = Promise.resolve();
  /** hash 去重/配额/rename 的串行提交尾。 */
  private finalizeTail: Promise<void> = Promise.resolve();
  /** Store 是否已初始化。 */
  private initialized = false;
  /** 是否正在切换 generation 并重建 spill 目录。 */
  private resetting = false;

  /** 清理旧持久 Blob 与崩溃残留 spill，并建立空临时目录。 */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await fs.rm(this.legacyBlobDir, { recursive: true, force: true });
    await fs.rm(this.rootDir, { recursive: true, force: true });
    await fs.mkdir(this.rootDir, { recursive: true });
    this.initialized = true;
  }

  /** 当前临时正文总字节数（内存 + spill，去重后）。 */
  get usageBytes(): number {
    return this.totalBytes;
  }

  /** 当前驻内存正文总字节数。 */
  get memoryBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind === 'memory') {
        total += entry.size;
      }
    }
    return total;
  }

  /** 当前 spill 文件总字节数。 */
  get spillBytes(): number {
    return this.totalBytes - this.memoryBytes;
  }

  /**
   * 流式写入正文并返回内容 hash；超过内存阈值后把已收集与后续 chunk 写入临时文件。
   * Clear/Stop 推进 generation 后，旧写入即使完成也不会挂回 Store。
   */
  async writeStream(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult> {
    this.assertInitialized();
    let operation!: Promise<BlobWriteResult>;
    await this.withLifecycleLock(async () => {
      await this.resetBarrier;
      operation = this.performWrite(source, this.generation);
      this.activeWrites.add(operation);
    });
    try {
      return await operation;
    } finally {
      this.activeWrites.delete(operation);
    }
  }

  /** 判断指定正文是否仍在当前 Core 临时 Store。 */
  async has(hash: string): Promise<boolean> {
    return this.entries.has(hash);
  }

  /** 打开正文只读流；驻内存正文通过 Node Readable 暴露同一异步流接口。 */
  openReadStream(hash: string): Readable {
    const entry = this.requireEntry(hash);
    return entry.kind === 'memory'
      ? NodeReadable.from([entry.data])
      : createReadStream(entry.filePath);
  }

  /** 按 hash 读取有限字节范围。 */
  async readRange(
    hash: string,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    const entry = this.requireEntry(hash);
    if (entry.kind === 'memory') {
      return entry.data.subarray(offset, Math.min(entry.size, offset + length));
    }
    const handle = await fs.open(entry.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  /** 删除不在 Capture 引用集合中的正文。 */
  async collectGarbage(
    referencedHashes: Iterable<string>,
  ): Promise<BlobGcResult> {
    this.assertInitialized();
    const referenced = new Set(referencedHashes);
    let removedBlobs = 0;
    let freedBytes = 0;
    for (const [hash, entry] of this.entries) {
      if (referenced.has(hash) || this.leases.has(hash)) {
        continue;
      }
      this.entries.delete(hash);
      this.totalBytes -= entry.size;
      removedBlobs += 1;
      freedBytes += entry.size;
      if (entry.kind === 'spill') {
        await fs.rm(entry.filePath, { force: true });
      }
    }
    return { removedBlobs, freedBytes };
  }

  /**
   * 切断当前 generation、等待旧写入退出并物理重建 spill 目录。
   * 新写入会在 resetBarrier 后进入下一 generation。
   */
  async reset(): Promise<void> {
    this.assertInitialized();
    let reset!: Promise<void>;
    await this.withLifecycleLock(() => {
      if (this.leases.size > 0) {
        throw new Error('Temporary bodies are still leased by an active transfer.');
      }
      this.resetting = true;
      this.generation += 1;
      const previousBarrier = this.resetBarrier;
      reset = (async (): Promise<void> => {
        try {
          await previousBarrier;
          await Promise.allSettled(Array.from(this.activeWrites));
          await this.finalizeTail;
          this.entries.clear();
          this.totalBytes = 0;
          await fs.rm(this.rootDir, { recursive: true, force: true });
          await fs.mkdir(this.rootDir, { recursive: true });
        } finally {
          this.resetting = false;
        }
      })();
      this.resetBarrier = reset;
    });
    await reset;
  }

  /** Reset 后移除临时目录，供 Core dispose。 */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await this.reset();
    await fs.rm(this.rootDir, { recursive: true, force: true });
    this.initialized = false;
  }

  /** 保留一组当前正文，直到 archive 导出 finally 调用 release。 */
  acquireLease(hashes: readonly string[]): () => void {
    if (this.resetting) {
      throw new Error('Temporary bodies are being reset.');
    }
    const acquired: string[] = [];
    for (const hash of hashes) {
      if (!this.entries.has(hash)) {
        this.releaseHashes(acquired);
        throw new Error(`Temporary body '${hash}' does not exist.`);
      }
      this.leases.set(hash, (this.leases.get(hash) ?? 0) + 1);
      acquired.push(hash);
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.releaseHashes(acquired);
    };
  }

  /** 递减一组 Body lease，归零时移除计数。 */
  private releaseHashes(hashes: readonly string[]): void {
    for (const hash of hashes) {
      const count = this.leases.get(hash) ?? 0;
      if (count <= 1) {
        this.leases.delete(hash);
      } else {
        this.leases.set(hash, count - 1);
      }
    }
  }

  /** 消费输入、增量 hash，并按阈值选择内存或 spill。 */
  private async performWrite(
    source: AsyncIterable<Uint8Array>,
    writeGeneration: number,
  ): Promise<BlobWriteResult> {
    const hash = createHash('sha256');
    const memoryChunks: Buffer[] = [];
    let spillPath: string | null = null;
    let output: FileHandle | null = null;
    let size = 0;

    try {
      for await (const chunk of source) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > this.maxBodyBytes) {
          throw new BodyTooLargeError(this.maxBodyBytes);
        }
        hash.update(buffer);
        if (!output && size > this.memoryThresholdBytes) {
          spillPath = path.join(this.rootDir, `.${randomUUID()}.tmp`);
          output = await fs.open(spillPath, 'wx');
          for (const memoryChunk of memoryChunks) {
            await this.writeAll(output, memoryChunk);
          }
          memoryChunks.length = 0;
        }
        if (output) {
          await this.writeAll(output, buffer);
        } else {
          memoryChunks.push(buffer);
        }
      }
      if (output) {
        await output.close();
        output = null;
      }
    } catch (error) {
      await output?.close().catch(() => undefined);
      if (spillPath) {
        await fs.rm(spillPath, { force: true });
      }
      throw error;
    }

    const digest = hash.digest('hex');
    const memory = spillPath ? null : Buffer.concat(memoryChunks, size);
    return this.finalizeWrite(
      digest,
      size,
      memory,
      spillPath,
      writeGeneration,
    );
  }

  /** 串行提交 hash 去重、配额与最终 spill 路径。 */
  private async finalizeWrite(
    hash: string,
    size: number,
    memory: Buffer | null,
    spillPath: string | null,
    writeGeneration: number,
  ): Promise<BlobWriteResult> {
    let result: BlobWriteResult | undefined;
    let failure: unknown;
    const previous = this.finalizeTail;
    const current = (async (): Promise<void> => {
      await previous;
      try {
        if (writeGeneration !== this.generation) {
          throw new Error('Temporary body write belongs to a cleared generation.');
        }
        const existing = this.entries.get(hash);
        if (existing) {
          if (spillPath) {
            await fs.rm(spillPath, { force: true });
          }
          result = { hash, size, deduplicated: true };
          return;
        }
        if (this.totalBytes + size > this.quotaBytes) {
          throw new BodyQuotaExceededError(this.quotaBytes);
        }
        if (spillPath) {
          const finalPath = path.join(this.rootDir, hash);
          await fs.rename(spillPath, finalPath);
          this.entries.set(hash, { kind: 'spill', hash, size, filePath: finalPath });
        } else {
          this.entries.set(hash, {
            kind: 'memory',
            hash,
            size,
            data: memory ?? Buffer.alloc(0),
          });
        }
        this.totalBytes += size;
        result = { hash, size, deduplicated: false };
      } catch (error) {
        failure = error;
        if (spillPath) {
          await fs.rm(spillPath, { force: true });
        }
      }
    })();
    this.finalizeTail = current;
    await current;
    if (failure) {
      throw failure;
    }
    if (!result) {
      throw new Error('Temporary body write did not produce a result.');
    }
    return result;
  }

  /** 返回指定正文条目，不存在时抛稳定错误。 */
  private requireEntry(hash: string): TemporaryBodyEntry {
    const entry = this.entries.get(hash);
    if (!entry) {
      throw new Error(`Temporary body '${hash}' does not exist.`);
    }
    return entry;
  }

  /** 在写入/Reset 生命周期门闩内执行一个短操作。 */
  private async withLifecycleLock(operation: () => void | Promise<void>): Promise<void> {
    const previous = this.lifecycleTail;
    let release!: () => void;
    this.lifecycleTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await operation();
    } finally {
      release();
    }
  }

  /** 循环写完整个 Buffer，处理 FileHandle.write 的合法 partial write。 */
  private async writeAll(output: FileHandle, buffer: Buffer): Promise<void> {
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await output.write(
        buffer,
        offset,
        buffer.length - offset,
      );
      offset += bytesWritten;
    }
  }

  /** 防止初始化前读写未定义目录。 */
  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('TemporaryBodyStore.init() must be called before use.');
    }
  }
}
