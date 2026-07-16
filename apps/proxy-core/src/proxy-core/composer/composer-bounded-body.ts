import { Buffer } from 'node:buffer';

import { MAX_RESPONSE_BYTES } from './composer-constants';

/** 累加响应正文并施加容量上限，同时保留实际总字节数。 */
export class BoundedBody {
  /** 上限内保留的正文块。 */
  private readonly chunks: Buffer[] = [];
  /** 已保留字节数。 */
  private kept = 0;
  /** 接收到的实际总字节数。 */
  private total = 0;
  /** 是否已有字节因容量上限被丢弃。 */
  private truncatedFlag = false;

  /** 追加响应块，并只保留容量上限内的前缀。 */
  push(chunk: Buffer): void {
    this.total += chunk.length;
    if (this.kept >= MAX_RESPONSE_BYTES) {
      this.truncatedFlag = true;
      return;
    }
    const room = MAX_RESPONSE_BYTES - this.kept;
    if (chunk.length <= room) {
      this.chunks.push(chunk);
      this.kept += chunk.length;
      return;
    }
    this.chunks.push(chunk.subarray(0, room));
    this.kept += room;
    this.truncatedFlag = true;
  }

  /** 返回上限内保留的连续响应字节。 */
  get bytes(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.chunks));
  }

  /** 返回正文是否被容量上限截断。 */
  get truncated(): boolean {
    return this.truncatedFlag;
  }

  /** 返回截断前接收到的总字节数。 */
  get totalBytes(): number {
    return this.total;
  }
}