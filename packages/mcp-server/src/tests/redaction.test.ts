import { describe, expect, it } from 'vitest';

import { McpRedactor } from '../redaction/entry';

describe('McpRedactor', () => {
  const redactor = new McpRedactor();

  it('masks credential headers but keeps their names', () => {
    const result = redactor.redactHeaders([
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
    const result = redactor.redactHeaders([
      { name: 'Authorization', value: 'secret', ruleEffect: 'set', ruleId: 'r1' },
    ]);

    expect(result[0]).toMatchObject({ ruleEffect: 'set', ruleId: 'r1', value: '<redacted>' });
  });

  it('masks credential query parameters in absolute URLs', () => {
    const result = redactor.redactUrl('https://api.example.com/v1?access_token=abc&page=2');

    expect(result).toContain('access_token=%3Credacted%3E');
    expect(result).toContain('page=2');
  });

  it('masks credential query parameters in relative paths', () => {
    expect(redactor.redactPath('/v1/me?token=abc&x=1')).toBe('/v1/me?token=%3Credacted%3E&x=1');
  });

  it('leaves paths without a query untouched', () => {
    expect(redactor.redactPath('/v1/me')).toBe('/v1/me');
    expect(redactor.redactPath(undefined)).toBeUndefined();
  });

  it('leaves unparsable URLs untouched instead of dropping data', () => {
    expect(redactor.redactUrl('not a url')).toBe('not a url');
  });

  it('treats audio and video as opaque', () => {
    expect(redactor.isOpaqueBody('video/mp4')).toBe(true);
    expect(redactor.isOpaqueBody('AUDIO/mpeg')).toBe(true);
    expect(redactor.isOpaqueBody('application/json')).toBe(false);
    expect(redactor.isOpaqueBody(null)).toBe(false);
  });

  it('truncates oversized bodies and reports how much was read', () => {
    const data = new TextEncoder().encode('x'.repeat(200_000));

    const preview = redactor.previewBody(data, 'text/plain');

    expect(preview).toMatchObject({ truncated: true, bytesRead: 128 * 1024 });
  });

  it('returns metadata only for media bodies', () => {
    const preview = redactor.previewBody(new Uint8Array([1, 2, 3]), 'video/mp4');

    expect(preview).toEqual({ opaque: true, mimeType: 'video/mp4' });
  });
});
