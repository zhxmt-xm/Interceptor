import { afterEach, describe, expect, it } from 'vitest';

import { usePrivacyStore } from '../privacyStore';

const initial = usePrivacyStore.getState();

afterEach(() => {
  usePrivacyStore.setState({
    maskAuthorization: initial.maskAuthorization,
    maskCookies: initial.maskCookies,
    warnBeforeUnmasked: initial.warnBeforeUnmasked,
  });
});

describe('usePrivacyStore', () => {
  it('defaults to masking authorization and cookies and warning before unmasked export', () => {
    const state = usePrivacyStore.getState();
    expect(state.maskAuthorization).toBe(true);
    expect(state.maskCookies).toBe(true);
    expect(state.warnBeforeUnmasked).toBe(true);
  });

  it('updates a single preference through setPreference', () => {
    usePrivacyStore.getState().setPreference('maskCookies', false);
    expect(usePrivacyStore.getState().maskCookies).toBe(false);
    expect(usePrivacyStore.getState().maskAuthorization).toBe(true);
  });
});
