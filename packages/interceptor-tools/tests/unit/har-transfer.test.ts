import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

const REDACTION = { authorization: true, cookies: true, bodies: false };
const EXPORT_ARGS = { scope: { kind: 'all' }, redaction: REDACTION };
const TOOL_CASES = [
  { name: 'capture_export_har', type: 'capture.har.export', kind: 'har-export', args: EXPORT_ARGS },
  { name: 'capture_import_har', type: 'capture.har.import', kind: 'har-import', args: {} },
] as const;

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Capture HAR Tool: ${name}`);
  return tool;
}

describe('Capture HAR transfer Tools', () => {
  it.each(TOOL_CASES)('$name is a separate approval-controlled change', ({ name }) => {
    expect(findTool(name)).toMatchObject({ capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false });
    expect(findTool(name).describeChange).toBeTypeOf('function');
    expect(findTool(name).inputSchema.additionalProperties).toBe(false);
  });

  it.each(TOOL_CASES)('$name only invokes its native Main intent and returns cancellation without a job', async ({ name, type, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type, payload: { job: null } }) };
    const abortSignal = new AbortController().signal;
    await expect(findTool(name).execute(args, { host, abortSignal })).resolves.toEqual({ started: false });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type, payload: args }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name only returns safe transfer fields and never file information', async ({ name, type, kind, args }) => {
    const job = {
      id: 'transfer-har', kind, state: 'running', processed: 0, total: 2,
      startedAt: '2026-09-07T08:00:00.000Z', fileName: 'private.har', filePath: 'C:\\private\\capture.har',
      message: 'private data', warnings: ['private warning'],
    };
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type, payload: { job } }) };
    await expect(findTool(name).execute(args, { host, abortSignal: new AbortController().signal })).resolves.toEqual({
      started: true,
      job: { id: 'transfer-har', kind, state: 'running', processed: 0, total: 2, startedAt: job.startedAt, warningCount: 1 },
    });
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'all' },
    { kind: 'selected', exchangeIds: ['exchange-one', 'exchange-two'] },
    { kind: 'filter', filter: { host: 'example.test', method: 'GET', status: 200, mime: 'application/json', appName: 'browser', search: 'checkout', protocol: 'h2' } },
  ])('preserves the formal scope and explicit redaction choices: %j', async (scope) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ payload: { job: null } }) };
    const abortSignal = new AbortController().signal;
    const args = { scope, redaction: { authorization: false, cookies: false, bodies: true } };
    await expect(findTool('capture_export_har').execute(args, { host, abortSignal })).resolves.toEqual({ started: false });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'capture.har.export', payload: args }, abortSignal);
  });

  it.each([
    {},
    { scope: { kind: 'all' } },
    { ...EXPORT_ARGS, filePath: 'C:\\private\\capture.har' },
    { ...EXPORT_ARGS, jobId: 'model-job' },
    { ...EXPORT_ARGS, scope: { kind: 'all', exchangeIds: ['exchange-one'] } },
    { ...EXPORT_ARGS, scope: { kind: 'selected', exchangeIds: [] } },
    { ...EXPORT_ARGS, scope: { kind: 'selected', exchangeIds: [' '] } },
    { ...EXPORT_ARGS, scope: { kind: 'selected', exchangeIds: ['exchange-one', 'exchange-one'] } },
    { ...EXPORT_ARGS, scope: { kind: 'filter' } },
    { ...EXPORT_ARGS, scope: { kind: 'filter', filter: { protocol: 'h3' } } },
    { ...EXPORT_ARGS, scope: { kind: 'filter', filter: { status: 200.5 } } },
    { ...EXPORT_ARGS, scope: { kind: 'filter', filter: { filePath: 'private.har' } } },
    { ...EXPORT_ARGS, redaction: { authorization: 'true', cookies: true, bodies: false } },
    { ...EXPORT_ARGS, redaction: { ...REDACTION, path: true } },
  ])('rejects invalid export parameters before approval or a native dialog: %j', async (args) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    await expect(findTool('capture_export_har').describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findTool('capture_export_har').execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each([{ filePath: 'private.har' }, { content: '{}' }, { replace: true }, { jobId: 'model-job' }])('import never accepts a path, file bytes or a hidden replace mode: %j', async (args) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    await expect(findTool('capture_import_har').describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findTool('capture_import_har').execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name builds a bounded approval without opening a dialog or reading file data', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const description = await findTool(name).describeChange!(args, { host, abortSignal: new AbortController().signal });
    expect(description.lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(description)).not.toMatch(/private\.har|C:\\/);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name pre-cancellation does not open a dialog or touch Core', async ({ name, args }) => {
    const abortController = new AbortController();
    abortController.abort();
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: abortController.signal };
    await expect(findTool(name).describeChange!(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(findTool(name).execute(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TOOL_CASES)('$name hides native and filesystem errors', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockRejectedValue(new Error('Private path C:\\private\\capture.har')) };
    await expect(findTool(name).execute(args, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(name === 'capture_export_har' ? 'Unable to export HAR.' : 'Unable to import HAR.');
  });
});