import { describe, expect, it } from 'vitest';

import {
  assertBoundedString,
  assertIdentifier,
  toDiagnosticsExportFilter,
  toDiagnosticsQueryRequest,
  toGrpcMessageQuery,
  toHarExportRequest,
  toRendererDiagnosticReport,
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
      process: 'core',
      traceId: 'trace-1',
      requestId: 'request-1',
      command: 'echo',
      phase: 'command.completed',
      attributes: { secret: '[REDACTED]' },
    })).toEqual({
      timestamp: '2026-07-13T00:00:00.000Z',
      sequence: 1,
      level: 'info',
      process: 'core',
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

  it('validates HAR export scope and redaction at the Renderer boundary', () => {
    expect(toHarExportRequest({
      scope: {
        kind: 'filter',
        filter: {
          sessionId: 'session-current',
          method: 'GET',
          status: 200,
          protocol: 'h2',
        },
      },
      redaction: {
        authorization: true,
        cookies: true,
        bodies: false,
      },
    })).toEqual({
      scope: {
        kind: 'filter',
        filter: {
          sessionId: 'session-current',
          host: undefined,
          method: 'GET',
          status: 200,
          mime: undefined,
          process: undefined,
          search: undefined,
          protocol: 'h2',
        },
      },
      redaction: {
        authorization: true,
        cookies: true,
        bodies: false,
      },
    });
    expect(() => toHarExportRequest({
      scope: { kind: 'selected', exchangeIds: ['../unsafe'] },
      redaction: { authorization: true, cookies: true, bodies: false },
    })).toThrow('HAR export exchangeId is invalid');
    expect(() => toHarExportRequest({
      scope: { kind: 'all' },
      redaction: { authorization: true, cookies: 'yes', bodies: false },
    })).toThrow('HAR export redaction flags are invalid');
    expect(() => toHarExportRequest({
      scope: { kind: 'filter', filter: { protocol: 'ftp' } },
      redaction: { authorization: true, cookies: true, bodies: false },
    })).toThrow('query.filter.protocol is invalid');
  });

  it('validates diagnostics export filters at the Renderer boundary', () => {
    expect(toDiagnosticsExportFilter({
      process: 'renderer',
      level: 'warn',
      outcome: 'timed_out',
    })).toEqual({
      process: 'renderer',
      level: 'warn',
      outcome: 'timed_out',
    });
    expect(toDiagnosticsExportFilter(undefined)).toEqual({});
    expect(() => toDiagnosticsExportFilter({ level: 'fatal' })).toThrow(
      'Diagnostics export level is invalid',
    );
    expect(() => toDiagnosticsExportFilter({ outcome: 'unknown' })).toThrow(
      'Diagnostics export outcome is invalid',
    );
    expect(() => toDiagnosticsExportFilter({ process: 'browser' })).toThrow(
      'Diagnostics export process is invalid',
    );
  });

    it('validates a full diagnostics page query at the Renderer boundary', () => {
      expect(toDiagnosticsQueryRequest({
        cursor: '42',
        limit: 100,
        process: 'main',
        level: 'error',
        outcome: 'failed',
        traceId: 'trace-1',
        command: 'proxy.start',
        minDurationMs: 10,
        maxDurationMs: 500,
      })).toEqual({
        cursor: '42',
        limit: 100,
        process: 'main',
        level: 'error',
        outcome: 'failed',
        traceId: 'trace-1',
        command: 'proxy.start',
        minDurationMs: 10,
        maxDurationMs: 500,
      });
      expect(() => toDiagnosticsQueryRequest({
        minDurationMs: 100,
        maxDurationMs: 10,
      })).toThrow('Diagnostics query duration range is invalid');
      expect(() => toDiagnosticsQueryRequest({ limit: 501 })).toThrow(
        'Diagnostics query.limit is invalid',
      );
    });

  it('accepts only fixed, bounded Renderer error reports', () => {
    expect(toRendererDiagnosticReport({
      kind: 'uncaught-error',
      name: 'TypeError',
      message: 'render failed',
    })).toEqual({
      kind: 'uncaught-error',
      name: 'TypeError',
      message: 'render failed',
    });
    expect(() => toRendererDiagnosticReport({
      kind: 'log',
      name: 'Error',
      message: 'not allowed',
    })).toThrow('Renderer diagnostic kind is invalid');
    expect(() => toRendererDiagnosticReport({
      kind: 'unhandled-rejection',
      name: '../unsafe',
      message: 'failed',
    })).toThrow('Renderer diagnostic name is invalid');
  });
});