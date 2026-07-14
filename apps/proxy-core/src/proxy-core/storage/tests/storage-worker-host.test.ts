import { afterEach, describe, expect, it } from 'vitest';

import { IN_MEMORY_LOCATION, openCaptureDatabase } from '../capture-database';
import { CaptureStore } from '../capture-store';
import { applyStorageRequest } from '../storage-request-dispatch';
import {
  StorageWorkerHost,
  type StorageWorkerChannel,
} from '../storage-worker-host';
import type {
  StorageWorkerRequestEnvelope,
  StorageWorkerResponse,
} from '../storage-worker-protocol';

/**
 * 进程内假通道：用真实 CaptureStore 同步处理请求，验证 host 的关联/错误传播，
 * 不启动真正的 worker_threads 线程（真实 Worker 由 packaged smoke 覆盖）。
 */
class FakeChannel implements StorageWorkerChannel {
  private readonly store: CaptureStore;
  private messageListener: ((message: StorageWorkerResponse) => void) | null =
    null;
  private errorListener: ((error: Error) => void) | null = null;
  terminated = false;
  failNext = false;

  constructor() {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    this.store = new CaptureStore(db);
    queueMicrotask(() => this.messageListener?.({ type: 'ready' }));
  }

  postMessage(envelope: StorageWorkerRequestEnvelope): void {
    queueMicrotask(() => {
      if (this.failNext) {
        this.errorListener?.(new Error('boom'));
        return;
      }
      try {
        const result = applyStorageRequest(this.store, envelope.request);
        this.messageListener?.({
          type: 'result',
          requestId: envelope.requestId,
          ok: true,
          result,
        });
      } catch (error) {
        this.messageListener?.({
          type: 'result',
          requestId: envelope.requestId,
          ok: false,
          error: {
            name: (error as Error).name,
            message: (error as Error).message,
          },
        });
      }
    });
  }

  on(event: 'message' | 'error' | 'exit', listener: (arg: never) => void): void {
    if (event === 'message') {
      this.messageListener = listener as (m: StorageWorkerResponse) => void;
    } else if (event === 'error') {
      this.errorListener = listener as (e: Error) => void;
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('StorageWorkerHost', () => {
  let host: StorageWorkerHost | null = null;

  afterEach(async () => {
    await host?.close();
    host = null;
  });

  function createHost(channel: FakeChannel): StorageWorkerHost {
    return new StorageWorkerHost({
      databaseLocation: IN_MEMORY_LOCATION,
      createChannel: () => channel,
    });
  }

  it('resolves start once the worker reports ready', async () => {
    host = createHost(new FakeChannel());
    await expect(host.start()).resolves.toBeUndefined();
  });

  it('correlates append and query requests end to end', async () => {
    host = createHost(new FakeChannel());
    await host.start();

    await host.ensureSession({
      id: 's1',
      name: 'S1',
      startedAt: 1,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    const assigned = await host.appendExchanges([
      {
        id: 'e1',
        sessionId: 's1',
        method: 'GET',
        url: 'https://a/e1',
        protocol: 'http/1.1',
        startedAt: 5,
        state: 'pending',
      },
    ]);
    expect(assigned).toEqual([{ id: 'e1', seq: 1 }]);

    const page = await host.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {},
    });
    expect(page.items.map((item) => item.id)).toEqual(['e1']);
  });

  it('rejects a request when the worker reports an error', async () => {
    const channel = new FakeChannel();
    host = createHost(channel);
    await host.start();
    channel.failNext = true;
    await expect(host.storageStatus()).rejects.toThrow('boom');
  });

  it('rejects requests issued after close', async () => {
    host = createHost(new FakeChannel());
    await host.start();
    await host.close();
    await expect(host.storageStatus()).rejects.toThrow('closed');
  });
});
