import { describe, expect, it, vi } from 'vitest';

import { TransferService } from '../entry';

describe('TransferService', () => {
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
    expect(transferService.cancel('job-2')).toMatchObject({ state: 'cancelled' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(receivedAbortSignal?.aborted).toBe(true);
    expect(transferService.get('job-2')).toMatchObject({
      state: 'cancelled',
      message: 'Transfer cancelled.',
    });
  });

  it('rejects a duplicate active job ID', () => {
    const transferService = new TransferService();
    transferService.start('dupe', 'har-export', '/tmp/a.har', () => new Promise(() => undefined));
    expect(() =>
      transferService.start('dupe', 'har-export', '/tmp/b.har', () => new Promise(() => undefined)),
    ).toThrow(/already active/);
  });
});
