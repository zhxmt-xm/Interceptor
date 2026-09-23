import { randomUUID } from 'node:crypto';

import type { RulesImportResponse } from '../../shared/desktop-api';

interface PendingRulesImport {
  readonly requestId: string;
  readonly abortSignal: AbortSignal | undefined;
  readonly cancel: () => void;
  readonly resolve: (response: RulesImportResponse) => void;
  readonly reject: (reason: unknown) => void;
}

export class RulesImportService {
  private pendingImport: PendingRulesImport | null = null;

  constructor(
    private readonly requestRendererImport: (requestId: string) => void,
    private readonly cancelRendererImport: (requestId: string) => void,
  ) {}

  async startImport(abortSignal?: AbortSignal): Promise<RulesImportResponse> {
    abortSignal?.throwIfAborted();
    if (this.pendingImport !== null) throw new Error('A Rules import is already running.');
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const cancel = (): void => this.cancelImport();
      this.pendingImport = { requestId, abortSignal, cancel, resolve, reject };
      abortSignal?.addEventListener('abort', cancel, { once: true });
      try {
        this.requestRendererImport(requestId);
      } catch {
        this.completeImport(requestId, { status: 'failed' });
      }
    });
  }

  cancelImport(): void {
    const pendingImport = this.releasePendingImport();
    if (pendingImport === null) return;
    pendingImport.reject(pendingImport.abortSignal?.aborted
      ? pendingImport.abortSignal.reason
      : new DOMException('Rules import canceled.', 'AbortError'));
    this.cancelRendererImport(pendingImport.requestId);
  }

  completeImport(requestId: string, response: unknown): void {
    if (this.pendingImport?.requestId !== requestId) return;
    const pendingImport = this.releasePendingImport()!;
    try {
      pendingImport.resolve(RulesImportService.readResponse(response));
    } catch {
      pendingImport.reject(new Error('Invalid Rules import response.'));
    }
  }

  private static readResponse(value: unknown): RulesImportResponse {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Invalid Rules import response.');
    }
    const response = value as Record<string, unknown>;
    if (response.status === 'failed' && Object.keys(response).length === 1) return { status: 'failed' };
    if (response.status !== 'completed' || Object.keys(response).length !== 2
      || typeof response.result !== 'object' || response.result === null || Array.isArray(response.result)) {
      throw new Error('Invalid Rules import response.');
    }
    const result = response.result as Record<string, unknown>;
    if (result.imported === false && Object.keys(result).length === 1) {
      return { status: 'completed', result: { imported: false } };
    }
    if (result.imported !== true || Object.keys(result).length !== 6) {
      throw new Error('Invalid Rules import response.');
    }
    return { status: 'completed', result: {
      imported: true,
      revision: RulesImportService.readCount(result.revision),
      ruleCount: RulesImportService.readCount(result.ruleCount),
      folderCount: RulesImportService.readCount(result.folderCount),
      enabledCount: RulesImportService.readCount(result.enabledCount),
      skippedCount: RulesImportService.readCount(result.skippedCount),
    } };
  }

  private static readCount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error('Invalid Rules import response.');
    }
    return value;
  }

  private releasePendingImport(): PendingRulesImport | null {
    const pendingImport = this.pendingImport;
    if (pendingImport === null) return null;
    this.pendingImport = null;
    pendingImport.abortSignal?.removeEventListener('abort', pendingImport.cancel);
    return pendingImport;
  }
}