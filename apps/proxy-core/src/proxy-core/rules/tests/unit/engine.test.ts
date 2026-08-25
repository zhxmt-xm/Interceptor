import { describe, expect, it, vi } from 'vitest';

import type { RuleAction, RuleMatcher } from '@interceptor/core-protocol';

import type {
  MutableRequestState,
  MutableResponseState,
  MatchContext,
} from '../../interfaces';
import { RuleService } from '../../entry';
import { BreakpointQueue } from '../../internal/breakpoint-queue';

const REQUEST_BREAKPOINT: RuleAction = {
  type: 'breakpoint',
  phase: 'request',
};
const RESPONSE_BREAKPOINT: RuleAction = {
  type: 'breakpoint',
  phase: 'response',
};

function rule(
  id: string,
  matchers: RuleMatcher[],
  actions: RuleAction[],
  overrides: { priority?: number; enabled?: boolean } = {},
) {
  return {
    kind: 'rule' as const,
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

describe('RuleService — request evaluation', () => {
  it('applies a matching rule and records a hit with the revision', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 3,
      nodes: [
        rule('r1', [{ type: 'host', value: 'api.test', mode: 'exact' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-tag', value: '1' },
        ]),
      ],
    });
    const state = requestState();
    const result = await ruleService.evaluateRequest(requestContext(), state);
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
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 4,
      nodes: [
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

    const result = await ruleService.evaluateRequest(context, state);

    expect(result.headerEffects).toEqual([
      { ruleId: 'r1', phase: 'request', effect: 'replace', name: 'x-set', value: 'before' },
      { ruleId: 'r1', phase: 'request', effect: 'set', name: 'x-set', value: 'after' },
      { ruleId: 'r1', phase: 'request', effect: 'append', name: 'x-append', value: 'second' },
      { ruleId: 'r1', phase: 'request', effect: 'remove', name: 'x-remove', value: 'one' },
      { ruleId: 'r1', phase: 'request', effect: 'remove', name: 'x-remove', value: 'two' },
    ]);
    expect(state.headers).toMatchObject({
      'x-set': 'after',
      'x-append': ['first', 'second'],
    });
    expect(state.headers['x-remove']).toBeUndefined();
  });

  it('records only the final request body writer', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 5,
      nodes: [
        rule('first-writer', [{ type: 'method', value: 'GET' }], [
          { type: 'body', phase: 'request', format: 'text', content: 'first' },
        ], { priority: 100 }),
        rule('final-writer', [{ type: 'method', value: 'GET' }], [
          { type: 'body', phase: 'request', format: 'json', content: '{"final":true}' },
        ], { priority: 200 }),
      ],
    });
    const state = requestState();

    const result = await ruleService.evaluateRequest(requestContext(), state);

    expect(state.body).toBe('{"final":true}');
    expect(result.bodyEffect).toEqual({
      ruleId: 'final-writer',
      phase: 'request',
      effect: 'replace',
      source: 'text',
    });
  });

  it('skips non-matching and disabled rules', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('miss', [{ type: 'host', value: 'other.test', mode: 'exact' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x', value: '1' },
        ]),
        rule('off', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }], {
          enabled: false,
        }),
      ],
    });
    const state = requestState();
    const result = await ruleService.evaluateRequest(requestContext(), state);
    expect(result).toMatchObject({ kind: 'continue', hits: [] });
    expect(state.headers).toEqual({});

    // 仅含 disabled 规则时编译结果为空。
    const disabledOnlyRuleService = new RuleService(new BreakpointQueue());
    disabledOnlyRuleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('off', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }], {
          enabled: false,
        }),
      ],
    });
    expect(disabledOnlyRuleService.hasRules).toBe(false);
  });

  it('executes rules in priority then id order', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('b', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-order', value: 'low' },
        ], { priority: 200 }),
        rule('a', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-order', value: 'high' },
        ], { priority: 100 }),
      ],
    });
    const state = requestState();
    const result = await ruleService.evaluateRequest(requestContext(), state);
    expect(result.hits.map((hit) => hit.ruleId)).toEqual(['a', 'b']);
    // priority 100 (a) 先 set high，priority 200 (b) 后 set low 覆盖
    expect(state.headers['x-order']).toBe('low');
  });

  it('short-circuits on a synthetic response', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'synthetic', statusCode: 200, body: 'ok' },
        ]),
      ],
    });
    const result = await ruleService.evaluateRequest(requestContext(), requestState());
    expect(result.kind).toBe('respond');
    if (result.kind === 'respond') {
      expect(result.response.statusCode).toBe(200);
      expect(result.response.body).toBe('ok');
    }
  });

  it('blocks on a block action', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [{ type: 'block', mode: 'reset' }]),
      ],
    });
    const result = await ruleService.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'block', mode: 'reset' });
  });

  it('accumulates the maximum delay across actions', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          { type: 'delay', phase: 'request', ms: 100 },
          { type: 'delay', phase: 'request', ms: 300 },
        ]),
      ],
    });
    const result = await ruleService.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'continue', delayMs: 300 });
  });
});
describe('RuleService — breakpoints', () => {
  it('continues after a request breakpoint resolves', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue');
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ]),
      ],
    });
    const result = await ruleService.evaluateRequest(requestContext(), requestState());
    expect(result.kind).toBe('continue');
    expect(result.hits[0]).toMatchObject({ action: 'breakpoint', summary: 'continued' });
  });

  it('keeps a request breakpoint pending until the user continues', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          {
            type: 'breakpoint',
            phase: 'request',
          },
        ]),
      ],
    });

    const evaluation = ruleService.evaluateRequest(requestContext(), requestState());
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    expect(pending).not.toHaveProperty('deadline');

    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });
  });

  it('builds the request breakpoint snapshot after all regular rule actions', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 10 }),
        rule('rewrite-later', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-after', value: 'applied' },
        ], { priority: 20 }),
      ],
    });

    const evaluation = ruleService.evaluateRequest(requestContext(), requestState());
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });

    expect(pending!.snapshot.headers).toContainEqual({
      name: 'x-after',
      value: 'applied',
      ruleEffect: 'set',
      ruleId: 'rewrite-later',
    });
  });

  it('attributes the final header marker to the last Rule that wrote the value', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 10 }),
        rule('rewrite-first', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-marker', value: 'same' },
        ], { priority: 20 }),
        rule('rewrite-last', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-marker', value: 'same' },
        ], { priority: 30 }),
      ],
    });

    const evaluation = ruleService.evaluateRequest(requestContext(), requestState());
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });

    expect(pending!.snapshot.headers).toContainEqual({
      name: 'x-marker',
      value: 'same',
      ruleEffect: 'set',
      ruleId: 'rewrite-last',
    });
  });

  it('marks the appended duplicate instance and lets a later set replace its marker', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 10 }),
        rule('append-values', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'append', name: 'x-duplicate', value: 'same' },
          { type: 'header', phase: 'request', op: 'append', name: 'x-overwrite', value: 'same' },
        ], { priority: 20 }),
        rule('set-overwrite', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-overwrite', value: 'same' },
        ], { priority: 30 }),
      ],
    });
    const state: MutableRequestState = {
      ...requestState(),
      headers: { 'x-duplicate': 'same' },
    };

    const evaluation = ruleService.evaluateRequest(requestContext(), state);
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });

    expect(pending!.snapshot.headers.filter((header) => header.name === 'x-duplicate')).toEqual([
      { name: 'x-duplicate', value: 'same' },
      {
        name: 'x-duplicate',
        value: 'same',
        ruleEffect: 'append',
        ruleId: 'append-values',
      },
    ]);
    expect(pending!.snapshot.headers).toContainEqual({
      name: 'x-overwrite',
      value: 'same',
      ruleEffect: 'set',
      ruleId: 'set-overwrite',
    });
  });

  it('attributes an append after remove to the final Rule only', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 10 }),
        rule('append-first', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'append', name: 'x-marker', value: 'same' },
        ], { priority: 20 }),
        rule('remove-middle', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'remove', name: 'x-marker' },
        ], { priority: 30 }),
        rule('append-last', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'append', name: 'x-marker', value: 'same' },
        ], { priority: 40 }),
      ],
    });

    const evaluation = ruleService.evaluateRequest(requestContext(), requestState());
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });

    expect(pending!.snapshot.headers).toContainEqual({
      name: 'x-marker',
      value: 'same',
      ruleEffect: 'append',
      ruleId: 'append-last',
    });
  });

  it('blocks when a breakpoint is dropped', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'drop');
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ]),
      ],
    });
    const result = await ruleService.evaluateRequest(requestContext(), requestState());
    expect(result).toMatchObject({ kind: 'block', mode: 'close' });
  });

  it('applies a breakpoint edit to the request', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue', {
          method: 'POST',
          headers: [
            { name: 'x-replace', value: 'after' },
            { name: 'x-add', value: 'new' },
            { name: 'x-keep', value: 'same' },
          ],
          editedHeaderNames: ['X-Replace', 'x-add', 'x-remove', 'x-keep'],
        });
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ]),
      ],
    });
    const state: MutableRequestState = {
      ...requestState(),
      headers: {
        'x-replace': 'before',
        'x-remove': 'gone',
        'x-keep': 'same',
      },
    };
    const result = await ruleService.evaluateRequest(requestContext(), state);
    expect(result.kind).toBe('continue');
    expect(state.method).toBe('POST');
    expect(state.headers).toEqual({
      'x-replace': 'after',
      'x-add': 'new',
      'x-keep': 'same',
    });
    expect(result.headerEffects).toEqual([
      {
        ruleId: 'r1',
        phase: 'request',
        effect: 'replace',
        name: 'x-replace',
        value: 'before',
      },
      { ruleId: 'r1', phase: 'request', effect: 'set', name: 'x-replace', value: 'after' },
      { ruleId: 'r1', phase: 'request', effect: 'set', name: 'x-add', value: 'new' },
      { ruleId: 'r1', phase: 'request', effect: 'remove', name: 'x-remove', value: 'gone' },
    ]);
    expect(result.hits[0]).toMatchObject({ action: 'breakpoint', summary: 'edited' });
  });

  it('does not invent header effects for a body-only breakpoint edit', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue', { body: 'edited body' });
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ]),
      ],
    });

    const result = await ruleService.evaluateRequest(requestContext(), requestState());

    expect(result.headerEffects).toEqual([]);
  });

  it('lets a request breakpoint body edit replace the regular Rule writer', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue', { body: 'breakpoint final' });
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('regular-writer', [{ type: 'method', value: 'GET' }], [
          { type: 'body', phase: 'request', format: 'text', content: 'regular' },
        ], { priority: 100 }),
        rule('breakpoint-writer', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 200 }),
      ],
    });
    const state = requestState();

    const result = await ruleService.evaluateRequest(requestContext(), state);

    expect(state.body).toBe('breakpoint final');
    expect(result.bodyEffect).toEqual({
      ruleId: 'breakpoint-writer',
      phase: 'request',
      effect: 'replace',
      source: 'text',
    });
  });

  it('records only the changed value when editing duplicate breakpoint headers', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue', {
          headers: [
            { name: 'x-duplicate', value: 'first' },
            { name: 'x-duplicate', value: 'changed' },
          ],
          editedHeaderNames: ['x-duplicate'],
        });
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ]),
      ],
    });
    const state: MutableRequestState = {
      ...requestState(),
      headers: { 'x-duplicate': ['first', 'second'] },
    };

    const result = await ruleService.evaluateRequest(requestContext(), state);

    expect(result.headerEffects).toEqual([
      {
        ruleId: 'r1',
        phase: 'request',
        effect: 'replace',
        name: 'x-duplicate',
        value: 'second',
      },
      {
        ruleId: 'r1',
        phase: 'request',
        effect: 'set',
        name: 'x-duplicate',
        value: 'changed',
      },
    ]);
  });

  it('does not suspend after the client aborts during regular Rule actions', async () => {
    const breakpointQueue = new BreakpointQueue();
    const onBreakpointHit = vi.fn(({ id }: { id: string }) => {
      breakpointQueue.resolve(id, 'continue');
    });
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit,
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
        ], { priority: 10 }),
        rule('rewrite-later', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'request', op: 'set', name: 'x-after', value: 'applied' },
        ], { priority: 20 }),
      ],
    });

    const evaluation = ruleService.evaluateRequest(
      requestContext(),
      requestState(),
      'request-1',
      'exchange-1',
    );
    ruleService.abortRequestBreakpoints('request-1');

    await expect(evaluation).resolves.toMatchObject({ kind: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
    expect(onBreakpointHit).not.toHaveBeenCalled();

    await expect(ruleService.evaluateRequest(
      requestContext(),
      requestState(),
      'request-1',
      'exchange-2',
    )).resolves.toMatchObject({ kind: 'continue' });
    expect(onBreakpointHit).toHaveBeenCalledOnce();
  });

  it('stops evaluating breakpoint actions after the client aborts', async () => {
    const breakpointQueue = new BreakpointQueue();
    let ruleService!: RuleService;
    ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: () => {
        ruleService.abortRequestBreakpoints('request-1');
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('r1', [{ type: 'method', value: 'GET' }], [
          REQUEST_BREAKPOINT,
          REQUEST_BREAKPOINT,
        ]),
      ],
    });

    const result = await ruleService.evaluateRequest(
      requestContext(),
      requestState(),
      'request-1',
      'exchange-1',
    );

    expect(result.kind).toBe('aborted');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ action: 'breakpoint', summary: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });
});

describe('RuleService — response evaluation', () => {
  it('records only the final response body writer', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 6,
      nodes: [
        rule('response-writer', [{ type: 'method', value: 'GET' }], [
          { type: 'body', phase: 'response', format: 'text', content: 'final response' },
        ]),
      ],
    });
    const context: MatchContext = {
      ...requestContext(),
      response: { statusCode: 200, headers: {} },
    };
    const state: MutableResponseState = { statusCode: 200, headers: {} };

    const result = await ruleService.evaluateResponse(context, state);

    expect(state.body).toBe('final response');
    expect(result.bodyEffect).toEqual({
      ruleId: 'response-writer',
      phase: 'response',
      effect: 'replace',
      source: 'text',
    });
  });

  it('keeps the request identity in a response breakpoint snapshot', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('response-breakpoint', [{ type: 'method', value: 'GET' }], [
          RESPONSE_BREAKPOINT,
        ]),
      ],
    });
    const context: MatchContext = {
      ...requestContext(),
      response: { statusCode: 200, headers: {} },
    };
    const evaluation = ruleService.evaluateResponse(
      context,
      { statusCode: 200, headers: {} },
      'request-1',
      'exchange-1',
    );

    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    expect(pending?.snapshot).toMatchObject({
      exchangeId: 'exchange-1',
      method: 'GET',
      url: 'https://api.test/users',
      statusCode: 200,
    });
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });
  });

  it('builds the response breakpoint snapshot after all regular rule actions', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('breakpoint-first', [{ type: 'method', value: 'GET' }], [
          RESPONSE_BREAKPOINT,
        ], { priority: 10 }),
        rule('rewrite-later', [{ type: 'method', value: 'GET' }], [
          { type: 'header', phase: 'response', op: 'set', name: 'x-after', value: 'applied' },
        ], { priority: 20 }),
      ],
    });
    const context: MatchContext = {
      ...requestContext(),
      response: { statusCode: 200, headers: {} },
    };
    const state: MutableResponseState = { statusCode: 200, headers: {} };

    const evaluation = ruleService.evaluateResponse(context, state);
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [pending] = breakpointQueue.list();
    breakpointQueue.resolve(pending!.id, 'continue');
    await expect(evaluation).resolves.toMatchObject({ kind: 'continue' });

    expect(pending!.snapshot.headers).toContainEqual({
      name: 'x-after',
      value: 'applied',
      ruleEffect: 'set',
      ruleId: 'rewrite-later',
    });
  });

  it('records response header effects from an edited breakpoint', async () => {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue, {
      onBreakpointHit: ({ id }) => {
        breakpointQueue.resolve(id, 'continue', {
          headers: [{ name: 'x-result', value: 'after' }],
          editedHeaderNames: ['X-Result'],
        });
      },
    });
    ruleService.setRuleSet({
      revision: 1,
      nodes: [
        rule('response-breakpoint', [{ type: 'method', value: 'GET' }], [
          RESPONSE_BREAKPOINT,
        ]),
      ],
    });
    const context: MatchContext = {
      ...requestContext(),
      response: { statusCode: 200, headers: { 'x-result': 'before' } },
    };
    const state: MutableResponseState = {
      statusCode: 200,
      headers: { 'x-result': 'before' },
    };

    const result = await ruleService.evaluateResponse(context, state);

    expect(result.headerEffects).toEqual([
      {
        ruleId: 'response-breakpoint',
        phase: 'response',
        effect: 'replace',
        name: 'x-result',
        value: 'before',
      },
      {
        ruleId: 'response-breakpoint',
        phase: 'response',
        effect: 'set',
        name: 'x-result',
        value: 'after',
      },
    ]);
  });

  it('applies response-side status override', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 2,
      nodes: [
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
    const result = await ruleService.evaluateResponse(context, state);
    expect(result.kind).toBe('continue');
    expect(state.statusCode).toBe(201);
    expect(result.hits[0]).toMatchObject({
      phase: 'response',
      action: 'status',
      summary: '201',
    });
  });

  it('records response header replacement and final set value', async () => {
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 5,
      nodes: [
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

    const result = await ruleService.evaluateResponse(context, state);

    expect(result.headerEffects).toEqual([
      { ruleId: 'r1', phase: 'response', effect: 'replace', name: 'x-result', value: 'before' },
      { ruleId: 'r1', phase: 'response', effect: 'set', name: 'x-result', value: 'after' },
    ]);
    expect(state.headers['x-result']).toBe('after');
  });
});
