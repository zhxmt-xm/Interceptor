/** 可安全展示给用户的 HAR 格式、上限或路径错误。 */
export class InvalidHarError extends Error {
  /** 构造 HAR 输入错误并设置稳定错误名。 */
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHarError';
  }
}