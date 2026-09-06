import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

const commands = [
  { name: 'capture_get_transfer_job', type: 'transfer.job.get', kind: 'query' },
  { name: 'capture_cancel_transfer_job', type: 'transfer.job.cancel', kind: 'change' },
] as const;

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Transfer job Tool: ${name}`);
  return tool;
}

describe('Capture文件任务查询和取消', () => {
  it.each(commands)('$name保持独立意图与严格身份参数', ({ name, kind }) => {
    expect(findTool(name)).toMatchObject({
      capabilityId: 'capture', kind, openWorld: false,
      inputSchema: { type: 'object', required: ['jobId'], additionalProperties: false },
    });
    if (kind === 'query') expect(findTool(name).describeChange).toBeUndefined();
  });

  it.each(commands)('$name通过同一取消信号调用正式命令并投影公开字段', async ({ name, type }) => {
    const job = {
      id: 'transfer-one', kind: 'archive-export', state: 'running', processed: 1, total: 3,
      startedAt: '2026-09-07T00:00:00.000Z', fileName: 'private.iarchive',
      message: 'C:\\private\\archive.iarchive', warnings: ['private-detail'],
    };
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { job } }), invokeMain: vi.fn() };
    const abortSignal = new AbortController().signal;

    await expect(findTool(name).execute({ jobId: job.id }, { host, abortSignal })).resolves.toEqual({ job: {
      id: job.id, kind: job.kind, state: job.state, processed: 1, total: 3,
      startedAt: job.startedAt, warningCount: 1,
    } });
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type, payload: { jobId: job.id } }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(commands)('$name未知任务返回null而不伪造任务', async ({ name }) => {
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { job: null } }), invokeMain: vi.fn() };
    await expect(findTool(name).execute({ jobId: 'missing' }, { host, abortSignal: new AbortController().signal }))
      .resolves.toEqual({ job: null });
    expect(host.invoke).toHaveBeenCalledOnce();
  });

  it.each(['completed', 'failed', 'cancelled'])('取消保留Core返回的%s终态与完成时间', async (state) => {
    const job = {
      id: 'finished', kind: 'har-export', state, processed: 2, total: 2, warnings: [],
      startedAt: '2026-09-07T00:00:00.000Z', completedAt: '2026-09-07T00:00:01.000Z', fileName: 'private.har',
    };
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { job } }), invokeMain: vi.fn() };
    await expect(findTool('capture_cancel_transfer_job').execute({ jobId: job.id }, { host, abortSignal: new AbortController().signal }))
      .resolves.toEqual({ job: {
        id: job.id, kind: job.kind, state, processed: 2, total: 2,
        startedAt: job.startedAt, completedAt: job.completedAt, warningCount: 0,
      } });
  });

  it('取消审批只查询同一个任务且不披露文件信息', async () => {
    const host = { invokeMain: vi.fn(), invoke: vi.fn().mockResolvedValue({ payload: { job: {
      id: 'transfer-one', kind: 'har-export', state: 'running', processed: 2, total: 5,
      fileName: 'private.har', message: 'private-path', warnings: ['private-warning'],
    } } }) };
    const abortSignal = new AbortController().signal;
    const description = await findTool('capture_cancel_transfer_job').describeChange!({ jobId: 'transfer-one' }, { host, abortSignal });
    expect(description.metadata).toEqual({ jobId: 'transfer-one', found: true, kind: 'har-export', state: 'running', processed: 2, total: 5 });
    expect(JSON.stringify(description)).not.toContain('private');
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'transfer.job.get', payload: { jobId: 'transfer-one' } }, abortSignal);
  });

  it('取消未知任务的审批诚实说明不存在', async () => {
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { job: null } }), invokeMain: vi.fn() };
    const description = await findTool('capture_cancel_transfer_job').describeChange!({ jobId: 'missing' }, { host, abortSignal: new AbortController().signal });
    expect(description.metadata).toEqual({ jobId: 'missing', found: false });
  });

  it.each(commands)('$name拒绝空白身份与额外路径', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    for (const args of [{ jobId: '' }, { jobId: ' ' }, { jobId: 1 }, { jobId: 'one', filePath: 'private.har' }]) {
      await expect(findTool(name).execute(args, { host, abortSignal: new AbortController().signal }))
        .rejects.toThrow(InterceptorToolArgumentError);
    }
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(commands)('$name预取消不触达Core', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    await expect(findTool(name).execute({ jobId: 'one' }, { host, abortSignal: abortController.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(commands)('$name下游错误不暴露本机路径', async ({ name }) => {
    const host = { invoke: vi.fn().mockRejectedValue(new Error('C:\\private\\file.har failed')), invokeMain: vi.fn() };
    await expect(findTool(name).execute({ jobId: 'one' }, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(name === 'capture_get_transfer_job' ? 'Unable to read transfer job.' : 'Unable to cancel transfer job.');
  });
});