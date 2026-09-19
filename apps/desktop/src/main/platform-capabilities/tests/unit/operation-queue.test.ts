import { describe, expect, it } from 'vitest';

import { SystemProxyOperationQueue } from '../../internal/operation-queue';

describe('SystemProxyOperationQueue', () => {
  it('runs operations in order without overlap', async () => {
    const systemProxyOperationQueue = new SystemProxyOperationQueue();
    const actions: string[] = [];
    let releaseFirst = (): void => {
      throw new Error('First operation was not initialized.');
    };
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = systemProxyOperationQueue.run(async () => {
      actions.push('first-start');
      await firstBlocked;
      actions.push('first-end');
      return 'first';
    });
    const second = systemProxyOperationQueue.run(async () => {
      actions.push('second');
      return 'second';
    });

    await Promise.resolve();
    expect(actions).toEqual(['first-start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(actions).toEqual(['first-start', 'first-end', 'second']);
  });

  it('continues after an earlier operation fails', async () => {
    const systemProxyOperationQueue = new SystemProxyOperationQueue();

    await expect(systemProxyOperationQueue.run(async () => {
      throw new Error('restore failed');
    })).rejects.toThrow('restore failed');

    await expect(systemProxyOperationQueue.run(async () => 'enabled'))
      .resolves.toBe('enabled');
  });
});