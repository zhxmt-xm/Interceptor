import { describe, expect, it, vi } from 'vitest';

import {
  InterceptorToolArgumentError,
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  type InterceptorToolDefinition,
} from '../../src';

const CERTIFICATE_OPERATIONS = [
  { name: 'settings_generate_certificate', command: 'settings.certificate.generate', destructive: true, returnsState: true },
  { name: 'settings_install_certificate', command: 'settings.certificate.install', destructive: false, returnsState: true },
  { name: 'settings_uninstall_certificate', command: 'settings.certificate.uninstall', destructive: false, returnsState: true },
  { name: 'settings_delete_certificate', command: 'settings.certificate.delete', destructive: true, returnsState: true },
  { name: 'settings_reveal_certificate', command: 'settings.certificate.reveal', destructive: false, returnsState: false },
  { name: 'settings_view_certificate', command: 'settings.certificate.view', destructive: false, returnsState: false },
  { name: 'settings_open_certificate_manager', command: 'settings.certificate-manager.open', destructive: false, returnsState: false },
] as const;

const PUBLIC_STATE = {
  present: true, trusted: false, supported: true, mitmEnabled: false,
  fingerprint: 'public-fingerprint', subject: 'Interceptor CA',
  createdAt: '2026-09-08T08:00:00Z', expiresAt: '2029-09-08T08:00:00Z',
};

function certificateTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((definition) => definition.name === name);
  if (tool === undefined) throw new Error(`Missing certificate Tool: ${name}`);
  return tool;
}

describe('Settings certificate Tools', () => {
  it('discovers all seven certificate operations from the Settings capability', () => {
    const catalog = buildInterceptorToolCatalog(buildInterceptorToolRegistry());
    const names = CERTIFICATE_OPERATIONS.map((operation) => operation.name);

    expect(catalog.discover({ capabilityId: 'settings' })
      .map((match) => match.descriptor.name)
      .filter((name) => names.some((expected) => expected === name)))
      .toEqual(names);
  });

  it.each(CERTIFICATE_OPERATIONS)('$name is a closed change with the intended destructive boundary', ({ name, destructive }) => {
    expect(certificateTool(name)).toMatchObject({
      capabilityId: 'settings', kind: 'change', openWorld: false, destructive,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it.each(CERTIFICATE_OPERATIONS)('$name invokes the shared Main owner and returns only public fields', async ({ name, command, returnsState }) => {
    const expected = returnsState ? PUBLIC_STATE : { requested: true };
    const invokeMain = vi.fn().mockResolvedValue({
      type: command,
      payload: { ...expected, path: 'C:\\private\\root.pem', privateKey: 'private-key', helperOutput: 'private output' },
    });
    const invoke = vi.fn();
    const abortSignal = new AbortController().signal;

    await expect(certificateTool(name).execute({}, { host: { invoke, invokeMain }, abortSignal }))
      .resolves.toEqual(expected);
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: {} }, abortSignal);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(CERTIFICATE_OPERATIONS)('$name describes public state without mutating or leaking paths', async ({ name }) => {
    const invoke = vi.fn();
    const invokeMain = vi.fn().mockResolvedValue({
      type: 'settings.certificate.status',
      payload: { ...PUBLIC_STATE, path: 'C:\\private\\root.pem', privateKey: 'private-key' },
    });
    const abortSignal = new AbortController().signal;
    const description = await certificateTool(name).describeChange!({}, { host: { invoke, invokeMain }, abortSignal });

    expect(description.metadata).toEqual({ present: true, trusted: false, supported: true, mitmEnabled: false });
    expect(JSON.stringify(description)).not.toMatch(/private|[A-Za-z]:[\\/]/);
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'settings.certificate.status', payload: {} }, abortSignal);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(CERTIFICATE_OPERATIONS)('$name rejects external arguments before approval and execution', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };

    await expect(certificateTool(name).describeChange!({ path: 'private.pem' }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    await expect(certificateTool(name).execute({ thumbprint: 'other-certificate' }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(CERTIFICATE_OPERATIONS)('$name never calls Main when already canceled', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    const context = { host, abortSignal: abortController.signal };

    await expect(certificateTool(name).describeChange!({}, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(certificateTool(name).execute({}, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(CERTIFICATE_OPERATIONS)('$name sanitizes approval and execution errors', async ({ name }) => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockRejectedValue(new Error('Cannot access C:\\private\\root.pem private-key')),
    };
    const context = { host, abortSignal: new AbortController().signal };

    await expect(certificateTool(name).describeChange!({}, context)).rejects.toThrow('Unable to read certificate state.');
    await expect(certificateTool(name).execute({}, context)).rejects.toThrow('Unable to complete certificate operation.');
  });

  it.each(CERTIFICATE_OPERATIONS)('$name preserves cancellation during approval and execution', async ({ name }) => {
    for (const phase of ['describeChange', 'execute'] as const) {
      const abortController = new AbortController();
      const host = {
        invoke: vi.fn(),
        invokeMain: vi.fn().mockImplementation(async () => {
          abortController.abort();
          return { payload: PUBLIC_STATE };
        }),
      };

      await expect(certificateTool(name)[phase]!({}, { host, abortSignal: abortController.signal }))
        .rejects.toMatchObject({ name: 'AbortError' });
    }
  });
});