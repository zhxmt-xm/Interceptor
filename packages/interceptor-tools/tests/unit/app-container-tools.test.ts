import { describe, expect, it, vi } from 'vitest';

import {
  InterceptorToolArgumentError,
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  type InterceptorToolDefinition,
} from '../../src';

const TARGET_SID = 'S-1-15-2-123';
const OPERATIONS = [
  { name: 'settings_enable_app_container', command: 'settings.app-container.enable', single: true },
  { name: 'settings_disable_app_container', command: 'settings.app-container.disable', single: true },
  { name: 'settings_enable_all_app_containers', command: 'settings.app-containers.enable-all', single: false },
  { name: 'settings_disable_all_app_containers', command: 'settings.app-containers.disable-all', single: false },
] as const;
const SNAPSHOT = {
  supported: true,
  containers: [
    { appContainerSid: TARGET_SID, packageFamilyName: 'Test.First', displayName: 'First app', exempt: false },
    { appContainerSid: 'S-1-15-2-456', packageFamilyName: null, displayName: 'Second app', exempt: true },
  ],
};

function tool(name: string): InterceptorToolDefinition {
  const definition = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!definition) throw new Error(`Missing AppContainer Tool: ${name}`);
  return definition;
}

describe('Settings AppContainer Tools', () => {
  it('discovers four independent AppContainer change operations', () => {
    const names = OPERATIONS.map((operation) => operation.name);
    expect(buildInterceptorToolCatalog(buildInterceptorToolRegistry()).discover({ capabilityId: 'settings' })
      .map((match) => match.descriptor.name).filter((name) => names.some((expected) => expected === name)))
      .toEqual(names);
  });

  it.each(OPERATIONS)('$name is a closed change with an explicit single or bulk target', ({ name, single }) => {
    const definition = tool(name);
    expect(definition).toMatchObject({ capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false });
    expect(definition.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(definition.inputSchema.properties)).toEqual(single ? ['appContainerSid'] : []);
    expect(definition.inputSchema.required ?? []).toEqual(single ? ['appContainerSid'] : []);
  });

  it.each(OPERATIONS)('$name delegates once and strips private helper fields', async ({ name, command, single }) => {
    const invoke = vi.fn();
    const invokeMain = vi.fn().mockResolvedValue({ type: command, payload: {
      ...SNAPSHOT, exemptSids: ['S-1-15-2-999'], helperPath: 'C:\\private\\helper.exe',
      containers: SNAPSHOT.containers.map((container) => ({ ...container, workingDirectory: 'C:\\private', binaries: ['private.exe'] })),
    } });
    const abortSignal = new AbortController().signal;
    const args = single ? { appContainerSid: TARGET_SID } : {};

    await expect(tool(name).execute(args, { host: { invoke, invokeMain }, abortSignal })).resolves.toEqual(SNAPSHOT);
    expect(invokeMain).toHaveBeenCalledExactlyOnceWith({ type: command, payload: args }, abortSignal);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)('$name describes only the affected count and existing exemption count', async ({ name, single }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ payload: SNAPSHOT }) };
    const abortSignal = new AbortController().signal;
    const description = await tool(name).describeChange!(single ? { appContainerSid: TARGET_SID } : {}, { host, abortSignal });

    expect(description.metadata).toEqual({ supported: true, targetCount: single ? 1 : 2, exemptCount: single ? 0 : 1 });
    expect(JSON.stringify(description)).not.toMatch(/private|[A-Za-z]:[\\/]/);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type: 'settings.app-containers.list', payload: {} }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)('$name rejects unrelated arguments before reading or writing', async ({ name, single }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const args = single ? { appContainerSid: TARGET_SID, enabled: true } : { appContainerSid: TARGET_SID };
    const context = { host, abortSignal: new AbortController().signal };

    await expect(tool(name).describeChange!(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    await expect(tool(name).execute(args, context)).rejects.toThrow(InterceptorToolArgumentError);
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(['', 'S-1-5-18', 'S-1-15-2-', 'S-1-15-2-1 & whoami', '../helper.exe'])('rejects invalid AppContainer SID %s before approval', async (sid) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: new AbortController().signal };
    for (const name of ['settings_enable_app_container', 'settings_disable_app_container']) {
      await expect(tool(name).describeChange!({ appContainerSid: sid }, context)).rejects.toThrow(InterceptorToolArgumentError);
      await expect(tool(name).execute({ appContainerSid: sid }, context)).rejects.toThrow(InterceptorToolArgumentError);
    }
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)('$name preserves pre-cancellation and never starts Main', async ({ name, single }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const abortController = new AbortController();
    abortController.abort();
    const context = { host, abortSignal: abortController.signal };
    const args = single ? { appContainerSid: TARGET_SID } : {};

    await expect(tool(name).describeChange!(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(tool(name).execute(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)('$name hides raw owner errors in approval and execution', async ({ name, single }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockRejectedValue(new Error('C:\\private\\helper.exe secret output')) };
    const context = { host, abortSignal: new AbortController().signal };
    const args = single ? { appContainerSid: TARGET_SID } : {};

    await expect(tool(name).describeChange!(args, context)).rejects.toThrow('Unable to read AppContainer access.');
    await expect(tool(name).execute(args, context)).rejects.toThrow('Unable to change AppContainer access.');
  });

  it.each(OPERATIONS)('$name preserves cancellation during owner work', async ({ name, single }) => {
    for (const phase of ['describeChange', 'execute'] as const) {
      const abortController = new AbortController();
      const host = { invoke: vi.fn(), invokeMain: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return { payload: SNAPSHOT };
      }) };
      await expect(tool(name)[phase]!(single ? { appContainerSid: TARGET_SID } : {}, { host, abortSignal: abortController.signal }))
        .rejects.toMatchObject({ name: 'AbortError' });
    }
  });
});