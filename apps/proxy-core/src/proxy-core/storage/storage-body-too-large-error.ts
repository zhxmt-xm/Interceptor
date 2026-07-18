/** 临时正文写入超过单条上限。 */
export class BodyTooLargeError extends Error {
  /** 允许的最大正文字节数。 */
  readonly limitBytes: number;

  /** 记录上限并构造稳定错误名。 */
  constructor(limitBytes: number) {
    super(`Body exceeds the per-body limit of ${limitBytes} bytes.`);
    this.name = 'BodyTooLargeError';
    this.limitBytes = limitBytes;
  }
}
