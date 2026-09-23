import { randomUUID } from 'node:crypto';

import type { CollectionImportResponse } from '../../shared/desktop-api';

interface PendingCollectionImport {
  readonly requestId: string;
  readonly abortSignal: AbortSignal | undefined;
  readonly cancel: () => void;
  readonly resolve: (response: CollectionImportResponse) => void;
  readonly reject: (reason: unknown) => void;
}

export class CollectionImportService {
  private pendingImport: PendingCollectionImport | null = null;

  constructor(
    private readonly requestRendererImport: (requestId: string) => void,
    private readonly cancelRendererImport: (requestId: string) => void,
  ) {}

  async startImport(abortSignal?: AbortSignal): Promise<CollectionImportResponse> {
    abortSignal?.throwIfAborted();
    if (this.pendingImport !== null) throw new Error('A Collection import is already running.');
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
      : new DOMException('Collection import canceled.', 'AbortError'));
    this.cancelRendererImport(pendingImport.requestId);
  }

  completeImport(requestId: string, response: unknown): void {
    if (this.pendingImport?.requestId !== requestId) return;
    const pendingImport = this.releasePendingImport()!;
    try {
      pendingImport.resolve(CollectionImportService.readResponse(response));
    } catch {
      pendingImport.reject(new Error('Invalid Collection import response.'));
    }
  }

  private static readResponse(value: unknown): CollectionImportResponse {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid Collection import response.');
    const response = value as Record<string, unknown>;
    if (response.status === 'failed' && Object.keys(response).length === 1) return { status: 'failed' };
    if (response.status !== 'completed' || Object.keys(response).length !== 2
      || typeof response.result !== 'object' || response.result === null || Array.isArray(response.result)) {
      throw new Error('Invalid Collection import response.');
    }
    const result = response.result as Record<string, unknown>;
    if (result.imported === false && Object.keys(result).length === 1) return { status: 'completed', result: { imported: false } };
    if (result.imported !== true || Object.keys(result).length !== 5) throw new Error('Invalid Collection import response.');
    return { status: 'completed', result: {
      imported: true,
      revision: CollectionImportService.readCount(result.revision),
      requestCount: CollectionImportService.readCount(result.requestCount),
      folderCount: CollectionImportService.readCount(result.folderCount),
      skippedCount: CollectionImportService.readCount(result.skippedCount),
    } };
  }

  private static readCount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid Collection import response.');
    return value;
  }

  private releasePendingImport(): PendingCollectionImport | null {
    const pendingImport = this.pendingImport;
    if (pendingImport === null) return null;
    this.pendingImport = null;
    pendingImport.abortSignal?.removeEventListener('abort', pendingImport.cancel);
    return pendingImport;
  }
}