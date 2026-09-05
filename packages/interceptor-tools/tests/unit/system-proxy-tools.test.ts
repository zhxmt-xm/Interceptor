import { describe, expect, it, vi } from 'vitest';

import {
  buildInterceptorToolRegistry,
  InterceptorToolArgumentError,
  type InterceptorToolDefinition,
} from '../../src';

const PROXY_STATUS = {
  supported: true, enabled: true, owned: true, ownershipLost: false,
  autoDetect: false, upstreamReachable: true,
};
const CHANGES = [
  { name: 'settings_enable_system_proxy', command: 'settings.system-proxy.enable', result: PROXY_STATUS },
  { name: 'settings_restore_system_proxy', command: 'settings.system-proxy.restore',
    result: { restored: true, status: { ...PROXY_STATUS, owned: false, enabled: false } } },
] as const;

function definition(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing system proxy Tool: ${name}`);
  return tool;
}

describe('System proxy change Tools', () => {
  it.each(CHANGES)('$name is an independent approved change with no arguments', ({ name }) => {
    expect(definition(name)).toMatchObject({
      capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false,
      effectDescription: expect.any(String),
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  });

  it.each(CHANGES)('$name invokes only its formal Main command and returns public state', async ({ name, command, result }) => {
    const invokeMain = vi.fn().mockResolvedValue({
      type: command,
      payload: {
        ...result, path: 'C:\\private\\journal.json', proxyServer: 'http://user:password@proxy.test',
        ...('status' in result ? { status: { ...result.status, pacUrl: 'file:///C:/private/proxy.pac' } } : {}),
      },
    });
    const host = { invoke: vi.fn(), invokeMain };
    const abortSignal = new AbortController().signal;

    await expect(definition(name).execute({}, { host, abortSignal })).resolves.toEqual(result);
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(CHANGES)('$name describes current ownership without writing or leaking OS configuration', async ({ name }) => {
    const invokeMain = vi.fn().mockResolvedValue({
      type: 'settings.system-proxy.status',
      payload: { ...PROXY_STATUS, proxyServer: 'http://user:password@proxy.test' },
    });
    const host = { invoke: vi.fn(), invokeMain };
    const abortSignal = new AbortController().signal;
    const describeChange = definition(name).describeChange;
    expect(describeChange).toBeTypeOf('function');
    const impact = await describeChange!({}, { host, abortSignal });

    expect(impact.metadata).toEqual({ supported: true, enabled: true, owned: true });
    expect(impact.lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(impact)).not.toContain('password');
    expect(JSON.stringify(impact)).not.toContain('proxy.test');
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'settings.system-proxy.status', payload: {} }, abortSignal);
  });

  it.each(CHANGES)('$name rejects unexpected arguments before approval or execution', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    await expect(definition(name).describeChange!({ enabled: true }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    await expect(definition(name).execute({ enabled: true }, context))
      .rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(CHANGES)('$name does not begin a cancelled change', async ({ name }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    await expect(definition(name).execute({}, { host, abortSignal: abortController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it('preserves a skipped Restore reason and redacts its status', async () => {
    const result = { restored: false, reason: 'not-owned', status: { ...PROXY_STATUS, owned: false } };
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockResolvedValue({ type: 'settings.system-proxy.restore', payload: result }),
    };
    await expect(definition('settings_restore_system_proxy').execute({}, {
      host, abortSignal: new AbortController().signal,
    })).resolves.toEqual(result);
  });

  it.each(CHANGES)('$name sanitizes Main failures', async ({ name }) => {
    const host = {
      invoke: vi.fn(),
      invokeMain: vi.fn().mockRejectedValue(new Error('Cannot read C:\\private\\journal.json')),
    };
    await expect(definition(name).execute({}, { host, abortSignal: new AbortController().signal }))
      .rejects.toThrow('Unable to change system proxy state.');
  });
});