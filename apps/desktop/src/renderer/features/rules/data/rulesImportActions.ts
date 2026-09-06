import type { RulesImportResponse } from '../../../../shared/desktop-api';
import type { RuleImportPreview } from '../interfaces';
import { useRulesImportStore } from './rulesImportStore';
import { useRulesStore } from './rulesStore';
import { analyzeRuleImport, ensureRulesLoaded, importRules } from './useRulesData';

interface PendingRulesImport {
  readonly abortSignal: AbortSignal;
  readonly cancel: () => void;
  readonly resolve: (response: RulesImportResponse) => void;
  preview: Extract<RuleImportPreview, { ok: true }> | null;
}

export class RulesImportActions {
  private pendingImport: PendingRulesImport | null = null;

  subscribe(readTitle: () => string): () => void {
    const api = window.interceptor;
    const abortControllersByRequestId = new Map<string, AbortController>();
    const stopRequests = api.onRulesImportRequested((requestId) => {
      const abortController = new AbortController();
      abortControllersByRequestId.set(requestId, abortController);
      void this.respondToImport(requestId, readTitle(), abortController.signal)
        .catch(() => {
          if (!abortController.signal.aborted) useRulesImportStore.setState({ errorKey: 'rules.import.failed' });
        })
        .finally(() => abortControllersByRequestId.delete(requestId));
    });
    const stopCancellations = api.onRulesImportCanceled((requestId) => {
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
    await window.interceptor.completeRulesImport(requestId, response);
  }

  async startImport(title: string, abortSignal: AbortSignal): Promise<RulesImportResponse> {
    abortSignal.throwIfAborted();
    if (this.pendingImport !== null) return { status: 'failed' };
    return new Promise((resolve) => {
      const cancel = (): void => this.cancelImport();
      const pendingImport: PendingRulesImport = { abortSignal, cancel, resolve, preview: null };
      this.pendingImport = pendingImport;
      abortSignal.addEventListener('abort', cancel, { once: true });
      useRulesImportStore.setState({ phase: 'reading', preview: null, errorKey: null });
      void this.readImportPreview(title, pendingImport);
    });
  }

  private async readImportPreview(title: string, pendingImport: PendingRulesImport): Promise<void> {
    try {
      await ensureRulesLoaded();
      if (this.pendingImport !== pendingImport) return;
      if (!useRulesStore.getState().initialized) {
        this.rejectPreparation('rules.import.readFailed');
        return;
      }
      const preview = await analyzeRuleImport(title);
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
      useRulesImportStore.setState({ phase: 'preview', preview });
    } catch {
      if (this.pendingImport === pendingImport) this.rejectPreparation('rules.import.readFailed');
    }
  }

  async confirmImport(): Promise<void> {
    const pendingImport = this.pendingImport;
    if (pendingImport === null || pendingImport.preview === null) return;
    if (useRulesImportStore.getState().phase !== 'preview') return;
    const preview = pendingImport.preview;
    useRulesImportStore.setState({ phase: 'saving', errorKey: null });
    const imported = await importRules(preview.nodes);
    if (!imported) {
      if (pendingImport.abortSignal.aborted) {
        this.completeImport({ status: 'completed', result: { imported: false } });
      } else {
        useRulesImportStore.setState({ phase: 'preview', errorKey: 'rules.import.failed' });
      }
      return;
    }
    this.completeImport({ status: 'completed', result: {
      imported: true,
      revision: useRulesStore.getState().revision,
      ruleCount: preview.leafCount,
      folderCount: preview.folderCount,
      enabledCount: preview.enabledCount,
      skippedCount: preview.skipped.length,
    } });
  }

  cancelImport(): void {
    if (this.pendingImport === null || useRulesImportStore.getState().phase === 'saving') return;
    this.completeImport({ status: 'completed', result: { imported: false } });
  }

  clearError(): void {
    useRulesImportStore.setState({ errorKey: null });
  }

  private rejectPreparation(errorKey: string): void {
    useRulesImportStore.setState({ errorKey });
    this.completeImport({ status: 'failed' });
  }

  private completeImport(response: RulesImportResponse): void {
    const pendingImport = this.pendingImport;
    if (pendingImport === null) return;
    this.pendingImport = null;
    pendingImport.abortSignal.removeEventListener('abort', pendingImport.cancel);
    useRulesImportStore.setState({ phase: 'idle', preview: null });
    pendingImport.resolve(response);
  }
}

export const rulesImportActions = new RulesImportActions();