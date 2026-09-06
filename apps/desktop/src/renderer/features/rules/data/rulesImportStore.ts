import { create } from 'zustand';

import type { RuleImportPreview } from '../interfaces';

interface RulesImportState {
  phase: 'idle' | 'reading' | 'preview' | 'saving';
  preview: Extract<RuleImportPreview, { ok: true }> | null;
  errorKey: string | null;
}

export const useRulesImportStore = create<RulesImportState>(() => ({
  phase: 'idle',
  preview: null,
  errorKey: null,
}));