import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { locations } = vi.hoisted(() => ({
  locations: {
    captureTemp: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  get captureTempDirectory() {
    return locations.captureTemp;
  },
}));

import { CaptureService } from '../entry';

/** CaptureService Core 代际生命周期夹具。 */
class CaptureServiceFixture {
  /** 当前测试目录。 */
  directory = '';

  /** 建立所有运行时路径。 */
  async initialize(): Promise<void> {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-capture-service-'));
    locations.captureTemp = path.join(this.directory, 'capture-temp');
  }

  /** 删除测试目录。 */
  async cleanup(): Promise<void> {
    if (this.directory) {
      await fs.rm(this.directory, { recursive: true, force: true });
    }
  }

  /** 写入一条 Session、Body 和 Exchange。 */
  async seedCapture(captureService: CaptureService): Promise<string> {
    await captureService.ensureSession({
      id: 'session-1',
      name: 'Recording',
      startedAt: 1,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    const body = await captureService.writeBody((async function* () {
      yield Buffer.from('temporary payload');
    })());
    await captureService.appendExchanges([
      {
        id: 'exchange-1',
        sessionId: 'session-1',
        method: 'GET',
        url: 'https://api.test/items',
        host: 'api.test',
        protocol: 'h2',
        startedAt: 1,
        completedAt: 2,
        state: 'completed',
        responseBody: {
          id: 'body-1',
          blobHash: body.hash,
          encodedSize: body.size,
          mediaType: 'text/plain',
        },
      },
    ]);
    return body.hash;
  }
}

describe('CaptureService temporary lifecycle', () => {
  let captureServiceFixture: CaptureServiceFixture;

  beforeEach(async () => {
    captureServiceFixture = new CaptureServiceFixture();
    await captureServiceFixture.initialize();
  });

  afterEach(async () => captureServiceFixture.cleanup());

  it('preserves Capture across Stop semantics and deletes it only on Clear', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const bodyHash = await captureServiceFixture.seedCapture(captureService);
    const beforeStop = await captureService.status();

    await captureService.collectUnreferencedBodies();
    expect(await captureService.status()).toEqual(beforeStop);
    expect((await captureService.readBodyRange(bodyHash, 0, 9)).toString()).toBe('temporary');

    await captureService.cleanup({ kind: 'all' });
    expect(await captureService.status()).toMatchObject({
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 0,
      blobBytes: 0,
    });
    await expect(captureService.readBodyRange(bodyHash, 0, 1)).rejects.toThrow();
    await captureService.dispose();
  });

  it('drops Capture and Body on Core reopen', async () => {
    const first = new CaptureService();
    await first.initialize();
    await captureServiceFixture.seedCapture(first);
    await first.dispose();

    const reopened = new CaptureService();
    await reopened.initialize();
    expect(await reopened.status()).toMatchObject({
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 0,
      blobBytes: 0,
    });
    await reopened.dispose();
  });

  it('streams a complete body to an atomic user-selected file', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const expected = Buffer.alloc(1024 * 1024 + 17, 0x5a);
    const body = await captureService.writeBody((async function* () {
      yield expected.subarray(0, 700_000);
      yield expected.subarray(700_000);
    })());
    const destination = path.join(captureServiceFixture.directory, 'saved-body.txt');
    const progress: Array<{ processed: number; total: number }> = [];
    await fs.writeFile(destination, 'old');

    const result = await captureService.exportBodyToFile(
      body.hash,
      destination,
      new AbortController().signal,
      (update) => progress.push(update),
    );

    expect(await fs.readFile(destination)).toEqual(expected);
    expect(result).toEqual({
      processed: expected.byteLength,
      total: expected.byteLength,
      warnings: [],
    });
    expect(progress.at(-1)).toEqual({
      processed: expected.byteLength,
      total: expected.byteLength,
    });
    await captureService.dispose();
  }, 10_000);

  it('leaves no destination or temp file when body export cannot start', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const destination = path.join(captureServiceFixture.directory, 'cancelled.bin');
    const abortController = new AbortController();
    abortController.abort();
    const body = await captureService.writeBody((async function* () {
      yield Buffer.from('payload');
    })());

    await expect(captureService.exportBodyToFile(
      body.hash,
      destination,
      abortController.signal,
      () => undefined,
    )).rejects.toMatchObject({ name: 'AbortError' });
    await expect(captureService.exportBodyToFile(
      'missing',
      destination,
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow("Temporary body 'missing' does not exist.");
    expect(await fs.readdir(captureServiceFixture.directory)).not.toContain('cancelled.bin');
    expect((await fs.readdir(captureServiceFixture.directory)).some((name) => name.endsWith('.tmp')))
      .toBe(false);
    await captureService.dispose();
  });
});
