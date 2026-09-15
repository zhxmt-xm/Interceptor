import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { locations } = vi.hoisted(() => ({
  locations: {
    captureTemp: '',
  },
}));

vi.mock('../../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../constants')>()),
  get captureTempDirectory() {
    return locations.captureTemp;
  },
}));

import { CaptureService } from '../../entry';
import { BodyStore } from '../../internal/body-store';

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

  afterEach(async () => {
    vi.restoreAllMocks();
    await captureServiceFixture.cleanup();
  });

  it.each([32, 4 * 1024 * 1024])('reads %s-byte in-flight bodies by exchange and side through finalization and Clear', async (bodySize) => {
    const captureService = new CaptureService();
    await captureService.initialize();
    await captureServiceFixture.seedCapture(captureService);
    await captureService.appendExchanges([{ id: 'live-1', sessionId: 'session-1', method: 'POST',
      url: 'https://api.test/stream', protocol: 'h2', startedAt: 3, state: 'response-streaming' }]);
    const requestWriter = captureService.createBodyWriter('live-1', 'request');
    const responseWriter = captureService.createBodyWriter('live-1', 'response');
    requestWriter.write(Buffer.from('request-message'));
    const responseBody = Buffer.alloc(bodySize, 0x61);
    responseWriter.write(responseBody);
    await expect(captureService.getExchangeBodySnapshot('live-1', 'response')).resolves.toMatchObject({
      encodedSize: bodySize, available: true, complete: false, bodyHash: undefined,
    });
    await expect(captureService.readExchangeBodyRange('live-1', 'request', 0, 7)).resolves.toEqual(Buffer.from('request'));
    await expect(captureService.readExchangeBodyRange('live-1', 'response', bodySize - 10, 20))
      .resolves.toEqual(responseBody.subarray(bodySize - 10));

    const finalizing = responseWriter.finalize();
    await expect(captureService.readExchangeBodyRange('live-1', 'response', 0, 5))
      .resolves.toEqual(responseBody.subarray(0, 5));
    const result = await finalizing;
    await captureService.updateExchange({ id: 'live-1', responseBody: {
      id: 'response-body', blobHash: result!.hash, encodedSize: result!.size, mediaType: 'application/grpc+json',
    } });
    await expect(captureService.getExchangeBodySnapshot('live-1', 'response')).resolves.toMatchObject({
      bodyHash: result!.hash, encodedSize: bodySize, available: true, complete: true,
    });
    const liveRead = captureService.readExchangeBodyRange('live-1', 'request', 0, 7);
    const clearing = captureService.cleanup({ kind: 'all' });
    await expect(liveRead).resolves.toEqual(Buffer.from('request'));
    await clearing;
    await expect(captureService.getExchangeBodySnapshot('live-1', 'request')).resolves.toMatchObject({
      encodedSize: 0, available: false, complete: true,
    });
    await expect(captureService.readExchangeBodyRange('live-1', 'response', 0, 5)).resolves.toEqual(Buffer.alloc(0));
    expect(await fs.readdir(locations.captureTemp)).toEqual([]);
    await captureService.dispose();
  });

  it('waits for an accepted final body range read before Clear removes its spill', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    await captureServiceFixture.seedCapture(captureService);
    const body = await captureService.writeBody((async function* () { yield Buffer.alloc(4 * 1024 * 1024, 0x61); })());
    await captureService.updateExchange({ id: 'exchange-1', responseBody: {
      id: 'large-body', blobHash: body.hash, encodedSize: body.size,
    } });
    const actualRead = BodyStore.prototype.readRange;
    const actualReset = BodyStore.prototype.reset;
    let releaseRead!: () => void;
    let readFinished = false;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    vi.spyOn(BodyStore.prototype, 'readRange').mockImplementation(async function (this: BodyStore, hash, offset, length) {
      await readGate;
      const result = await actualRead.call(this, hash, offset, length);
      readFinished = true;
      return result;
    });
    vi.spyOn(BodyStore.prototype, 'reset').mockImplementation(async function (this: BodyStore) {
      expect(readFinished).toBe(true);
      await actualReset.call(this);
    });
    const reading = captureService.readExchangeBodyRange('exchange-1', 'response', 0, 7);
    const clearing = captureService.cleanup({ kind: 'all' });
    void clearing.catch(() => undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseRead();
    await expect(reading).resolves.toEqual(Buffer.from('aaaaaaa'));
    await clearing;
    await captureService.dispose();
  });

  it('does not read an in-flight original body when the Final replacement is explicitly empty', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    await captureServiceFixture.seedCapture(captureService);
    await captureService.updateExchange({ id: 'exchange-1', requestBody: { id: 'empty-final', encodedSize: 0 } });
    const bodyWriter = captureService.createBodyWriter('exchange-1', 'request');
    bodyWriter.write(Buffer.from('original request'));
    await expect(captureService.getExchangeBodySnapshot('exchange-1', 'request')).resolves.toMatchObject({
      encodedSize: 0, complete: true, available: false,
    });
    await expect(captureService.readExchangeBodyRange('exchange-1', 'request', 0, 16)).resolves.toEqual(Buffer.alloc(0));
    await captureService.dispose();
  });

  it('retains the original writer for cleanup after a Final replacement is bound', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const finalHash = await captureServiceFixture.seedCapture(captureService);
    await captureService.appendExchanges([{ id: 'replaced-live', sessionId: 'session-1', method: 'POST',
      url: 'https://api.test/replaced-live', protocol: 'h2', startedAt: 3, state: 'response-streaming' }]);
    const bodyWriter = captureService.createBodyWriter('replaced-live', 'request');
    bodyWriter.write(Buffer.alloc(4 * 1024 * 1024, 0x61));
    await bodyWriter.snapshot();
    await captureService.updateExchange({ id: 'replaced-live', requestBody: {
      id: 'replacement', blobHash: finalHash, encodedSize: 17,
    } });
    await expect(captureService.readExchangeBodyRange('replaced-live', 'request', 0, 9))
      .resolves.toEqual(Buffer.from('temporary'));
    await captureService.cleanup({ kind: 'all' });
    await expect(bodyWriter.snapshot()).resolves.toMatchObject({ complete: true, available: false });
    expect(await fs.readdir(locations.captureTemp)).toEqual([]);
    await captureService.dispose();
  });

  it.each([false, true])('returns a Final replacement bound while its original snapshot is pending (stored=%s)', async (stored) => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const finalBodyHash = await captureServiceFixture.seedCapture(captureService);
    await captureService.appendExchanges([{ id: 'replaced-pending', sessionId: 'session-1', method: 'POST',
      url: 'https://api.test/replaced-pending', protocol: 'h2', startedAt: 3, state: 'response-streaming' }]);
    const bodyWriter = captureService.createBodyWriter('replaced-pending', 'request');
    bodyWriter.write(Buffer.from('original request'));
    await bodyWriter.snapshot();

    const snapshotting = captureService.getExchangeBodySnapshot('replaced-pending', 'request');
    await captureService.updateExchange({ id: 'replaced-pending', requestBody: stored
      ? { id: 'stored-final', blobHash: finalBodyHash, encodedSize: 17 }
      : { id: 'empty-final', encodedSize: 0 } });

    await expect(snapshotting).resolves.toEqual({
      bodyHash: stored ? finalBodyHash : undefined,
      encodedSize: stored ? 17 : 0,
      available: stored,
      complete: true,
    });
    await captureService.dispose();
  });

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
