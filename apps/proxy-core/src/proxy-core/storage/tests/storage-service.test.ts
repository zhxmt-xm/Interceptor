import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { locations } = vi.hoisted(() => ({
  locations: {
    rules: '',
    captureTemp: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  get rulesDatabasePath() {
    return locations.rules;
  },
  get captureTempDirectory() {
    return locations.captureTemp;
  },
}));

import { StorageService } from '../entry';

/** StorageService Core 代际生命周期夹具。 */
class StorageServiceFixture {
  /** 当前测试目录。 */
  directory = '';

  /** 建立所有运行时路径。 */
  async initialize(): Promise<void> {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-storage-service-'));
    locations.rules = path.join(this.directory, 'rules.sqlite');
    locations.captureTemp = path.join(this.directory, 'capture-temp');
  }

  /** 删除测试目录。 */
  async cleanup(): Promise<void> {
    if (this.directory) {
      await fs.rm(this.directory, { recursive: true, force: true });
    }
  }

  /** 写入一条 Session、Body 和 Exchange。 */
  async seedCapture(storage: StorageService): Promise<string> {
    await storage.ensureSession({
      id: 'session-1',
      name: 'Recording',
      startedAt: 1,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    const body = await storage.writeBody((async function* () {
      yield Buffer.from('temporary payload');
    })());
    await storage.appendExchanges([
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

describe('StorageService temporary lifecycle', () => {
  let fixture: StorageServiceFixture;

  beforeEach(async () => {
    fixture = new StorageServiceFixture();
    await fixture.initialize();
  });

  afterEach(async () => fixture.cleanup());

  it('preserves Capture across Stop semantics and deletes it only on Clear', async () => {
    const storage = new StorageService();
    await storage.initialize();
    const bodyHash = await fixture.seedCapture(storage);
    const beforeStop = await storage.status();

    await storage.collectUnreferencedBodies();
    expect(await storage.status()).toEqual(beforeStop);
    expect((await storage.readBodyRange(bodyHash, 0, 9)).toString()).toBe('temporary');

    await storage.cleanup({ kind: 'all' });
    expect(await storage.status()).toMatchObject({
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 0,
      blobBytes: 0,
    });
    await expect(storage.readBodyRange(bodyHash, 0, 1)).rejects.toThrow();
    await storage.dispose();
  });

  it('drops Capture/Body on Core reopen while retaining RuleSet', async () => {
    const first = new StorageService();
    await first.initialize();
    await fixture.seedCapture(first);
    await first.saveRuleSet(0, [
      {
        id: 'persistent-rule',
        name: 'Keep me',
        enabled: true,
        priority: 1,
        matchers: [],
        actions: [],
      },
    ]);
    await first.dispose();

    const reopened = new StorageService();
    await reopened.initialize();
    expect(await reopened.status()).toMatchObject({
      sessionCount: 0,
      exchangeCount: 0,
      bodyCount: 0,
      databaseBytes: 0,
      blobBytes: 0,
    });
    expect(await reopened.loadRuleSet()).toMatchObject({
      revision: 1,
      rules: [{ id: 'persistent-rule' }],
    });
    await reopened.dispose();
  });

  it('streams a complete body to an atomic user-selected file', async () => {
    const storage = new StorageService();
    await storage.initialize();
    const expected = Buffer.alloc(1024 * 1024 + 17, 0x5a);
    const body = await storage.writeBody((async function* () {
      yield expected.subarray(0, 700_000);
      yield expected.subarray(700_000);
    })());
    const destination = path.join(fixture.directory, 'saved-body.txt');
    const progress: Array<{ processed: number; total: number }> = [];
    await fs.writeFile(destination, 'old');

    const result = await storage.exportBodyToFile(
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
    await storage.dispose();
  });

  it('leaves no destination or temp file when body export cannot start', async () => {
    const storage = new StorageService();
    await storage.initialize();
    const destination = path.join(fixture.directory, 'cancelled.bin');
    const controller = new AbortController();
    controller.abort();
    const body = await storage.writeBody((async function* () {
      yield Buffer.from('payload');
    })());

    await expect(storage.exportBodyToFile(
      body.hash,
      destination,
      controller.signal,
      () => undefined,
    )).rejects.toMatchObject({ name: 'AbortError' });
    await expect(storage.exportBodyToFile(
      'missing',
      destination,
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow("Temporary body 'missing' does not exist.");
    expect(await fs.readdir(fixture.directory)).not.toContain('cancelled.bin');
    expect((await fs.readdir(fixture.directory)).some((name) => name.endsWith('.tmp')))
      .toBe(false);
    await storage.dispose();
  });
});
