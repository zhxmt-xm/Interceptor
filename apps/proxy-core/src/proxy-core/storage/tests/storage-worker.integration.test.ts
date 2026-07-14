import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { StorageWorkerHost } from '../storage-worker-host';

/**
 * 真实 worker_threads 集成测试：使用已构建的 storage-worker.cjs bundle 启动真正的
 * Worker，验证 worker 内 node:sqlite、消息往返与 bundle 路径解析。需要先执行
 * `npm run build --workspace @interceptor/proxy-core`；bundle 缺失时跳过（由 packaged
 * smoke 兜底）。
 */
const workerBundle = path.resolve(
  process.cwd(),
  'dist/proxy-core/storage/storage-worker.cjs',
);
const bundleExists = existsSync(workerBundle);

describe.skipIf(!bundleExists)('StorageWorkerHost (real worker thread)', () => {
  let dataDir: string;
  let host: StorageWorkerHost | null = null;

  afterEach(async () => {
    await host?.close();
    host = null;
    if (dataDir) {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('starts a real worker, persists exchanges, and queries them back', async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-storage-'));
    host = new StorageWorkerHost({
      databaseLocation: path.join(dataDir, 'capture.sqlite'),
      workerPath: workerBundle,
    });
    await host.start();

    await host.ensureSession({
      id: 's1',
      name: 'Integration',
      startedAt: Date.now(),
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    const assigned = await host.appendExchanges([
      {
        id: 'e1',
        sessionId: 's1',
        method: 'GET',
        url: 'https://api.example.com/ping',
        host: 'api.example.com',
        protocol: 'http/1.1',
        startedAt: Date.now(),
        state: 'completed',
        statusCode: 200,
      },
    ]);
    expect(assigned).toEqual([{ id: 'e1', seq: 1 }]);

    const page = await host.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: { search: 'ping' },
    });
    expect(page.items.map((item) => item.id)).toEqual(['e1']);

    const status = await host.storageStatus();
    expect(status.sessionCount).toBe(1);
    expect(status.exchangeCount).toBe(1);
  });
});
