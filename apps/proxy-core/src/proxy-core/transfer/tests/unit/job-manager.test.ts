import { describe, expect, it, vi } from 'vitest';

import { TransferService } from '../../entry';

describe('TransferService', () => {
  it('notifies the owner once after a successful job reaches its terminal state without file information', async () => {
    const transferService = new TransferService();
    const completed = vi.fn((kind: string) => {
      expect(kind).toBe('har-import');
      expect(transferService.get('imported')?.state).toBe('completed');
    });
    transferService.onCompleted(completed);
    transferService.start('imported', 'har-import', 'C:\\private\\capture.har', async () => ({ processed: 2, total: 2, warnings: [] }));
    expect(completed).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(completed).toHaveBeenCalledExactlyOnceWith('har-import');
  });

  it('does not publish completion for a failed import', async () => {
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    transferService.start('failed-import', 'har-import', 'C:\\private\\capture.har', async () => { throw new Error('Invalid source'); });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(transferService.get('failed-import')?.state).toBe('failed');
    expect(completed).not.toHaveBeenCalled();
  });

  it('publishes completion when cancellation arrives after an import has committed', async () => {
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    transferService.start('cancelled-import', 'har-import', 'C:\\private\\capture.har', async () => ({ processed: 2, total: 2, warnings: [] }));
    const cancellation = transferService.cancel('cancelled-import');
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(Promise.resolve(cancellation)).resolves.toMatchObject({ state: 'completed', processed: 2, total: 2 });
    expect(transferService.get('cancelled-import')?.state).toBe('completed');
    expect(completed).toHaveBeenCalledExactlyOnceWith('har-import');
  });

  it('does not acknowledge cancellation until the operation finishes its cleanup', async () => {
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    let receivedAbortSignal: AbortSignal | undefined;
    transferService.start('cancelling-export', 'body-export', 'C:\\private\\body.bin', async (abortSignal) => {
      receivedAbortSignal = abortSignal;
      await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      await cleanupGate;
      throw abortSignal.reason;
    });
    let cancellationAcknowledged = false;
    const cancellation = Promise.resolve(transferService.cancel('cancelling-export')).then((job) => {
      cancellationAcknowledged = true;
      return job;
    });
    try {
      expect(receivedAbortSignal?.aborted).toBe(true);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(cancellationAcknowledged).toBe(false);
      expect(transferService.get('cancelling-export')).toMatchObject({ state: 'running' });
      expect(transferService.get('cancelling-export')).not.toHaveProperty('completedAt');
    } finally {
      releaseCleanup();
      await cancellation;
    }
    await expect(cancellation).resolves.toMatchObject({ state: 'cancelled', completedAt: expect.any(String) });
    expect(completed).not.toHaveBeenCalled();
  });

  it('reports a write failure instead of cancellation when both race', async () => {
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    const writeError = Object.assign(new Error('Cannot rename C:\\private\\capture.har'), { code: 'EACCES' });
    transferService.start('failing-commit', 'har-export', 'C:\\private\\capture.har', async (abortSignal) => {
      await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      throw writeError;
    });

    await expect(transferService.cancel('failing-commit')).resolves.toMatchObject({
      state: 'failed', message: 'File operation failed (EACCES).',
    });
    expect(JSON.stringify(transferService.get('failing-commit'))).not.toContain('private');
    expect(completed).not.toHaveBeenCalled();
  });

  it('reports progress and completion without exposing the absolute path', async () => {
    const transferService = new TransferService();
    const operation = vi.fn(async (
      _abortSignal: AbortSignal,
      progress: (value: { processed: number; total: number }) => void,
    ) => {
      progress({ processed: 1, total: 2 });
      return { processed: 2, total: 2, warnings: ['lossy'] };
    });

    expect(
      transferService.start('job-1', 'har-export', 'C:\\private\\capture.har', operation),
    ).toMatchObject({ state: 'running', kind: 'har-export', fileName: 'capture.har' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(transferService.get('job-1')).toMatchObject({
      state: 'completed',
      processed: 2,
      total: 2,
      warnings: ['lossy'],
    });
    expect(JSON.stringify(transferService.get('job-1'))).not.toContain('private');
  });

  it('cancels an active transfer through its AbortSignal', async () => {
    const transferService = new TransferService();
    let receivedAbortSignal: AbortSignal | undefined;

    transferService.start(
      'job-2',
      'archive-import',
      'C:\\private\\capture.iarchive',
      (abortSignal) =>
        new Promise<never>((_resolve, reject) => {
          receivedAbortSignal = abortSignal;
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason));
        }),
    );
    await expect(transferService.cancel('job-2')).resolves.toMatchObject({ state: 'cancelled' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(receivedAbortSignal?.aborted).toBe(true);
    expect(transferService.get('job-2')).toMatchObject({
      state: 'cancelled',
      message: 'Transfer cancelled.',
    });
  });

  it.each([false, true])('waits for transfer cleanup during shutdown (already cancelled=%s)', async (alreadyCancelled) => {
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    let cleanupFinished = false;
    let receivedAbortSignal: AbortSignal | undefined;
    transferService.start('shutdown-export', 'body-export', 'C:\\private\\body.bin', async (abortSignal) => {
      receivedAbortSignal = abortSignal;
      await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
      await cleanupGate;
      cleanupFinished = true;
      throw abortSignal.reason;
    });
    if (alreadyCancelled) transferService.cancel('shutdown-export');
    let drained = false;
    const draining = Promise.resolve(transferService.cancelAll()).then(() => { drained = true; });
    try {
      expect(receivedAbortSignal?.aborted).toBe(true);
      expect(transferService.get('shutdown-export')?.state).toBe('running');
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(drained).toBe(false);
      expect(cleanupFinished).toBe(false);
    } finally {
      releaseCleanup();
      await draining;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(cleanupFinished).toBe(true);
    expect(transferService.get('shutdown-export')?.state).toBe('cancelled');
    expect(completed).not.toHaveBeenCalled();
    await transferService.cancelAll();
  });

  it.each(['body-export', 'har-export', 'har-import', 'archive-export', 'archive-import'] as const)(
    'keeps %s excluded from Clear until its cancelled operation finishes', async (kind) => {
      const transferService = new TransferService();
      let releaseCleanup!: () => void;
      const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
      transferService.start('capture-file', kind, 'C:\\private\\capture', async (abortSignal) => {
        await cleanupGate;
        throw abortSignal.reason;
      });
      expect(transferService.hasPendingCaptureTransfers()).toBe(true);
      const cancellation = transferService.cancel('capture-file');
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(transferService.hasPendingCaptureTransfers()).toBe(true);
      } finally {
        releaseCleanup();
        await cancellation;
      }
      expect(transferService.hasPendingCaptureTransfers()).toBe(false);
    },
  );

  it('does not block Clear for an independent Diagnostics export', async () => {
    const transferService = new TransferService();
    let releaseExport!: () => void;
    const exportGate = new Promise<void>((resolve) => { releaseExport = resolve; });
    transferService.start('diagnostics-file', 'diagnostics-export', 'C:\\private\\diagnostics.jsonl', async () => {
      await exportGate;
      return { processed: 1, total: 1, warnings: [] };
    });
    try {
      expect(transferService.hasPendingCaptureTransfers()).toBe(false);
    } finally {
      releaseExport();
      await transferService.cancelAll();
    }
  });

  it('rejects a duplicate active job ID', () => {
    const transferService = new TransferService();
    transferService.start('dupe', 'har-export', '/tmp/a.har', () => new Promise(() => undefined));
    expect(() =>
      transferService.start('dupe', 'har-export', '/tmp/b.har', () => new Promise(() => undefined)),
    ).toThrow(/already active/);
  });
});
