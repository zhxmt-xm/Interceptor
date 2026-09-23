/** Root CA 生命周期错误。 */
export class CertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateError';
  }
}

/** 本地计算机信任库操作错误。 */
export class TrustStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustStoreError';
  }
}
