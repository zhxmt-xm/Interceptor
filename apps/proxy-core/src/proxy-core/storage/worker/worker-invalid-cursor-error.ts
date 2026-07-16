/** Storage keyset 或 WebSocket 游标格式无效。 */
export class InvalidCursorError extends Error {
  /** 构造稳定的分页游标错误。 */
  constructor() {
    super('The pagination cursor is malformed.');
    this.name = 'InvalidCursorError';
  }
}