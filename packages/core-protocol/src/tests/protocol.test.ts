import { describe, expect, it } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
  MAX_BODY_CHUNK_BYTES,
  MAX_QUERY_PAGE_SIZE,
} from '../messages';
import type { RuleAction, RuleDefinition, RuleMatcher } from '../rules';
import {
  collectRuleDiagnostics,
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

  it('accepts rules.get result and rejects malformed rule definitions', () => {
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
                  { type: 'host', value: '*.ads.test', mode: 'wildcard' },
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

    // 未知 matcher 类型被拒绝
    expect(badRule([{ type: 'nonsense', value: 'x' }], [
      { type: 'block', mode: 'reset' },
    ]).ok).toBe(false);
    // 空 matchers 被拒绝
    expect(badRule([], [{ type: 'block', mode: 'reset' }]).ok).toBe(false);
    // 未知 action 类型被拒绝
    expect(badRule([{ type: 'method', value: 'GET' }], [
      { type: 'explode' },
    ]).ok).toBe(false);
    // 非法 status 范围被拒绝
    expect(badRule([{ type: 'status', min: 10, max: 20 }], [
      { type: 'block', mode: 'reset' },
    ]).ok).toBe(false);
  });

  it('accepts rules.hits result and rejects malformed hit counts', () => {
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

    // 负数命中计数被拒绝
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
    }).ok).toBe(false);
  });

  it('accepts composer.response result and rejects malformed status', () => {
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
          bodyTruncated: false,
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

    // 非法 status 被拒绝
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
          bodyTruncated: false,
          totalBytes: 0,
          durationMs: 1,
          tls: null,
          remoteAddress: null,
        },
      },
    }).ok).toBe(false);
  });

  it('accepts breakpoint.pending result and rejects malformed phase', () => {
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
          ],
        },
      },
    }).ok).toBe(true);

    // 非法 phase 被拒绝
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
    }).ok).toBe(false);
  });

  it('accepts connection.probed result and rejects invalid protocol length', () => {
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

    // protocol 过长被拒绝
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
    }).ok).toBe(false);
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

describe('collectRuleDiagnostics', () => {
  const ruleWith = (
    matchers: RuleMatcher[],
    actions: RuleAction[],
    overrides: Partial<RuleDefinition> = {},
  ): RuleDefinition => ({
    id: 'rule-1',
    name: 'Rule',
    enabled: true,
    priority: 100,
    matchers,
    actions,
    ...overrides,
  });

  it('returns no diagnostics for a semantically valid rule set', () => {
    expect(
      collectRuleDiagnostics([
        ruleWith(
          [{ type: 'host', value: '^api\\.test$', mode: 'regex' }],
          [{ type: 'status', statusCode: 200 }],
        ),
      ]),
    ).toEqual([]);
  });

  it('flags duplicate rule ids', () => {
    const rule = ruleWith(
      [{ type: 'method', value: 'GET' }],
      [{ type: 'block', mode: 'reset' }],
    );
    expect(collectRuleDiagnostics([rule, rule])).toContainEqual(
      expect.objectContaining({ code: 'duplicate-rule-id' }),
    );
  });

  it('flags an uncompilable regex matcher', () => {
    expect(
      collectRuleDiagnostics([
        ruleWith(
          [{ type: 'path', value: '(', mode: 'regex' }],
          [{ type: 'block', mode: 'reset' }],
        ),
      ]),
    ).toContainEqual(expect.objectContaining({ code: 'invalid-regex' }));
  });

  it('flags an inverted status range', () => {
    expect(
      collectRuleDiagnostics([
        ruleWith(
          [{ type: 'status', min: 500, max: 400 }],
          [{ type: 'block', mode: 'reset' }],
        ),
      ]),
    ).toContainEqual(expect.objectContaining({ code: 'invalid-status-range' }));
  });

  it('flags an invalid JSON body action', () => {
    expect(
      collectRuleDiagnostics([
        ruleWith(
          [{ type: 'method', value: 'GET' }],
          [
            {
              type: 'body',
              phase: 'response',
              format: 'json',
              content: '{ not json',
            },
          ],
        ),
      ]),
    ).toContainEqual(expect.objectContaining({ code: 'invalid-json-body' }));
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