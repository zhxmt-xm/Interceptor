/** 会话列表视为终态、不得因队列容量压力静默丢弃的状态。 */
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'aborted',
]);

/** 网络中断后接收迟到正文观测的固定宽限，不因后续事件延长。 */
export const ABORT_BODY_GRACE_MS = 1000;

/** Core 可延迟解码的 content-encoding。 */
export const SUPPORTED_ENCODINGS: ReadonlySet<string> = new Set([
  'gzip',
  'x-gzip',
  'deflate',
  'br',
]);
