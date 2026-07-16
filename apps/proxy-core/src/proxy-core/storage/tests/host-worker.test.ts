import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../constants';
import { StorageWorkerHost } from '../host/host-worker';
import type { ExchangeInput } from '../types';

/**
 * 真实 worker_threads 测试：host 自解析并启动已构建的 storage/worker/worker-entry.cjs
 * bundle，验证 worker 内 node:sqlite、requestId 关联、worker 端错误传播与关闭后拒绝。
 * 不再用假通道注入——host 通过 resolveStorageWorkerEntry 回落到工作区 dist bundle；
 * bundle 缺失时跳过（需先 `npm run build`，packaged smoke 兜底）。
 */
const workerBundle = path.resolve(
  process.cwd(),
  'dist/proxy-core/storage/worker/worker-entry.cjs',
);

function exchange(id: string): ExchangeInput {
  return {
    id,
    sessionId: 's1',
    method: 'GET',
    url: `https://api.example.com/${id}`,
    host: 'api.example.com',
    protocol: 'http/1.1',
    startedAt: Date.now(),
    state: 'completed',
    statusCode: 200,
  };
}

describe.skipIf(!existsSync(workerBundle))(
  'StorageWorkerHost (real worker thread)',
  () => {
    let dataDir: string;
    let host: StorageWorkerHost | null = null;

    afterEach(async () => {
      await host?.close();
      host = null;
      if (dataDir) {
        await fs.rm(dataDir, { recursive: true, force: true });
      }
    });

    async function startHost(): Promise<StorageWorkerHost> {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-storage-'));
      initializeRuntime([`--data-dir=${dataDir}`]);
      host = new StorageWorkerHost();
      await host.start();
      return host;
    }

    it('starts, persists exchanges, and queries them back end to end', async () => {
      const started = await startHost();
      await started.ensureSession({
        id: 's1',
        name: 'Integration',
        startedAt: Date.now(),
        captureMode: 'explicit-proxy',
        appVersion: '0.0.0',
      });
      const assigned = await started.appendExchanges([exchange('ping')]);
      expect(assigned).toEqual([{ id: 'ping', seq: 1 }]);

      const page = await started.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: { search: 'ping' },
      });
      expect(page.items.map((item) => item.id)).toEqual(['ping']);

      const status = await started.storageStatus();
      expect(status.sessionCount).toBe(1);
      expect(status.exchangeCount).toBe(1);
    });

    it('rejects a request when the worker reports an error', async () => {
      const started = await startHost();
      await started.ensureSession({
        id: 's1',
        name: 'Integration',
        startedAt: Date.now(),
        captureMode: 'explicit-proxy',
        appVersion: '0.0.0',
      });
      // 同一主键重复追加触发 UNIQUE 约束错误，worker 以 ok:false 回传、host 拒绝。
      await started.appendExchanges([exchange('dup')]);
      await expect(started.appendExchanges([exchange('dup')])).rejects.toThrow();
    });

    it('persists websocket frame payload references through the worker protocol', async () => {
      const started = await startHost();
      await started.ensureSession({
        id: 's1',
        name: 'Integration',
        startedAt: Date.now(),
        captureMode: 'explicit-proxy',
        appVersion: '0.0.0',
      });
      await started.appendExchanges([exchange('ws')]);
      const blobHash = 'd'.repeat(64);
      await started.appendWebSocketFrames('ws', [
        {
          direction: 'client-to-server',
          opcode: 1,
          payloadSize: 4,
          timestamp: Date.now(),
          payload: {
            id: 'ws-payload',
            blobHash,
            encodedSize: 4,
            mediaType: 'text/plain; charset=utf-8',
          },
        },
      ]);

      await expect(started.referencedHashes()).resolves.toContain(blobHash);
    });

    it('rejects requests issued after close', async () => {
      const started = await startHost();
      await started.close();
      await expect(started.storageStatus()).rejects.toThrow('closed');
    });
  },
);
