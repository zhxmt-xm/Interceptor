/** 会话列表视为终态、不得因队列容量压力静默丢弃的状态。 */
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'aborted',
]);

/** Core 可延迟解码的 content-encoding。 */
export const SUPPORTED_ENCODINGS: ReadonlySet<string> = new Set([
  'gzip',
  'x-gzip',
  'deflate',
  'br',
]);