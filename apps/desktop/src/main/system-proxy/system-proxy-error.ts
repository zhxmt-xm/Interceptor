export class SystemProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyError';
  }
}