import { describe, expect, it, vi } from 'vitest';

import { UiPreferencesService } from '../../ui-preferences-service';

function createService() {
  const requestRendererChange = vi.fn();
  const publishChange = vi.fn();
  const uiPreferencesService = new UiPreferencesService(requestRendererChange, publishChange);
  const requestId = (): string => requestRendererChange.mock.calls.at(-1)![0] as string;
  return { uiPreferencesService, requestRendererChange, publishChange, requestId };
}

describe('UI preference request lifecycle', () => {
  it('waits for the Renderer to apply a theme before publishing or resolving', async () => {
    const { uiPreferencesService, requestRendererChange, publishChange, requestId } = createService();
    const result = uiPreferencesService.setTheme('dark');
    expect(requestRendererChange).toHaveBeenCalledOnce();
    expect(publishChange).not.toHaveBeenCalled();
    expect(uiPreferencesService.claimChange(requestId())).toEqual({ kind: 'theme', theme: 'dark' });
    expect(uiPreferencesService.claimChange(requestId())).toBeNull();
    uiPreferencesService.completeChange(requestId(), { status: 'applied', change: { kind: 'theme', theme: 'dark' } }, 12);
    await expect(result).resolves.toEqual({ theme: 'dark' });
    expect(publishChange).toHaveBeenCalledExactlyOnceWith({ kind: 'theme', theme: 'dark' }, 12);
  });

  it('uses the same request lifecycle for language changes', async () => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const result = uiPreferencesService.setLanguage('zh-CN');
    expect(uiPreferencesService.claimChange(requestId())).toEqual({ kind: 'language', language: 'zh-CN' });
    uiPreferencesService.completeChange(requestId(), { status: 'applied', change: { kind: 'language', language: 'zh-CN' } }, 13);
    await expect(result).resolves.toEqual({ language: 'zh-CN' });
    expect(publishChange).toHaveBeenCalledOnce();
  });

  it('accepts a UI privacy patch and returns the complete applied preferences', async () => {
    const { uiPreferencesService, requestId } = createService();
    const result = uiPreferencesService.setExportPrivacyDefaults({ maskCookies: false });
    expect(uiPreferencesService.claimChange(requestId())).toEqual({ kind: 'export-privacy-defaults', maskCookies: false });
    uiPreferencesService.completeChange(requestId(), {
      status: 'applied', change: { kind: 'export-privacy-defaults', maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true },
    }, 12);
    await expect(result).resolves.toEqual({ maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true });
  });

  it.each(['auto', 'en-US', '', null, 1])('rejects an unsupported language before dispatch: %j', async (language) => {
    const { uiPreferencesService, requestRendererChange } = createService();
    await expect(uiPreferencesService.setLanguage(language)).rejects.toThrow('Invalid UI language.');
    expect(requestRendererChange).not.toHaveBeenCalled();
  });

  it.each(['system', 'auto', '', null, 1])('rejects an unsupported theme before dispatch: %j', async (theme) => {
    const { uiPreferencesService, requestRendererChange } = createService();
    await expect(uiPreferencesService.setTheme(theme)).rejects.toThrow('Invalid UI theme.');
    expect(requestRendererChange).not.toHaveBeenCalled();
  });

  it.each([{}, null, [], { maskCookies: 'false' }, { warnBeforeUnmasked: 1 }, { maskAuthorization: true, script: 'private' }])('rejects invalid privacy patches before dispatch: %j', async (patch) => {
    const { uiPreferencesService, requestRendererChange } = createService();
    await expect(uiPreferencesService.setExportPrivacyDefaults(patch)).rejects.toThrow('Invalid export privacy defaults.');
    expect(requestRendererChange).not.toHaveBeenCalled();
  });

  it('does not dispatch after pre-cancellation', async () => {
    const { uiPreferencesService, requestRendererChange } = createService();
    const abortController = new AbortController();
    abortController.abort();
    await expect(uiPreferencesService.setTheme('dark', abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestRendererChange).not.toHaveBeenCalled();
  });

  it('cancels an unclaimed request so the late Renderer cannot apply it', async () => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const abortController = new AbortController();
    const result = uiPreferencesService.setLanguage('fr', abortController.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    abortController.abort();
    expect(uiPreferencesService.claimChange(requestId())).toBeNull();
    uiPreferencesService.completeChange(requestId(), { status: 'applied', change: { kind: 'language', language: 'fr' } }, 12);
    await rejected;
    expect(publishChange).not.toHaveBeenCalled();
  });

  it('completes an already claimed setting instead of rolling it back after cancellation', async () => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const abortController = new AbortController();
    const result = uiPreferencesService.setTheme('ember', abortController.signal);
    uiPreferencesService.claimChange(requestId());
    abortController.abort();
    uiPreferencesService.completeChange(requestId(), { status: 'applied', change: { kind: 'theme', theme: 'ember' } }, 12);
    await expect(result).resolves.toEqual({ theme: 'ember' });
    expect(publishChange).toHaveBeenCalledOnce();
  });

  it('ignores completion before claim and duplicate completion after settlement', async () => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const result = uiPreferencesService.setTheme('warm');
    const response = { status: 'applied', change: { kind: 'theme', theme: 'warm' } };
    uiPreferencesService.completeChange(requestId(), response, 12);
    expect(publishChange).not.toHaveBeenCalled();
    uiPreferencesService.claimChange(requestId());
    uiPreferencesService.completeChange(requestId(), response, 12);
    uiPreferencesService.completeChange(requestId(), response, 12);
    await expect(result).resolves.toEqual({ theme: 'warm' });
    expect(publishChange).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 'failed' },
    { status: 'applied', change: { kind: 'theme', theme: 'light' } },
    { status: 'applied', change: { kind: 'language', language: 'en' } },
    { status: 'applied', change: { kind: 'theme', theme: 'dark', path: 'private' } },
  ])('rejects failure or a response inconsistent with the requested change: %j', async (response) => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const result = uiPreferencesService.setTheme('dark');
    const rejected = expect(result).rejects.toThrow('Unable to change the requested preference.');
    uiPreferencesService.claimChange(requestId());
    uiPreferencesService.completeChange(requestId(), response, 12);
    await rejected;
    expect(publishChange).not.toHaveBeenCalled();
  });

  it('settles both waiting and claimed requests when the Renderer exits', async () => {
    const { uiPreferencesService, requestId, publishChange } = createService();
    const first = uiPreferencesService.setTheme('dark');
    const firstId = requestId();
    uiPreferencesService.claimChange(firstId);
    const second = uiPreferencesService.setLanguage('fr');
    const secondId = requestId();
    const settled = Promise.allSettled([first, second]);
    uiPreferencesService.cancelChanges();
    expect(await settled).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ name: 'AbortError' }) },
      { status: 'rejected', reason: expect.objectContaining({ name: 'AbortError' }) },
    ]);
    expect(uiPreferencesService.claimChange(firstId)).toBeNull();
    expect(uiPreferencesService.claimChange(secondId)).toBeNull();
    expect(publishChange).not.toHaveBeenCalled();
  });

  it('does not retain a request when no Renderer is available', async () => {
    const { uiPreferencesService, requestRendererChange, requestId } = createService();
    requestRendererChange.mockImplementation(() => { throw new Error('Renderer unavailable'); });
    await expect(uiPreferencesService.setTheme('dark')).rejects.toThrow('Unable to change the requested preference.');
    expect(uiPreferencesService.claimChange(requestId())).toBeNull();
  });
});