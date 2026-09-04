/** Serializes system-proxy operations inside the single supported App process. */
export class SystemProxyOperationQueue {
  /** Settlement-only tail that keeps later operations runnable after a failure. */
  private operationTail: Promise<void> = Promise.resolve();

  /** Run one operation after every earlier system-proxy operation settles. */
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}