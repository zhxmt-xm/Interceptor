import { Buffer } from 'node:buffer';

/** 完整累加 Composer 响应正文，不截断或丢弃数据。 */
export class ResponseBody {
  /** 按接收顺序保留的全部响应块。 */
  private readonly chunks: Buffer[] = [];
  /** 接收到的完整字节数。 */
  private total = 0;

  /** 追加一个完整响应块。 */
  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.total += chunk.length;
  }

  /** 返回连续的完整响应字节。 */
  get bytes(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.chunks, this.total));
  }

  /** 返回接收到的完整字节数。 */
  get totalBytes(): number {
    return this.total;
  }
}