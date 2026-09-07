import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

const TOOL_CASES = [
  { name: 'capture_export_archive', type: 'capture.archive.export', kind: 'archive-export', error: 'Unable to export Archive.' },
  { name: 'capture_import_archive', type: 'capture.archive.import', kind: 'archive-import', error: 'Unable to import Archive.' },
] as const;

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Capture Archive Tool: ${name}`);
  return tool;
}

describe('Capture Archive transfer Tools', () => {
  it.each(TOOL_CASES)('$name is a separate empty-argument approval-controlled change', ({ name }) => {
    expect(findTool(name)).toMatchObject({
      capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
    expect(findTool(name).describeChange).toBeTypeOf('function');
  });

  it.each(TOOL_CASES)('$name invokes only its native Main intent and preserves native cancellation', async ({ name, type }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type, payload: { job: null } }) };
    const abortSignal = new AbortController().signal;
    await expect(findTool(name).execute({}, { host, abortSignal })).resolves.toEqual({ started: false });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type, payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name only returns safe transfer fields', async ({ name, type, kind }) => {
    const job = {
      id: 'transfer-archive', kind, state: 'running', processed: 0, total: 4,
      startedAt: '2026-09-07T11:00:00.000Z', fileName: 'private.iarchive', filePath: 'C:\\private\\capture.iarchive',
      message: 'private data', warnings: ['private warning'],
    };
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type, payload: { job } }) };
    await expect(findTool(name).execute({}, { host, abortSignal: new AbortController().signal })).resolves.toEqual({
      started: true,
      job: { id: 'transfer-archive', kind, state: 'running', processed: 0, total: 4, startedAt: job.startedAt, warningCount: 1 },
    });
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name rejects paths, content and alternate operations before approval or execution', async ({ name }) => {
    for (const args of [
      { filePath: 'C:\\private\\capture.iarchive' }, { fileName: 'capture.iarchive' }, { content: 'private' },
      { jobId: 'model-job' }, { scope: { kind: 'all' } }, { redaction: { bodies: true } }, { replace: true }, { clear: true },
    ]) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn() };
      const context = { host, abortSignal: new AbortController().signal };
      await expect(findTool(name).describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
      await expect(findTool(name).execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
      expect(host.invoke).not.toHaveBeenCalled();
      expect(host.invokeMain).not.toHaveBeenCalled();
    }
  });

  it.each(TOOL_CASES)('$name describes the native operation without touching Core or file data', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const description = await findTool(name).describeChange!({}, { host, abortSignal: new AbortController().signal });
    expect(description.lines.length).toBeGreaterThan(0);
    expect(description.metadata).toEqual({});
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name pre-cancellation never touches Core or opens a dialog', async ({ name }) => {
    const abortController = new AbortController();
    abortController.abort();
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: abortController.signal };
    await expect(findTool(name).describeChange!({}, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(findTool(name).execute({}, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name preserves cancellation without accepting a late result', async ({ name, type }) => {
    const abortController = new AbortController();
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockImplementation(async () => {
      abortController.abort();
      return { type, payload: { job: null } };
    }) };
    await expect(findTool(name).execute({}, { host, abortSignal: abortController.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).toHaveBeenCalledOnce();
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name hides native and filesystem failures', async ({ name, error }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockRejectedValue(new Error('Private path C:\\private\\capture.iarchive')) };
    await expect(findTool(name).execute({}, { host, abortSignal: new AbortController().signal })).rejects.toThrow(error);
  });
});