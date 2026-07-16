import { describe, expect, it } from 'vitest';

import type { RuleAction } from '@interceptor/core-protocol';

import {
  applyRequestAction,
  applyResponseAction,
  type MutableRequestState,
  type MutableResponseState,
} from '../action-executor';

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
  it('sets a request header, replacing case-insensitive existing values', () => {
    const state = requestState({ headers: { 'content-type': 'text/plain' } });
    const summary = applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'set',
      name: 'Content-Type',
      value: 'application/json',
    });
    expect(summary).toEqual({ action: 'header.set', detail: 'Content-Type' });
    expect(state.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('appends a request header, merging into an array', () => {
    const state = requestState({ headers: { 'x-tag': 'a' } });
    applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'append',
      name: 'x-tag',
      value: 'b',
    });
    expect(state.headers['x-tag']).toEqual(['a', 'b']);
  });

  it('appends a new request header when absent', () => {
    const state = requestState({ headers: {} });
    const summary = applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'append',
      name: 'x-new',
      value: 'v',
    });
    expect(summary).toEqual({ action: 'header.append', detail: 'x-new' });
    expect(state.headers['x-new']).toBe('v');
  });

  it('removes a request header case-insensitively', () => {
    const state = requestState({ headers: { 'Content-Type': 'application/json' } });
    const summary = applyRequestAction(state, {
      type: 'header',
      phase: 'request',
      op: 'remove',
      name: 'content-type',
    });
    expect(summary).toEqual({ action: 'header.remove', detail: 'content-type' });
    expect(state.headers).toEqual({});
  });

  it('returns null when removing an absent header', () => {
    const state = requestState({ headers: {} });
    expect(
      applyRequestAction(state, {
        type: 'header',
        phase: 'request',
        op: 'remove',
        name: 'x-missing',
      }),
    ).toBeNull();
  });

  it('returns null for set/append without a value', () => {
    const state = requestState();
    expect(
      applyRequestAction(state, {
        type: 'header',
        phase: 'request',
        op: 'set',
        name: 'x',
      }),
    ).toBeNull();
  });
});

describe('action phase isolation', () => {
  it('ignores response-phase header actions in the request stage', () => {
    expect(
      applyRequestAction(requestState(), {
        type: 'header',
        phase: 'response',
        op: 'set',
        name: 'x',
        value: 'v',
      }),
    ).toBeNull();
  });

  it('applies response-phase header actions in the response stage', () => {
    const state = responseState();
    const summary = applyResponseAction(state, {
      type: 'header',
      phase: 'response',
      op: 'set',
      name: 'X-New',
      value: 'v',
    });
    expect(summary).toEqual({ action: 'header.set', detail: 'X-New' });
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
    ).toBeNull();
  });
});

describe('applyRequestAction — query', () => {
  it('sets a query parameter and updates the url', () => {
    const state = requestState();
    const summary = applyRequestAction(state, {
      type: 'query',
      op: 'set',
      name: 'page',
      value: '2',
    });
    expect(summary).toEqual({ action: 'query.set', detail: 'page' });
    expect(new URL(state.url).searchParams.get('page')).toBe('2');
  });

  it('adds a new query parameter', () => {
    const state = requestState();
    applyRequestAction(state, {
      type: 'query',
      op: 'set',
      name: 'tag',
      value: 'x',
    });
    expect(new URL(state.url).searchParams.get('tag')).toBe('x');
  });

  it('removes a query parameter', () => {
    const state = requestState();
    const summary = applyRequestAction(state, {
      type: 'query',
      op: 'remove',
      name: 'page',
    });
    expect(summary).toEqual({ action: 'query.remove', detail: 'page' });
    expect(new URL(state.url).searchParams.has('page')).toBe(false);
  });

  it('returns null when removing an absent query parameter', () => {
    const state = requestState();
    expect(
      applyRequestAction(state, { type: 'query', op: 'remove', name: 'missing' }),
    ).toBeNull();
  });
});

describe('actions handled by later tasks', () => {
  it('returns null for block actions in both stages', () => {
    const block: RuleAction = { type: 'block', mode: 'reset' };
    expect(applyRequestAction(requestState(), block)).toBeNull();
    expect(applyResponseAction(responseState(), block)).toBeNull();
  });
});
