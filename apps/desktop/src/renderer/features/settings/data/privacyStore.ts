import { create } from 'zustand';

import type { PrivacyState } from '../interfaces';
import { loadPreferences, persistPreferences } from '../utils';

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  ...loadPreferences(),
  setPreference(key, value) {
    set({ [key]: value } as Partial<PrivacyState>);
    const { maskAuthorization, maskCookies, warnBeforeUnmasked } = get();
    persistPreferences({ maskAuthorization, maskCookies, warnBeforeUnmasked });
  },
}));
