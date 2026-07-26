import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { BODY_WRITER_PENDING_LIMIT_BYTES } from '../constants';
import type { BlobWriteResult, BodyWriter } from './interfaces';

/** 把已收集内容提交为内容寻址条目的回调；由 TemporaryBodyStore 提供。 */
export type BodyCommit = (
  hash: string,
  size: number,
  memory: Buffer | null,
  spillPath: string | null,
) => Promise<BlobWriteResult>;

/**
 * 增量正文写入器：chunk 到达即累计 hash 并按阈值内存/spill，结束时才提交。
 *
 * Mockttp 的 body-data 事件是旁路且不等待消费者，因此 `write` 必须立即返回，
 * 实际落盘在内部串行队列中进行。待落盘字节超过上限时降级为只累计 observedBytes，
 * 不再保存内容，避免 Core 内存随下载速度无界增长。
 */
export class TemporaryBodyWriter implements BodyWriter {
  /** 增量内容 hash。 */
  private readonly hash = createHash('sha256');
  /** 尚未 spill 时的内存分片。 */
  private readonly memoryChunks: Buffer[] = [];
  /** 落盘串行队列尾；保证 chunk 顺序写入。 */
  private tail: Promise<void> = Promise.resolve();
  /** 当前 spill 临时文件路径。 */
  private spillPath: string | null = null;
  /** 当前 spill 文件句柄。 */
  private output: FileHandle | null = null;
  /** 已实际写入 hash 的字节数。 */
  private writtenBytes = 0;
  /** 已观察到的完整字节数，含降级后未保存的部分。 */
  private observed = 0;
  /** 排队中尚未落盘的字节数。 */
  private pendingBytes = 0;
  /** 是否因排队超限停止保存内容。 */
  private degradedFlag = false;
  /** 是否已结束（finalize 或 abort）。 */
  private closed = false;

  /** 绑定 spill 目录、内存阈值与提交回调。 */
  constructor(
    private readonly rootDir: string,
    private readonly memoryThresholdBytes: number,
    private readonly commit: BodyCommit,
  ) {}

  /** 已观察到的完整编码字节数。 */
  get observedBytes(): number {
    return this.observed;
  }

  /** 是否已降级为只计数。 */
  get degraded(): boolean {
    return this.degradedFlag;
  }

  /** 追加一段正文；立即返回，落盘在内部队列串行执行。 */
  write(chunk: Uint8Array): void {
    if (this.closed || chunk.byteLength === 0) {
      this.observed += chunk.byteLength;
      return;
    }
    this.observed += chunk.byteLength;
    if (this.degradedFlag) {
      return;
    }
    if (this.pendingBytes + chunk.byteLength > BODY_WRITER_PENDING_LIMIT_BYTES) {
      this.degradedFlag = true;
      this.tail = this.tail.then(() => this.discardCollected());
      return;
    }
    const buffer = Buffer.from(chunk);
    this.pendingBytes += buffer.byteLength;
    this.tail = this.tail
      .then(() => this.consume(buffer))
      .catch(() => {
        this.degradedFlag = true;
      })
      .finally(() => {
        this.pendingBytes -= buffer.byteLength;
      });
  }

  /** 结束写入并提交；降级或空正文返回 null。 */
  async finalize(): Promise<BlobWriteResult | null> {
    if (this.closed) {
      return null;
    }
    this.closed = true;
    await this.tail;
    if (this.output) {
      await this.output.close().catch(() => undefined);
      this.output = null;
    }
    if (this.degradedFlag || this.writtenBytes === 0) {
      await this.removeSpill();
      return null;
    }
    const digest = this.hash.digest('hex');
    const memory = this.spillPath
      ? null
      : Buffer.concat(this.memoryChunks, this.writtenBytes);
    this.memoryChunks.length = 0;
    const spillPath = this.spillPath;
    this.spillPath = null;
    return this.commit(digest, this.writtenBytes, memory, spillPath);
  }

  /** 放弃写入并清理半成品。 */
  async abort(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.tail.catch(() => undefined);
    await this.discardCollected();
  }

  /** 串行消费单个 chunk：累计 hash，按阈值切换到 spill。 */
  private async consume(buffer: Buffer): Promise<void> {
    this.hash.update(buffer);
    this.writtenBytes += buffer.byteLength;
    if (!this.output && this.writtenBytes > this.memoryThresholdBytes) {
      this.spillPath = path.join(this.rootDir, `.${randomUUID()}.tmp`);
      this.output = await fs.open(this.spillPath, 'wx');
      for (const memoryChunk of this.memoryChunks) {
        await this.writeAll(this.output, memoryChunk);
      }
      this.memoryChunks.length = 0;
    }
    if (this.output) {
      await this.writeAll(this.output, buffer);
      return;
    }
    this.memoryChunks.push(buffer);
  }

  /** 释放内存分片与 spill 文件。 */
  private async discardCollected(): Promise<void> {
    this.memoryChunks.length = 0;
    if (this.output) {
      await this.output.close().catch(() => undefined);
      this.output = null;
    }
    await this.removeSpill();
  }

  /** 删除尚未提交的 spill 临时文件。 */
  private async removeSpill(): Promise<void> {
    if (!this.spillPath) {
      return;
    }
    await fs.rm(this.spillPath, { force: true }).catch(() => undefined);
    this.spillPath = null;
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
}
