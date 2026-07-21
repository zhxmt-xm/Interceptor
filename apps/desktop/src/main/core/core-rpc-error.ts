import type { CoreError } from '@interceptor/core-protocol';

/** Main 侧本地 RPC 错误：携带 Core 错误码与是否可重试。 */
export class CoreRpcError extends Error {
  readonly code: CoreError['code'];
  readonly retryable: boolean;

  constructor(error: CoreError) {
    super(error.message);
    this.name = 'CoreRpcError';
    this.code = error.code;
    this.retryable = error.retryable;
  }

  /** 构造一个不可重试的本地 RPC 错误（disconnected/cancelled/timeout/conflict）。 */
  static of(code: CoreError['code'], message: string): CoreRpcError {
    return new CoreRpcError({ code, message, retryable: false });
  }
}
