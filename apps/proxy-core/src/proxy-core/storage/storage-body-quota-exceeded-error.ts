/** 当前 Core 临时 Body Store 写入将超过全局配额。 */
export class BodyQuotaExceededError extends Error {
  /** 当前 Core 代际允许的最大临时正文总量。 */
  readonly quotaBytes: number;

  /** 记录配额并构造稳定错误名。 */
  constructor(quotaBytes: number) {
    super(`Temporary body quota of ${quotaBytes} bytes is exhausted.`);
    this.name = 'BodyQuotaExceededError';
    this.quotaBytes = quotaBytes;
  }
}
