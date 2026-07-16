/** 正文写入超过单条上限。 */
export class BlobTooLargeError extends Error {
  /** 允许的最大正文字节数。 */
  readonly limitBytes: number;

  /** 记录上限并构造稳定错误名。 */
  constructor(limitBytes: number) {
    super(`Blob exceeds the per-body limit of ${limitBytes} bytes.`);
    this.name = 'BlobTooLargeError';
    this.limitBytes = limitBytes;
  }
}