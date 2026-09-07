import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UiPreferenceAppliedChange } from '../../../../../shared/ui-preferences';
import { usePrivacyStore } from '../../data/privacyStore';
import { UiPreferencesActions } from '../../data/uiPreferencesActions';

const { changeLanguage } = vi.hoisted(() => ({ changeLanguage: vi.fn() }));
vi.mock('../../../../i18n/i18n', () => ({ i18n: { changeLanguage } }));

let requestListener: (requestId: string) => void;
let changedListener: (change: UiPreferenceAppliedChange) => void;
const claimUiPreferenceChange = vi.fn();
const completeUiPreferenceChange = vi.fn();
const unsubscribeRequest = vi.fn();
const unsubscribeChanged = vi.fn();
const setItem = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  changeLanguage.mockResolvedValue(undefined);
  completeUiPreferenceChange.mockResolvedValue(undefined);
  vi.stubGlobal('localStorage', { setItem });
  vi.stubGlobal('window', { interceptor: {
    claimUiPreferenceChange,
    completeUiPreferenceChange,
    onUiPreferenceChangeRequested: (listener: typeof requestListener) => { requestListener = listener; return unsubscribeRequest; },
    onUiPreferenceChanged: (listener: typeof changedListener) => { changedListener = listener; return unsubscribeChanged; },
  } });
  usePrivacyStore.setState({ maskAuthorization: true, maskCookies: true, warnBeforeUnmasked: true });
});

afterEach(() => vi.unstubAllGlobals());

describe('Renderer preference application', () => {
  it('claims a theme request and confirms only the applied preference', async () => {
    const applyTheme = vi.fn();
    claimUiPreferenceChange.mockResolvedValue({ kind: 'theme', theme: 'dark' });
    const uiPreferencesActions = new UiPreferencesActions(applyTheme);
    const unsubscribe = uiPreferencesActions.subscribe();
    requestListener('theme-one');
    await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledExactlyOnceWith('theme-one', {
      status: 'applied', change: { kind: 'theme', theme: 'dark' },
    }));
    expect(applyTheme).toHaveBeenCalledExactlyOnceWith('dark');
    expect(setItem).toHaveBeenCalledWith('interceptor.theme', 'dark');
    expect(claimUiPreferenceChange).toHaveBeenCalledExactlyOnceWith('theme-one');
    unsubscribe();
    expect(unsubscribeRequest).toHaveBeenCalledOnce();
    expect(unsubscribeChanged).toHaveBeenCalledOnce();
  });

  it('waits for language application before confirming', async () => {
    let resolveLanguage!: () => void;
    changeLanguage.mockImplementation(() => new Promise<void>((resolve) => { resolveLanguage = resolve; }));
    claimUiPreferenceChange.mockResolvedValue({ kind: 'language', language: 'fr' });
    const unsubscribe = new UiPreferencesActions(vi.fn()).subscribe();
    requestListener('language-one');
    await vi.waitFor(() => expect(changeLanguage).toHaveBeenCalledExactlyOnceWith('fr'));
    expect(completeUiPreferenceChange).not.toHaveBeenCalled();
    resolveLanguage();
    await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledWith('language-one', {
      status: 'applied', change: { kind: 'language', language: 'fr' },
    }));
    expect(setItem).toHaveBeenCalledWith('interceptor.language', 'fr');
    unsubscribe();
  });

  it.each([
    { kind: 'language', language: 'fr' },
    { kind: 'theme', theme: 'dark' },
    { kind: 'export-privacy-defaults', maskCookies: false },
  ])('does not report a saved preference when persistence fails: %j', async (change) => {
    setItem.mockImplementation(() => { throw new Error('Private storage error'); });
    claimUiPreferenceChange.mockResolvedValue(change);
    const unsubscribe = new UiPreferencesActions(vi.fn()).subscribe();
    try {
      requestListener('failed-save');
      await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledExactlyOnceWith('failed-save', { status: 'failed' }));
      expect(usePrivacyStore.getState().maskCookies).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it('merges consecutive privacy field changes against the latest applied values', async () => {
    claimUiPreferenceChange.mockResolvedValueOnce({ kind: 'export-privacy-defaults', maskCookies: false });
    claimUiPreferenceChange.mockResolvedValueOnce({ kind: 'export-privacy-defaults', maskAuthorization: false });
    const unsubscribe = new UiPreferencesActions(vi.fn()).subscribe();
    requestListener('cookies');
    requestListener('authorization');
    await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledTimes(2));
    expect(completeUiPreferenceChange).toHaveBeenLastCalledWith('authorization', {
      status: 'applied', change: { kind: 'export-privacy-defaults', maskAuthorization: false, maskCookies: false, warnBeforeUnmasked: true },
    });
    expect(usePrivacyStore.getState()).toMatchObject({ maskAuthorization: false, maskCookies: false, warnBeforeUnmasked: true });
    expect(JSON.parse(setItem.mock.calls.at(-1)![1] as string)).toEqual({ maskAuthorization: false, maskCookies: false, warnBeforeUnmasked: true });
    unsubscribe();
  });

  it('does not apply a request cancelled before the Renderer claimed it', async () => {
    const applyTheme = vi.fn();
    claimUiPreferenceChange.mockResolvedValue(null);
    const unsubscribe = new UiPreferencesActions(applyTheme).subscribe();
    requestListener('cancelled');
    await vi.waitFor(() => expect(claimUiPreferenceChange).toHaveBeenCalledOnce());
    expect(applyTheme).not.toHaveBeenCalled();
    expect(changeLanguage).not.toHaveBeenCalled();
    expect(completeUiPreferenceChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('reports a failed application without exposing the error and continues the next request', async () => {
    const applyTheme = vi.fn();
    changeLanguage.mockRejectedValue(new Error('Private Renderer error'));
    claimUiPreferenceChange.mockResolvedValueOnce({ kind: 'language', language: 'fr' });
    claimUiPreferenceChange.mockResolvedValueOnce({ kind: 'theme', theme: 'warm' });
    const unsubscribe = new UiPreferencesActions(applyTheme).subscribe();
    requestListener('failed');
    requestListener('next');
    await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledTimes(2));
    expect(completeUiPreferenceChange).toHaveBeenNthCalledWith(1, 'failed', { status: 'failed' });
    expect(completeUiPreferenceChange).toHaveBeenLastCalledWith('next', { status: 'applied', change: { kind: 'theme', theme: 'warm' } });
    expect(applyTheme).toHaveBeenCalledExactlyOnceWith('warm');
    unsubscribe();
  });

  it('serializes different setting requests until the previous confirmation finishes', async () => {
    let completeFirst!: () => void;
    completeUiPreferenceChange.mockImplementationOnce(() => new Promise<void>((resolve) => { completeFirst = resolve; }));
    claimUiPreferenceChange.mockResolvedValue({ kind: 'theme', theme: 'dark' });
    const unsubscribe = new UiPreferencesActions(vi.fn()).subscribe();
    requestListener('first');
    requestListener('second');
    await vi.waitFor(() => expect(completeUiPreferenceChange).toHaveBeenCalledOnce());
    expect(claimUiPreferenceChange).toHaveBeenCalledOnce();
    completeFirst();
    await vi.waitFor(() => expect(claimUiPreferenceChange).toHaveBeenCalledTimes(2));
    unsubscribe();
  });

  it('applies a confirmed change from another Renderer without creating a second Main request', async () => {
    const applyTheme = vi.fn();
    const unsubscribe = new UiPreferencesActions(applyTheme).subscribe();
    changedListener({ kind: 'theme', theme: 'ember' });
    await vi.waitFor(() => expect(applyTheme).toHaveBeenCalledExactlyOnceWith('ember'));
    expect(claimUiPreferenceChange).not.toHaveBeenCalled();
    expect(completeUiPreferenceChange).not.toHaveBeenCalled();
    unsubscribe();
  });
});