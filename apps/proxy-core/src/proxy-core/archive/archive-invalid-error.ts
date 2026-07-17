/**
 * 原生 archive 的确定性校验错误。
 *
 * 与 InvalidHarError 同构：TransferJobManager 只把这类错误的 message 透传给 Renderer，
 * 其它异常统一折叠为通用文案，避免泄漏绝对路径或内部细节。所有解压前校验失败都抛出它。
 */
export class ArchiveInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveInvalidError';
  }
}
