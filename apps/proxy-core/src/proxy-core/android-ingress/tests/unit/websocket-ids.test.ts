import { describe, expect, it } from 'vitest';
import { inspectionWebSocketOperationId } from '../../utils/websocket-ids';

const exchangeId = '12345678-9abc-4def-8000-000000000002';

describe('WebSocket exchange-scoped operation identifiers', () => {
  it.each([
    ['client-to-server', 'message', '0'],
    ['client-to-server', 'original', '1'],
    ['client-to-server', 'decision', '2'],
    ['client-to-server', 'replacement', '3'],
    ['server-to-client', 'message', '4'],
    ['server-to-client', 'original', '5'],
    ['server-to-client', 'decision', '6'],
    ['server-to-client', 'replacement', '7'],
  ] as const)('derives the canonical %s %s operation ID', (direction, operation, suffix) => {
    expect(inspectionWebSocketOperationId(exchangeId, direction, 0, operation))
      .toBe(`12345678-9abc-8def-8000-00000000000${suffix}`);
  });

  it('preserves the full safe sequence range and RFC variant without floating-point multiplication', () => {
    expect(inspectionWebSocketOperationId(exchangeId, 'server-to-client', Number.MAX_SAFE_INTEGER, 'replacement'))
      .toBe('12345678-9abc-8def-80ff-ffffffffffff');
  });

  it('never reuses an ID across message operations, directions or successive sequences', () => {
    const ids = new Set<string>();
    for (let sequence = 0; sequence < 256; sequence++) {
      for (const direction of ['client-to-server', 'server-to-client'] as const) {
        for (const operation of ['message', 'original', 'decision', 'replacement'] as const) {
          ids.add(inspectionWebSocketOperationId(exchangeId, direction, sequence, operation));
        }
      }
    }
    expect(ids.size).toBe(2048);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sequence %s', sequence => {
    expect(() => inspectionWebSocketOperationId(exchangeId, 'client-to-server', sequence, 'message')).toThrow();
  });
});
