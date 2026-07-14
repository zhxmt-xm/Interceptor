import { describe, expect, it } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
  MAX_BODY_CHUNK_BYTES,
  MAX_QUERY_PAGE_SIZE,
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
        type: 'rules.validate',
        payload: { draftId: 'draft-1', revision: 1, ruleCount: 2 },
      },
      {
        type: 'rules.replace',
        payload: { draftId: 'draft-1', expectedRevision: 1, revision: 2 },
      },
      {
        type: 'breakpoint.resolve',
        payload: { breakpointId: 'breakpoint-1', action: 'continue' },
      },
      {
        type: 'diagnostics.recent',
        payload: { limit: 50, traceId: 'trace-previous' },
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
            requestHeaders: [{ name: 'accept', value: 'application/json' }],
            responseHeaders: [{ name: 'content-type', value: 'application/json' }],
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
          draftId: 'draft-1',
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

  it('rejects unknown fields and incompatible versions', () => {
    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-1',
      traceId: 'trace-1',
      command: { type: 'echo', payload: { value: 'hello' } },
      escapePayload: true,
    })).toEqual({
      ok: false,
      error: 'message.escapePayload is not allowed',
    });

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

  it('rejects malformed identifiers and oversized echo values', () => {
    expect(parseMainToCoreMessage({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'contains spaces',
      traceId: 'trace-1',
      command: {
        type: 'echo',
        payload: { value: 'hello' },
      },
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
    }).ok).toBe(false);
  });

  it('enforces pagination and body range bounds', () => {
    expect(parseMainToCoreMessage(request({
      type: 'sessions.query',
      payload: {
        limit: MAX_QUERY_PAGE_SIZE + 1,
        sort: 'started_desc',
        filter: {},
      },
    })).ok).toBe(false);

    expect(parseMainToCoreMessage(request({
      type: 'body.read-range',
      payload: {
        bodyId: 'body-1',
        offset: -1,
        length: MAX_BODY_CHUNK_BYTES + 1,
      },
    })).ok).toBe(false);

  });

  it('rejects unknown variants and non-scalar log attributes', () => {
    expect(parseMainToCoreMessage(request({
      type: 'escape-hatch',
      payload: {},
    }))).toEqual({ ok: false, error: 'command.type is unknown' });

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
    }).ok).toBe(false);
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
    process: 'proxy-core',
    traceId: 'trace-1',
    requestId: 'request-1',
    command: 'echo',
    phase: 'command.completed',
    durationMs: 2,
    outcome: 'success',
    attributes: { responseType: 'echo' },
  };
}