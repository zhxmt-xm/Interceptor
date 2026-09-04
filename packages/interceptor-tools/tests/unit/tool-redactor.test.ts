import { describe, expect, it } from 'vitest';

import { InterceptorToolRedactor } from '../../src';

describe('InterceptorToolRedactor', () => {
  const interceptorToolRedactor = new InterceptorToolRedactor();

  it('masks credential headers but keeps their names', () => {
    const result = interceptorToolRedactor.redactHeaders([
      { name: 'Authorization', value: 'Bearer real-token' },
      { name: 'cookie', value: 'session=abc' },
      { name: 'Accept', value: 'application/json' },
    ]);

    expect(result).toEqual([
      { name: 'Authorization', value: '<redacted>' },
      { name: 'cookie', value: '<redacted>' },
      { name: 'Accept', value: 'application/json' },
    ]);
  });

  it('preserves extra header fields while masking the value', () => {
    const result = interceptorToolRedactor.redactHeaders([
      { name: 'Authorization', value: 'secret', ruleEffect: 'set', ruleId: 'r1' },
    ]);

    expect(result[0]).toMatchObject({
      ruleEffect: 'set',
      ruleId: 'r1',
      value: '<redacted>',
    });
  });

  it('masks credential query parameters in absolute URLs', () => {
    const result = interceptorToolRedactor.redactUrl(
      'https://api.example.com/v1?access_token=abc&page=2',
    );

    expect(result).toContain('access_token=%3Credacted%3E');
    expect(result).toContain('page=2');
  });

  it('masks URL userinfo credentials', () => {
    const result = interceptorToolRedactor.redactUrl(
      'https://user:password@api.example.com/v1',
    );

    expect(result).toBe('https://%3Credacted%3E:%3Credacted%3E@api.example.com/v1');
    expect(result).not.toContain('user');
    expect(result).not.toContain('password');
  });

  it('masks credential query parameters in relative paths', () => {
    expect(interceptorToolRedactor.redactPath('/v1/me?token=abc&x=1'))
      .toBe('/v1/me?token=%3Credacted%3E&x=1');
  });

  it('leaves paths without a query untouched', () => {
    expect(interceptorToolRedactor.redactPath('/v1/me')).toBe('/v1/me');
    expect(interceptorToolRedactor.redactPath(undefined)).toBeUndefined();
  });

  it('leaves unparsable URLs untouched instead of dropping data', () => {
    expect(interceptorToolRedactor.redactUrl('not a url')).toBe('not a url');
  });

  it('treats audio and video as opaque', () => {
    expect(interceptorToolRedactor.isOpaqueBody('video/mp4')).toBe(true);
    expect(interceptorToolRedactor.isOpaqueBody('AUDIO/mpeg')).toBe(true);
    expect(interceptorToolRedactor.isOpaqueBody('application/json')).toBe(false);
    expect(interceptorToolRedactor.isOpaqueBody(null)).toBe(false);
  });

  it('truncates oversized bodies and reports how much was read', () => {
    const preview = interceptorToolRedactor.previewBody(
      new TextEncoder().encode('x'.repeat(200_000)),
      'text/plain',
    );

    expect(preview).toMatchObject({ truncated: true, bytesRead: 128 * 1024 });
  });

  it('returns metadata only for media bodies', () => {
    expect(interceptorToolRedactor.previewBody(new Uint8Array([1, 2, 3]), 'video/mp4'))
      .toEqual({ opaque: true, mimeType: 'video/mp4' });
  });
});