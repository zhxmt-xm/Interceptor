/**
 * Enumerates stable model failure categories used by Runtime policy.
 * 枚举 Runtime 策略使用的稳定模型故障分类。
 */
export type ModelCallErrorCode =
  | 'invalid_request'
  | 'authentication_failed'
  | 'insufficient_balance'
  | 'rate_limited'
  | 'server_error'
  | 'http_error'
  | 'network_error'
  | 'attempt_timeout'
  | 'invalid_response';

/**
 * States whether replaying the same model request can duplicate accepted work.
 * 表示重放同一模型请求是否可能重复已经被接受的工作。
 */
export type ModelReplaySafety = 'safe' | 'unsafe';

/**
 * Carries normalized Provider facts without deciding retry behavior.
 * 携带标准化的 Provider 事实，但不决定重试行为。
 */
export interface ModelCallErrorOptions {
  statusCode?: number;
  retryAfterMs?: number;
  responseStarted: boolean;
  replaySafety: ModelReplaySafety;
  cause?: unknown;
}

/**
 * Represents one normalized model-attempt failure at the Provider boundary.
 * 表示 Provider 边界上的一次标准化模型 attempt 失败。
 */
export class ModelCallError extends Error {
  /** Stable failure category. / 稳定的故障分类。 */
  readonly code: ModelCallErrorCode;
  /** HTTP status when the Provider returned one. / Provider 返回时记录 HTTP 状态码。 */
  readonly statusCode: number | undefined;
  /** Provider-requested retry delay in milliseconds. / Provider 要求的重试等待毫秒数。 */
  readonly retryAfterMs: number | undefined;
  /** Whether any model event was already visible to Runtime. / 是否已有模型事件对 Runtime 可见。 */
  readonly responseStarted: boolean;
  /** Whether the same request may be replayed automatically. / 同一请求是否允许自动重放。 */
  readonly replaySafety: ModelReplaySafety;

  /**
   * Builds a diagnostic error from normalized Provider facts.
   * 根据标准化 Provider 事实构造诊断错误。
   */
  constructor(code: ModelCallErrorCode, message: string, options: ModelCallErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ModelCallError';
    this.code = code;
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
    this.responseStarted = options.responseStarted;
    this.replaySafety = options.replaySafety;
  }
}