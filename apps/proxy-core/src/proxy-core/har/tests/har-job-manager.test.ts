import { describe, expect, it, vi } from 'vitest';

import { HarJobManager } from '../har-job-manager';

const exportOptions = {
  scope: { kind: 'all' as const },
  redaction: { authorization: true, cookies: true, bodies: false },
};

describe('HarJobManager', () => {
  it('reports progress and completion without exposing the absolute path', async () => {
    const service = {
      exportToFile: vi.fn(async (
        _path: string,
        _options: typeof exportOptions,
        _signal: AbortSignal,
        progress?: (value: { processed: number; total: number }) => void,
      ) => {
        progress?.({ processed: 1, total: 2 });
        return { processed: 2, total: 2, warnings: ['lossy'] };
      }),
      importFromFile: vi.fn(),
    };
    const manager = new HarJobManager(service);

    expect(manager.startExport('job-1', 'C:\\private\\capture.har', exportOptions))
      .toMatchObject({ state: 'running', fileName: 'capture.har' });
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
    let receivedSignal: AbortSignal | undefined;
    const service = {
      exportToFile: vi.fn(),
      importFromFile: vi.fn(
        (_path: string, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            receivedSignal = signal;
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      ),
    };
    const manager = new HarJobManager(service);

    manager.startImport('job-2', 'C:\\private\\capture.har');
    expect(manager.cancel('job-2')).toMatchObject({ state: 'cancelled' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(receivedSignal?.aborted).toBe(true);
    expect(manager.get('job-2')).toMatchObject({
      state: 'cancelled',
      message: 'Transfer cancelled.',
    });
  });
});