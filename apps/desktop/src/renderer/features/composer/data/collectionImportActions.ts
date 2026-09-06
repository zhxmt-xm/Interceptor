import type { CollectionImportResponse } from '../../../../shared/desktop-api';
import type { CollectionImportPreview } from '../interfaces';
import { useCollectionImportStore } from './collectionImportStore';
import { useComposerStore } from './composerStore';
import { analyzeCollectionImport, importCollection, loadCollection } from './useCollection';

interface PendingCollectionImport {
  readonly abortSignal: AbortSignal;
  readonly cancel: () => void;
  readonly resolve: (response: CollectionImportResponse) => void;
  preview: Extract<CollectionImportPreview, { ok: true }> | null;
}

export class CollectionImportActions {
  private pendingImport: PendingCollectionImport | null = null;

  subscribe(readTitle: () => string): () => void {
    const api = window.interceptor;
    const abortControllersByRequestId = new Map<string, AbortController>();
    const stopRequests = api.onCollectionImportRequested((requestId) => {
      const abortController = new AbortController();
      abortControllersByRequestId.set(requestId, abortController);
      void this.respondToImport(requestId, readTitle(), abortController.signal)
        .catch(() => {
          if (!abortController.signal.aborted) useCollectionImportStore.setState({ errorKey: 'composer.import.failed' });
        })
        .finally(() => abortControllersByRequestId.delete(requestId));
    });
    const stopCancellations = api.onCollectionImportCanceled((requestId) => {
      abortControllersByRequestId.get(requestId)?.abort();
    });
    return () => {
      stopRequests();
      stopCancellations();
      for (const abortController of abortControllersByRequestId.values()) abortController.abort();
      abortControllersByRequestId.clear();
    };
  }

  private async respondToImport(requestId: string, title: string, abortSignal: AbortSignal): Promise<void> {
    const response = await this.startImport(title, abortSignal);
    if (abortSignal.aborted) return;
    await window.interceptor.completeCollectionImport(requestId, response);
  }

  async startImport(title: string, abortSignal: AbortSignal): Promise<CollectionImportResponse> {
    abortSignal.throwIfAborted();
    if (this.pendingImport !== null) return { status: 'failed' };
    return new Promise((resolve) => {
      const cancel = (): void => this.cancelImport();
      const pendingImport: PendingCollectionImport = { abortSignal, cancel, resolve, preview: null };
      this.pendingImport = pendingImport;
      abortSignal.addEventListener('abort', cancel, { once: true });
      useCollectionImportStore.setState({ phase: 'reading', preview: null, errorKey: null });
      void this.readImportPreview(title, pendingImport);
    });
  }

  private async readImportPreview(title: string, pendingImport: PendingCollectionImport): Promise<void> {
    try {
      if (!useComposerStore.getState().loaded) await loadCollection();
      if (this.pendingImport !== pendingImport) return;
      if (!useComposerStore.getState().loaded) {
        this.rejectPreparation('composer.import.readFailed');
        return;
      }
      const preview = await analyzeCollectionImport(title);
      if (this.pendingImport !== pendingImport) return;
      if (preview === null) {
        this.completeImport({ status: 'completed', result: { imported: false } });
        return;
      }
      if (!preview.ok) {
        this.rejectPreparation(`import.reason.${preview.reason}`);
        return;
      }
      pendingImport.preview = preview;
      useCollectionImportStore.setState({ phase: 'preview', preview });
    } catch {
      if (this.pendingImport === pendingImport) this.rejectPreparation('composer.import.readFailed');
    }
  }

  async confirmImport(): Promise<void> {
    const pendingImport = this.pendingImport;
    if (pendingImport === null || pendingImport.preview === null) return;
    if (useCollectionImportStore.getState().phase !== 'preview') return;
    const preview = pendingImport.preview;
    useCollectionImportStore.setState({ phase: 'saving', errorKey: null });
    const imported = await importCollection(preview.nodes, pendingImport.abortSignal);
    if (!imported) {
      if (pendingImport.abortSignal.aborted) {
        this.completeImport({ status: 'completed', result: { imported: false } });
      } else {
        useCollectionImportStore.setState({ phase: 'preview', errorKey: 'composer.import.failed' });
      }
      return;
    }
    this.completeImport({ status: 'completed', result: {
      imported: true,
      revision: useComposerStore.getState().revision,
      requestCount: preview.leafCount,
      folderCount: preview.folderCount,
      skippedCount: preview.skipped.length,
    } });
  }

  cancelImport(): void {
    if (this.pendingImport === null || useCollectionImportStore.getState().phase === 'saving') return;
    this.completeImport({ status: 'completed', result: { imported: false } });
  }

  clearError(): void {
    useCollectionImportStore.setState({ errorKey: null });
  }

  private rejectPreparation(errorKey: string): void {
    useCollectionImportStore.setState({ errorKey });
    this.completeImport({ status: 'failed' });
  }

  private completeImport(response: CollectionImportResponse): void {
    const pendingImport = this.pendingImport;
    if (pendingImport === null) return;
    this.pendingImport = null;
    pendingImport.abortSignal.removeEventListener('abort', pendingImport.cancel);
    useCollectionImportStore.setState({ phase: 'idle', preview: null });
    pendingImport.resolve(response);
  }
}

export const collectionImportActions = new CollectionImportActions();