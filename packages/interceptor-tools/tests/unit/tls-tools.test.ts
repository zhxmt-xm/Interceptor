import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  type InterceptorToolDefinition,
} from '../../src';

const CERTIFICATE_STATUS = {
  present: true, trusted: true, supported: true, mitmEnabled: true,
  fingerprint: 'public-fingerprint', subject: 'Interceptor Root CA',
  createdAt: '2026-09-05T00:00:00Z', expiresAt: '2027-09-05T00:00:00Z',
};
const TLS_TOOLS = [
  {
    name: 'settings_replace_tls_insecure_hosts', command: 'settings.tls-insecure-hosts.replace',
    args: { hosts: ['LOCALHOST', 'localhost'] }, result: { hosts: ['localhost'] },
  },
  {
    name: 'settings_replace_tls_passthrough', command: 'settings.tls-passthrough.replace',
    args: { expectedRevision: 2, hosts: ['*.EXAMPLE.test'] },
    result: { ok: true, settings: { revision: 3, hosts: ['*.example.test'] } },
  },
  {
    name: 'settings_enable_https_decryption', command: 'settings.https-decryption.enable',
    args: {}, result: { ...CERTIFICATE_STATUS, decrypting: true },
  },
  {
    name: 'settings_disable_https_decryption', command: 'settings.https-decryption.disable',
    args: {}, result: { ...CERTIFICATE_STATUS, mitmEnabled: false, decrypting: false },
  },
] as const;

function definition(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing TLS Tool: ${name}`);
  return tool;
}

describe('TLS configuration Tools', () => {
  it.each(TLS_TOOLS)('$name is an independent non-destructive change', ({ name }) => {
    expect(definition(name)).toMatchObject({
      kind: 'change', capabilityId: 'settings', destructive: false, openWorld: false,
      effectDescription: expect.any(String),
    });
  });

  it.each(TLS_TOOLS)('$name delegates to the formal Main owner and redacts the returned state', async ({ name, command, args, result }) => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: command, payload: { ...result, path: 'C:\\private\\root.pem', privateKey: 'secret-key' },
      }),
    };
    const abortSignal = new AbortController().signal;
    await expect(definition(name).execute(args, { host, abortSignal })).resolves.toEqual(result);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: args }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(TLS_TOOLS)('$name rejects extra arguments before approval and execution', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    await expect(definition(name).describeChange!({ ...args, path: 'private.pem' }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    await expect(definition(name).execute({ ...args, path: 'private.pem' }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TLS_TOOLS)('$name rejects cancelled calls before owner execution', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    await expect(definition(name).execute(args, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(TLS_TOOLS)('$name hides owner errors while preparing approval', async ({ name, args }) => {
    const failure = new Error('Unable to open C:\\private\\workspace.sqlite token=secret');
    const host = {
      invoke: vi.fn().mockRejectedValue(failure),
      invokeMain: vi.fn().mockRejectedValue(failure),
    };
    await expect(definition(name).describeChange!(args, {
      host, abortSignal: new AbortController().signal,
    })).rejects.toThrow('Unable to read TLS settings.');
  });

  it.each(TLS_TOOLS)('$name preserves cancellation during approval preparation', async ({ name, args }) => {
    const abortController = new AbortController();
    const cancel = vi.fn(async () => {
      abortController.abort();
      throw new Error('private failure after cancellation');
    });
    const host = { invoke: cancel, invokeMain: cancel };
    await expect(definition(name).describeChange!(args, {
      host, abortSignal: abortController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([
    { name: 'settings_replace_tls_insecure_hosts', args: { hosts: [false] } },
    { name: 'settings_replace_tls_insecure_hosts', args: { hosts: [''] } },
    { name: 'settings_replace_tls_passthrough', args: { hosts: ['localhost'], expectedRevision: -1 } },
    { name: 'settings_replace_tls_passthrough', args: { hosts: ['localhost'], expectedRevision: 1.5 } },
  ])('$name rejects malformed lists and revisions', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    await expect(definition(name).execute(args, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('preserves a passthrough conflict without leaking the owner error', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: 'settings.tls-passthrough.replace',
        payload: { ok: false, reason: 'conflict', message: 'private C:\\user\\workspace.sqlite' },
      }),
    };
    await expect(definition('settings_replace_tls_passthrough').execute({ hosts: [], expectedRevision: 1 }, {
      host, abortSignal: new AbortController().signal,
    })).resolves.toEqual({ ok: false, reason: 'conflict', message: 'TLS settings changed; read the latest revision.' });
  });

  it('describes the insecure host count without replacing it', async () => {
    const host = {
      invoke: vi.fn().mockResolvedValue({ type: 'tls.insecureHosts', payload: { hosts: ['localhost'] } }),
      invokeMain: vi.fn(),
    };
    const result = await definition('settings_replace_tls_insecure_hosts').describeChange!({ hosts: [] }, {
      host, abortSignal: new AbortController().signal,
    });
    expect(result.metadata).toEqual({ currentHostCount: 1, targetHostCount: 0 });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('describes decryption intent separately from trust', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: 'settings.certificate.status', payload: { ...CERTIFICATE_STATUS, trusted: false, mitmEnabled: false },
      }),
    };
    const result = await definition('settings_enable_https_decryption').describeChange!({}, {
      host, abortSignal: new AbortController().signal,
    });
    expect(result.metadata).toEqual({ trusted: false, mitmEnabled: false });
    expect(host.invokeMain).toHaveBeenCalledTimes(1);
    expect(host.invokeMain.mock.calls[0]?.[0]).toEqual({ type: 'settings.certificate.status', payload: {} });
  });

  it('returns the effective state reported by the Main operation instead of inferring it from trust and intent', async () => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({
        type: 'settings.https-decryption.enable',
        payload: { ...CERTIFICATE_STATUS, decrypting: false },
      }),
    };
    await expect(definition('settings_enable_https_decryption').execute({}, {
      host, abortSignal: new AbortController().signal,
    })).resolves.toMatchObject({ trusted: true, mitmEnabled: true, decrypting: false });
    expect(host.invoke).not.toHaveBeenCalled();
  });
});