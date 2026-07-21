/** 本地计算机信任库操作错误。 */
export class TrustStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustStoreError';
  }
}
