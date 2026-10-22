import { promises as fs } from 'node:fs';
import { rename, type FileHandle } from 'node:fs/promises';
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

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

import { CaptureService } from '../../entry';
import { BodyStore } from '../../internal/body-store';
import { TransferService } from '../../../transfer/entry';

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

  it.each([
    { side: 'request', bytes: 32 },
    { side: 'request', bytes: 4 * 1024 * 1024 },
    { side: 'response', bytes: 32 },
    { side: 'response', bytes: 4 * 1024 * 1024 },
  ] as const)('keeps $bytes-byte $side Original separate from the current Final writer', async ({ side, bytes }) => {
    const captureService = new CaptureService();
    await captureService.initialize();
    try {
      await captureServiceFixture.seedCapture(captureService);
      await captureService.appendExchanges([{ id: 'dual-body', sessionId: 'session-1', method: 'POST',
        url: 'https://api.test/dual-body', protocol: 'h1', startedAt: 3, state: 'response-streaming' }]);
      const finalWriter = captureService.createBodyWriter('dual-body', side);
      const originalWriter = captureService.createOriginalBodyWriter('dual-body', side);
      const finalBody = Buffer.alloc(bytes, 0x66);
      const originalBody = Buffer.alloc(bytes, 0x6f);
      finalWriter.write(finalBody);
      originalWriter.write(originalBody);

      await expect(captureService.getExchangeBodySnapshot('dual-body', side)).resolves.toMatchObject({
        encodedSize: bytes, available: true, complete: false, bodyHash: undefined,
      });
      expect((await captureService.readExchangeBodyRange('dual-body', side, 0, bytes)).equals(finalBody)).toBe(true);
      expect((await originalWriter.readRange(0, bytes)).equals(originalBody)).toBe(true);
      const originalResult = await originalWriter.finalize();
      const finalResult = await finalWriter.finalize();
      expect(originalResult?.hash).not.toBe(finalResult?.hash);
      expect(originalResult?.size).toBe(bytes);
      expect(finalResult?.size).toBe(bytes);
      expect((await captureService.readBodyRange(originalResult!.hash, 0, bytes)).equals(originalBody)).toBe(true);
      expect((await captureService.readBodyRange(finalResult!.hash, 0, bytes)).equals(finalBody)).toBe(true);
    } finally {
      await captureService.dispose();
    }
  });

  it.each(['all', 'session', 'dispose'] as const)('drains HTTP and both WebSocket writers before %s cleanup', async (operation) => {
    const captureService = new CaptureService();
    await captureService.initialize();
    try {
      await captureServiceFixture.seedCapture(captureService);
      await captureService.appendExchanges([{ id: 'dual-cleanup', sessionId: 'session-1', method: 'POST',
        url: 'https://api.test/dual-cleanup', protocol: 'h1', startedAt: 3, state: 'response-streaming' }]);
      const bodyWriters = [
        captureService.createBodyWriter('dual-cleanup', 'request'),
        captureService.createBodyWriter('dual-cleanup', 'response'),
        captureService.createOriginalBodyWriter('dual-cleanup', 'request'),
        captureService.createOriginalBodyWriter('dual-cleanup', 'response'),
        captureService.createWebSocketBodyWriter('dual-cleanup', 'client-to-server'),
        captureService.createWebSocketBodyWriter('dual-cleanup', 'server-to-client'),
      ];
      const bodySize = 4 * 1024 * 1024;
      for (const [index, bodyWriter] of bodyWriters.entries()) {
        bodyWriter.write(Buffer.alloc(bodySize, 0x61 + index));
        await expect(bodyWriter.snapshot()).resolves.toMatchObject({
          encodedSize: bodySize, available: true, complete: false,
        });
      }
      expect(await fs.readdir(locations.captureTemp)).toHaveLength(6);
      expect(await captureService.readExchangeBodyRange('dual-cleanup', 'request', 0, 32)).toEqual(Buffer.alloc(32, 0x61));
      expect(await captureService.readExchangeBodyRange('dual-cleanup', 'response', 0, 32)).toEqual(Buffer.alloc(32, 0x62));
      const reading = bodyWriters.map((bodyWriter) => bodyWriter.readRange(bodySize - 32, 32));
      const clearing = operation === 'dispose' ? captureService.dispose()
        : captureService.cleanup(operation === 'all' ? { kind: 'all' } : { kind: 'session', sessionId: 'session-1' });
      for (const [index, read] of reading.entries()) {
        await expect(read).resolves.toEqual(Buffer.alloc(32, 0x61 + index));
      }
      await clearing;
      for (const bodyWriter of bodyWriters) {
        await expect(bodyWriter.snapshot()).resolves.toMatchObject({ complete: true, available: false });
      }
      if (operation === 'dispose') {
        await expect(fs.stat(locations.captureTemp)).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        expect(await fs.readdir(locations.captureTemp)).toEqual([]);
      }
    } finally {
      await captureService.dispose();
    }
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

  it('preserves the original file when body export is cancelled during sync', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const bodyHash = await captureServiceFixture.seedCapture(captureService);
    const destination = path.join(captureServiceFixture.directory, 'cancel-before-commit.bin');
    const originalFile = await fs.open(destination, 'w');
    await originalFile.writeFile('original file');
    await originalFile.close();
    const prototype = Object.getPrototypeOf(originalFile) as FileHandle;
    const syncFile = prototype.sync;
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => { releaseSync = resolve; });
    let notifySyncStarted!: () => void;
    const syncStarted = new Promise<void>((resolve) => { notifySyncStarted = resolve; });
    vi.spyOn(prototype, 'sync').mockImplementationOnce(async function (this: FileHandle) {
      await syncFile.call(this);
      notifySyncStarted();
      await syncGate;
    });
    const abortController = new AbortController();
    const exporting = captureService.exportBodyToFile(bodyHash, destination, abortController.signal, () => undefined);
    void exporting.catch(() => undefined);
    try {
      await syncStarted;
      abortController.abort();
      releaseSync();
      await expect(exporting).rejects.toMatchObject({ name: 'AbortError' });
      expect(await fs.readFile(destination, 'utf8')).toBe('original file');
      expect((await fs.readdir(captureServiceFixture.directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      releaseSync();
      await exporting.catch(() => undefined);
      await captureService.dispose();
    }
  });

  it('reports a body export as completed when cancellation races after its rename', async () => {
    const captureService = new CaptureService();
    await captureService.initialize();
    const bodyHash = await captureServiceFixture.seedCapture(captureService);
    const transferService = new TransferService();
    const completed = vi.fn();
    transferService.onCompleted(completed);
    const destination = path.join(captureServiceFixture.directory, 'cancel-after-commit.bin');
    await fs.writeFile(destination, 'original file');
    let releaseRename!: () => void;
    const renameGate = new Promise<void>((resolve) => { releaseRename = resolve; });
    let notifyRenamed!: () => void;
    const renamed = new Promise<void>((resolve) => { notifyRenamed = resolve; });
    vi.mocked(rename).mockImplementationOnce(async (source, target) => {
      await fs.rename(source, target);
      notifyRenamed();
      await renameGate;
    });
    let exporting!: ReturnType<CaptureService['exportBodyToFile']>;
    transferService.start('body-commit', 'body-export', destination, (abortSignal, progress) => {
      exporting = captureService.exportBodyToFile(bodyHash, destination, abortSignal, progress);
      return exporting;
    });
    try {
      await renamed;
      const cancellation = Promise.resolve(transferService.cancel('body-commit'));
      releaseRename();
      await exporting;
      await expect(cancellation).resolves.toMatchObject({ state: 'completed', processed: 17, total: 17 });
      expect(await fs.readFile(destination, 'utf8')).toBe('temporary payload');
      expect(completed).toHaveBeenCalledExactlyOnceWith('body-export');
      expect((await fs.readdir(captureServiceFixture.directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      releaseRename();
      await exporting.catch(() => undefined);
      await transferService.cancelAll();
      await captureService.dispose();
    }
  });

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
