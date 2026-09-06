import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

const cases = [
  { name: 'breakpoints_continue_queue', command: 'breakpoint.continueQueue', args: { queueKey: 'http' }, pendingCount: 2, destructive: false },
  { name: 'breakpoints_drop_queue', command: 'breakpoint.dropQueue', args: { queueKey: 'ws:connection-a' }, pendingCount: 1, destructive: true },
  { name: 'breakpoints_continue_rule', command: 'breakpoint.continueRule', args: { ruleId: 'rule-a' }, pendingCount: 1, destructive: false },
] as const;

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Breakpoint batch Tool: ${name}`);
  return tool;
}

describe('断点批量Tool', () => {
  it.each(cases)('$name使用独立change语义和严格目标参数', ({ name, args, destructive }) => {
    expect(findTool(name)).toMatchObject({
      capabilityId: 'breakpoints', kind: 'change', destructive, openWorld: false,
      inputSchema: { type: 'object', required: Object.keys(args), additionalProperties: false },
    });
  });

  it.each(cases)('$name只调用正式命令并返回实际计数', async ({ name, command, args }) => {
    const host = { invokeMain: vi.fn(), invoke: vi.fn().mockResolvedValue({ type: command, payload: { resolvedCount: 2, body: 'private-content' } }) };
    const abortSignal = new AbortController().signal;

    await expect(findTool(name).execute(args, { host, abortSignal })).resolves.toEqual({ resolvedCount: 2 });
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: command, payload: args }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(cases)('$name保留空目标返回0的正式语义', async ({ name, command, args }) => {
    const host = { invokeMain: vi.fn(), invoke: vi.fn().mockResolvedValue({ type: command, payload: { resolvedCount: 0 } }) };

    await expect(findTool(name).execute(args, { host, abortSignal: new AbortController().signal }))
      .resolves.toEqual({ resolvedCount: 0 });
    expect(host.invoke).toHaveBeenCalledOnce();
  });

  it.each(cases)('$name审批只披露匹配目标数量而不复制敏感快照', async ({ name, args, pendingCount }) => {
    const privateFields = { ruleName: 'private-name', url: 'https://example.test/?token=private-token', body: 'private-content', headers: [] };
    const host = { invokeMain: vi.fn(), invoke: vi.fn().mockResolvedValue({ type: 'breakpoint.pending', payload: { enabled: true, breakpoints: [
      { id: 'http-a', queueKey: 'http', ruleId: 'rule-a', ...privateFields },
      { id: 'http-b', queueKey: 'http', ruleId: 'rule-b', ...privateFields },
      { id: 'ws-a', queueKey: 'ws:connection-a', ...privateFields },
      { id: 'ws-b', queueKey: 'ws:connection-b', ...privateFields },
    ] } }) };
    const abortSignal = new AbortController().signal;
    const description = await findTool(name).describeChange!(args, { host, abortSignal });

    expect(description.metadata).toEqual({ ...args, pendingCount });
    expect(JSON.stringify(description)).not.toContain('private-');
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'breakpoint.list', payload: {} }, abortSignal);
  });

  it.each(cases)('$name在审批和执行前拒绝额外参数', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    const invalid = { ...args, bodyFilePath: 'private.json' };

    await expect(findTool(name).describeChange!(invalid, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findTool(name).execute(invalid, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(cases)('$name预取消不查询或解除队列', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    const context = { host, abortSignal: abortController.signal };

    await expect(findTool(name).describeChange!(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(findTool(name).execute(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(['', 'ws:', 'other-queue', 'ws:   '])('拒绝非法逻辑队列 %j', async (queueKey) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };

    await expect(findTool('breakpoints_continue_queue').describeChange!({ queueKey }, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findTool('breakpoints_drop_queue').execute({ queueKey }, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('拒绝空Rule身份而不是把它解释为全部规则', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    await expect(findTool('breakpoints_continue_rule').execute({ ruleId: ' ' }, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });
});