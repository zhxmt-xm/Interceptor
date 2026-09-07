import { describe, expect, it, vi } from 'vitest';

import { buildInterceptorToolRegistry, InterceptorToolArgumentError, type InterceptorToolDefinition } from '../../src';

const CASES = [
  { name: 'settings_set_language', type: 'settings.language.set', args: { language: 'zh-CN' }, result: { language: 'zh-CN' } },
  { name: 'settings_set_theme', type: 'settings.theme.set', args: { theme: 'ember' }, result: { theme: 'ember' } },
  {
    name: 'settings_set_export_privacy_defaults', type: 'settings.export-privacy-defaults.set',
    args: { maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true },
    result: { maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true },
  },
] as const;

function findTool(name: string): InterceptorToolDefinition {
  const tool = buildInterceptorToolRegistry().find((entry) => entry.name === name);
  if (!tool) throw new Error(`Missing Settings preference Tool: ${name}`);
  return tool;
}

describe('Settings preference Tools', () => {
  it.each(CASES)('$name is an independently authorized strict change', ({ name }) => {
    expect(findTool(name)).toMatchObject({ capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false });
    expect(findTool(name).inputSchema.additionalProperties).toBe(false);
    expect(findTool(name).describeChange).toBeTypeOf('function');
  });

  it.each(CASES)('$name uses its shared Main method and returns only applied preference fields', async ({ name, type, args, result }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ type, payload: { ...result, path: 'C:\\private\\profile', token: 'private' } }) };
    const abortSignal = new AbortController().signal;
    await expect(findTool(name).execute(args, { host, abortSignal })).resolves.toEqual(result);
    expect(host.invokeMain).toHaveBeenCalledExactlyOnceWith({ type, payload: args }, abortSignal);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it.each(CASES)('$name describes explicit values without changing preferences', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const description = await findTool(name).describeChange!(args, { host, abortSignal: new AbortController().signal });
    expect(description.lines.length).toBeGreaterThan(0);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(CASES)('$name rejects missing or unknown fields before approval and execution', async ({ name, args }) => {
    for (const invalid of [{}, { ...args, filePath: 'private.json' }, { ...args, script: 'private' }, { ...args, operation: 'reset' }]) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn() };
      const context = { host, abortSignal: new AbortController().signal };
      await expect(findTool(name).describeChange!(invalid, context)).rejects.toThrow(InterceptorToolArgumentError);
      await expect(findTool(name).execute(invalid, context)).rejects.toThrow(InterceptorToolArgumentError);
      expect(host.invokeMain).not.toHaveBeenCalled();
    }
  });

  it('accepts exactly the fifteen supported language IDs', async () => {
    const tool = findTool('settings_set_language');
    for (const language of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'it', 'pt-BR', 'ru', 'nl', 'pl', 'tr', 'uk']) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ payload: { language } }) };
      await expect(tool.execute({ language }, { host, abortSignal: new AbortController().signal })).resolves.toEqual({ language });
    }
    for (const language of ['zh', 'en-US', 'auto', '', 1, null]) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn() };
      await expect(tool.execute({ language }, { host, abortSignal: new AbortController().signal })).rejects.toThrow(InterceptorToolArgumentError);
      expect(host.invokeMain).not.toHaveBeenCalled();
    }
  });

  it('accepts exactly the four supported theme IDs', async () => {
    const tool = findTool('settings_set_theme');
    for (const theme of ['warm', 'light', 'ember', 'dark']) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn().mockResolvedValue({ payload: { theme } }) };
      await expect(tool.execute({ theme }, { host, abortSignal: new AbortController().signal })).resolves.toEqual({ theme });
    }
    for (const theme of ['system', 'auto', '', 1, null]) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn() };
      await expect(tool.execute({ theme }, { host, abortSignal: new AbortController().signal })).rejects.toThrow(InterceptorToolArgumentError);
      expect(host.invokeMain).not.toHaveBeenCalled();
    }
  });

  it('requires all three independent privacy choices as booleans', async () => {
    const tool = findTool('settings_set_export_privacy_defaults');
    for (const args of [
      { maskAuthorization: true },
      { maskAuthorization: true, maskCookies: false },
      { maskAuthorization: 'true', maskCookies: false, warnBeforeUnmasked: true },
      { maskAuthorization: true, maskCookies: 1, warnBeforeUnmasked: true },
      { maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: null },
    ]) {
      const host = { invoke: vi.fn(), invokeMain: vi.fn() };
      await expect(tool.execute(args, { host, abortSignal: new AbortController().signal })).rejects.toThrow(InterceptorToolArgumentError);
      expect(host.invokeMain).not.toHaveBeenCalled();
    }
  });

  it.each(CASES)('$name pre-cancellation cannot dispatch a Renderer change', async ({ name, args }) => {
    const abortController = new AbortController();
    abortController.abort();
    const host = { invoke: vi.fn(), invokeMain: vi.fn() };
    const context = { host, abortSignal: abortController.signal };
    await expect(findTool(name).describeChange!(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(findTool(name).execute(args, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(host.invokeMain).not.toHaveBeenCalled();
  });

  it.each(CASES)('$name hides local persistence and Renderer errors', async ({ name, args }) => {
    const host = { invoke: vi.fn(), invokeMain: vi.fn().mockRejectedValue(new Error('Private path C:\\profile\\settings.json')) };
    await expect(findTool(name).execute(args, { host, abortSignal: new AbortController().signal })).rejects.toThrow('Unable to change the requested preference.');
  });
});