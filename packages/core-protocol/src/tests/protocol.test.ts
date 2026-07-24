import { describe, expect, it } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
} from '../messages';
import {
  parseCoreToMainMessage,
  parseMainToCoreMessage,
} from '../validation';

describe('core protocol validation', () => {
  it('accepts every Main-to-Core message family', () => {
    const commands = [
      { type: 'echo', payload: { value: 'hello' } },
      {
        type: 'sessions.query',
        payload: {
          limit: 100,
          sort: 'started_desc',
          filter: { host: 'example.test', status: 200 },
        },
      },
      {
        type: 'body.read-range',
        payload: { bodyId: 'body-1', offset: 0, length: 1024 },
      },
      {
        type: 'websocket.frames',
        payload: {
          exchangeId: 'exchange-ws',
          limit: 100,
          direction: 'client-to-server',
        },
      },
      {
        type: 'websocket.breakpoint.configure',
        payload: { enabled: true },
      },
      {
        type: 'grpc.messages',
        payload: {
          exchangeId: 'exchange-grpc',
          side: 'response',
          limit: 50,
        },
      },
      {
        type: 'rules.validate',
        payload: {
          rules: [
            {
              id: 'rule-1',
              name: 'Tag API',
              enabled: true,
              priority: 100,
              matchers: [
                { type: 'host', value: 'api.test', mode: 'exact' },
                { type: 'method', value: 'GET' },
              ],
              actions: [
                {
                  type: 'header',
                  phase: 'request',
                  op: 'set',
                  name: 'x-tag',
                  value: 'on',
                },
              ],
            },
          ],
        },
      },
      {
        type: 'rules.replace',
        payload: { expectedRevision: 1, rules: [] },
      },
      {
        type: 'rules.get',
        payload: {},
      },
      {
        type: 'rules.hits',
        payload: {},
      },
      {
        type: 'composer.send',
        payload: {
          method: 'POST',
          url: 'https://api.example.com/v1',
          headers: [{ name: 'accept', value: 'application/json' }],
          body: '{}',
          protocol: 'auto',
        },
      },
      {
        type: 'breakpoint.resolve',
        payload: { breakpointId: 'breakpoint-1', action: 'continue' },
      },
      {
        type: 'breakpoint.list',
        payload: {},
      },
      {
        type: 'breakpoint.configure',
        payload: { enabled: false },
      },
      {
        type: 'connection.probe',
        payload: { host: 'example.com', port: 443 },
      },
      {
        type: 'diagnostics.recent',
        payload: { limit: 50, traceId: 'trace-previous' },
      },
      {
        type: 'diagnostics.ingest',
        payload: {
          process: 'renderer',
          level: 'error',
          phase: 'renderer.unhandled-error',
          errorCode: 'TypeError',
          attributes: { message: 'render failed' },
        },
      },
      {
        type: 'diagnostics.query',
        payload: {
          limit: 20,
          process: 'main',
          level: 'error',
          outcome: 'failed',
          traceId: 'trace-query',
          command: 'proxy.start',
          minDurationMs: 10,
          maxDurationMs: 500,
        },
      },
      {
        type: 'diagnostics.export.start',
        payload: {
          jobId: 'diagnostics-job-export',
          filePath: 'C:\\Exports\\diagnostics.jsonl',
          process: 'renderer',
          level: 'warn',
          outcome: 'timed_out',
        },
      },
      {
        type: 'har.export.start',
        payload: {
          jobId: 'har-job-export',
          filePath: 'C:\\Exports\\capture.har',
          scope: {
            kind: 'filter',
            filter: { method: 'GET', status: 200, protocol: 'h2' },
          },
          redaction: {
            authorization: true,
            cookies: true,
            bodies: false,
          },
        },
      },
      {
        type: 'har.import.start',
        payload: {
          jobId: 'har-job-import',
          filePath: 'C:\\Imports\\capture.har',
        },
      },
      {
        type: 'archive.export.start',
        payload: {
          jobId: 'archive-job-export',
          filePath: 'C:\\Exports\\capture.iarchive',
        },
      },
      {
        type: 'archive.import.start',
        payload: {
          jobId: 'archive-job-import',
          filePath: 'C:\\Imports\\capture.iarchive',
        },
      },
      {
        type: 'transfer.job.get',
        payload: { jobId: 'har-job-export' },
      },
      {
        type: 'transfer.job.cancel',
        payload: { jobId: 'har-job-import' },
      },
    ];

    for (const [index, command] of commands.entries()) {
      expect(parseMainToCoreMessage({
        kind: 'request',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId: `request-${index}`,
        traceId: `trace-${index}`,
        command,
      }).ok).toBe(true);
    }

    expect(parseMainToCoreMessage({
      kind: 'cancel',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-1',
      reason: 'caller',
    }).ok).toBe(true);
  });

  it('passes HAR transfer payloads without deep validation', () => {
    const response = {
      kind: 'response' as const,
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-transfer',
      traceId: 'trace-transfer',
      ok: true as const,
      result: {
        type: 'transfer.job',
        payload: {
          job: {
            id: 'har-job-export',
            kind: 'har-export',
            state: 'completed',
            fileName: 'capture.har',
            processed: 18,
            total: 18,
            startedAt: '2026-07-17T10:00:00.000Z',
            completedAt: '2026-07-17T10:00:01.000Z',
            warnings: ['HAR omits WebSocket messages.'],
          },
        },
      },
    };
    expect(parseCoreToMainMessage(response).ok).toBe(true);
    expect(parseCoreToMainMessage({
      ...response,
      result: {
        ...response.result,
        payload: {
          job: { ...response.result.payload.job, processed: -1 },
        },
      },
    }).ok).toBe(true);

    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-empty-selection',
      traceId: 'trace-empty-selection',
      command: {
        type: 'har.export.start',
        payload: {
          jobId: 'har-job-empty',
          filePath: 'C:\\Exports\\empty.har',
          scope: { kind: 'selected', exchangeIds: [] },
          redaction: {
            authorization: true,
            cookies: true,
            bodies: false,
          },
        },
      },
    }).ok).toBe(true);
  });

  it('passes rule payloads without transport-level semantic validation', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-rules',
      traceId: 'trace-rules',
      ok: true,
      result: {
        type: 'rules.ruleset',
        payload: {
          ruleSet: {
            revision: 3,
            rules: [
              {
                id: 'rule-1',
                name: 'Block ads',
                enabled: true,
                priority: 10,
                matchers: [
                  { type: 'host', value: 'ads.test', mode: 'contains' },
                ],
                actions: [{ type: 'block', mode: 'reset' }],
              },
            ],
          },
        },
      },
    }).ok).toBe(true);

    const badRule = (
      matchers: unknown,
      actions: unknown,
    ): ReturnType<typeof parseMainToCoreMessage> =>
      parseMainToCoreMessage({
        kind: 'request',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId: 'request-bad',
        traceId: 'trace-bad',
        command: {
          type: 'rules.validate',
          payload: {
            rules: [
              {
                id: 'rule-x',
                name: 'Bad',
                enabled: true,
                priority: 1,
                matchers,
                actions,
              },
            ],
          },
        },
      });

    // Rule editor/engine owns semantic diagnostics; RPC only carries the payload.
    expect(badRule([{ type: 'nonsense', value: 'x' }], [
      { type: 'block', mode: 'reset' },
    ]).ok).toBe(true);
  });

  it('passes websocket frame payloads without deep validation', () => {
    const response = (opcode: number) => ({
      kind: 'response' as const,
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-ws',
      traceId: 'trace-ws',
      ok: true as const,
      result: {
        type: 'websocket.frames',
        payload: {
          items: [
            {
              seq: 1,
              direction: 'client-to-server',
              opcode,
              timestamp: 1_000,
              payloadSize: 5,
              payload: {
                bodyHash: 'a'.repeat(64),
                mediaType: 'text/plain; charset=utf-8',
                encodedSize: 5,
                truncated: false,
                decodeStatus: 'ok',
              },
            },
          ],
          nextCursor: 'opaque-cursor',
          hasMore: true,
          breakpointsEnabled: false,
        },
      },
    });

    expect(parseCoreToMainMessage(response(1)).ok).toBe(true);
    expect(parseCoreToMainMessage(response(9)).ok).toBe(true);
  });

  it('passes gRPC message payloads without deep validation', () => {
    const response = (payloadOffset: number) => ({
      kind: 'response' as const,
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-grpc',
      traceId: 'trace-grpc',
      ok: true as const,
      result: {
        type: 'grpc.messages',
        payload: {
          recognized: true,
          side: 'response',
          contentType: 'application/grpc+proto',
          encoding: 'gzip',
          bodyHash: 'a'.repeat(64),
          bodySize: 42,
          items: [
            {
              index: 0,
              envelopeOffset: 0,
              payloadOffset,
              payloadLength: 37,
              compressed: false,
              truncated: false,
            },
          ],
          hasMore: false,
        },
      },
    });
    expect(parseCoreToMainMessage(response(5)).ok).toBe(true);
    expect(parseCoreToMainMessage(response(-1)).ok).toBe(true);
  });

  it('passes rule hit payloads without deep validation', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-hits',
      traceId: 'trace-hits',
      ok: true,
      result: {
        type: 'rules.hits',
        payload: {
          counts: [
            { ruleId: 'rule-1', count: 128 },
            { ruleId: 'rule-2', count: 0 },
          ],
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-hits-bad',
      traceId: 'trace-hits-bad',
      ok: true,
      result: {
        type: 'rules.hits',
        payload: { counts: [{ ruleId: 'rule-1', count: -1 }] },
      },
    }).ok).toBe(true);
  });

  it('passes composer response payloads without deep validation', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-composer',
      traceId: 'trace-composer',
      ok: true,
      result: {
        type: 'composer.response',
        payload: {
          ok: true,
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'content-type', value: 'application/json' }],
          body: new Uint8Array([123, 125]),
          totalBytes: 2,
          durationMs: 42,
          tls: {
            protocol: 'TLSv1.3',
            cipher: 'TLS_AES_128_GCM_SHA256',
            alpn: 'h2',
            subject: 'example.com',
            issuer: 'Example CA',
            validFrom: 'Jan  1 00:00:00 2026 GMT',
            validTo: 'Jan  1 00:00:00 2027 GMT',
          },
          remoteAddress: '93.184.216.34',
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-composer-bad',
      traceId: 'trace-composer-bad',
      ok: true,
      result: {
        type: 'composer.response',
        payload: {
          ok: true,
          status: 900,
          statusText: '',
          httpVersion: 'h2',
          headers: [],
          body: new Uint8Array(0),
          totalBytes: 0,
          durationMs: 1,
          tls: null,
          remoteAddress: null,
        },
      },
    }).ok).toBe(true);
  });

  it('passes breakpoint payloads without deep validation', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-bp',
      traceId: 'trace-bp',
      ok: true,
      result: {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [
            {
              id: 'bp-1',
              phase: 'request',
              createdAt: 1_000,
              deadline: 31_000,
              ruleName: 'Debug checkout',
              method: 'POST',
              url: 'https://shop.example.com/checkout',
              headers: [{ name: 'content-type', value: 'application/json' }],
              body: '{}',
            },
            {
              id: 'bp-ws',
              phase: 'websocket',
              createdAt: 2_000,
              deadline: 32_000,
              ruleName: 'WebSocket message',
              url: 'ws://example.test/socket',
              direction: 'client-to-server',
              opcode: 1,
              bodyFormat: 'text',
              headers: [],
              body: 'hello',
            },
          ],
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-bp-bad',
      traceId: 'trace-bp-bad',
      ok: true,
      result: {
        type: 'breakpoint.pending',
        payload: {
          enabled: true,
          breakpoints: [
            {
              id: 'bp-2',
              phase: 'sideways',
              createdAt: 0,
              deadline: 0,
              ruleName: 'x',
              headers: [],
            },
          ],
        },
      },
    }).ok).toBe(true);
  });

  it('passes connection probe payloads without deep validation', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-probe',
      traceId: 'trace-probe',
      ok: true,
      result: {
        type: 'connection.probed',
        payload: {
          ok: true,
          protocol: 'TLSv1.3',
          cipher: 'TLS_AES_128_GCM_SHA256',
          alpn: 'h2',
          authorized: true,
          certificates: [
            {
              subject: 'CN=example.com',
              issuer: 'CN=Example CA',
              validFrom: 'Jan  1 00:00:00 2026 GMT',
              validTo: 'Jan  1 00:00:00 2027 GMT',
              serialNumber: '0A1B2C',
              fingerprint256: 'AA:BB:CC',
            },
          ],
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-probe-bad',
      traceId: 'trace-probe-bad',
      ok: true,
      result: {
        type: 'connection.probed',
        payload: {
          ok: true,
          protocol: 'x'.repeat(65),
          cipher: '',
          alpn: '',
          authorized: false,
          certificates: [],
        },
      },
    }).ok).toBe(true);
  });

  it('accepts every Core-to-Main message family', () => {
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-1',
      traceId: 'trace-1',
      ok: true,
      result: {
        type: 'echo',
        payload: {
          value: 'hello',
          handledAt: '2026-07-12T00:00:00.000Z',
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-3',
      traceId: 'trace-3',
      ok: true,
      result: {
        type: 'sessions.page',
        payload: {
          items: [
            {
              id: 'exchange-1',
              method: 'GET',
              secure: true,
              host: 'api.test',
              path: '/a',
              protocol: 'http/1.1',
              statusCode: 200,
              responseMime: 'application/json',
              state: 'completed',
              startedAt: 1,
              durationMs: 12,
              requestBytes: 0,
              responseBytes: 12,
            },
          ],
          nextCursor: 'cursor-2',
          hasMore: true,
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-detail',
      traceId: 'trace-detail',
      ok: true,
      result: {
        type: 'sessions.detail',
        payload: {
          detail: {
            summary: {
              id: 'exchange-1',
              method: 'POST',
              secure: true,
              host: 'api.test',
              path: '/users',
              protocol: 'http/1.1',
              statusCode: 201,
              responseMime: 'application/json',
              state: 'completed',
              startedAt: 1,
              durationMs: 20,
              requestBytes: 8,
              responseBytes: 42,
            },
            url: 'https://api.test/users',
            scheme: 'https',
            statusText: 'Created',
            streamId: 3,
            requestHeaders: [
              { name: ':method', value: 'POST', isPseudo: true },
              { name: 'accept', value: 'application/json' },
            ],
            responseHeaders: [{ name: 'content-type', value: 'application/json' }],
            requestTrailers: [],
            responseTrailers: [{ name: 'x-checksum', value: 'abc123' }],
            responseBody: {
              bodyHash: 'a'.repeat(64),
              mediaType: 'application/json',
              encodedSize: 42,
              truncated: false,
              decodeStatus: 'ok',
            },
          },
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-detail-null',
      traceId: 'trace-detail-null',
      ok: true,
      result: {
        type: 'sessions.detail',
        payload: { detail: null },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-4',
      traceId: 'trace-4',
      ok: true,
      result: {
        type: 'body.range',
        payload: {
          bodyId: 'body-1',
          offset: 0,
          data: new Uint8Array([1, 2, 3]),
          end: false,
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-5',
      traceId: 'trace-5',
      ok: true,
      result: {
        type: 'rules.validation',
        payload: {
          valid: false,
          diagnostics: [{ code: 'rule.invalid', message: 'Invalid matcher' }],
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-6',
      traceId: 'trace-6',
      ok: true,
      result: { type: 'rules.revision', payload: { revision: 2 } },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-7',
      traceId: 'trace-7',
      ok: true,
      result: {
        type: 'breakpoint.resolution',
        payload: { breakpointId: 'breakpoint-1', state: 'continued' },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-8',
      traceId: 'trace-8',
      ok: true,
      result: {
        type: 'diagnostics.records',
        payload: {
          droppedCount: 0,
          records: [diagnosticRecord()],
        },
      },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-8-ingest',
      traceId: 'trace-8-ingest',
      ok: true,
      result: { type: 'diagnostics.ingested', payload: {} },
    }).ok).toBe(true);

    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-9',
      traceId: 'trace-9',
      ok: false,
      error: {
        code: 'unsupported-command',
        message: 'Not implemented in M1',
        retryable: false,
      },
    }).ok).toBe(true);

  });

  it('allows envelope extensions but rejects incompatible versions', () => {
    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-1',
      traceId: 'trace-1',
      command: { type: 'echo', payload: { value: 'hello' } },
      escapePayload: true,
    }).ok).toBe(true);

    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: 2,
      requestId: 'request-1',
      traceId: 'trace-1',
      command: { type: 'echo', payload: { value: 'hello' } },
    })).toEqual({
      ok: false,
      error: `protocolVersion must be ${CORE_PROTOCOL_VERSION}`,
    });
  });

  it('only requires string correlation IDs and does not limit command payloads', () => {
    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'contains spaces',
      traceId: 'trace-1',
      command: {
        type: 'echo',
        payload: { value: 'hello' },
      },
    }).ok).toBe(true);

    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 1,
      traceId: 'trace-1',
      command: { type: 'echo', payload: { value: 'hello' } },
    }).ok).toBe(false);

    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-1',
      traceId: 'trace-1',
      command: {
        type: 'echo',
        payload: { value: 'x'.repeat(4_097) },
      },
    }).ok).toBe(true);
  });

  it('does not validate trusted pagination and body range payloads', () => {
    expect(parseMainToCoreMessage(request({
      type: 'sessions.query',
      payload: {
        limit: 1_000_000,
        sort: 'started_desc',
        filter: {},
      },
    })).ok).toBe(true);

    expect(parseMainToCoreMessage(request({
      type: 'body.read-range',
      payload: {
        bodyId: 'body-1',
        offset: -1,
        length: Number.MAX_SAFE_INTEGER,
      },
    })).ok).toBe(true);

  });

  it('accepts capture event paths without changing their content', () => {
    const eventBatch = (path: string) => ({
      kind: 'event-batch',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 1,
      events: [{
        kind: 'exchange-added',
        summary: {
          id: 'exchange-path-boundary',
          method: 'GET',
          secure: true,
          host: 'data.bilibili.com',
          path,
          protocol: 'h2',
          statusCode: 200,
          state: 'completed',
          startedAt: 1,
          requestBytes: 0,
          responseBytes: 0,
        },
      }],
    });

    const path = `/${'bilibili-path'.repeat(1_000)}`;
    const parsed = parseCoreToMainMessage(eventBatch(path));
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.kind === 'event-batch') {
      expect(parsed.value.events[0]?.summary.path).toBe(path);
    }
  });

  it('passes unknown command and result payload variants through the envelope', () => {
    expect(parseMainToCoreMessage(request({
      type: 'escape-hatch',
      payload: {},
    }))).toMatchObject({ ok: true });

    const record = diagnosticRecord();
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-log',
      traceId: 'trace-log',
      ok: true,
      result: {
        type: 'diagnostics.records',
        payload: {
          droppedCount: 0,
          records: [{
            ...record,
            attributes: { unsafe: { token: 'secret' } },
          }],
        },
      },
    }).ok).toBe(true);
  });
});

function request(command: unknown): Record<string, unknown> {
  return {
    kind: 'request',
    protocolVersion: CORE_PROTOCOL_VERSION,
    requestId: 'request-test',
    traceId: 'trace-test',
    command,
  };
}

function diagnosticRecord(): Record<string, unknown> {
  return {
    timestamp: '2026-07-12T00:00:00.000Z',
    sequence: 1,
    level: 'info',
    process: 'core',
    traceId: 'trace-1',
    requestId: 'request-1',
    command: 'echo',
    phase: 'command.completed',
    durationMs: 2,
    outcome: 'success',
    attributes: { responseType: 'echo' },
  };
}