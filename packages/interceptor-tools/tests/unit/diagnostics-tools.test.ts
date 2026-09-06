import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Diagnostics Tool: ${name}`);
  return tool;
}

describe('Diagnostics静默查询与原生导出Tool', () => {
  it.each(['diagnostics_get_trace', 'diagnostics_get_recent'])('%s是无审批query', (name) => {
    expect(findTool(name)).toMatchObject({ capabilityId: 'diagnostics', kind: 'query', destructive: false, openWorld: false });
    expect(findTool(name).describeChange).toBeUndefined();
  });

  it('Trace沿正式recent命令最多读取200条并保持记录顺序', async () => {
    const records = [{ sequence: 8, traceId: 'trace-one' }, { sequence: 9, traceId: 'trace-one' }];
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { records, droppedCount: 0 } }), invokeMain: vi.fn() };
    const abortSignal = new AbortController().signal;

    await expect(findTool('diagnostics_get_trace').execute({ traceId: 'trace-one' }, { host, abortSignal }))
      .resolves.toEqual({ traceId: 'trace-one', records, droppedCount: 0 });
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'diagnostics.recent', payload: { limit: 200, traceId: 'trace-one' } }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each([undefined, 1, 200])('Recent使用有界limit %s并只返回正式公开字段', async (limit) => {
    const records = [{ sequence: 1 }];
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { records, droppedCount: 2, filePath: 'C:\private\diagnostics.sqlite' } }), invokeMain: vi.fn() };
    const abortSignal = new AbortController().signal;
    const args = limit === undefined ? {} : { limit };

    await expect(findTool('diagnostics_get_recent').execute(args, { host, abortSignal })).resolves.toEqual({ records, droppedCount: 2 });
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'diagnostics.recent', payload: { limit: limit ?? 200 } }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('未知trace保留空结果而不读取另一trace', async () => {
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { records: [], droppedCount: 0 } }), invokeMain: vi.fn() };
    await expect(findTool('diagnostics_get_trace').execute({ traceId: 'missing' }, { host, abortSignal: new AbortController().signal }))
      .resolves.toEqual({ traceId: 'missing', records: [], droppedCount: 0 });
    expect(host.invoke).toHaveBeenCalledOnce();
  });

  it.each([0, 201, 1.5, '2', null])('Recent拒绝非法limit %j', async (limit) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    await expect(findTool('diagnostics_get_recent').execute({ limit }, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(['', ' '])('Trace拒绝空身份 %j', async (traceId) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    await expect(findTool('diagnostics_get_trace').execute({ traceId }, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('导出只接受正式过滤并遵守change审批', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const tool = findTool('diagnostics_export');
    expect(tool).toMatchObject({ capabilityId: 'diagnostics', kind: 'change', destructive: false, openWorld: false });
    const description = await tool.describeChange!({ process: 'core', level: 'info', outcome: 'success' }, { host, abortSignal: new AbortController().signal });
    expect(description.metadata).toEqual({ process: 'core', level: 'info', outcome: 'success' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('导出原生取消返回started=false而不伪造任务', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type: 'diagnostics.export', payload: { job: null } }) };
    const abortSignal = new AbortController().signal;
    await expect(findTool('diagnostics_export').execute({}, { host, abortSignal })).resolves.toEqual({ started: false });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'diagnostics.export', payload: {} }, abortSignal);
  });

  it('导出启动只投影安全任务信息而不宣称已完成', async () => {
    const job = {
      id: 'transfer-one', kind: 'diagnostics-export', state: 'running', processed: 0, total: 0,
      startedAt: '2026-09-06T12:00:00.000Z', fileName: 'private.jsonl',
      message: 'C:\private\output.jsonl', warnings: ['private-path'],
    };
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type: 'diagnostics.export', payload: { job } }) };
    const abortSignal = new AbortController().signal;
    const args = { process: 'core', level: 'info', outcome: 'success' };
    await expect(findTool('diagnostics_export').execute(args, { host, abortSignal })).resolves.toEqual({
      started: true, job: {
        id: 'transfer-one', kind: 'diagnostics-export', state: 'running', processed: 0, total: 0,
        startedAt: '2026-09-06T12:00:00.000Z', warningCount: 1,
      },
    });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'diagnostics.export', payload: args }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each([
    { process: 'browser' }, { level: 'trace' }, { outcome: 'done' }, { filePath: 'private.jsonl' },
    { jobId: 'model-job' }, { cursor: 'cursor' }, { process: null },
  ])('导出在审批和执行前拒绝非正式参数 %j', async (args) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    await expect(findTool('diagnostics_export').describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findTool('diagnostics_export').execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each([
    ['diagnostics_get_trace', { traceId: 'trace-one' }], ['diagnostics_get_recent', {}], ['diagnostics_export', {}],
  ] as const)('%s预取消不触达业务', async (name, args) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    await expect(findTool(name).execute(args, { host, abortSignal: abortController.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('底层导出错误不暴露本机路径', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockRejectedValue(new Error('Access denied at C:\private\output.jsonl')) };
    await expect(findTool('diagnostics_export').execute({}, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow('Unable to export Diagnostics.');
  });
});