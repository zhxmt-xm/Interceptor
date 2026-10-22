import { describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import type { RuleAction, RuleDefinition } from '@interceptor/core-protocol';
import { HttpMessageService } from '../../../http-message/entry';
import { RuleService } from '../../../rules/entry';
import type { MatchContext, RequestMatchInput } from '../../../rules/interfaces';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { HttpInterceptionService } from '../../entry';

function request(): RequestMatchInput {
  return {
    method: 'POST', url: 'https://api.test/items?q=1', host: 'api.test', path: '/items',
    query: new URLSearchParams('q=1'), headers: { 'x-tag': ['one', 'two'], 'content-length': '100' },
  };
}

function context(): MatchContext & { response: NonNullable<MatchContext['response']> } {
  return { request: request(), response: { statusCode: 200, headers: { 'content-length': '50' } } };
}

function setup(actions: RuleAction[] = []) {
  const breakpointQueue = new BreakpointQueue();
  const ruleService = new RuleService(breakpointQueue);
  const nodes: RuleDefinition[] = actions.length === 0 ? [] : [{
    kind: 'rule', id: 'copy-rule', name: 'Copy rule', enabled: true, priority: 1,
    matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }], actions,
  }];
  ruleService.setRuleSet({ revision: 4, nodes });
  return {
    breakpointQueue, ruleService,
    httpInterceptionService: new HttpInterceptionService(ruleService, new HttpMessageService()),
  };
}

describe('HTTP copy decisions without a proxy listener', () => {
  it('explicitly bypasses both phases when no rule matches', async () => {
    const { httpInterceptionService } = setup();
    const signal = new AbortController().signal;
    expect(await httpInterceptionService.evaluateRequest(request(), signal))
      .toEqual({ decision: { action: 'bypass' }, hits: [], headerEffects: [] });
    expect(await httpInterceptionService.evaluateResponse(context(), signal))
      .toEqual({ decision: { action: 'bypass' }, hits: [], headerEffects: [] });
  });

  it('returns metadata and encoded body edits without mutating the observed request copy', async () => {
    const { httpInterceptionService } = setup([
      { type: 'header', phase: 'request', op: 'append', name: 'x-tag', value: 'three' },
      { type: 'header', phase: 'request', op: 'set', name: 'content-encoding', value: 'gzip' },
      { type: 'query', op: 'set', name: 'q', value: 'edited' },
      { type: 'body', phase: 'request', format: 'text', content: 'modified-body' },
    ]);
    const original = request();
    const result = await httpInterceptionService.evaluateRequest(original, new AbortController().signal);
    expect(result.decision.action).toBe('intercept');
    if (result.decision.action !== 'intercept') throw new Error('Expected intercept');
    expect(result.decision.url).toBe('https://api.test/items?q=edited');
    expect(result.decision.headers['x-tag']).toEqual(['one', 'two', 'three']);
    expect(result.decision.editedHeaderNames).toEqual(['x-tag', 'content-encoding']);
    expect(result.decision.body.action).toBe('replace');
    if (result.decision.body.action !== 'replace') throw new Error('Expected replacement');
    expect(gunzipSync(result.decision.body.content).toString('utf8')).toBe('modified-body');
    expect(result.decision.headers['content-length']).toBe(String(result.decision.body.content.byteLength));
    expect(original.headers).toEqual({ 'x-tag': ['one', 'two'], 'content-length': '100' });
    expect(original.query.get('q')).toBe('1');
    expect(result.bodyEffect?.source).toBe('text');
    expect(result.hits).toHaveLength(4);
  });

  it('keeps the original streaming body when only metadata changes', async () => {
    const { httpInterceptionService } = setup([
      { type: 'header', phase: 'request', op: 'remove', name: 'x-tag' },
    ]);
    const result = await httpInterceptionService.evaluateRequest(request(), new AbortController().signal);
    expect(result.decision).toMatchObject({
      action: 'intercept', body: { action: 'keep' }, editedHeaderNames: ['x-tag'],
    });
  });

  it('does not wait for the delay or perform forwarding in PC', async () => {
    const { httpInterceptionService } = setup([{ type: 'delay', phase: 'request', ms: 60_000 }]);
    const result = await httpInterceptionService.evaluateRequest(request(), new AbortController().signal);
    expect(result.decision).toMatchObject({ action: 'intercept', delayMs: 60_000, body: { action: 'keep' } });
  });

  it('returns a synthetic response including an explicit empty replacement', async () => {
    const { httpInterceptionService } = setup([{ type: 'synthetic', statusCode: 204, headers: [], body: '' }]);
    const result = await httpInterceptionService.evaluateRequest(request(), new AbortController().signal);
    expect(result.decision).toMatchObject({
      action: 'respond', statusCode: 204, headers: {}, body: { action: 'replace', content: new Uint8Array() },
    });
  });

  it.each(['close', 'reset'] as const)('returns rule abort mode %s rather than bypass', async (mode) => {
    const { httpInterceptionService } = setup([{ type: 'block', mode }]);
    const result = await httpInterceptionService.evaluateRequest(request(), new AbortController().signal);
    expect(result.decision).toEqual({ action: 'abort', mode });
  });

  it('evaluates response rules even though the request was bypassed', async () => {
    const { httpInterceptionService } = setup([
      { type: 'status', statusCode: 202 },
      { type: 'header', phase: 'response', op: 'set', name: 'content-type', value: 'text/plain; charset=iso-8859-1' },
      { type: 'body', phase: 'response', format: 'text', content: 'café' },
    ]);
    const signal = new AbortController().signal;
    expect((await httpInterceptionService.evaluateRequest(request(), signal)).decision).toEqual({ action: 'bypass' });
    const original = context();
    const result = await httpInterceptionService.evaluateResponse(original, signal);
    expect(result.decision).toMatchObject({
      action: 'intercept', statusCode: 202,
      body: { action: 'replace', content: new Uint8Array([99, 97, 102, 233]) },
    });
    expect(original.response).toEqual({ statusCode: 200, headers: { 'content-length': '50' } });
  });

  it('waits for request breakpoint editing and associates its capture exchange', async () => {
    const { httpInterceptionService, breakpointQueue } = setup([{ type: 'breakpoint', phase: 'request' }]);
    const result = httpInterceptionService.evaluateRequest(request(), new AbortController().signal, 'ex-mobile');
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(1));
    const pending = breakpointQueue.list()[0]!;
    expect(pending.snapshot.exchangeId).toBe('ex-mobile');
    expect(pending.snapshot.bodyAvailable).toBe(false);
    breakpointQueue.resolve(pending.id, 'continue', { method: 'PUT', body: 'edited' });
    expect((await result).decision).toMatchObject({
      action: 'intercept', method: 'PUT', body: { action: 'replace', content: new Uint8Array(Buffer.from('edited')) },
    });
    expect(breakpointQueue.size).toBe(0);
  });

  it('does not return bypass until a response breakpoint is continued', async () => {
    const { httpInterceptionService, breakpointQueue } = setup([{ type: 'breakpoint', phase: 'response' }]);
    let settled = false;
    const result = httpInterceptionService.evaluateResponse(context(), new AbortController().signal)
      .then(value => { settled = true; return value; });
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(1));
    expect(settled).toBe(false);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
    expect((await result).decision).toEqual({ action: 'bypass' });
  });

  it('returns abort when a user drops a breakpoint', async () => {
    const { httpInterceptionService, breakpointQueue } = setup([{ type: 'breakpoint', phase: 'request' }]);
    const result = httpInterceptionService.evaluateRequest(request(), new AbortController().signal);
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(1));
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'drop');
    expect((await result).decision).toEqual({ action: 'abort', mode: 'close' });
  });

  it('cancels only the corresponding evaluation while another request still waits', async () => {
    const { httpInterceptionService, breakpointQueue } = setup([{ type: 'breakpoint', phase: 'request' }]);
    const first = new AbortController();
    const second = new AbortController();
    const firstResult = httpInterceptionService.evaluateRequest(request(), first.signal);
    const secondResult = httpInterceptionService.evaluateRequest(request(), second.signal);
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(2));
    first.abort();
    expect((await firstResult).decision).toEqual({ action: 'aborted' });
    expect(breakpointQueue.size).toBe(1);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
    expect((await secondResult).decision).toEqual({ action: 'bypass' });
  });

  it('does not create a breakpoint for an already cancelled operation', async () => {
    const { httpInterceptionService, breakpointQueue } = setup([{ type: 'breakpoint', phase: 'request' }]);
    const controller = new AbortController();
    controller.abort();
    expect((await httpInterceptionService.evaluateRequest(request(), controller.signal)).decision)
      .toEqual({ action: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('does not create a later response breakpoint after cancellation races with continuation', async () => {
    const { httpInterceptionService, breakpointQueue, ruleService } = setup();
    ruleService.setRuleSet({
      revision: 5,
      nodes: ['first', 'second'].map((id, priority) => ({
        kind: 'rule', id, name: id, enabled: true, priority,
        matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }],
        actions: [{ type: 'breakpoint', phase: 'response' }],
      })),
    });
    const controller = new AbortController();
    const result = httpInterceptionService.evaluateResponse(context(), controller.signal);
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(1));
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
    controller.abort();
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(0));
    expect((await result).decision).toEqual({ action: 'aborted' });
  });

  it('propagates encoding errors instead of returning success-shaped bypass', async () => {
    const { httpInterceptionService } = setup([
      { type: 'header', phase: 'request', op: 'set', name: 'content-encoding', value: 'unsupported-coding' },
      { type: 'body', phase: 'request', format: 'text', content: 'modified' },
    ]);
    await expect(httpInterceptionService.evaluateRequest(request(), new AbortController().signal))
      .rejects.toThrow('Unsupported Content-Encoding');
  });
});
