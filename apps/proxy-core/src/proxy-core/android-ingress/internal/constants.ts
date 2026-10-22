/** 每方向单个未确认块的最大字节数。 */
export const MAX_CHUNK_BYTES = 32_768;
/** 与两端实际WS framing一致的单消息content上限，在分配buffer前检查。 */
export const MAX_WEBSOCKET_MESSAGE_BYTES = 100 * 1024 * 1024;
/** 首消息和取消/关闭确认期限，不作用于业务等待。 */
export const CONNECT_TIMEOUT_MS = 10_000;
/** Ping用于连接存活判断，不放行断点。 */
export const PING_INTERVAL_MS = 20_000;
/** v2协议副本JSON按UTF-8 bytes计数，不复用v1字符上限。 */
export const MAX_INSPECTION_CONTROL_BYTES = 65_536;
/** v2正文帧携带16字节UUID与8字节offset。 */
export const INSPECTION_BODY_HEADER_BYTES = 24;
/** 协议副本保序headers的最大字段对数。 */
export const MAX_INSPECTION_HEADERS = 256;
/** 单设备v2活动exchange与异步关闭收尾的共同配额。 */
export const MAX_INSPECTION_EXCHANGES = 16;
/** UUIDv8低位区分每条WS消息的四种操作，不依赖历史ID集合。 */
export const WEBSOCKET_OPERATION_CODES: Readonly<Record<InspectionWebSocketOperation, bigint>> = {
  message: 0n, original: 1n, decision: 2n, replacement: 3n,
};
import type { InspectionWebSocketOperation } from '../interfaces/websocket';
