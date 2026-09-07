import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePrivacyStore } from '../../data/privacyStore';

const initial = usePrivacyStore.getState();

afterEach(() => {
  usePrivacyStore.setState({
    maskAuthorization: initial.maskAuthorization,
    maskCookies: initial.maskCookies,
    warnBeforeUnmasked: initial.warnBeforeUnmasked,
  });
  vi.unstubAllGlobals();
});

describe('usePrivacyStore', () => {
  it('defaults to masking authorization and cookies and warning before unmasked export', () => {
    const state = usePrivacyStore.getState();
    expect(state.maskAuthorization).toBe(true);
    expect(state.maskCookies).toBe(true);
    expect(state.warnBeforeUnmasked).toBe(true);
  });

  it('submits only the selected field to the shared Main preference method', () => {
    const setExportPrivacyDefaults = vi.fn().mockResolvedValue({ maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true });
    vi.stubGlobal('window', { interceptor: { setExportPrivacyDefaults } });
    usePrivacyStore.getState().setPreference('maskCookies', false);
    expect(setExportPrivacyDefaults).toHaveBeenCalledExactlyOnceWith({ maskCookies: false });
    expect(usePrivacyStore.getState().maskCookies).toBe(true);
    expect(usePrivacyStore.getState().maskAuthorization).toBe(true);
  });
});
