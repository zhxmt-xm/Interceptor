/** Blob Store 写入将超过全局配额。 */
export class BlobQuotaExceededError extends Error {
  /** Blob Store 全局配额。 */
  readonly quotaBytes: number;

  /** 记录配额并构造稳定错误名。 */
  constructor(quotaBytes: number) {
    super(`Blob store global quota of ${quotaBytes} bytes is exhausted.`);
    this.name = 'BlobQuotaExceededError';
    this.quotaBytes = quotaBytes;
  }
}