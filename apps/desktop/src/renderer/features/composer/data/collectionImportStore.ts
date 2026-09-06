import { create } from 'zustand';

import type { CollectionImportPreview } from '../interfaces';

interface CollectionImportState {
  phase: 'idle' | 'reading' | 'preview' | 'saving';
  preview: Extract<CollectionImportPreview, { ok: true }> | null;
  errorKey: string | null;
}

export const useCollectionImportStore = create<CollectionImportState>(() => ({
  phase: 'idle',
  preview: null,
  errorKey: null,
}));