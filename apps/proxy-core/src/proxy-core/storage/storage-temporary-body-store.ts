import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Readable as NodeReadable } from 'node:stream';

import {
  BODY_MEMORY_THRESHOLD_BYTES,
  captureTempDirectory,
} from '../constants';
import type {
  BlobGcResult,
  BlobWriteResult,
  TemporaryBodyEntry,
} from './interfaces';

/** 当前 Core 代际的内容寻址 Body Store；小正文驻内存，大正文异步 spill。 */
export class TemporaryBodyStore {
  /** 当前 Core 的临时 spill 根目录。 */
  private readonly rootDir = captureTempDirectory;
  /** 正文从内存切换到 spill 的阈值。 */
  private readonly memoryThresholdBytes = BODY_MEMORY_THRESHOLD_BYTES;
  /** hash 到内存或 spill 位置。 */
  private readonly entries = new Map<string, TemporaryBodyEntry>();
  /** 当前去重正文总字节数。 */
  private totalBytes = 0;
  /** hash 去重/配额/rename 的串行提交尾。 */
  private finalizeTail: Promise<void> = Promise.resolve();
  /** Store 是否已初始化。 */
  private initialized = false;

  /** 清理崩溃残留 spill 并建立空临时目录。 */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
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

  /** 流式写入正文；超过内存阈值后把已收集与后续 chunk 写入临时文件。 */
  async writeStream(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult> {
    this.assertInitialized();
    return this.performWrite(source);
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
      const available = Math.max(0, Math.min(length, entry.size - offset));
      const buffer = Buffer.allocUnsafe(available);
      const { bytesRead } = await handle.read(buffer, 0, available, offset);
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
      if (referenced.has(hash)) {
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

  /** 直接清空全部临时正文并重建 spill 目录。 */
  async reset(): Promise<void> {
    this.assertInitialized();
    this.entries.clear();
    this.totalBytes = 0;
    await fs.rm(this.rootDir, { recursive: true, force: true });
    await fs.mkdir(this.rootDir, { recursive: true });
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

  /** 消费输入、增量 hash，并按阈值选择内存或 spill。 */
  private async performWrite(
    source: AsyncIterable<Uint8Array>,
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
    );
  }

  /** 串行提交 hash 去重、配额与最终 spill 路径。 */
  private async finalizeWrite(
    hash: string,
    size: number,
    memory: Buffer | null,
    spillPath: string | null,
  ): Promise<BlobWriteResult> {
    let result: BlobWriteResult | undefined;
    let failure: unknown;
    const previous = this.finalizeTail;
    const current = (async (): Promise<void> => {
      await previous;
      try {
        const existing = this.entries.get(hash);
        if (existing) {
          if (spillPath) {
            await fs.rm(spillPath, { force: true });
          }
          result = { hash, size, deduplicated: true };
          return;
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
