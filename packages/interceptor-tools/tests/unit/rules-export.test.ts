import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  type InterceptorToolDefinition,
} from '../../src';

function exportTool(): InterceptorToolDefinition {
  const definition = buildInterceptorToolRegistry().find((tool) => tool.name === 'rules_export');
  if (definition === undefined) throw new Error('Missing Rules export Tool.');
  return definition;
}

describe('Rules export Tool', () => {
  it('registers an independent change with strictly empty arguments', () => {
    expect(exportTool()).toMatchObject({
      name: 'rules_export', capabilityId: 'rules', kind: 'change',
      destructive: false, openWorld: false, effectDescription: expect.any(String),
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it.each([true, false])('returns exported=%s without exposing the file path or content', async (exported) => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: 'rules.export', payload: { exported, path: 'C:\\private\\rules.json', nodes: ['private rules'] },
      }),
    };
    const abortSignal = new AbortController().signal;

    await expect(exportTool().execute({}, { host, abortSignal })).resolves.toEqual({ exported });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'rules.export', payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('prepares approval from persisted counts without exposing Rule or Map Local content', async () => {
    const host = {
      invoke: vi.fn().mockResolvedValue({
        type: 'rules.snapshot', payload: { ruleSet: { revision: 4, nodes: [{
          kind: 'folder', id: 'folder-1', name: 'Private group', children: [
            { kind: 'rule', id: 'rule-1', name: 'Private rule', enabled: true, matchers: [], actions: [
              { type: 'map-local', path: 'C:\\private\\response.json' },
            ] },
            { kind: 'rule', id: 'rule-2', name: 'Secret rule', enabled: false, matchers: [], actions: [] },
          ],
        }] } },
      }),
      invokeMain: vi.fn(),
    };
    const abortSignal = new AbortController().signal;
    const description = await exportTool().describeChange!({}, { host, abortSignal });

    expect(description.metadata).toEqual({ ruleCount: 2, folderCount: 1 });
    expect(description.lines).toHaveLength(2);
    expect(JSON.stringify(description)).not.toContain('Private');
    expect(JSON.stringify(description)).not.toContain('Secret');
    expect(JSON.stringify(description)).not.toContain('C:\\');
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'rules.get', payload: {} }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['execute', 'describeChange'] as const)('%s rejects caller-selected paths before reaching an owner', async (method) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    await expect(exportTool()[method]!({ path: 'rules.json' }, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['execute', 'describeChange'] as const)('%s stops before owner execution after cancellation', async (method) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    await expect(exportTool()[method]!({}, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['execute', 'describeChange'] as const)('%s hides raw owner failures', async (method) => {
    const failure = new Error('Permission denied: C:\\private\\rules.json');
    const host = { invoke: vi.fn().mockRejectedValue(failure), invokeMain: vi.fn().mockRejectedValue(failure) };
    await expect(exportTool()[method]!({}, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow('Unable to export Rules.');
  });
});