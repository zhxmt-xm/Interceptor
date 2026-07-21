import type { CoreCommand, CoreResult } from '@interceptor/core-protocol';

/** 一个 RPC Promise 的全部本地资源，完成后统一释放。 */
export class PendingRpcRequest {
  readonly promise: Promise<CoreResult>;
  private resolvePromise!: (result: CoreResult) => void;
  private rejectPromise!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private removeAbortListener: (() => void) | null = null;
  private settled = false;

  constructor(
    readonly commandType: CoreCommand['type'],
    readonly traceId: string,
  ) {
    this.promise = new Promise<CoreResult>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  start(
    timeoutMs: number,
    signal: AbortSignal | undefined,
    cancel: (reason: 'caller' | 'timeout') => void,
  ): void {
    this.timer = setTimeout(() => cancel('timeout'), timeoutMs);
    if (signal) {
      const listener = (): void => cancel('caller');
      signal.addEventListener('abort', listener, { once: true });
      this.removeAbortListener = () => signal.removeEventListener('abort', listener);
      if (signal.aborted) {
        cancel('caller');
      }
    }
  }

  resolve(result: CoreResult): void {
    if (!this.settled) {
      this.settled = true;
      this.cleanup();
      this.resolvePromise(result);
    }
  }

  reject(error: Error): void {
    if (!this.settled) {
      this.settled = true;
      this.cleanup();
      this.rejectPromise(error);
    }
  }

  private cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.removeAbortListener?.();
    this.removeAbortListener = null;
  }
}
