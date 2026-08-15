import { describe, expect, it } from 'vitest';

import type { BreakpointEdit } from '@interceptor/core-protocol';

import type { MutableRequestState, MutableResponseState } from '../../interfaces';
import { ActionExecutor } from '../../internal/action-executor';
import {
  applyRequestEdit,
  applyResponseEdit,
  buildBreakpointHeaderEffects,
} from '../../utils';

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

  it('merges response header names explicitly edited at a breakpoint', async () => {
    const state: MutableResponseState = {
      statusCode: 200,
      headers: { 'content-length': '12' },
      editedHeaderNames: new Set<string>(['x-rule-edited']),
    };

    await applyResponseEdit(state, {
      headers: [{ name: 'Content-Length', value: '999' }],
      editedHeaderNames: ['Content-Length', 'CONTENT-ENCODING'],
    });

    expect([...state.editedHeaderNames!]).toEqual([
      'x-rule-edited',
      'content-length',
      'content-encoding',
    ]);
  });

  it('diffs duplicate and reordered breakpoint header values without over-reporting', () => {
    expect(buildBreakpointHeaderEffects(
      'r1',
      'request',
      { 'x-duplicate': ['same', 'same'] },
      {
        headers: [{ name: 'x-duplicate', value: 'same' }],
        editedHeaderNames: ['x-duplicate'],
      },
    )).toEqual([
      { ruleId: 'r1', phase: 'request', effect: 'remove', name: 'x-duplicate', value: 'same' },
    ]);

    expect(buildBreakpointHeaderEffects(
      'r1',
      'request',
      { 'x-duplicate': 'same' },
      {
        headers: [
          { name: 'x-duplicate', value: 'same' },
          { name: 'x-duplicate', value: 'same' },
        ],
        editedHeaderNames: ['x-duplicate'],
      },
    )).toEqual([
      { ruleId: 'r1', phase: 'request', effect: 'set', name: 'x-duplicate', value: 'same' },
    ]);

    expect(buildBreakpointHeaderEffects(
      'r1',
      'request',
      { 'x-order': ['a', 'b'] },
      {
        headers: [
          { name: 'x-order', value: 'b' },
          { name: 'x-order', value: 'a' },
        ],
        editedHeaderNames: ['x-order'],
      },
    )).toEqual([
      { ruleId: 'r1', phase: 'request', effect: 'replace', name: 'x-order', value: 'a' },
      { ruleId: 'r1', phase: 'request', effect: 'set', name: 'x-order', value: 'a' },
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