import { describe, expect, it } from 'vitest';
import type { InspectionHttpMessage } from '../../interfaces/inspection';
import { InspectionProtocolError } from '../../internal/errors';
import {
  decodeInspectionChunk,
  encodeInspectionChunk,
  parseInspectionMessage,
} from '../../utils/inspection-protocol';

const sessionId = '00000000-0000-4000-8000-000000000001';
const exchangeId = '00000000-0000-4000-8000-000000000002';
const stageId = '00000000-0000-4000-8000-000000000003';
const decisionId = '00000000-0000-4000-8000-000000000004';
const bodyId = '00000000-0000-4000-8000-000000000005';
const cancellationId = '00000000-0000-4000-8000-000000000006';
const envelope = { protocolVersion: 2 as const, sessionId, exchangeId };
const headers: Array<[string, string]> = [
  ['X-Tag', 'first'], ['x-tag', 'second'], ['X-Empty', ''],
];
const request = { method: 'POST', url: 'https://api.test/path?q=1', httpVersion: '2' as const, headers };
const replacement = { action: 'replace' as const, bodyId, byteLength: 0 };
const encode = (value: unknown) => JSON.stringify(value);
const decode = (value: unknown) => parseInspectionMessage(encode(value), sessionId);

describe('inspection HTTP protocol messages', () => {
  it('distinguishes incomplete request prefixes and receiver discard from complete body ends', () => {
    for (const reason of ['early-response', 'synthetic-response']) {
      const stopped = { ...envelope, type: 'body.stopped', bodyId, byteLength: 2, reason };
      expect(decode(stopped)).toEqual(stopped);
    }
    const discard = { ...envelope, type: 'body.discard', bodyId };
    expect(decode(discard)).toEqual(discard);
  });

  it('rejects malformed stop/discard metadata without weakening complete end validation', () => {
    const stopped = { ...envelope, type: 'body.stopped', bodyId, byteLength: 2, reason: 'early-response' };
    for (const invalid of [
      { ...stopped, reason: 'other' }, { ...stopped, reason: null }, { ...stopped, byteLength: -1 },
      { ...stopped, byteLength: 1.5 }, { ...stopped, byteLength: '2' }, { ...stopped, trailers: [] },
      { ...envelope, type: 'body.discard', bodyId, byteLength: 0 },
      { ...envelope, type: 'body.discard', bodyId: '' },
    ]) expect(() => decode(invalid)).toThrow(InspectionProtocolError);
  });

  it('preserves trailer order, duplicate case and empty values at the body boundary', () => {
    const message = { ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: headers };
    expect(decode(message)).toEqual(message);
    expect(decode({ ...message, trailers: [] })).toEqual({ ...message, trailers: [] });
    const maximum = Array.from({ length: 256 }, () => ['X-Trailer', '']);
    expect(decode({ ...message, trailers: maximum })).toEqual({ ...message, trailers: maximum });
  });

  it('requires an explicit trailer list and rejects framing, routing and invalid trailer fields', () => {
    const end = { ...envelope, type: 'body.end', bodyId, byteLength: 0 };
    expect(() => decode(end)).toThrow(InspectionProtocolError);
    for (const trailers of [
      null, [['X', 'a\r\nb']], [[':authority', 'host']],
      ...['Content-Length', 'tRaNsFeR-eNcOdInG', 'Trailer', 'HOST'].map(name => [[name, 'value']]),
      Array.from({ length: 257 }, () => ['X-Trailer', '']),
    ]) {
      expect(() => decode({ ...end, trailers })).toThrow(InspectionProtocolError);
    }
    expect(() => decode({ ...end, trailers: [['X', 'a'.repeat(65536)]] })).toThrow(InspectionProtocolError);
    expect(() => decode({ ...end, type: 'body.received', trailers: [] })).toThrow(InspectionProtocolError);
  });

  const messages: InspectionHttpMessage[] = [
    { ...envelope, type: 'http.request', stageId, request },
    { ...envelope, type: 'http.response', stageId, response: { statusCode: 200, headers } },
    { ...envelope, type: 'http.response', stageId, response: { statusCode: 101, headers } },
    { ...envelope, type: 'http.informational', statusCode: 103, headers },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request', decision: { action: 'bypass' } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response', decision: { action: 'bypass' } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request', decision: { action: 'abort', mode: 'reset' } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response', decision: { action: 'abort', mode: 'close' } },
    {
      ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request',
      decision: { action: 'intercept', method: 'PUT', url: request.url, headers, editedHeaderNames: ['x-tag'], body: { action: 'keep' }, delayMs: 20 },
    },
    {
      ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response',
      decision: { action: 'intercept', statusCode: 202, headers, editedHeaderNames: [], body: replacement, delayMs: 0 },
    },
    {
      ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request',
      decision: { action: 'respond', statusCode: 204, headers: [], body: replacement },
    },
    { ...envelope, type: 'http.applied', stageId, decisionId },
    { ...envelope, type: 'http.upgraded', stageId, decisionId },
    { ...envelope, type: 'http.upgrade-ready', stageId, decisionId },
    { ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: Number.MAX_SAFE_INTEGER },
    { ...envelope, type: 'exchange.completed' },
    { ...envelope, type: 'exchange.cancel', cancellationId, reason: 'user' },
    { ...envelope, type: 'exchange.cancelled', cancellationId },
    { ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength: null },
    { ...envelope, type: 'body.open', bodyId, phase: 'response', role: 'applied', byteLength: 0 },
    { ...envelope, type: 'body.ack', bodyId, offset: 32768 },
    { ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] },
    { ...envelope, type: 'body.received', bodyId, byteLength: 32768 },
  ];

  it.each(messages.map((message, index) => ({ message, index })))(
    'round trips typed message $index without dropping fields or header order',
    ({ message }) => {
      expect(decode(message)).toEqual(message);
    },
  );

  it('does not retain mutable references to the input copy', () => {
    const parsed = decode(messages[0]);
    if (parsed.type !== 'http.request') throw new Error('Expected request');
    parsed.request.headers[0]![1] = 'changed';
    expect(headers[0]![1]).toBe('first');
  });

  const invalid = [
    null, [], {}, 'text',
    { ...envelope, type: 'flow.open' },
    { ...messages[0], protocolVersion: 1 },
    { ...messages[0], sessionId: exchangeId },
    { ...messages[0], exchangeId: exchangeId.replace('000000000002', 'AAAAAAAAAAAA') },
    { ...messages[0], extra: true },
    { ...messages[0], stageId: '' },
    ...['', 'GET\r\nHost: stolen', 'a'.repeat(65)].map(method => ({ ...messages[0], request: { ...request, method } })),
    ...['ftp://api.test/', '/path', 'https:api.test', 'https:/api.test', 'https://name:secret@api.test/', 'https://api.test/#fragment', 'https://api.test/\npath'].map(url => ({ ...messages[0], request: { ...request, url } })),
    { ...messages[0], request: { ...request, httpVersion: '3' } },
    { ...messages[0], request: { ...request, body: 'unexpected' } },
    ...[[['Bad Header', 'x']], [[':authority', 'api.test']], [['X', 'a\r\nb']], [['X', 1]], [['X']], [['X', 'a', 'b']]].map(badHeaders => ({ ...messages[0], request: { ...request, headers: badHeaders } })),
    { ...messages[0], request: { ...request, headers: Array.from({ length: 257 }, () => ['x', 'v']) } },
    { ...envelope, type: 'http.response', stageId, response: { statusCode: 103, headers } },
    { ...envelope, type: 'http.informational', statusCode: 101, headers },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response', decision: { action: 'respond', statusCode: 200, headers, body: replacement } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request', decision: { action: 'bypass', body: { action: 'keep' } } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request', decision: { action: 'abort', mode: 'bypass' } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'request', decision: { action: 'respond', statusCode: 200, headers, body: { action: 'keep' } } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response', decision: { action: 'intercept', statusCode: 200, headers, editedHeaderNames: ['X-Tag'], body: replacement, delayMs: 0 } },
    { ...envelope, type: 'http.decision', stageId, decisionId, phase: 'response', decision: { action: 'intercept', statusCode: 200, headers, editedHeaderNames: ['x', 'x'], body: replacement, delayMs: -1 } },
    { ...envelope, type: 'body.open', bodyId, phase: 'response', role: 'original', byteLength: -1 },
    { ...envelope, type: 'body.ack', bodyId, offset: Number.MAX_SAFE_INTEGER + 1 },
    { ...envelope, type: 'body.end', bodyId, byteLength: 0.5, trailers: [] },
    { ...envelope, type: 'exchange.cancel', cancellationId, reason: 'automatic-bypass' },
    { ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: -1 },
  ];

  it.each(invalid.map((message, index) => ({ message, index })))(
    'rejects invalid metadata $index with a fixed non-sensitive error',
    ({ message }) => {
      expect(() => decode(message)).toThrow(InspectionProtocolError);
      expect(() => decode(message)).toThrow('Invalid inspection protocol message');
    },
  );

  it('accepts the exact UTF-8 limit and rejects one byte over it', () => {
    const head = { ...envelope, type: 'http.request', stageId, request: { ...request, headers: [['x', '']] } };
    const remaining = 65536 - Buffer.byteLength(encode(head), 'utf8');
    head.request.headers[0]![1] = 'a'.repeat(remaining);
    expect(Buffer.byteLength(encode(head), 'utf8')).toBe(65536);
    expect(decode(head)).toEqual(head);
    head.request.headers[0]![1] += 'a';
    expect(() => decode(head)).toThrow(InspectionProtocolError);
  });

  it('counts UTF-8 bytes rather than JavaScript character length', () => {
    const value = { ...envelope, type: 'http.request', stageId, request: { ...request, headers: [['x', 'é'.repeat(33000)]] } };
    expect(encode(value).length).toBeLessThan(65536);
    expect(() => decode(value)).toThrow(InspectionProtocolError);
  });

  it('rejects malformed JSON without including its content in the error', () => {
    expect(() => parseInspectionMessage('{"secret-token":', sessionId))
      .toThrow(new InspectionProtocolError());
  });

  it('accepts the exact method, URL and header-count limits', () => {
    const url = 'https://api.test/' + 'a'.repeat(8192 - 'https://api.test/'.length);
    const head = { ...envelope, type: 'http.request', stageId, request: {
      method: 'a'.repeat(64), url, httpVersion: '1.1',
      headers: Array.from({ length: 256 }, () => ['x', '']),
    } };
    expect(decode(head)).toEqual(head);
    expect(() => decode({ ...head, request: { ...head.request, url: url + 'a' } }))
      .toThrow(InspectionProtocolError);
  });
});

describe('inspection binary content framing', () => {
  it.each([1, 32768])('round trips %i bytes with UUID and big-endian offset', (length) => {
    const payload = Uint8Array.from({ length }, (_, index) => index % 256);
    const chunk = { bodyId, offset: 0x100000001, payload };
    const encoded = encodeInspectionChunk(chunk);
    expect(encoded.byteLength).toBe(length + 24);
    expect(Buffer.from(encoded).subarray(0, 16).toString('hex')).toBe(bodyId.replaceAll('-', ''));
    expect(Buffer.from(encoded).readBigUInt64BE(16)).toBe(0x100000001n);
    expect(decodeInspectionChunk(encoded)).toEqual(chunk);
  });

  it.each([0, 32769])('rejects an invalid payload length %i', (length) => {
    expect(() => encodeInspectionChunk({ bodyId, offset: 0, payload: new Uint8Array(length) }))
      .toThrow(InspectionProtocolError);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity])('rejects an invalid offset %s', (offset) => {
    expect(() => encodeInspectionChunk({ bodyId, offset, payload: new Uint8Array([1]) }))
      .toThrow(InspectionProtocolError);
  });

  it('rejects an invalid body ID rather than silently encoding partial bytes', () => {
    expect(() => encodeInspectionChunk({ bodyId: 'bad', offset: 0, payload: new Uint8Array([1]) }))
      .toThrow(InspectionProtocolError);
  });

  it.each([0, 24, 32793])('rejects an invalid binary frame length %i', (length) => {
    expect(() => decodeInspectionChunk(new Uint8Array(length))).toThrow(InspectionProtocolError);
  });

  it('rejects an offset that cannot be represented exactly in the protocol', () => {
    const bytes = Buffer.alloc(25);
    bytes.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 16);
    expect(() => decodeInspectionChunk(bytes)).toThrow(InspectionProtocolError);
  });

  it('rejects a content end offset beyond the safe integer range', () => {
    expect(() => encodeInspectionChunk({ bodyId, offset: Number.MAX_SAFE_INTEGER, payload: new Uint8Array([1]) }))
      .toThrow(InspectionProtocolError);
    const bytes = Buffer.alloc(25);
    bytes.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER), 16);
    expect(() => decodeInspectionChunk(bytes)).toThrow(InspectionProtocolError);
  });
});
