import { describe, expect, it } from 'vitest';

import {
  headersWithoutCookies,
  headersWithRuleEffects,
  payloadClipboardText,
  requestCookiePairs,
  responseCookiePairs,
  responseTimingSegments,
  typeLabel,
} from '../../utils';

describe('capture row format', () => {
  it('normalizes native gRPC content types to a compact label', () => {
    expect(typeLabel('application/grpc')).toBe('grpc');
    expect(typeLabel('application/grpc+proto')).toBe('grpc');
    expect(typeLabel('application/grpc+json; charset=utf-8')).toBe('grpc');
    expect(typeLabel('application/grpc-web+proto')).toBe('grpc-web');
  });

  it('keeps Cookie and Set-Cookie exclusively in the Cookies tab', () => {
    const headers = [
      { name: ':method', value: 'GET', isPseudo: true },
      { name: 'Cookie', value: 'session=one' },
      { name: 'content-type', value: 'application/json' },
      { name: 'SET-COOKIE', value: 'session=two; HttpOnly' },
    ];

    expect(headersWithoutCookies(headers)).toEqual([
      { name: ':method', value: 'GET', isPseudo: true },
      { name: 'content-type', value: 'application/json' },
    ]);
  });

  it('deduplicates request/response wire headers against exact rule effects', () => {
    expect(headersWithRuleEffects([
      { name: 'x-old', value: 'before' },
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ], 'request')).toEqual([
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ]);
    expect(headersWithRuleEffects([
      { name: 'x-old', value: 'after' },
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ], 'response')).toEqual([
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ]);
  });

  it('parses every HTTP/2 Cookie header row', () => {
    expect(requestCookiePairs([
      { name: 'cookie', value: 'theme=dark' },
      { name: 'Cookie', value: 'session=abc=123' },
      { name: 'cookie', value: 'one=1; two=2' },
    ])).toEqual([
      ['theme', 'dark'],
      ['session', 'abc=123'],
      ['one', '1'],
      ['two', '2'],
    ]);
  });

  it('keeps each Set-Cookie header intact', () => {
    expect(responseCookiePairs([
      { name: 'set-cookie', value: 'session=abc; Path=/; HttpOnly' },
      { name: 'Set-Cookie', value: 'theme=dark; SameSite=Lax' },
    ])).toEqual([
      ['session', 'session=abc; Path=/; HttpOnly'],
      ['theme', 'theme=dark; SameSite=Lax'],
    ]);
  });

  it('builds honest waiting and response-body timing segments', () => {
    expect(responseTimingSegments(1_000, 1_480, 1_600)).toEqual([
      { id: 'waiting', durationMs: 480, offsetPercent: 0, widthPercent: 80 },
      { id: 'download', durationMs: 120, offsetPercent: 80, widthPercent: 20 },
    ]);
    expect(responseTimingSegments(1_000, undefined, 1_600)).toEqual([]);
  });
});

describe('payload clipboard text', () => {
  it('omits only an unfinished UTF-8 suffix in a limited text preview', () => {
    const bytes = new Uint8Array([0x61, 0xff, 0x62, 0xe4, 0xbd]);

    expect(payloadClipboardText(bytes, true, true)).toBe('a\ufffdb');
    expect(payloadClipboardText(bytes, true)).toBe('a\ufffdb\ufffd');
    expect(payloadClipboardText(bytes, true, false)).toBe('a\ufffdb\ufffd');
  });

  it('keeps every byte when copying binary payloads regardless of the preview limit', () => {
    const bytes = new Uint8Array([0x61, 0xff, 0x62, 0xe4, 0xbd]);
    const expected = '61 ff 62 e4 bd';

    expect(payloadClipboardText(bytes, false, true)).toBe(expected);
    expect(payloadClipboardText(bytes, false, false)).toBe(expected);
  });
});