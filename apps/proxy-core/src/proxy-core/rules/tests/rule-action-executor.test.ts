import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyRequestAction,
  applyResponseAction,
} from '../utils';
import type {
  MutableRequestState,
  MutableResponseState,
} from '../interfaces';

function requestState(
  overrides: Partial<MutableRequestState> = {},
): MutableRequestState {
  return {
    method: 'GET',
    url: 'https://api.example.com/users?page=1',
    headers: { 'Content-Type': 'application/json' },
    ...overrides,
  };
}

function responseState(): MutableResponseState {
  return { statusCode: 200, headers: { 'X-Old': 'v' } };
}

describe('applyRequestAction — headers', () => {
  it('sets a request header, replacing case-insensitive existing values', async () => {
    const state = requestState({ headers: { 'content-type': 'text/plain' } });
    const outcome = await applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'set',
      name: 'Content-Type',
      value: 'application/json',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'header.set', detail: 'Content-Type' },
    });
    expect(state.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('appends a request header, merging into an array', async () => {
    const state = requestState({ headers: { 'x-tag': 'a' } });
    await applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'append',
      name: 'x-tag',
      value: 'b',
    });
    expect(state.headers['x-tag']).toEqual(['a', 'b']);
  });

  it('appends a new request header when absent', async () => {
    const state = requestState({ headers: {} });
    const outcome = await applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'append',
      name: 'x-new',
      value: 'v',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'header.append', detail: 'x-new' },
    });
    expect(state.headers['x-new']).toBe('v');
  });

  it('removes a request header case-insensitively', async () => {
    const state = requestState({ headers: { 'Content-Type': 'application/json' } });
    const outcome = await applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'remove',
      name: 'content-type',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'header.remove', detail: 'content-type' },
    });
    expect(state.headers).toEqual({});
  });

  it('returns none when removing an absent header', async () => {
    const state = requestState({ headers: {} });
    expect(
      await applyRequestAction(state, {
        type: 'header',
        phase: 'request',
        op: 'remove',
        name: 'x-missing',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('returns none for set/append without a value', async () => {
    const state = requestState();
    expect(
      await applyRequestAction(state, {
        type: 'header',
        phase: 'request',
        op: 'set',
        name: 'x',
      }),
    ).toEqual({ kind: 'none' });
  });
});

describe('action phase isolation', () => {
  it('ignores response-phase header actions in the request stage', async () => {
    expect(
      await applyRequestAction(requestState(), {
        type: 'header',
        phase: 'response',
        op: 'set',
        name: 'x',
        value: 'v',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('applies response-phase header actions in the response stage', () => {
    const state = responseState();
    const outcome = applyResponseAction(state, {
      type: 'header',
      phase: 'response',
      op: 'set',
      name: 'X-New',
      value: 'v',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'header.set', detail: 'X-New' },
    });
    expect(state.headers['X-New']).toBe('v');
  });

  it('ignores request-phase header actions in the response stage', () => {
    expect(
      applyResponseAction(responseState(), {
        type: 'header',
        phase: 'request',
        op: 'set',
        name: 'x',
        value: 'v',
      }),
    ).toEqual({ kind: 'none' });
  });
});

describe('applyRequestAction — query', () => {
  it('sets a query parameter and updates the url', async () => {
    const state = requestState();
    const outcome = await applyRequestAction(state, {
      type: 'query',
      op: 'set',
      name: 'page',
      value: '2',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'query.set', detail: 'page' },
    });
    expect(new URL(state.url).searchParams.get('page')).toBe('2');
  });

  it('removes a query parameter', async () => {
    const state = requestState();
    const outcome = await applyRequestAction(state, {
      type: 'query',
      op: 'remove',
      name: 'page',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'query.remove', detail: 'page' },
    });
    expect(new URL(state.url).searchParams.has('page')).toBe(false);
  });

  it('returns none when removing an absent query parameter', async () => {
    const state = requestState();
    expect(
      await applyRequestAction(state, { type: 'query', op: 'remove', name: 'missing' }),
    ).toEqual({ kind: 'none' });
  });
});

describe('applyRequestAction — body, synthetic, map-remote, block', () => {
  it('replaces the request body', async () => {
    const state = requestState();
    const outcome = await applyRequestAction(state, {
      type: 'body',
      phase: 'request',
      format: 'json',
      content: '{"x":1}',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'body.set', detail: 'json' },
    });
    expect(state.body).toBe('{"x":1}');
  });

  it('replaces the response body', () => {
    const state = responseState();
    const outcome = applyResponseAction(state, {
      type: 'body',
      phase: 'response',
      format: 'text',
      content: 'hello',
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'body.set', detail: 'text' },
    });
    expect(state.body).toBe('hello');
  });

  it('produces a synthetic response', async () => {
    const outcome = await applyRequestAction(requestState(), {
      type: 'synthetic',
      statusCode: 418,
      headers: [{ name: 'x-teapot', value: '1' }],
      body: 'no coffee',
    });
    expect(outcome.kind).toBe('respond');
    if (outcome.kind === 'respond') {
      expect(outcome.response.statusCode).toBe(418);
      expect(outcome.response.body).toBe('no coffee');
      expect(outcome.response.headers['x-teapot']).toBe('1');
    }
  });

  it('rewrites the request target for map-remote', async () => {
    const state = requestState();
    const outcome = await applyRequestAction(state, {
      type: 'map-remote',
      scheme: 'https',
      host: 'backend.internal',
      port: 8443,
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'map-remote', detail: 'backend.internal:8443' },
    });
    const url = new URL(state.url);
    expect(url.hostname).toBe('backend.internal');
    expect(url.port).toBe('8443');
  });

  it('blocks the request', async () => {
    const outcome = await applyRequestAction(requestState(), {
      type: 'block',
      mode: 'reset',
    });
    expect(outcome).toEqual({
      kind: 'block',
      mode: 'reset',
      summary: { action: 'block', detail: 'reset' },
    });
  });
});

describe('applyRequestAction — map-local path safety', () => {
  let root: string;
  let servedFile: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-maplocal-'));
    servedFile = path.join(root, 'mock.json');
    await fs.writeFile(servedFile, '{"ok":true}');
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('serves the complete file selected by the rule', async () => {
    const outcome = await applyRequestAction(
      requestState(),
      { type: 'map-local', path: servedFile },
    );
    expect(outcome.kind).toBe('respond');
    if (outcome.kind === 'respond') {
      expect(outcome.response.statusCode).toBe(200);
      expect(Buffer.from(outcome.response.body as Uint8Array).toString()).toBe(
        '{"ok":true}',
      );
    }
  });

  it('returns 404 for a missing file', async () => {
    const outcome = await applyRequestAction(
      requestState(),
      { type: 'map-local', path: path.join(root, 'missing.json') },
    );
    expect(outcome.kind).toBe('respond');
    if (outcome.kind === 'respond') {
      expect(outcome.response.statusCode).toBe(404);
    }
  });
});

describe('status and delay', () => {
  it('overrides the response status code', () => {
    const state = responseState();
    const outcome = applyResponseAction(state, {
      type: 'status',
      statusCode: 503,
    });
    expect(outcome).toEqual({
      kind: 'mutated',
      summary: { action: 'status', detail: '503' },
    });
    expect(state.statusCode).toBe(503);
  });

  it('ignores status override in the request stage', async () => {
    expect(
      await applyRequestAction(requestState(), {
        type: 'status',
        statusCode: 503,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('emits a delay outcome for the matching phase', async () => {
    expect(
      await applyRequestAction(requestState(), {
        type: 'delay',
        phase: 'request',
        ms: 250,
      }),
    ).toEqual({
      kind: 'delay',
      ms: 250,
      summary: { action: 'delay', detail: '250ms' },
    });
    expect(
      applyResponseAction(responseState(), {
        type: 'delay',
        phase: 'response',
        ms: 100,
      }),
    ).toEqual({
      kind: 'delay',
      ms: 100,
      summary: { action: 'delay', detail: '100ms' },
    });
  });

  it('ignores a delay whose phase does not match the stage', async () => {
    expect(
      await applyRequestAction(requestState(), {
        type: 'delay',
        phase: 'response',
        ms: 250,
      }),
    ).toEqual({ kind: 'none' });
  });
});
