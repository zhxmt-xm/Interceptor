import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../../constants';
import { WorkerHost } from '../../host/entry';

/**
 * 真实 worker_threads 测试：host 自解析并启动已构建的 diagnostics/worker/entry.cjs
 * bundle，验证就绪前写入的有界缓冲回放、查询 requestId 关联与关闭后拒绝。不再用假通道注入；
 * bundle 缺失时跳过（需先 `npm run build`，packaged smoke 兜底）。
 */
const workerBundle = path.resolve(
  process.cwd(),
  'dist/proxy-core/diagnostics/worker/entry.cjs',
);

function record(sequence: number): DiagnosticLogRecord {
  return {
    timestamp: new Date(1_700_000_000_000 + sequence).toISOString(),
    sequence,
    level: 'info',
    process: 'core',
    phase: 'command.completed',
  };
}

describe.skipIf(!existsSync(workerBundle))(
  'WorkerHost (real worker thread)',
  () => {
    let dataDir: string;
    let workerHost: WorkerHost | null = null;

    afterEach(async () => {
      await workerHost?.close();
      workerHost = null;
      if (dataDir) {
        await fs.rm(dataDir, { recursive: true, force: true });
      }
    });

    async function createHost(): Promise<WorkerHost> {
      dataDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'interceptor-diagnostics-'),
      );
      initializeRuntime([`--data-dir=${dataDir}`]);
      workerHost = new WorkerHost();
      return workerHost;
    }

    it('replays buffered writes once the worker becomes ready', async () => {
      const started = await createHost();
      // 在 ready 之前写入，应被有界缓冲并在启动后回放。
      started.sink([record(1)]);
      started.sink([record(2)]);
      await started.start();

      const page = await started.query({ limit: 10 });
      expect(page.records.map((r) => r.sequence).sort()).toEqual([1, 2]);
    });

    it('correlates queries and returns persisted records', async () => {
      const started = await createHost();
      await started.start();
      started.sink([record(5)]);

      const page = await started.query({ limit: 10 });
      expect(page.records.map((r) => r.sequence)).toEqual([5]);
    });

    it('rejects queries after close', async () => {
      const started = await createHost();
      await started.start();
      await started.close();
      await expect(started.query({ limit: 10 })).rejects.toThrow('unavailable');
    });
  },
);
