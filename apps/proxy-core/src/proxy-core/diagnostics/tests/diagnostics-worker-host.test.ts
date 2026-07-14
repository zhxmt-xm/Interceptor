import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { openDiagnosticsDatabase } from '../diagnostics-database';
import { DiagnosticsStore } from '../diagnostics-store';
import {
  DiagnosticsWorkerHost,
  type DiagnosticsWorkerChannel,
} from '../diagnostics-worker-host';
import type {
  DiagnosticsWorkerRequest,
  DiagnosticsWorkerResponse,
} from '../diagnostics-worker-protocol';

/**
 * 进程内假通道：用真实 DiagnosticsStore 同步处理请求，验证 host 的缓冲/关联逻辑，
 * 不启动真实 worker_threads（真实 Worker 由 packaged smoke 覆盖）。
 */
class FakeChannel implements DiagnosticsWorkerChannel {
  private readonly store: DiagnosticsStore;
  private messageListener: ((message: DiagnosticsWorkerResponse) => void) | null =
    null;
  terminated = false;

  constructor(readyDelayMicrotasks = 1) {
    const { db } = openDiagnosticsDatabase(':memory:');
    this.store = new DiagnosticsStore(db);
    let ticks = readyDelayMicrotasks;
    const emitReady = () => {
      if (ticks-- <= 0) {
        this.messageListener?.({ type: 'ready' });
      } else {
        queueMicrotask(emitReady);
      }
    };
    queueMicrotask(emitReady);
  }

  postMessage(request: DiagnosticsWorkerRequest): void {
    if (request.type === 'write') {
      this.store.insertBatch(request.records);
      return;
    }
    if (request.type === 'query') {
      const result = this.store.query(request.query);
      queueMicrotask(() =>
        this.messageListener?.({
          type: 'query-result',
          requestId: request.requestId,
          ok: true,
          result,
        }),
      );
    }
  }

  on(event: 'message' | 'error' | 'exit', listener: (arg: never) => void): void {
    if (event === 'message') {
      this.messageListener = listener as (m: DiagnosticsWorkerResponse) => void;
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function record(sequence: number): DiagnosticLogRecord {
  return {
    timestamp: new Date(1_700_000_000_000 + sequence).toISOString(),
    sequence,
    level: 'info',
    process: 'proxy-core',
    phase: 'command.completed',
  };
}

describe('DiagnosticsWorkerHost', () => {
  let host: DiagnosticsWorkerHost | null = null;

  afterEach(async () => {
    await host?.close();
    host = null;
  });

  it('replays buffered writes once the worker becomes ready', async () => {
    const channel = new FakeChannel(2);
    host = new DiagnosticsWorkerHost({
      databaseLocation: ':memory:',
      createChannel: () => channel,
    });
    // 在 ready 之前写入，应被缓冲。
    host.sink([record(1)]);
    host.sink([record(2)]);
    await host.start();

    const page = await host.query({ limit: 10 });
    expect(page.records.map((r) => r.sequence).sort()).toEqual([1, 2]);
  });

  it('correlates queries and returns persisted records', async () => {
    const channel = new FakeChannel();
    host = new DiagnosticsWorkerHost({
      databaseLocation: ':memory:',
      createChannel: () => channel,
    });
    await host.start();
    host.sink([record(5)]);

    const page = await host.query({ limit: 10 });
    expect(page.records.map((r) => r.sequence)).toEqual([5]);
  });

  it('rejects queries after close', async () => {
    const channel = new FakeChannel();
    host = new DiagnosticsWorkerHost({
      databaseLocation: ':memory:',
      createChannel: () => channel,
    });
    await host.start();
    await host.close();
    await expect(host.query({ limit: 10 })).rejects.toThrow('unavailable');
  });
});
