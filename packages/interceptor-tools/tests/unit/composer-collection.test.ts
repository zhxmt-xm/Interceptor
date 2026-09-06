import type { CollectionNode, CollectionRequest } from '@interceptor/core-protocol';
import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  InterceptorToolRedactor,
  TOOL_REDACTED_PLACEHOLDER,
  type InterceptorToolDefinition,
} from '../../src';

const QUERY_TOOL = 'composer_get_collection';
const REPLACE_TOOL = 'composer_replace_collection';

function definition(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`Missing Composer Collection Tool: ${name}`);
  return tool;
}

function request(overrides: Partial<CollectionRequest> = {}): CollectionRequest {
  return {
    kind: 'request', id: 'request-1', name: 'Collection request', method: 'GET',
    url: 'https://example.test/items?token=collection-query-token', protocol: 'auto',
    query: [{ id: 'query-token', name: 'token', value: 'collection-query-token', enabled: true }],
    headers: [
      { id: 'header-secret', name: 'Authorization', value: 'collection-header-token', enabled: false },
      { id: 'header-public', name: 'accept', value: 'application/json', enabled: true },
    ],
    bodyType: 'none', bodyText: '', bodyForm: [],
    auth: { type: 'bearer', token: 'collection-auth-token', username: '', password: '' },
    ...overrides,
  };
}

function tree(): CollectionNode[] {
  return [{ kind: 'folder', id: 'folder-1', name: 'API', children: [request()] }];
}

function hostFor(nodes = tree()) {
  return {
    invoke: vi.fn().mockImplementation(async (command) => command.type === 'collection.get'
      ? { payload: { collection: { revision: 3, nodes } } }
      : { payload: { revision: 4 } }),
    invokeMain: vi.fn().mockResolvedValue({ type: 'composer.collection.replace', payload: { revision: 4 } }),
  };
}

describe('Composer Collection Tools', () => {
  it('分别注册空参数查询与整树替换意图', () => {
    expect(definition(QUERY_TOOL)).toMatchObject({
      capabilityId: 'composer', kind: 'query', destructive: false, openWorld: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
    expect(definition(REPLACE_TOOL)).toMatchObject({
      capabilityId: 'composer', kind: 'change', destructive: false, openWorld: false,
      inputSchema: { type: 'object', required: ['baseRevision', 'nodes'], additionalProperties: false },
    });
  });

  it('读取已保存集合并脱敏Auth、Header、Query，保留稳定身份和编辑字段', async () => {
    const host = hostFor();
    const abortSignal = new AbortController().signal;
    const result = await definition(QUERY_TOOL).execute({}, { host, abortSignal });

    expect(result).toMatchObject({ collection: { revision: 3, nodes: [{
      kind: 'folder', id: 'folder-1', children: [{
        id: 'request-1', protocol: 'auto', bodyType: 'none',
        auth: { type: 'bearer', token: TOOL_REDACTED_PLACEHOLDER },
        query: [{ id: 'query-token', name: 'token', value: TOOL_REDACTED_PLACEHOLDER, enabled: true }],
        headers: [
          { id: 'header-secret', name: 'Authorization', value: TOOL_REDACTED_PLACEHOLDER, enabled: false },
          { id: 'header-public', name: 'accept', value: 'application/json', enabled: true },
        ],
      }],
    }] } });
    for (const secret of ['collection-query-token', 'collection-header-token', 'collection-auth-token']) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'collection.get', payload: {} }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('替换沿正式Core命令使用expectedRevision且不发送请求', async () => {
    const nodes = [request({ url: '', name: 'Unfinished editor request' })];
    const host = hostFor();
    const abortSignal = new AbortController().signal;

    await expect(definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes }, { host, abortSignal }))
      .resolves.toEqual({ revision: 4 });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({
      type: 'composer.collection.replace', payload: { expectedRevision: 3, nodes },
    }, abortSignal);
    expect(host.invoke.mock.calls.every(([command]) => command.type.startsWith('collection.'))).toBe(true);
  });

  it('审批只披露当前与目标请求和目录计数', async () => {
    const host = hostFor();
    const description = await definition(REPLACE_TOOL).describeChange!({ baseRevision: 3, nodes: [] }, {
      host, abortSignal: new AbortController().signal,
    });

    expect(description.metadata).toEqual({ beforeRequestCount: 1, afterRequestCount: 0, beforeFolderCount: 1, afterFolderCount: 0 });
    expect(JSON.stringify(description)).not.toContain('collection-auth-token');
    expect(host.invoke.mock.calls.map(([command]) => command.type)).toEqual(['collection.get']);
  });

  it('合法查询快照往返保留同一请求字段的原始凭据', async () => {
    const host = hostFor();
    const context = { host, abortSignal: new AbortController().signal };
    const result = await definition(QUERY_TOOL).execute({}, context) as { collection: { nodes: CollectionNode[] } };

    await definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes: result.collection.nodes }, context);

    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({
      type: 'composer.collection.replace', payload: { expectedRevision: 3, nodes: tree() },
    }, context.abortSignal);
  });

  it.each(['execute', 'describeChange'] as const)('%s在读取Core前拒绝非法递归树', async (method) => {
    const host = hostFor();
    const invalid = [request({ protocol: 'ftp' as CollectionRequest['protocol'] })];
    await expect(definition(REPLACE_TOOL)[method]!({ baseRevision: 3, nodes: invalid }, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('旧revision不能生成可执行审批或覆盖最新集合', async () => {
    const host = hostFor();
    await expect(definition(REPLACE_TOOL).execute({ baseRevision: 2, nodes: tree() }, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke.mock.calls.map(([command]) => command.type)).toEqual(['collection.get']);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each([QUERY_TOOL, REPLACE_TOOL])('%s在取消后不调用Core', async (name) => {
    const host = hostFor();
    const abortController = new AbortController();
    abortController.abort();
    await expect(definition(name).execute(name === QUERY_TOOL ? {} : { baseRevision: 3, nodes: [] }, {
      host, abortSignal: abortController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('共享Query字段脱敏保留ID、enabled与自定义敏感键配置', () => {
    const interceptorToolRedactor = new InterceptorToolRedactor([], ['secret-key']);
    expect(interceptorToolRedactor.redactQueryFields([
      { id: 'row-1', name: 'Secret-Key', value: 'private', enabled: false },
      { id: 'row-2', name: 'page', value: '2', enabled: true },
    ])).toEqual([
      { id: 'row-1', name: 'Secret-Key', value: TOOL_REDACTED_PLACEHOLDER, enabled: false },
      { id: 'row-2', name: 'page', value: '2', enabled: true },
    ]);
  });

  it('允许仍在编辑的URL凭据编码，只有明确遮罩才触发保留', async () => {
    const nodes = [request({ url: 'https://unfinished%token@example.test/path' })];
    const host = hostFor();
    const abortSignal = new AbortController().signal;

    await expect(definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes }, { host, abortSignal }))
      .resolves.toEqual({ revision: 4 });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({
      type: 'composer.collection.replace', payload: { expectedRevision: 3, nodes },
    }, abortSignal);
  });

  it.each([
    [request(), request()],
    [request({ headers: [{ id: 'same', name: 'accept', value: '*/*', enabled: true }], query: [{ id: 'same', name: 'page', value: '1', enabled: true }] })],
    [{ kind: 'folder', id: 'one', name: 'One', children: [{ kind: 'folder', id: 'two', name: 'Two', children: [{ kind: 'folder', id: 'three', name: 'Three', children: [{ kind: 'folder', id: 'four', name: 'Four', children: [] }] }] }] }],
  ])('拒绝重复身份或越界树，不能触达Main：%j', async (...nodes) => {
    const host = hostFor();
    await expect(definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes }, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['request', 'header', 'query', 'auth'] as const)('遮罩不能把原凭据复制给不同%s身份或普通字段', async (field) => {
    const host = hostFor();
    const context = { host, abortSignal: new AbortController().signal };
    const read = await definition(QUERY_TOOL).execute({}, context) as { collection: { nodes: CollectionNode[] } };
    const folder = read.collection.nodes[0]!;
    if (folder.kind !== 'folder') throw new Error('Expected folder.');
    const savedRequest = folder.children[0] as CollectionRequest;
    const changedRequest = field === 'request' ? { ...savedRequest, id: 'another-request' }
      : field === 'header' ? { ...savedRequest, headers: savedRequest.headers.map((row) => ({ ...row, id: `changed-${row.id}` })) }
        : field === 'query' ? { ...savedRequest, query: savedRequest.query.map((row) => ({ ...row, name: 'ordinary' })) }
          : { ...savedRequest, auth: { ...savedRequest.auth, username: TOOL_REDACTED_PLACEHOLDER } };
    await expect(definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes: [{ ...folder, children: [changedRequest] }] }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('basic认证、重复敏感query和form字段往返保持原值且不向Model披露', async () => {
    const original = [request({
      url: 'https://url-user:url-password@example.test/path?token=first&token=second',
      auth: { type: 'basic', token: 'dormant-token', username: 'basic-user', password: 'basic-password' },
      bodyType: 'form', bodyForm: [{ id: 'form-1', name: 'password', value: 'form-password', enabled: false }],
    })];
    const host = hostFor(original);
    const context = { host, abortSignal: new AbortController().signal };
    const result = await definition(QUERY_TOOL).execute({}, context) as { collection: { nodes: CollectionNode[] } };
    for (const secret of ['url-user', 'url-password', 'first', 'second', 'basic-user', 'basic-password', 'form-password', 'dormant-token']) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    await definition(REPLACE_TOOL).execute({ baseRevision: 3, nodes: result.collection.nodes }, context);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({
      type: 'composer.collection.replace', payload: { expectedRevision: 3, nodes: original },
    }, context.abortSignal);
  });
});