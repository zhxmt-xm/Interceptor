import { ModelCallError } from './errors';

/**
 * Decides whether and when one replay-safe model failure should be retried.
 * 决定一次 replay-safe 模型故障是否以及何时重试。
 */
export interface ModelRetryPolicy {
  readonly maxRetries: number;
  /**
   * Returns the delay for one retry, or undefined when the failure must surface.
   * 返回一次重试的等待时间；若故障必须直接上报则返回 undefined。
   */
  delayBeforeRetry(error: ModelCallError, retryNumber: number): number | undefined;
}

/**
 * Configures finite exponential backoff for transient model failures.
 * 配置瞬时模型故障的有限指数退避。
 */
export interface TransientModelRetryPolicyOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  random?: () => number;
}

/**
 * Creates a finite retry policy that honors Retry-After before using full jitter.
 * 创建有限重试策略：优先遵守 Retry-After，否则使用 full jitter。
 */
export function createTransientModelRetryPolicy(
  options: TransientModelRetryPolicyOptions,
): ModelRetryPolicy {
  validateRetryPolicyOptions(options);
  const random = options.random ?? Math.random;

  return {
    maxRetries: options.maxRetries,
    delayBeforeRetry(error, retryNumber) {
      if (!isReplaySafeTransientModelError(error)) {
        return undefined;
      }
      if (error.retryAfterMs !== undefined) {
        return error.retryAfterMs;
      }
      const exponentialDelay = options.initialDelayMs * (2 ** (retryNumber - 1));
      return Math.min(exponentialDelay, options.maxDelayMs) * random();
    },
  };
}

/**
 * Accepts only transient failures whose Provider facts permit replay.
 * 只接受 Provider 事实明确允许重放的瞬时故障。
 */
export function isReplaySafeTransientModelError(error: ModelCallError): boolean {
  return error.replaySafety === 'safe'
    && (error.code === 'rate_limited'
      || error.code === 'server_error'
      || error.code === 'network_error'
      || error.code === 'attempt_timeout');
}

/**
 * Rejects invalid retry settings at the configuration boundary.
 * 在配置边界拒绝非法重试参数。
 */
function validateRetryPolicyOptions(options: TransientModelRetryPolicyOptions): void {
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new RangeError('maxRetries must be a non-negative integer.');
  }
  if (!Number.isFinite(options.initialDelayMs) || options.initialDelayMs < 0) {
    throw new RangeError('initialDelayMs must be a non-negative finite number.');
  }
  if (!Number.isFinite(options.maxDelayMs) || options.maxDelayMs < 0) {
    throw new RangeError('maxDelayMs must be a non-negative finite number.');
  }
}