import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { locations } = vi.hoisted(() => ({
  locations: {
    capture: '',
    rules: '',
    legacyBlobs: '',
    captureTemp: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  get captureDatabasePath() {
    return locations.capture;
  },
  get rulesDatabasePath() {
    return locations.rules;
  },
  get blobDirectory() {
    return locations.legacyBlobs;
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
    locations.capture = path.join(this.directory, 'capture.sqlite');
    locations.rules = path.join(this.directory, 'rules.sqlite');
    locations.legacyBlobs = path.join(this.directory, 'blobs');
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
});
