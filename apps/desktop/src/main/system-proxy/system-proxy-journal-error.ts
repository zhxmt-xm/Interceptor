/** 系统代理归属日志错误。 */
export class SystemProxyJournalError extends Error {
  /** Create one bounded ownership-journal failure. */
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyJournalError';
  }
}
