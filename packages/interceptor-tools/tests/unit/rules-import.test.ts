import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  type InterceptorToolDefinition,
} from '../../src';

function importTool(): InterceptorToolDefinition {
  const definition = buildInterceptorToolRegistry().find((tool) => tool.name === 'rules_import');
  if (definition === undefined) throw new Error('Missing Rules import Tool.');
  return definition;
}

describe('Rules import Tool', () => {
  it('registers a separate change with strictly empty arguments', () => {
    expect(importTool()).toMatchObject({
      name: 'rules_import', capabilityId: 'rules', kind: 'change',
      destructive: false, openWorld: false, effectDescription: expect.any(String),
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it.each([
    { imported: false },
    { imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 },
  ])('returns only import outcome and public counts: %j', async (outcome) => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: 'rules.import',
        payload: { ...outcome, path: 'C:\\private\\rules.json', fileName: 'private.json', nodes: ['private Rule content'] },
      }),
    };
    const abortSignal = new AbortController().signal;

    await expect(importTool().execute({}, { host, abortSignal })).resolves.toEqual(outcome);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'rules.import', payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('describes the native selection and confirmation without opening or reading a file', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };

    const description = await importTool().describeChange!({}, {
      host, abortSignal: new AbortController().signal,
    });

    expect(description.lines).toHaveLength(2);
    expect(description.metadata).toBeUndefined();
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['execute', 'describeChange'] as const)('%s rejects Model-selected paths before reaching an owner', async (method) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };

    await expect(importTool()[method]!({ path: 'rules.json' }, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['execute', 'describeChange'] as const)('%s stops before any file selection when aborted', async (method) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();

    await expect(importTool()[method]!({}, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('does not accept a late result after cancellation', async () => {
    const abortController = new AbortController();
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return { type: 'rules.import', payload: { imported: false } };
      }),
    };

    await expect(importTool().execute({}, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not disclose raw owner errors', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockRejectedValue(new Error('Unable to read C:\\private\\rules.json')),
    };

    await expect(importTool().execute({}, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow('Unable to import Rules.');
  });
});