/** gRPC message keyset 游标无法安全解码。 */
export class InvalidGrpcCursorError extends Error {
  /** 构造具有稳定错误名的游标错误。 */
  constructor() {
    super('The gRPC message cursor is malformed.');
    this.name = 'InvalidGrpcCursorError';
  }
}
