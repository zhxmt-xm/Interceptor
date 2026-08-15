import { describe, expect, it } from 'vitest';

import type { RuleMatcher } from '@interceptor/core-protocol';

import {
  compileMatcher,
  compileRuleMatchers,
} from '../../utils';
import type { MatchContext } from '../../interfaces';

function context(): MatchContext {
  return {
    request: {
      method: 'GET',
      url: 'https://api.example.com/Users?page=2&tag=a&tag=b',
      host: 'api.example.com',
      path: '/Users',
      query: new URLSearchParams('page=2&tag=a&tag=b'),
      headers: { 'Content-Type': 'application/json', 'X-Req': 'yes' },
      mime: 'application/json',
    },
    response: {
      statusCode: 200,
      headers: { 'content-type': 'text/html', 'set-cookie': ['a=1', 'b=2'] },
      mime: 'text/html',
    },
  };
}

const matches = (matcher: RuleMatcher, ctx: MatchContext = context()): boolean =>
  compileMatcher(matcher)(ctx);

describe('compileMatcher', () => {
  it('matches method case-insensitively', () => {
    expect(matches({ type: 'method', value: 'get' })).toBe(true);
    expect(matches({ type: 'method', value: 'POST' })).toBe(false);
  });

  it('matches host case-insensitively across modes', () => {
    expect(matches({ type: 'host', value: 'API.EXAMPLE.COM', mode: 'exact' })).toBe(true);
    expect(matches({ type: 'host', value: 'EXAMPLE', mode: 'contains' })).toBe(true);
    expect(matches({ type: 'host', value: '^api\\.', mode: 'regex' })).toBe(true);
    expect(matches({ type: 'host', value: 'other.com', mode: 'exact' })).toBe(false);
  });

  it('matches path/url by contains default and honours caseSensitive', () => {
    expect(matches({ type: 'path', value: '/USERS', mode: 'contains' })).toBe(true);
    expect(matches({ type: 'path', value: '/users', mode: 'exact' })).toBe(true);
    expect(matches({ type: 'path', value: '/users', mode: 'exact', caseSensitive: true })).toBe(false);
    expect(matches({ type: 'path', value: '/Users', mode: 'exact', caseSensitive: true })).toBe(true);
    expect(matches({ type: 'url', value: 'tag=a', mode: 'contains' })).toBe(true);
    expect(matches({ type: 'url', value: 'nope', mode: 'contains' })).toBe(false);
  });

  it('matches query values by contains, exact and regex including repeats', () => {
    expect(matches({ type: 'query', key: 'page', mode: 'contains', value: '' })).toBe(true);
    expect(matches({ type: 'query', key: 'missing', mode: 'contains', value: '' })).toBe(false);
    expect(matches({ type: 'query', key: 'page', mode: 'exact', value: '2' })).toBe(true);
    expect(matches({ type: 'query', key: 'tag', mode: 'exact', value: 'b' })).toBe(true);
    expect(matches({ type: 'query', key: 'tag', mode: 'regex', value: '^a$' })).toBe(true);
  });

  it('matches headers by phase with case-insensitive names and multi-value support', () => {
    expect(matches({ type: 'header', phase: 'request', name: 'x-req', mode: 'contains', value: '' })).toBe(true);
    expect(
      matches({ type: 'header', phase: 'request', name: 'content-type', mode: 'exact', value: 'application/json' }),
    ).toBe(true);
    expect(matches({ type: 'header', phase: 'response', name: 'set-cookie', mode: 'contains', value: '' })).toBe(true);
    // 请求头在响应阶段查找不到
    expect(matches({ type: 'header', phase: 'response', name: 'x-req', mode: 'contains', value: '' })).toBe(false);
  });

  it('matches status ranges only when a response is present', () => {
    expect(matches({ type: 'status', min: 200, max: 299 })).toBe(true);
    expect(matches({ type: 'status', min: 400, max: 499 })).toBe(false);
    const requestOnly: MatchContext = { request: context().request };
    expect(matches({ type: 'status', min: 200, max: 299 }, requestOnly)).toBe(false);
  });

  it('matches request and response mime with optional wildcard', () => {
    expect(matches({ type: 'mime', phase: 'request', value: 'application/json' })).toBe(true);
    expect(matches({ type: 'mime', phase: 'request', value: 'application/*' })).toBe(true);
    expect(matches({ type: 'mime', phase: 'response', value: 'text/html' })).toBe(true);
    expect(matches({ type: 'mime', phase: 'response', value: 'application/json' })).toBe(false);
  });

  it('treats an uncompilable regex as never matching', () => {
    expect(matches({ type: 'host', value: '(', mode: 'regex' })).toBe(false);
  });
});

describe('compileRuleMatchers', () => {
  it('requires every matcher to pass (AND semantics)', () => {
    const test = compileRuleMatchers([
      { type: 'method', value: 'GET' },
      { type: 'host', value: 'api.example.com', mode: 'exact' },
    ]);
    expect(test(context())).toBe(true);
  });

  it('fails when any matcher fails', () => {
    const test = compileRuleMatchers([
      { type: 'method', value: 'GET' },
      { type: 'host', value: 'other.com', mode: 'exact' },
    ]);
    expect(test(context())).toBe(false);
  });
});
