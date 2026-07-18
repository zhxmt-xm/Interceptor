import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../constants';
import type { CaptureSnapshotBatch, ExchangeInput } from '../../storage/interfaces';
import { ArchiveWorkerHost } from '../host/entry';
import type { ArchiveSnapshotPage } from '../interfaces';

const workerBundle = path.resolve(
  process.cwd(),
  'dist/proxy-core/archive/worker/entry.cjs',
);

/** 真实一次性 Archive Worker 测试夹具。 */
class ArchiveWorkerFixture {
  /** 当前测试目录。 */
  directory = '';
  /** 当前 snapshot 路径。 */
  snapshotPath = '';

  /** 建立临时 dataDir 并刷新 Worker bundle resolver。 */
  async initialize(): Promise<void> {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-archive-worker-'));
    this.snapshotPath = path.join(this.directory, 'capture.sqlite');
    initializeRuntime([`--data-dir=${this.directory}`]);
  }

  /** 删除临时目录。 */
  async cleanup(): Promise<void> {
    if (this.directory) {
      await fs.rm(this.directory, { recursive: true, force: true });
    }
  }

  /** 创建一条带 header/body/frame 的 snapshot Exchange。 */
  exchange(index: number): ExchangeInput {
    return {
      id: `exchange-${index}`,
      sessionId: 'session-1',
      method: index % 2 === 0 ? 'GET' : 'POST',
      scheme: 'https',
      host: 'api.test',
      path: `/items/${index}`,
      url: `https://api.test/items/${index}`,
      protocol: index === 0 ? 'ws' : 'h2',
      statusCode: 200,
      startedAt: index,
      completedAt: index + 10,
      state: 'completed',
      headers: [
        { kind: 'request', name: ':method', value: 'GET', isPseudo: true },
        { kind: 'response-trailer', name: 'grpc-status', value: '0' },
      ],
      responseBody: {
        id: `body-${index}`,
        blobHash: index.toString(16).padStart(64, '0'),
        encodedSize: index + 1,
        mediaType: 'application/octet-stream',
      },
    };
  }

  /** 按 100/100/50 输出三个有界批次。 */
  async *batches(): AsyncIterable<CaptureSnapshotBatch> {
    for (let offset = 0; offset < 250; offset += 100) {
      yield {
        sessions: offset === 0
          ? [
              {
                id: 'session-1',
                name: 'Archive source',
                startedAt: 0,
                captureMode: 'explicit-proxy',
                appVersion: '0.0.0',
              },
            ]
          : [],
        exchanges: Array.from(
          { length: Math.min(100, 250 - offset) },
          (_, localIndex) => {
            const index = offset + localIndex;
            return {
              exchange: this.exchange(index),
              frames: index === 0
                ? [
                    {
                      direction: 'client-to-server' as const,
                      opcode: 1 as const,
                      payloadSize: 4,
                      timestamp: 5,
                      payload: {
                        id: 'frame-body',
                        blobHash: 'f'.repeat(64),
                        encodedSize: 4,
                        mediaType: 'text/plain',
                      },
                    },
                  ]
                : [],
            };
          },
        ),
      };
    }
  }
}

describe.skipIf(!existsSync(workerBundle))(
  'ArchiveWorkerHost (real worker thread)',
  () => {
    let fixture: ArchiveWorkerFixture;

    afterEach(async () => fixture?.cleanup());

    it('round-trips bounded batches and exits after each one-shot task', async () => {
      fixture = new ArchiveWorkerFixture();
      await fixture.initialize();
      const exportHost = new ArchiveWorkerHost('export', fixture.snapshotPath);
      await exportHost.writeSnapshot(
        fixture.batches(),
        new AbortController().signal,
      );
      expect(existsSync(fixture.snapshotPath)).toBe(true);

      const importHost = new ArchiveWorkerHost('import', fixture.snapshotPath);
      const pages: ArchiveSnapshotPage[] = [];
      for await (const page of importHost.readSnapshotBatches(
        new AbortController().signal,
      )) {
        pages.push(page);
      }

      expect(pages.map((page) => page.exchanges.length)).toEqual([100, 100, 50]);
      expect(pages.at(-1)?.total).toBe(250);
      expect(pages.flatMap((page) => page.exchanges)).toHaveLength(250);
      expect(pages[0]?.exchanges[0]).toMatchObject({
        exchange: {
          id: 'exchange-0',
          responseBody: { blobHash: '0'.repeat(64) },
          headers: [
            { name: ':method', isPseudo: true },
            { name: 'grpc-status' },
          ],
        },
        frames: [
          {
            payload: { blobHash: 'f'.repeat(64) },
          },
        ],
      });
      await expect(importHost.finish()).resolves.toBeUndefined();
    });

    it('supports an empty snapshot and exits without leaving a running host', async () => {
      fixture = new ArchiveWorkerFixture();
      await fixture.initialize();
      const exportHost = new ArchiveWorkerHost('export', fixture.snapshotPath);
      await exportHost.writeSnapshot(
        (async function* (): AsyncIterable<CaptureSnapshotBatch> {
          yield { sessions: [], exchanges: [] };
        })(),
        new AbortController().signal,
      );

      const importHost = new ArchiveWorkerHost('import', fixture.snapshotPath);
      const pages: ArchiveSnapshotPage[] = [];
      for await (const page of importHost.readSnapshotBatches(
        new AbortController().signal,
      )) {
        pages.push(page);
      }
      expect(pages).toEqual([
        { exchanges: [], total: 0, nextCursor: undefined, hasMore: false },
      ]);
      await expect(importHost.finish()).resolves.toBeUndefined();
    });

    it('terminates an export worker when the task is cancelled between batches', async () => {
      fixture = new ArchiveWorkerFixture();
      await fixture.initialize();
      const controller = new AbortController();
      const host = new ArchiveWorkerHost('export', fixture.snapshotPath);
      const batches = (async function* (): AsyncIterable<CaptureSnapshotBatch> {
        yield {
          sessions: [
            {
              id: 'session-1',
              name: 'Cancelled',
              startedAt: 0,
              captureMode: 'explicit-proxy',
              appVersion: '0.0.0',
            },
          ],
          exchanges: [],
        };
        controller.abort(new DOMException('cancelled', 'AbortError'));
        yield { sessions: [], exchanges: [] };
      })();

      await expect(host.writeSnapshot(batches, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      await expect(host.finish()).resolves.toBeUndefined();
    });
  },
);
