import { describe, expect, it } from 'vitest';

import type { CollectionRequest } from '../../interfaces';
import { parseImportedCollection } from '../../utils';

function payload(...nodes: unknown[]): unknown {
  return { nodes };
}

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'request',
    id: 'file-id',
    name: 'Create order',
    method: 'POST',
    url: 'https://api.example/orders',
    protocol: 'auto',
    query: [],
    headers: [],
    bodyType: 'json',
    bodyText: '{}',
    bodyForm: [],
    auth: { type: 'none', token: '', username: '', password: '' },
    ...overrides,
  };
}

describe('parseImportedCollection', () => {
  it('rejects a file whose top level is not a node payload', () => {
    expect(parseImportedCollection([]).ok).toBe(false);
    expect(parseImportedCollection({ requests: [] }).ok).toBe(false);
  });

  it('imports a valid request and regenerates its id', () => {
    const result = parseImportedCollection(payload(request()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.leafCount).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.nodes[0]?.id).not.toBe('file-id');
  });

  it('preserves the request content field by field', () => {
    const result = parseImportedCollection(payload(request({
      headers: [{ id: 'h1', name: 'accept', value: 'application/json', enabled: false }],
    })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = result.nodes[0] as CollectionRequest;
    expect(imported.method).toBe('POST');
    expect(imported.url).toBe('https://api.example/orders');
    expect(imported.headers).toEqual([
      expect.objectContaining({
        name: 'accept',
        value: 'application/json',
        enabled: false,
      }),
    ]);
    expect(imported.headers[0]?.id).not.toBe('h1');
  });

  it('rejects a node whose kind is not a request', () => {
    const result = parseImportedCollection(payload(request({ kind: 'rule' })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([{ path: 'Create order', reason: 'unknown-kind' }]);
  });

  it('rejects a request whose method or url is not a string', () => {
    const result = parseImportedCollection(payload(
      request({ name: 'No method', method: 42 }),
      request({ name: 'No url', url: null }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'No method', reason: 'invalid-method' },
      { path: 'No url', reason: 'invalid-url' },
    ]);
  });

  it('rejects unknown body types and protocols', () => {
    const result = parseImportedCollection(payload(
      request({ name: 'Odd body', bodyType: 'xml' }),
      request({ name: 'Odd protocol', protocol: 'h3' }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Odd body', reason: 'unknown-body-type' },
      { path: 'Odd protocol', reason: 'unknown-protocol' },
    ]);
  });

  it('rejects field rows that are not arrays', () => {
    const result = parseImportedCollection(payload(request({ name: 'Bad query', query: 'a=1' })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([{ path: 'Bad query', reason: 'invalid-field-rows' }]);
  });

  it('rejects malformed field rows, auth and body text', () => {
    const result = parseImportedCollection(payload(
      request({
        name: 'Bad row',
        headers: [{ id: 'h', name: 'accept', value: 42, enabled: true }],
      }),
      request({ name: 'Bad auth', auth: { type: 'basic', username: 42 } }),
      request({ name: 'Bad body', bodyText: 42 }),
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual([
      { path: 'Bad row', reason: 'invalid-field-rows' },
      { path: 'Bad auth', reason: 'invalid-auth' },
      { path: 'Bad body', reason: 'invalid-body-text' },
    ]);
  });

  it('keeps valid siblings when one request inside a folder is malformed', () => {
    const result = parseImportedCollection(payload({
      kind: 'folder',
      id: 'f',
      name: 'Checkout',
      children: [request({ name: 'Good' }), request({ name: 'Broken', url: 7 })],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folderCount).toBe(1);
    expect(result.leafCount).toBe(1);
    expect(result.skipped).toEqual([{ path: 'Checkout / Broken', reason: 'invalid-url' }]);
  });
});
