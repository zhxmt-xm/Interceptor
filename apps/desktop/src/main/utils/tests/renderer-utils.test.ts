import { describe, expect, it } from 'vitest';

import {
  toBodyDecodeOptions,
  toByteRange,
  toCoreSessionQuery,
  toDiagnosticsExportFilter,
  toDiagnosticsQueryRequest,
  toGrpcMessageQuery,
  toHarExportRequest,
  toInsecureHosts,
  toRendererDiagnosticReport,
  toRendererDiagnosticRecord,
  toWebSocketFrameQuery,
} from '..';

describe('renderer utils', () => {
  it('maps only diagnostic fields exposed to the Renderer', () => {
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

  it('passes query payloads through without limits or normalization', () => {
    const sessionQuery = {
      cursor: 'cursor'.repeat(10_000),
      limit: 1_000_000,
      sort: 'started_desc' as const,
      filter: {
        host: 'h'.repeat(20_000),
        search: 's'.repeat(20_000),
      },
    };
    const websocketQuery = {
      exchangeId: '../exchange',
      cursor: 'cursor'.repeat(10_000),
      limit: 1_000_000,
      direction: 'server-to-client' as const,
    };
    const grpcQuery = {
      exchangeId: '../grpc',
      side: 'response' as const,
      cursor: 'cursor'.repeat(10_000),
      limit: 1_000_000,
    };

    expect(toCoreSessionQuery(sessionQuery)).toBe(sessionQuery);
    expect(toWebSocketFrameQuery(websocketQuery)).toBe(websocketQuery);
    expect(toGrpcMessageQuery(grpcQuery)).toBe(grpcQuery);
  });

  it('passes file intent options through while Main continues to own paths', () => {
    const request = {
      scope: {
        kind: 'selected' as const,
        exchangeIds: ['../exchange', 'exchange-1', 'exchange-1'],
      },
      redaction: {
        authorization: true,
        cookies: true,
        bodies: false,
      },
    };
    expect(toHarExportRequest(request)).toBe(request);
  });

  it('does not constrain body range or decode values', () => {
    const options = {
      decode: true,
      encoding: 'encoding'.repeat(10_000),
    };
    expect(toByteRange(0, Number.MAX_SAFE_INTEGER)).toEqual({
      offset: 0,
      length: Number.MAX_SAFE_INTEGER,
    });
    expect(toBodyDecodeOptions(options)).toBe(options);
  });

  it('does not trim, deduplicate, or limit insecure hosts', () => {
    const hosts = [' example.com ', 'example.com', 'example.com'];
    expect(toInsecureHosts(hosts)).toBe(hosts);
  });

  it('passes Diagnostics and Renderer report payloads through', () => {
    const filter = { level: 'fatal' };
    const query = {
      cursor: 'cursor'.repeat(10_000),
      limit: 1_000_000,
      minDurationMs: 100,
      maxDurationMs: 10,
    };
    const report = {
      kind: 'uncaught-error' as const,
      name: '../Error',
      message: 'message'.repeat(10_000),
    };

    expect(toDiagnosticsExportFilter(filter)).toBe(filter);
    expect(toDiagnosticsQueryRequest(query)).toEqual(query);
    expect(toRendererDiagnosticReport(report)).toBe(report);
  });
});