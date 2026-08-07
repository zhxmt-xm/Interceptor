import { describe, expect, it } from 'vitest';

import {
  areTlsPassthroughHostsEquivalent,
  selectTlsPassthroughHostsForProvision,
  toBodyDecodeOptions,
  toBodyExportRequest,
  toByteRange,
  toCoreSessionQuery,
  toDiagnosticsExportFilter,
  toDiagnosticsQueryRequest,
  toGrpcMessageQuery,
  toHarExportRequest,
  toInsecureHosts,
  toRendererDiagnosticReport,
  toRendererDiagnosticRecord,
  toSafeBodyFileName,
  toTlsPassthroughSettingsStatus,
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
    const bodyRequest = { bodyId: 'a'.repeat(64), suggestedName: '../video?.mp4' };
    expect(toBodyExportRequest(bodyRequest)).toBe(bodyRequest);
    expect(toSafeBodyFileName(bodyRequest.suggestedName)).toBe('video_.mp4');
    expect(toSafeBodyFileName('..')).toBe('response-body.bin');
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

  it('compares TLS passthrough hosts by normalized set semantics', () => {
    const activeHosts = ['*.example.com'];
    const afterAdd = [...activeHosts, 'api.example.com'];
    const afterUndo = afterAdd.filter((host) => host !== 'api.example.com');
    expect(areTlsPassthroughHostsEquivalent(activeHosts, afterAdd)).toBe(false);
    expect(areTlsPassthroughHostsEquivalent(activeHosts, afterUndo)).toBe(true);
    expect(areTlsPassthroughHostsEquivalent(
      ['*.example.com', 'api.example.com'],
      [' API.EXAMPLE.COM ', '*.example.com', '*.example.com'],
    )).toBe(true);
    expect(areTlsPassthroughHostsEquivalent(
      ['*.example.com'],
      ['*.example.com', 'api.example.com'],
    )).toBe(false);
    expect(areTlsPassthroughHostsEquivalent(
      ['*.example.com', 'api.example.com'],
      ['*.example.com'],
    )).toBe(false);
  });

  it('requires restart only when a provisioned list differs from persistence', () => {
    const settings = { revision: 3, hosts: ['*.example.com'] };
    expect(toTlsPassthroughSettingsStatus(settings, null)).toEqual({
      ...settings,
      restartRequired: false,
    });
    expect(toTlsPassthroughSettingsStatus(settings, ['*.example.com'])).toEqual({
      ...settings,
      restartRequired: false,
    });
    expect(toTlsPassthroughSettingsStatus(settings, [])).toEqual({
      ...settings,
      restartRequired: true,
    });
  });

  it('applies persisted TLS hosts only for an explicit restart', () => {
    const activeHosts = ['old.example.com'];
    const persistedHosts = ['new.example.com'];
    expect(selectTlsPassthroughHostsForProvision(
      activeHosts,
      persistedHosts,
      false,
    )).toEqual(activeHosts);
    expect(selectTlsPassthroughHostsForProvision(
      activeHosts,
      persistedHosts,
      true,
    )).toEqual(persistedHosts);
    expect(selectTlsPassthroughHostsForProvision(
      null,
      persistedHosts,
      false,
    )).toEqual(persistedHosts);
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