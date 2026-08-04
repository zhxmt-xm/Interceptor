/** 单次 helper 调用的超时；超时视为解析失败，不阻塞抓包。 */
export const CLIENT_APP_LOOKUP_TIMEOUT_MS = 2_000;

/** helper 单次输出的最大字节数；连到代理的连接数有界，正常远小于该值。 */
export const CLIENT_APP_LOOKUP_MAX_OUTPUT_BYTES = 1024 * 1024;

/** 客户端应用 id 取可执行文件路径 sha256 的前 N 个十六进制字符。 */
export const CLIENT_APP_ID_LENGTH = 16;

/**
 * 端口归属快照的有效期。
 *
 * 连接关闭后源端口最终会被系统重新分配给另一个进程，过期快照因此会把请求归给
 * 错误的应用。取值远小于 Windows TIME_WAIT（默认 120s）与动态端口段轮回所需的
 * 时长，既能避开复用错认，又不会频繁拉起 helper。
 */
export const CLIENT_APP_SNAPSHOT_TTL_MS = 15_000;
