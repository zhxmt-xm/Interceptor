import type { WebSocketFrameDirection } from '@interceptor/core-protocol';
import type { InspectionWebSocketOperation } from '../interfaces/websocket';
import { WEBSOCKET_OPERATION_CODES } from '../internal/constants';
import { count, formatInspectionUuid, uuid } from './inspection-protocol';

/** 为当前exchange的方向、序号和操作生成固定UUIDv8。 */
export function inspectionWebSocketOperationId(
  exchangeId: string, direction: WebSocketFrameDirection, sequence: number, operation: InspectionWebSocketOperation,
): string {
  const bytes = Buffer.from(uuid(exchangeId).replaceAll('-', ''), 'hex');
  const counter = BigInt(count(sequence));
  bytes.writeBigUInt64BE((bytes.readBigUInt64BE(0) & ~0xf000n) | 0x8000n, 0);
  bytes.writeBigUInt64BE(0x8000000000000000n | (counter << 3n)
    | (direction === 'server-to-client' ? 4n : 0n) | WEBSOCKET_OPERATION_CODES[operation], 8);
  return formatInspectionUuid(bytes);
}
