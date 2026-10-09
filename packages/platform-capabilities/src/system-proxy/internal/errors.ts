export class SystemProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyError';
  }
}

/** No supported discovery source supplied a PAC configuration on the current network. */
export class WpadNotFoundError extends SystemProxyError {
  constructor() {
    super('No WPAD configuration was found on this network.');
    this.name = 'WpadNotFoundError';
  }
}

/** 系统代理归属日志错误。 */
export class SystemProxyJournalError extends Error {
  /** Create one bounded ownership-journal failure. */
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyJournalError';
  }
}
