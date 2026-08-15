import { describe, expect, it } from 'vitest';

import { redactHeaders, redactQueryString, redactUrl } from '../../utils';

describe('redactHeaders', () => {
  it('excludes pseudo headers and rule effect metadata from standard HAR', () => {
    expect(redactHeaders([
      { name: ':method', value: 'GET', isPseudo: true },
      { name: 'x-result', value: 'after' },
      { name: 'x-result', value: 'before', ruleEffect: 'replace' },
      { name: 'x-result', value: 'after', ruleEffect: 'set' },
    ], { authorization: false, cookies: false, bodies: false }, 'response')).toEqual([
      { name: 'x-result', value: 'after' },
    ]);
  });

  it('materializes request rule effects as actual upstream headers', () => {
    expect(redactHeaders([
      { name: 'x-set', value: 'before' },
      { name: 'x-remove', value: 'gone' },
      { name: 'x-set', value: 'before', ruleEffect: 'replace' },
      { name: 'x-set', value: 'after', ruleEffect: 'set' },
      { name: 'x-append', value: 'extra', ruleEffect: 'append' },
      { name: 'x-remove', value: 'gone', ruleEffect: 'remove' },
    ], { authorization: false, cookies: false, bodies: false }, 'request')).toEqual([
      { name: 'x-set', value: 'after' },
      { name: 'x-append', value: 'extra' },
    ]);
  });
});

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
