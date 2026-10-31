/** 等待代理 CONNECT 应答的上限；超时按发送失败处理。 */
export const REPLAY_CONNECT_TIMEOUT_MS = 10_000;

/** CONNECT 应答头允许的最大字节数，避免异常代理无限缓冲。 */
export const REPLAY_CONNECT_MAX_HEADER_BYTES = 16 * 1024;
