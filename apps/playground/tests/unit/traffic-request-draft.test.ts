import { describe, expect, it } from 'vitest';

import { parseTrafficRequestDraft } from '../../server/api/traffic-request-draft';

describe('parseTrafficRequestDraft', () => {
  it('accepts an HTTP request with an empty body', () => {
    expect(parseTrafficRequestDraft({
      body: '',
      headers: { accept: 'application/json' },
      kind: 'http',
      method: 'GET',
      path: '/playground/h1-json',
      protocol: 'h1',
    })).toMatchObject({ body: '', kind: 'http', protocol: 'h1' });
  });

  it.each([
    { clientMessages: [], controls: ['close'], headers: {}, kind: 'websocket', path: '/ws', serverMessages: [] },
    { framing: 'valid', headers: { 'content-type': 'application/grpc' }, kind: 'grpc', path: '/service/method', requestMessages: [], responseMessages: [], responseTrailers: { 'grpc-status': '0' } },
    { connectHeaders: {}, headers: {}, kind: 'tls', method: 'GET', mode: 'https-h2', path: '/', targetHost: 'localhost' },
  ])('accepts a valid $kind draft', (draft) => {
    expect(parseTrafficRequestDraft(draft)).toMatchObject({ kind: draft.kind });
  });

  it('rejects non-string header values', () => {
    expect(() => parseTrafficRequestDraft({
      body: '',
      headers: { 'x-count': 2 },
      kind: 'http',
      method: 'GET',
      path: '/',
      protocol: 'h1',
    })).toThrow('draft.headers.x-count must be a string.');
  });
});