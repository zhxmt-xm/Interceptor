import { describe, expect, it } from 'vitest';

import type { BreakpointEdit } from '@interceptor/core-protocol';

import type { MutableRequestState } from '../../interfaces';
import { ActionExecutor } from '../../internal/action-executor';
import { applyRequestEdit } from '../../utils';

describe('HTTP message editing', () => {
  it('updates every requested header without changing the body', async () => {
    const state: MutableRequestState = {
      method: 'POST',
      url: 'http://example.test/upload',
      headers: {
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
        'content-length': '12',
        'transfer-encoding': 'chunked',
        'x-original': 'yes',
      },
    };

    await applyRequestEdit(state, {
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Content-Encoding', value: 'br' },
        { name: 'Content-Length', value: '999' },
        { name: 'X-Edited', value: 'yes' },
      ],
    });

    expect(state.headers).toEqual({
      'Content-Type': 'application/json',
      'Content-Encoding': 'br',
      'Content-Length': '999',
      'X-Edited': 'yes',
    });
    expect(state.body).toBeUndefined();
  });

  it('merges the header names explicitly edited at a breakpoint', async () => {
    const state = {
      method: 'POST',
      url: 'http://example.test/upload',
      headers: { 'content-length': '12' },
      editedHeaderNames: new Set<string>(['x-rule-edited']),
    };
    const edit: BreakpointEdit & { editedHeaderNames: string[] } = {
      headers: [{ name: 'Content-Length', value: '999' }],
      editedHeaderNames: ['Content-Length', 'CONTENT-ENCODING'],
    };

    await applyRequestEdit(state, edit);

    expect([...state.editedHeaderNames]).toEqual([
      'x-rule-edited',
      'content-length',
      'content-encoding',
    ]);
  });

  it('records a Rules header action even when removing an absent field', async () => {
    const state = {
      method: 'POST',
      url: 'http://example.test/upload',
      headers: {},
      editedHeaderNames: new Set<string>(),
    };

    await new ActionExecutor().applyRequest(state, {
      type: 'header',
      phase: 'request',
      op: 'remove',
      name: 'Content-Length',
    });

    expect([...state.editedHeaderNames]).toEqual(['content-length']);
  });
});