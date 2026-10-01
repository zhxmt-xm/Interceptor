/**
 * 端口归属快照的有效期。
 *
 * 连接关闭后源端口最终会被系统重新分配给另一个进程，过期快照因此会把请求归给
 * 错误的应用。取值远小于 Windows TIME_WAIT（默认 120s）与动态端口段轮回所需的
 * 时长，既能避开复用错认，又不会频繁拉起 helper。
 */
export const CLIENT_APP_SNAPSHOT_TTL_MS = 15_000;
