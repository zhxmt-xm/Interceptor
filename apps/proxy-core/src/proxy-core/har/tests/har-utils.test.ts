import { describe, expect, it } from 'vitest';

import { redactQueryString, redactUrl } from '../utils';

describe('redactUrl', () => {
  it('masks sensitive token query parameters and keeps the rest', () => {
    const redacted = redactUrl(
      'https://api.test/v1/items?draft=1&access_token=abc.def&page=2',
    );
    expect(redacted).toContain('draft=1');
    expect(redacted).toContain('page=2');
    expect(redacted).toContain('access_token=%5BREDACTED%5D');
    expect(redacted).not.toContain('abc.def');
  });

  it('is case-insensitive on parameter names', () => {
    expect(redactUrl('https://x.test/?ApiKey=secret')).not.toContain('secret');
  });

  it('leaves non-sensitive URLs unchanged', () => {
    const url = 'https://x.test/path?a=1&b=2';
    expect(redactUrl(url)).toBe(url);
  });

  it('returns malformed input unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('redactQueryString', () => {
  it('masks sensitive entries by name', () => {
    expect(
      redactQueryString([
        { name: 'q', value: 'search' },
        { name: 'token', value: 'zzz' },
      ]),
    ).toEqual([
      { name: 'q', value: 'search' },
      { name: 'token', value: '[REDACTED]' },
    ]);
  });
});
