import { describe, expect, it } from 'vitest';

import {
  assertBoundedString,
  assertIdentifier,
  toGrpcMessageQuery,
  toRendererDiagnosticRecord,
  toWebSocketFrameQuery,
} from '../renderer-utils';

describe('renderer utils', () => {
  it('validates bounded strings', () => {
    expect(() => assertBoundedString('hello', 'value', 5)).not.toThrow();
    expect(() => assertBoundedString('too long', 'value', 5)).toThrow(
      'value is invalid',
    );
    expect(() => assertBoundedString(42, 'value', 5)).toThrow(
      'value is invalid',
    );
  });

  it('accepts protocol identifiers and rejects unsafe values', () => {
    expect(() => assertIdentifier('trace-1:a.b', 'traceId')).not.toThrow();
    expect(() => assertIdentifier('../trace', 'traceId')).toThrow(
      'traceId is invalid',
    );
    expect(() => assertIdentifier('', 'traceId')).toThrow(
      'traceId is invalid',
    );
  });

  it('maps only fields exposed to the Renderer', () => {
    expect(toRendererDiagnosticRecord({
      timestamp: '2026-07-13T00:00:00.000Z',
      sequence: 1,
      level: 'info',
      process: 'proxy-core',
      traceId: 'trace-1',
      requestId: 'request-1',
      command: 'echo',
      phase: 'command.completed',
      attributes: { secret: '[REDACTED]' },
    })).toEqual({
      timestamp: '2026-07-13T00:00:00.000Z',
      sequence: 1,
      level: 'info',
      traceId: 'trace-1',
      requestId: 'request-1',
      command: 'echo',
      phase: 'command.completed',
      action: undefined,
      durationMs: undefined,
      outcome: undefined,
      errorCode: undefined,
    });
  });

  it('validates websocket frame queries at the Renderer boundary', () => {
    expect(
      toWebSocketFrameQuery({
        exchangeId: 'exchange-ws-1',
        cursor: 'opaque-cursor',
        limit: 100,
        direction: 'server-to-client',
      }),
    ).toEqual({
      exchangeId: 'exchange-ws-1',
      cursor: 'opaque-cursor',
      limit: 100,
      direction: 'server-to-client',
    });
    expect(() =>
      toWebSocketFrameQuery({ exchangeId: '../unsafe', limit: 100 }),
    ).toThrow('websocket query.exchangeId is invalid');
    expect(() =>
      toWebSocketFrameQuery({ exchangeId: 'exchange-1', limit: 501 }),
    ).toThrow('websocket query.limit is invalid');
    expect(() =>
      toWebSocketFrameQuery({
        exchangeId: 'exchange-1',
        limit: 100,
        direction: 'sideways',
      }),
    ).toThrow('websocket query.direction is invalid');
  });

  it('validates grpc message queries at the Renderer boundary', () => {
    expect(
      toGrpcMessageQuery({
        exchangeId: 'exchange-grpc-1',
        side: 'response',
        cursor: 'opaque-cursor',
        limit: 50,
      }),
    ).toEqual({
      exchangeId: 'exchange-grpc-1',
      side: 'response',
      cursor: 'opaque-cursor',
      limit: 50,
    });
    expect(() =>
      toGrpcMessageQuery({ exchangeId: '../unsafe', side: 'request', limit: 10 }),
    ).toThrow('grpc query.exchangeId is invalid');
    expect(() =>
      toGrpcMessageQuery({ exchangeId: 'grpc-1', side: 'both', limit: 10 }),
    ).toThrow('grpc query.side is invalid');
    expect(() =>
      toGrpcMessageQuery({ exchangeId: 'grpc-1', side: 'request', limit: 501 }),
    ).toThrow('grpc query.limit is invalid');
  });
});