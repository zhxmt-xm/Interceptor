import { describe, expect, it } from 'vitest';

import type { RuleAction, RuleMatcher } from '@interceptor/core-protocol';

import type {
  MutableRequestState,
  MutableResponseState,
  MatchContext,
} from '../interfaces';
import { RuleEngine } from '../entry';
import { BreakpointQueue } from '../rule-breakpoint-queue';

function rule(
  id: string,
  matchers: RuleMatcher[],
  actions: RuleAction[],
  overrides: { priority?: number; enabled?: boolean } = {},
) {
  return {
    id,
    name: id,
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 100,
    matchers,
    actions,
  };
}

function requestContext(): MatchContext {
  return {
    request: {
      method: 'GET',
      url: 'https://api.test/users',
      host: 'api.test',
      path: '/users',
      query: new URLSearchParams(),
      headers: {},
    },
  };
}

function requestState(): MutableRequestState {
  return { method: 'GET', url: 'https://api.test/users', headers: {} };
}

describe('RuleEngine — request evaluation', () => {
  it('applies a matching rule and records a hit with the revision', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 3,
      rules: [
        rule('r1', [{ type: 'host', value: 'api.test', mode: 'exact' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-tag', value: '1' },
        ]),
      ],
    });
    const state = requestState();
    const result = await engine.evaluateRequest(requestContext(), state);
    expect(result.kind).toBe('continue');
    expect(state.headers['x-tag']).toBe('1');
    expect(result.hits).toEqual([
      {
        ruleId: 'r1',
        ruleRevision: 3,
        phase: 'request',
        action: 'header.set',
        summary: 'x-tag',
      },
    ]);
  });

  it('records set, append and remove header effects in execution order', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 4,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-set', value: 'after' },
          { type: 'header', phase: 'request', op: 'append', name: 'x-append', value: 'second' },
          { type: 'header', phase: 'request', op: 'remove', name: 'x-remove' },
        ]),
      ],
    });
    const context = requestContext();
    context.request.headers['x-set'] = 'before';
    context.request.headers['x-append'] = 'first';
    context.request.headers['x-remove'] = ['one', 'two'];
    const state: MutableRequestState = {
      method: 'GET',
      url: context.request.url,
      headers: { ...context.request.headers },
    };

    const result = await engine.evaluateRequest(context, state);

    expect(result.headerEffects).toEqual([
      { phase: 'request', effect: 'replace', name: 'x-set', value: 'before' },
      { phase: 'request', effect: 'set', name: 'x-set', value: 'after' },
      { phase: 'request', effect: 'append', name: 'x-append', value: 'second' },
      { phase: 'request', effect: 'remove', name: 'x-remove', value: 'one' },
      { phase: 'request', effect: 'remove', name: 'x-remove', value: 'two' },
    ]);
    expect(state.headers).toMatchObject({
      'x-set': 'after',
      'x-append': ['first', 'second'],
    });
    expect(state.headers['x-remove']).toBeUndefined();
  });

  it('skips non-matching and disabled rules', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('miss', [{ type: 'host', value: 'other.test', mode: 'exact' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x', value: '1' },
        ]),
        rule('off', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }], {
          enabled: false,
        }),
      ],
    });
    const state = requestState();
    const result = await engine.evaluateRequest(requestContext(), state);
    expect(result).toMatchObject({ kind: 'continue', hits: [] });
    expect(state.headers).toEqual({});

    // 仅含 disabled 规则时编译结果为空。
    const disabledOnly = new RuleEngine(new BreakpointQueue());
    disabledOnly.setRuleSet({
      revision: 1,
      rules: [
        rule('off', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }], {
          enabled: false,
        }),
      ],
    });
    expect(disabledOnly.hasRules).toBe(false);
  });

  it('executes rules in priority then id order', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('b', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-order', value: 'low' },
        ], { priority: 200 }),
        rule('a', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-order', value: 'high' },
        ], { priority: 100 }),
      ],
    });
    const state = requestState();
    const result = await engine.evaluateRequest(requestContext(), state);
    expect(result.hits.map((hit) => hit.ruleId)).toEqual(['a', 'b']);
    // priority 100 (a) 先 set high，priority 200 (b) 后 set low 覆盖
    expect(state.headers['x-order']).toBe('low');
  });

  it('short-circuits on a synthetic response', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'synthetic', statusCode: 200, body: 'ok' },
        ]),
      ],
    });
    const result = await engine.evaluateRequest(requestContext(), requestState());
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') {
      expect(result.response.statusCode).toBe(200);
      expect(result.response.body).toBe('ok');
    }
  });

  it('blocks on a block action', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }]),
      ],
    });
    const result = await engine.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'block', mode: 'reset' });
  });

  it('accumulates the maximum delay across actions', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'delay', phase: 'request', ms: 100 },
          { type: 'delay', phase: 'request', ms: 300 },
        ]),
      ],
    });
    const result = await engine.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'continue', delayMs: 300 });
  });
});

describe('RuleEngine — breakpoints', () => {
  it('continues after a request breakpoint resolves', async () => {
    const queue = new BreakpointQueue();
    const engine = new RuleEngine(queue, {
      onBreakpointHit: ({ id }) => {
        queue.resolve(id, 'continue');
      },
    });
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' },
        ]),
      ],
    });
    const result = await engine.evaluateRequest(requestContext(), requestState());
    expect(result.kind).toBe('continue');
    expect(result.hits[0]).toMatchObject({ action: 'breakpoint', summary: 'continued' });
  });

  it('blocks when a breakpoint is dropped', async () => {
    const queue = new BreakpointQueue();
    const engine = new RuleEngine(queue, {
      onBreakpointHit: ({ id }) => {
        queue.resolve(id, 'drop');
      },
    });
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' },
        ]),
      ],
    });
    const result = await engine.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'block', mode: 'close' });
  });

  it('applies a breakpoint edit to the request', async () => {
    const queue = new BreakpointQueue();
    const engine = new RuleEngine(queue, {
      onBreakpointHit: ({ id }) => {
        queue.resolve(id, 'continue', {
          method: 'POST',
          headers: [{ name: 'x-edit', value: 'y' }],
        });
      },
    });
    engine.setRuleSet({
      revision: 1,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'breakpoint', phase: 'request', timeoutMs: 30_000, onTimeout: 'continue' },
        ]),
      ],
    });
    const state = requestState();
    const result = await engine.evaluateRequest(requestContext(), state);
    expect(result.kind).toBe('continue');
    expect(state.method).toBe('POST');
    expect(state.headers['x-edit']).toBe('y');
    expect(result.hits[0]).toMatchObject({ action: 'breakpoint', summary: 'edited' });
  });
});

describe('RuleEngine — response evaluation', () => {
  it('applies response-side status override', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 2,
      rules: [
        rule('r1', [{ type: 'status', min: 200, max: 299 }], [
          { type: 'status', statusCode: 201 },
        ]),
      ],
    });
    const context: MatchContext = {
      request: requestContext().request,
      response: { statusCode: 200, headers: {} },
    };
    const state: MutableResponseState = { statusCode: 200, headers: {} };
    const result = await engine.evaluateResponse(context, state);
    expect(result.kind).toBe('continue');
    expect(state.statusCode).toBe(201);
    expect(result.hits[0]).toMatchObject({
      phase: 'response',
      action: 'status',
      summary: '201',
    });
  });

  it('records response header replacement and final set value', async () => {
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({
      revision: 5,
      rules: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'response', op: 'set', name: 'x-result', value: 'after' },
        ]),
      ],
    });
    const context: MatchContext = {
      request: requestContext().request,
      response: { statusCode: 200, headers: { 'x-result': 'before' } },
    };
    const state: MutableResponseState = {
      statusCode: 200,
      headers: { 'x-result': 'before' },
    };

    const result = await engine.evaluateResponse(context, state);

    expect(result.headerEffects).toEqual([
      { phase: 'response', effect: 'replace', name: 'x-result', value: 'before' },
      { phase: 'response', effect: 'set', name: 'x-result', value: 'after' },
    ]);
    expect(state.headers['x-result']).toBe('after');
  });
});
