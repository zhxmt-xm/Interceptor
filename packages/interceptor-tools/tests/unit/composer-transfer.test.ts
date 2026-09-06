import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

function definition(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Collection transfer Tool: ${name}`);
  return tool;
}

describe('Collection导入导出Tool', () => {
  it.each(['composer_export_collection', 'composer_import_collection'])('%s只接受空参数且需要change授权', (name) => {
    expect(definition(name)).toMatchObject({
      capabilityId: 'composer', kind: 'change', destructive: false, openWorld: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it.each([
    ['composer_export_collection', 'composer.collection.export', { exported: true }],
    ['composer_export_collection', 'composer.collection.export', { exported: false }],
    ['composer_import_collection', 'composer.collection.import', { imported: false }],
    ['composer_import_collection', 'composer.collection.import', { imported: true, revision: 4, requestCount: 2, folderCount: 1, skippedCount: 0 }],
  ] as const)('%s只返回公开结果', async (name, command, outcome) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({
      type: command, payload: { ...outcome, path: 'C:\\private\\collection.json', content: 'private', fileName: 'private.json' },
    }) };
    const abortSignal = new AbortController().signal;
    await expect(definition(name).execute({}, { host, abortSignal })).resolves.toEqual(outcome);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('导出审批只读取Core已保存树的数量', async () => {
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { collection: { revision: 2, nodes: [{
      kind: 'folder', id: 'group', name: 'Private', children: [{ kind: 'request', id: 'one', auth: { token: 'private-token' } }],
    }] } } }), invokeMain: vi.fn() };
    const abortSignal = new AbortController().signal;
    const description = await definition('composer_export_collection').describeChange!({}, { host, abortSignal });
    expect(description.metadata).toEqual({ requestCount: 1, folderCount: 1 });
    expect(JSON.stringify(description)).not.toContain('private');
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'collection.get', payload: {} }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('导入审批不提前打开或读取文件', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const description = await definition('composer_import_collection').describeChange!({}, {
      host, abortSignal: new AbortController().signal,
    });
    expect(description.lines).toHaveLength(2);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['composer_export_collection', 'composer_import_collection'])('%s拒绝路径和取消后的调用', async (name) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    await expect(definition(name).execute({ path: 'private.json' }, { host, abortSignal: abortController.signal }))
      .rejects.toThrow(InterceptorToolArgumentError);
    abortController.abort();
    await expect(definition(name).execute({}, { host, abortSignal: abortController.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });
});