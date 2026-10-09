import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterceptorDesktopApi, UpstreamSettingsSnapshot } from '../../../../../shared/desktop-api';
import { EMPTY_UPSTREAM_DRAFT, UpstreamSettingsActions, useUpstreamSettingsStore } from '../../data/upstreamSettingsStore';

const systemSnapshot: UpstreamSettingsSnapshot = {
  settings: { mode: 'system' }, route: { kind: 'proxy', authority: '127.0.0.1:7890' },
  operation: 'idle', health: 'reachable', error: null,
};
const directSnapshot: UpstreamSettingsSnapshot = {
  settings: { mode: 'direct' }, route: { kind: 'direct' },
  operation: 'idle', health: 'not-applicable', error: null,
};

describe('Renderer shared upstream settings', () => {
  let api: Pick<InterceptorDesktopApi, 'getUpstreamSettings' | 'applyUpstreamSettings' | 'onUpstreamSettingsChanged'>;
  let changed: (() => void) | undefined;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    useUpstreamSettingsStore.setState({
      snapshot: null, draft: { ...EMPTY_UPSTREAM_DRAFT }, dirty: false,
      loading: false, busy: false, popoverOpen: false, error: null,
    });
    changed = undefined;
    unsubscribe.mockClear();
    api = {
      getUpstreamSettings: vi.fn(async () => structuredClone(systemSnapshot)),
      applyUpstreamSettings: vi.fn(async () => structuredClone(directSnapshot)),
      onUpstreamSettingsChanged: vi.fn(listener => { changed = listener; return unsubscribe; }),
    };
    vi.stubGlobal('window', { interceptor: api });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads saved settings while editing changes only the shared draft', async () => {
    await UpstreamSettingsActions.load();
    UpstreamSettingsActions.updateDraft({ mode: 'direct' });
    expect(useUpstreamSettingsStore.getState()).toMatchObject({
      snapshot: systemSnapshot, draft: { mode: 'direct' }, dirty: true,
    });
    expect(api.applyUpstreamSettings).not.toHaveBeenCalled();
  });

  it('sends only the selected mode fields and commits the returned state after Apply', async () => {
    await UpstreamSettingsActions.load();
    UpstreamSettingsActions.updateDraft({ mode: 'direct', host: 'unused.example.test', port: '8888' });
    await UpstreamSettingsActions.apply();
    expect(api.applyUpstreamSettings).toHaveBeenCalledExactlyOnceWith({ mode: 'direct' });
    expect(useUpstreamSettingsStore.getState()).toMatchObject({
      snapshot: directSnapshot, draft: { mode: 'direct' }, dirty: false, busy: false, error: null,
    });
  });

  it('cancels a draft without applying it and returns the popup to its saved mode', async () => {
    await UpstreamSettingsActions.load();
    UpstreamSettingsActions.openPopover();
    UpstreamSettingsActions.updateDraft({ mode: 'pac', url: 'https://proxy.example.test/rules.pac' });
    UpstreamSettingsActions.cancelDraft();
    expect(useUpstreamSettingsStore.getState()).toMatchObject({
      snapshot: systemSnapshot, draft: { mode: 'system' }, dirty: false, popoverOpen: false,
    });
    expect(api.applyUpstreamSettings).not.toHaveBeenCalled();
  });

  it('keeps the previous route and draft when the backend rejects Apply', async () => {
    await UpstreamSettingsActions.load();
    vi.mocked(api.applyUpstreamSettings).mockRejectedValue(new Error('PAC could not be loaded'));
    UpstreamSettingsActions.updateDraft({ mode: 'pac', url: 'https://proxy.example.test/rules.pac' });
    await expect(UpstreamSettingsActions.apply()).rejects.toThrow('PAC could not be loaded');
    expect(useUpstreamSettingsStore.getState()).toMatchObject({
      snapshot: systemSnapshot, draft: { mode: 'pac' }, dirty: true, busy: false,
      error: { kind: 'connection', message: 'PAC could not be loaded' },
    });
  });

  it('does not let a stale reload overwrite a successful Apply', async () => {
    await UpstreamSettingsActions.load();
    let finishLoad!: (snapshot: UpstreamSettingsSnapshot) => void;
    vi.mocked(api.getUpstreamSettings).mockImplementationOnce(() => new Promise(resolve => { finishLoad = resolve; }));
    const oldLoad = UpstreamSettingsActions.load();
    UpstreamSettingsActions.updateDraft({ mode: 'direct' });
    await UpstreamSettingsActions.apply();
    finishLoad(systemSnapshot);
    await oldLoad;
    expect(useUpstreamSettingsStore.getState()).toMatchObject({ snapshot: directSnapshot, loading: false, dirty: false });
  });

  it('refreshes on the shared Main notification without discarding a dirty draft', async () => {
    const stop = UpstreamSettingsActions.subscribe();
    await UpstreamSettingsActions.load();
    UpstreamSettingsActions.updateDraft({ mode: 'manual', host: 'proxy.example.test', port: '8080' });
    vi.mocked(api.getUpstreamSettings).mockResolvedValue(directSnapshot);
    changed?.();
    await expect.poll(() => useUpstreamSettingsStore.getState().snapshot?.settings.mode).toBe('direct');
    expect(useUpstreamSettingsStore.getState()).toMatchObject({ draft: { mode: 'manual', host: 'proxy.example.test' }, dirty: true });
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('preserves the draft when navigating from the popup to Settings', async () => {
    await UpstreamSettingsActions.load();
    UpstreamSettingsActions.openPopover();
    UpstreamSettingsActions.updateDraft({ mode: 'pac', url: 'https://proxy.example.test/rules.pac' });
    UpstreamSettingsActions.closePopover();
    expect(useUpstreamSettingsStore.getState()).toMatchObject({
      popoverOpen: false, draft: { mode: 'pac', url: 'https://proxy.example.test/rules.pac' }, dirty: true,
    });
  });
});
