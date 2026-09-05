import { describe, expect, it, vi } from 'vitest';

import {
  InterceptorToolArgumentError,
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  type InterceptorToolDefinition,
} from '../../src';

const SETTINGS_QUERY_NAMES = [
  'settings_get_core_process_status',
  'settings_get_system_proxy_status',
  'settings_get_certificate_status',
  'settings_get_tls_insecure_hosts',
  'settings_get_tls_passthrough',
  'settings_list_app_containers',
] as const;

function settingsTool(name: string): InterceptorToolDefinition {
  const definition = buildInterceptorToolRegistry().find((tool) => tool.name === name);
  if (definition === undefined) throw new Error(`Missing Settings Tool: ${name}`);
  return definition;
}

describe('Settings read-only Tools', () => {
  it('discovers the six queries from the executable Settings capability', () => {
    const registry = buildInterceptorToolRegistry();
    const catalog = buildInterceptorToolCatalog(registry);

    expect(registry.filter((tool) => tool.capabilityId === 'settings').map((tool) => tool.name))
      .toEqual(SETTINGS_QUERY_NAMES);
    expect(catalog.discover({ capabilityId: 'settings' }).map((match) => match.descriptor.name))
      .toEqual(SETTINGS_QUERY_NAMES);
  });

  it.each(SETTINGS_QUERY_NAMES)('%s is a closed, non-destructive query with no arguments', (name) => {
    expect(settingsTool(name)).toMatchObject({
      kind: 'query',
      destructive: false,
      openWorld: false,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
    expect(settingsTool(name).describeChange).toBeUndefined();
  });

  it.each(SETTINGS_QUERY_NAMES)('%s rejects extra arguments before reaching any owner', async (name) => {
    const invoke = vi.fn();
    const invokeMain = vi.fn();

    await expect(settingsTool(name).execute({ path: 'private.pem' }, {
      host: { invoke, invokeMain },
      abortSignal: new AbortController().signal,
    })).rejects.toThrow(InterceptorToolArgumentError);
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeMain).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'settings_get_core_process_status',
      command: 'settings.core-process.status',
      payload: {
        state: 'running', pid: 42, restartCount: 0, startedAt: '2026-09-05T10:00:00Z',
        lastHeartbeatAt: '2026-09-05T10:01:00Z', updatedAt: '2026-09-05T10:01:00Z',
      },
    },
    {
      name: 'settings_get_system_proxy_status',
      command: 'settings.system-proxy.status',
      payload: {
        supported: true, enabled: true, owned: true, ownershipLost: false,
        autoDetect: false, upstreamReachable: true,
      },
    },
    {
      name: 'settings_get_certificate_status',
      command: 'settings.certificate.status',
      payload: {
        present: true, trusted: false, supported: true, mitmEnabled: false,
        fingerprint: 'public-fingerprint', subject: 'Interceptor Root CA',
        createdAt: '2026-09-05T10:00:00Z', expiresAt: '2027-09-05T10:00:00Z',
      },
    },
    {
      name: 'settings_list_app_containers',
      command: 'settings.app-containers.list',
      payload: {
        supported: true,
        containers: [{ appContainerSid: 'S-1-15-2-123', displayName: 'Test App',
          packageFamilyName: 'Test.App_123', exempt: false }],
      },
    },
  ])('$name reads Main and returns only the public field allowlist', async ({ name, command, payload }) => {
    const invoke = vi.fn();
    const invokeMain = vi.fn().mockResolvedValue({
      type: command,
      payload: {
        ...payload,
        path: 'C:\\private\\root-ca.pem',
        privateKey: 'private-key-bytes',
        detail: 'C:\\private\\worker.cjs',
        proxyServer: 'https://user:password@proxy.test:8080',
        bypassList: 'private.corp',
        pacUrl: 'file:///C:/private/proxy.pac',
        original: { secret: true },
        ...(payload.containers === undefined ? {} : {
          containers: payload.containers.map((container) => ({
            ...container, path: 'C:\\private\\app.exe', description: 'private application detail',
          })),
        }),
      },
    });
    const abortSignal = new AbortController().signal;
    const host = { invoke, invokeMain };

    await expect(settingsTool(name).execute({}, { host, abortSignal })).resolves.toEqual(payload);
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: {} }, abortSignal);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['settings_get_tls_insecure_hosts', 'tls.getInsecureHosts', { hosts: ['localhost'] }],
    ['settings_get_tls_passthrough', 'tls-passthrough.get', { revision: 2, hosts: ['*.example.test'] }],
  ] as const)('%s reads the existing Core query with the original cancellation signal', async (name, command, payload) => {
    const invoke = vi.fn().mockResolvedValue({
      type: command,
      payload: command === 'tls-passthrough.get' ? { settings: payload } : payload,
    });
    const invokeMain = vi.fn();
    const abortSignal = new AbortController().signal;
    const host = { invoke, invokeMain };

    await expect(settingsTool(name).execute({}, { host, abortSignal })).resolves.toEqual(payload);
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ type: command, payload: {} }, abortSignal);
    expect(invokeMain).not.toHaveBeenCalled();
  });

  it.each(SETTINGS_QUERY_NAMES)('%s does not start an owner after cancellation', async (name) => {
    const invoke = vi.fn();
    const invokeMain = vi.fn();
    const abortController = new AbortController();
    abortController.abort();
    const host = { invoke, invokeMain };

    await expect(settingsTool(name).execute({}, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
    expect(invokeMain).not.toHaveBeenCalled();
  });

  it.each(SETTINGS_QUERY_NAMES)('%s hides raw owner errors', async (name) => {
    const failure = new Error('Cannot read C:\\private\\settings.json token=secret');
    const host = {
      invoke: vi.fn().mockRejectedValue(failure),
      invokeMain: vi.fn().mockRejectedValue(failure),
    };

    await expect(settingsTool(name).execute({}, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow('Unable to read Settings state.');
  });
});