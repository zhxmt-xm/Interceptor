import { describe, expect, it, vi } from 'vitest';

import { TransferJobManager } from '../entry';

describe('TransferJobManager', () => {
  it('reports progress and completion without exposing the absolute path', async () => {
    const manager = new TransferJobManager();
    const operation = vi.fn(async (
      _signal: AbortSignal,
      progress: (value: { processed: number; total: number }) => void,
    ) => {
      progress({ processed: 1, total: 2 });
      return { processed: 2, total: 2, warnings: ['lossy'] };
    });

    expect(
      manager.start('job-1', 'har-export', 'C:\\private\\capture.har', operation),
    ).toMatchObject({ state: 'running', kind: 'har-export', fileName: 'capture.har' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(manager.get('job-1')).toMatchObject({
      state: 'completed',
      processed: 2,
      total: 2,
      warnings: ['lossy'],
    });
    expect(JSON.stringify(manager.get('job-1'))).not.toContain('private');
  });

  it('cancels an active transfer through its AbortSignal', async () => {
    const manager = new TransferJobManager();
    let receivedSignal: AbortSignal | undefined;

    manager.start(
      'job-2',
      'archive-import',
      'C:\\private\\capture.iarchive',
      (signal) =>
        new Promise<never>((_resolve, reject) => {
          receivedSignal = signal;
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    expect(manager.cancel('job-2')).toMatchObject({ state: 'cancelled' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(receivedSignal?.aborted).toBe(true);
    expect(manager.get('job-2')).toMatchObject({
      state: 'cancelled',
      message: 'Transfer cancelled.',
    });
  });

  it('rejects a duplicate active job ID', () => {
    const manager = new TransferJobManager();
    manager.start('dupe', 'har-export', '/tmp/a.har', () => new Promise(() => undefined));
    expect(() =>
      manager.start('dupe', 'har-export', '/tmp/b.har', () => new Promise(() => undefined)),
    ).toThrow(/already active/);
  });
});
