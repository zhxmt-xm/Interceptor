/** replacement body 无法按最终 headers 构造时的显式错误。 */
export class HttpBodyEncodingError extends Error {
  /** 建立稳定错误名称，供 diagnostics 与发送链识别。 */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpBodyEncodingError';
  }
}
