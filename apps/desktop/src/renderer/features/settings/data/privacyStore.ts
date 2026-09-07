import { create } from 'zustand';

import type { PrivacyState } from '../interfaces';
import { loadPreferences } from '../utils';

export const usePrivacyStore = create<PrivacyState>(() => ({
  ...loadPreferences(),
  setPreference(key, value) {
    void window.interceptor.setExportPrivacyDefaults({ [key]: value }).catch(() => undefined);
  },
}));
