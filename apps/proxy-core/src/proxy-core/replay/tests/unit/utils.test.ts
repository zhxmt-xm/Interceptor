import { describe, expect, it } from 'vitest';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import {
  h1HeaderArray,
  h2Headers,
  hasHostHeader,
  isGrpcRequest,
  originalBodyRef,
  originalRequestHeaders,
  replayProtocolOf,
  requestHadBody,
} from '../../utils';

/** 构造一条只带测试关心字段的详情。 */
function detail(overrides: Partial<CaptureExchangeDetail> = {}): CaptureExchangeDetail {
  return {
    summary: {
      id: 'ex-1',
      method: 'POST',
      secure: false,
      protocol: 'HTTP/1.1',
      state: 'completed',
      startedAt: 1,
      requestBytes: 0,
      responseBytes: 0,
    },
    url: 'http://example.com/a',
    requestHeaders: [],
    responseHeaders: [],
    requestTrailers: [],
    responseTrailers: [],
    ...overrides,
  };
}

describe('replay protocol mapping', () => {
  it('maps HTTP/1.x and HTTP/2 to their replay protocol', () => {
    expect(replayProtocolOf('HTTP/1.1')).toBe('h1');
    expect(replayProtocolOf('HTTP/1.0')).toBe('h1');
    expect(replayProtocolOf('h1')).toBe('h1');
    expect(replayProtocolOf('HTTP/2')).toBe('h2');
    expect(replayProtocolOf('h2')).toBe('h2');
  });

  it('rejects WebSocket and tunnel exchanges', () => {
    expect(replayProtocolOf('ws')).toBeNull();
    expect(replayProtocolOf('WebSocket')).toBeNull();
    expect(replayProtocolOf('TLS tunnel')).toBeNull();
  });

  it('treats gRPC content types as out of scope', () => {
    expect(isGrpcRequest('application/grpc')).toBe(true);
    expect(isGrpcRequest('application/grpc+proto')).toBe(true);
    expect(isGrpcRequest('application/json')).toBe(false);
    expect(isGrpcRequest(undefined)).toBe(false);
  });
});

describe('original request reconstruction', () => {
  it('drops rule effect rows but keeps order, case and pseudo headers', () => {
    const headers = originalRequestHeaders([
      { name: 'X-Keep', value: 'a' },
      { name: ':authority', value: 'example.com', isPseudo: true },
      { name: 'x-rewritten', value: 'new', ruleEffect: 'set', ruleId: 'r1' },
      { name: 'x-keep', value: 'b' },
    ]);
    expect(headers).toEqual([
      { name: 'X-Keep', value: 'a' },
      { name: ':authority', value: 'example.com', isPseudo: true },
      { name: 'x-keep', value: 'b' },
    ]);
  });

  it('prefers the original body when a rule replaced it', () => {
    const original = {
      id: 'body-original',
      blobHash: 'hash-original',
      encodedSize: 3,
      truncated: false,
      decodeStatus: 'ok',
    };
    const final = {
      id: 'body-final',
      blobHash: 'hash-final',
      encodedSize: 1,
      truncated: false,
      decodeStatus: 'ok',
    };
    expect(originalBodyRef(detail({
      requestBody: final,
      requestBodyEffect: {
        ruleId: 'r1',
        effect: 'replace',
        source: 'text',
        originalState: 'available',
        originalBody: original,
      },
    }))).toBe(original);
    expect(originalBodyRef(detail({
      requestBody: final,
      requestBodyEffect: {
        ruleId: 'r1',
        effect: 'replace',
        source: 'file',
        originalState: 'unavailable',
      },
    }))).toBeUndefined();
    expect(originalBodyRef(detail({ requestBody: final }))).toBe(final);
  });

  it('detects whether the client sent a body', () => {
    expect(requestHadBody(detail())).toBe(false);
    expect(requestHadBody(detail({
      summary: {
        id: 'ex-1',
        method: 'POST',
        secure: false,
        protocol: 'HTTP/1.1',
        state: 'completed',
        startedAt: 1,
        requestBytes: 4,
        responseBytes: 0,
      },
    }))).toBe(true);
    expect(requestHadBody(detail({
      requestHeaders: [{ name: 'content-length', value: '4' }],
    }))).toBe(true);
    expect(requestHadBody(detail({
      requestHeaders: [{ name: 'content-length', value: '4', ruleEffect: 'set', ruleId: 'r1' }],
    }))).toBe(false);
  });

  it('keeps duplicate h1 headers in wire order', () => {
    expect(h1HeaderArray([
      { name: 'cookie', value: 'a=1' },
      { name: ':path', value: '/a', isPseudo: true },
      { name: 'cookie', value: 'b=2' },
    ])).toEqual(['cookie', 'a=1', 'cookie', 'b=2']);
  });

  it('detects a missing host header', () => {
    expect(hasHostHeader([{ name: 'Host', value: 'example.com' }])).toBe(true);
    expect(hasHostHeader([{ name: 'x-other', value: '1' }])).toBe(false);
  });
});

describe('h2 request headers', () => {
  it('uses captured pseudo headers and merges duplicate values', () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/a?b=1',
      protocol: 'h2' as const,
      headers: [],
      body: null,
    };
    const headers = h2Headers([
      { name: ':method', value: 'PUT', isPseudo: true },
      { name: ':path', value: '/a?b=1', isPseudo: true },
      { name: ':authority', value: 'example.com', isPseudo: true },
      { name: 'cookie', value: 'a=1' },
      { name: 'cookie', value: 'b=2' },
    ], request, new URL(request.url));
    expect(headers[':method']).toBe('PUT');
    expect(headers[':path']).toBe('/a?b=1');
    expect(headers[':scheme']).toBe('https');
    expect(headers[':authority']).toBe('example.com');
    expect(headers.cookie).toEqual(['a=1', 'b=2']);
  });

  it('falls back to the URL when pseudo headers are missing', () => {
    const request = {
      method: 'GET',
      url: 'https://example.com/path?x=1',
      protocol: 'h2' as const,
      headers: [],
      body: null,
    };
    const headers = h2Headers([], request, new URL(request.url));
    expect(headers[':method']).toBe('GET');
    expect(headers[':path']).toBe('/path?x=1');
    expect(headers[':authority']).toBe('example.com');
  });
});
