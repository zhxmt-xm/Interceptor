import { createHash } from 'node:crypto';
import {
  createWriteStream,
  promises as fs,
} from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

import {
  BLOB_TEMP_DIR,
  GLOBAL_QUOTA_BYTES,
  MAX_BODY_BYTES,
  blobDirectory,
  blobTempDirectory,
} from '../../constants';

/**
 * 写入正文超过单条上限时抛出；调用方据此把 body_ref 标记为 truncated。
 */
export class BlobTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Blob exceeds the per-body limit of ${limitBytes} bytes.`);
    this.name = 'BlobTooLargeError';
  }
}

/**
 * 写入会使总量超过全局配额时抛出；调用方据此省略正文但保留元数据。
 */
export class BlobQuotaExceededError extends Error {
  constructor(readonly quotaBytes: number) {
    super(`Blob store global quota of ${quotaBytes} bytes is exhausted.`);
    this.name = 'BlobQuotaExceededError';
  }
}

export interface BlobWriteResult {
  readonly hash: string;
  readonly size: number;
  /** 该内容此前已存在（内容寻址去重命中）。 */
  readonly deduplicated: boolean;
}

export interface BlobGcResult {
  readonly removedBlobs: number;
  readonly freedBytes: number;
}

/**
 * 内容寻址正文 Blob 存储。
 *
 * 正文先流式写入临时文件并增量计算 SHA-256，完成后按 hash 原子 rename 到分片路径，
 * 相同内容自动去重。SQLite 只保存 body_ref 引用，磁盘 GC 依据引用集合删除孤立 Blob，
 * 且启动时清理残留临时文件以保证崩溃安全。所有操作使用异步流式 I/O，不阻塞事件循环。
 */
export class BlobStore {
  private readonly rootDir = blobDirectory;
  private readonly tempDir = blobTempDirectory;
  private readonly maxBodyBytes = MAX_BODY_BYTES;
  private readonly globalQuotaBytes = GLOBAL_QUOTA_BYTES;
  private totalBytes = 0;
  private initialized = false;

  /**
   * 建立目录结构、清理崩溃残留临时文件并统计现有 Blob 总量。
   * 调用方：StorageService 初始化；重复调用幂等。
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await fs.mkdir(this.rootDir, { recursive: true });
    await fs.rm(this.tempDir, { recursive: true, force: true });
    await fs.mkdir(this.tempDir, { recursive: true });
    this.totalBytes = await this.scanTotalBytes();
    this.initialized = true;
  }

  /** 当前 Blob 占用的总字节数。 */
  get usageBytes(): number {
    return this.totalBytes;
  }

  /**
   * 流式写入一段正文：增量哈希 + 原子 rename，命中相同 hash 时去重。
   * 超过单条上限或全局配额时删除临时文件并抛出对应错误，不落盘半成品。
   * 调用方：M3/T3.3 正文管道；M2 由 blob store 测试直接验证。
   */
  async writeStream(source: AsyncIterable<Uint8Array>): Promise<BlobWriteResult> {
    this.assertInitialized();
    const hash = createHash('sha256');
    const tempPath = path.join(
      this.tempDir,
      `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
    );
    const out = createWriteStream(tempPath);
    let size = 0;

    try {
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > this.maxBodyBytes) {
          throw new BlobTooLargeError(this.maxBodyBytes);
        }
        hash.update(chunk);
        if (!out.write(chunk)) {
          await once(out, 'drain');
        }
      }
      await closeWriteStream(out);
    } catch (error) {
      await this.discardTemp(out, tempPath);
      throw error;
    }

    const digest = hash.digest('hex');
    const finalPath = this.pathForHash(digest);

    if (await pathExists(finalPath)) {
      await fs.rm(tempPath, { force: true });
      return { hash: digest, size, deduplicated: true };
    }

    if (this.totalBytes + size > this.globalQuotaBytes) {
      await fs.rm(tempPath, { force: true });
      throw new BlobQuotaExceededError(this.globalQuotaBytes);
    }

    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rename(tempPath, finalPath);
    this.totalBytes += size;
    return { hash: digest, size, deduplicated: false };
  }

  /** 内容是否已存在。调用方：去重预检和测试。 */
  async has(hash: string): Promise<boolean> {
    return pathExists(this.pathForHash(hash));
  }

  /**
   * 读取指定 hash Blob 的一个字节范围，返回实际读到的字节（EOF 处可能更短）。
   * 调用方：body.read-range command handler（M4 起分块读取正文）。
   */
  async readRange(
    hash: string,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    const handle = await fs.open(this.pathForHash(hash), 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  /**
   * crash-safe 垃圾回收：删除引用集合之外的 Blob 文件并清理临时目录。
   * 调用方：StorageService 在 cleanup 后或定期对账时。
   */
  async collectGarbage(referencedHashes: Iterable<string>): Promise<BlobGcResult> {
    this.assertInitialized();
    const referenced = new Set(referencedHashes);
    let removedBlobs = 0;
    let freedBytes = 0;

    for (const { hash, filePath } of await this.listBlobs()) {
      if (referenced.has(hash)) {
        continue;
      }
      const size = await fileSize(filePath);
      await fs.rm(filePath, { force: true });
      removedBlobs += 1;
      freedBytes += size;
      this.totalBytes = Math.max(0, this.totalBytes - size);
    }

    await this.cleanTempDir();
    return { removedBlobs, freedBytes };
  }

  private async scanTotalBytes(): Promise<number> {
    let total = 0;
    for (const { filePath } of await this.listBlobs()) {
      total += await fileSize(filePath);
    }
    return total;
  }

  private async listBlobs(): Promise<{ hash: string; filePath: string }[]> {
    const blobs: { hash: string; filePath: string }[] = [];
    let shards: string[];
    try {
      shards = await fs.readdir(this.rootDir);
    } catch {
      return blobs;
    }

    for (const shard of shards) {
      if (shard === BLOB_TEMP_DIR || shard.length !== 2) {
        continue;
      }
      const shardDir = path.join(this.rootDir, shard);
      let entries: string[];
      try {
        entries = await fs.readdir(shardDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        blobs.push({ hash: shard + entry, filePath: path.join(shardDir, entry) });
      }
    }
    return blobs;
  }

  private async cleanTempDir(): Promise<void> {
    try {
      const entries = await fs.readdir(this.tempDir);
      await Promise.all(
        entries.map((entry) =>
          fs.rm(path.join(this.tempDir, entry), { force: true }),
        ),
      );
    } catch {
      // 临时目录缺失时无需清理。
    }
  }

  private async discardTemp(
    out: ReturnType<typeof createWriteStream>,
    tempPath: string,
  ): Promise<void> {
    try {
      await closeWriteStream(out);
    } catch {
      // 写流可能已因错误销毁。
    }
    await fs.rm(tempPath, { force: true });
  }

  private pathForHash(hash: string): string {
    return path.join(this.rootDir, hash.slice(0, 2), hash.slice(2));
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('BlobStore.init() must be called before use.');
    }
  }
}

function closeWriteStream(
  out: ReturnType<typeof createWriteStream>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    out.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(target: string): Promise<number> {
  try {
    return (await fs.stat(target)).size;
  } catch {
    return 0;
  }
}
