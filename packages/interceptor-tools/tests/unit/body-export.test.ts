import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  type InterceptorToolDefinition,
} from '../../src';

const BODY_EXPORT_ARGS = { exchangeId: 'exchange-one', bodyId: 'body-one' };

function findBodyExportTool(): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === 'capture_export_body');
  if (!tool) throw new Error('Missing Capture Tool: capture_export_body');
  return tool;
}

describe('Capture body export Tool', () => {
  it('exposes an approval-controlled change with a closed body identity schema', () => {
    expect(findBodyExportTool()).toMatchObject({
      capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['exchangeId', 'bodyId'],
        properties: {
          exchangeId: { type: 'string', minLength: 1 },
          bodyId: { type: 'string', minLength: 1 },
        },
      },
    });
    expect(findBodyExportTool().describeChange).toBeTypeOf('function');
  });

  it('builds approval from the matching captured body without URL, headers or file information', async () => {
    const host = {
      invoke: vi.fn().mockResolvedValue({ payload: { detail: {
        url: 'https://private.example/path?token=secret',
        responseHeaders: [{ name: 'authorization', value: 'private' }],
        responseBody: { bodyHash: 'body-one', encodedSize: 2_097_152, mediaType: 'application/octet-stream', contentEncoding: 'gzip' },
      } } }),
      invokeMain: vi.fn(),
    };
    const abortSignal = new AbortController().signal;
    const description = await findBodyExportTool().describeChange!(BODY_EXPORT_ARGS, { host, abortSignal });

    expect(description.metadata).toEqual({ ...BODY_EXPORT_ARGS, encodedSize: 2_097_152 });
    expect(JSON.stringify(description)).not.toMatch(/private|secret|https:|authorization/);
    expect(host.invoke).toHaveBeenCalledExactlyOnceWith({ type: 'sessions.detail', payload: { exchangeId: 'exchange-one' } }, abortSignal);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { responseBody: { bodyHash: 'another-body', encodedSize: 4 } },
  ])('rejects missing or mismatched body identity before approval: %j', async (detail) => {
    const host = { invoke: vi.fn().mockResolvedValue({ payload: { detail } }), invokeMain: vi.fn() };
    await expect(findBodyExportTool().describeChange!(BODY_EXPORT_ARGS, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow('The captured body is no longer available.');
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('does not expose failures while reading approval metadata', async () => {
    const host = { invoke: vi.fn().mockRejectedValue(new Error('C:\\private\\capture.sqlite')), invokeMain: vi.fn() };
    await expect(findBodyExportTool().describeChange!(BODY_EXPORT_ARGS, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow('Unable to read captured body metadata.');
  });

  it('delegates to the native Main intent and reports native cancellation without a job', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({ type: 'capture.body.export', payload: { job: null } }),
    };
    const abortSignal = new AbortController().signal;

    await expect(findBodyExportTool().execute(BODY_EXPORT_ARGS, { host, abortSignal }))
      .resolves.toEqual({ started: false });
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({
      type: 'capture.body.export', payload: BODY_EXPORT_ARGS,
    }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('returns only safe running-job fields without body bytes or local file information', async () => {
    const job = {
      id: 'transfer-one', kind: 'body-export', state: 'running', processed: 0, total: 2_097_152,
      startedAt: '2026-09-07T06:00:00.000Z', fileName: 'private-body.bin',
      filePath: 'C:\\private\\body.bin', message: 'private export message', warnings: ['private warning'],
    };
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({ type: 'capture.body.export', payload: { job } }),
    };

    await expect(findBodyExportTool().execute(BODY_EXPORT_ARGS, {
      host, abortSignal: new AbortController().signal,
    })).resolves.toEqual({
      started: true,
      job: {
        id: 'transfer-one', kind: 'body-export', state: 'running', processed: 0, total: 2_097_152,
        startedAt: '2026-09-07T06:00:00.000Z', warningCount: 1,
      },
    });
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...BODY_EXPORT_ARGS, exchangeId: ' ' },
    { ...BODY_EXPORT_ARGS, bodyId: '' },
    { ...BODY_EXPORT_ARGS, filePath: 'C:\\private\\body.bin' },
    { ...BODY_EXPORT_ARGS, suggestedName: 'model-name.bin' },
    { ...BODY_EXPORT_ARGS, mimeType: 'application/octet-stream' },
    { ...BODY_EXPORT_ARGS, jobId: 'model-job' },
  ])('rejects invalid or model-controlled export metadata before approval and execution: %j', async (args) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };

    await expect(findBodyExportTool().describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(findBodyExportTool().execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('does not read metadata or open a dialog for a pre-cancelled Tool call', async () => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    const context = { host, abortSignal: abortController.signal };

    await expect(findBodyExportTool().describeChange!(BODY_EXPORT_ARGS, context))
      .rejects.toMatchObject({ name: 'AbortError' });
    await expect(findBodyExportTool().execute(BODY_EXPORT_ARGS, context))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('does not cancel an accepted file job when the calling Tool is cancelled', async () => {
    const abortController = new AbortController();
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return { type: 'capture.body.export', payload: { job: { id: 'accepted-job' } } };
      }),
    };

    await expect(findBodyExportTool().execute(BODY_EXPORT_ARGS, {
      host, abortSignal: abortController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).toHaveBeenCalledOnce();
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('does not expose underlying file-system errors', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockRejectedValue(new Error('Access denied at C:\\private\\body.bin')),
    };

    await expect(findBodyExportTool().execute(BODY_EXPORT_ARGS, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow('Unable to export captured body.');
  });
});