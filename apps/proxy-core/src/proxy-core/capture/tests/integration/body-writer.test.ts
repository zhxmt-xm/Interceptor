import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { limits } = vi.hoisted(() => ({
  limits: {
    memoryThresholdBytes: 1024 * 1024,
    pendingLimitBytes: 8 * 1024 * 1024,
    captureTempDir: '',
  },
}));

vi.mock('../../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../constants')>()),
  get BODY_MEMORY_THRESHOLD_BYTES() {
    return limits.memoryThresholdBytes;
  },
  get BODY_WRITER_PENDING_LIMIT_BYTES() {
    return limits.pendingLimitBytes;
  },
  get captureTempDirectory() {
    return limits.captureTempDir;
  },
}));

import { BodyStore } from '../../internal/body-store';

/** 增量写入器测试的临时目录夹具。 */
class BodyWriterFixture {
  /** 当前测试根目录。 */
  root = '';
  /** 当前 Store。 */
  bodyStore = new BodyStore();

  /** 重置阈值并初始化临时目录。 */
  async initialize(): Promise<void> {
    limits.memoryThresholdBytes = 1024 * 1024;
    limits.pendingLimitBytes = 8 * 1024 * 1024;
    this.root = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-writer-'));
    limits.captureTempDir = path.join(this.root, 'capture-temp');
    this.bodyStore = new BodyStore();
    await this.bodyStore.init();
  }

  /** 删除测试根目录。 */
  async cleanup(): Promise<void> {
    if (this.root) {
      await fs.rm(this.root, { recursive: true, force: true });
    }
  }

  /** 内存阈值在 Store 构造时快照，因此修改后必须重建。 */
  async useMemoryThreshold(bytes: number): Promise<void> {
    limits.memoryThresholdBytes = bytes;
    this.bodyStore = new BodyStore();
    await this.bodyStore.init();
  }

  /** 当前 spill 目录下的文件名列表。 */
  async spillFiles(): Promise<string[]> {
    return fs.readdir(limits.captureTempDir);
  }
}

describe('BodyWriter', () => {
  const bodyWriterFixture = new BodyWriterFixture();

  beforeEach(async () => {
    await bodyWriterFixture.initialize();
  });

  afterEach(async () => {
    await bodyWriterFixture.cleanup();
  });

  it('hashes incrementally written chunks identically to a single write', async () => {
    const writer = bodyWriterFixture.bodyStore.createWriter();
    writer.write(Buffer.from('hello '));
    writer.write(Buffer.from('incremental '));
    writer.write(Buffer.from('world'));
    const result = await writer.finalize();

    const expected = Buffer.from('hello incremental world');
    expect(result).not.toBeNull();
    expect(result?.size).toBe(expected.byteLength);
    expect(result?.hash).toBe(
      createHash('sha256').update(expected).digest('hex'),
    );
    expect(
      await bodyWriterFixture.bodyStore.readRange(result!.hash, 0, expected.byteLength),
    ).toEqual(expected);
  });

  it('reports observed bytes as chunks arrive, before finalize', async () => {
    const writer = bodyWriterFixture.bodyStore.createWriter();
    expect(writer.observedBytes).toBe(0);
    writer.write(Buffer.alloc(10));
    expect(writer.observedBytes).toBe(10);
    writer.write(Buffer.alloc(25));
    expect(writer.observedBytes).toBe(35);
    await writer.finalize();
  });

  it.each([64, 4])('reads a bounded live range with a %s-byte memory threshold', async (threshold) => {
    await bodyWriterFixture.useMemoryThreshold(threshold);
    const bodyWriter = bodyWriterFixture.bodyStore.createWriter();
    bodyWriter.write(Buffer.from('first'));
    bodyWriter.write(Buffer.from('-second'));

    await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 12, available: true, complete: false });
    await expect(bodyWriter.readRange(3, 5)).resolves.toEqual(Buffer.from('st-se'));
    await expect(bodyWriter.readRange(10, 10)).resolves.toEqual(Buffer.from('nd'));
    await expect(bodyWriter.readRange(20, 5)).resolves.toEqual(Buffer.alloc(0));
    expect(bodyWriterFixture.bodyStore.usageBytes).toBe(0);

    bodyWriter.write(Buffer.from('-third'));
    await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 18, available: true, complete: false });
    await expect(bodyWriter.readRange(12, 6)).resolves.toEqual(Buffer.from('-third'));
    const result = await bodyWriter.finalize();
    expect(result?.hash).toBe(createHash('sha256').update('first-second-third').digest('hex'));
  });

  it.each(['finalize', 'abort'] as const)('finishes a queued live read before %s closes the spill', async (ending) => {
    await bodyWriterFixture.useMemoryThreshold(4);
    const bodyWriter = bodyWriterFixture.bodyStore.createWriter();
    bodyWriter.write(Buffer.from('first-second'));
    const read = bodyWriter.readRange(3, 5);
    const finished = bodyWriter[ending]();
    await expect(read).resolves.toEqual(Buffer.from('st-se'));
    await finished;
    await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 12,
      available: ending === 'finalize', complete: true });
  });

  it('does not return partial live bytes after the writer degrades', async () => {
    limits.pendingLimitBytes = 8;
    const bodyWriter = bodyWriterFixture.bodyStore.createWriter();
    bodyWriter.write(Buffer.from('four'));
    bodyWriter.write(Buffer.alloc(16, 1));
    await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 0, available: false, complete: false });
    await expect(bodyWriter.readRange(0, 5)).resolves.toEqual(Buffer.alloc(0));
    await expect(bodyWriter.finalize()).resolves.toBeNull();
  });

  it('marks a failed spill commit as complete and unavailable', async () => {
    await bodyWriterFixture.useMemoryThreshold(4);
    const bodyWriter = bodyWriterFixture.bodyStore.createWriter();
    bodyWriter.write(Buffer.from('first-second'));
    await bodyWriter.snapshot();
    const commitError = Object.assign(new Error('Spill rename failed.'), { code: 'EACCES' });
    const renameSpill = vi.spyOn(fs, 'rename').mockRejectedValueOnce(commitError);

    try {
      await expect(bodyWriter.finalize()).rejects.toBe(commitError);
      await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 0, available: false, complete: true });
      expect(bodyWriter.bodyHash).toBeUndefined();
      await expect(bodyWriter.readRange(0, 5)).resolves.toEqual(Buffer.alloc(0));
      expect(bodyWriter.observedBytes).toBe(12);
      expect(bodyWriterFixture.bodyStore.usageBytes).toBe(0);
      expect(await bodyWriterFixture.spillFiles()).toEqual([]);
    } finally {
      renameSpill.mockRestore();
    }
  });

  it('returns null for an empty body without creating an entry', async () => {
    const writer = bodyWriterFixture.bodyStore.createWriter();
    const result = await writer.finalize();
    expect(result).toBeNull();
    expect(bodyWriterFixture.bodyStore.usageBytes).toBe(0);
  });

  it('spills to disk once the accumulated size crosses the memory threshold', async () => {
    await bodyWriterFixture.useMemoryThreshold(64);
    const writer = bodyWriterFixture.bodyStore.createWriter();
    // 每片都小于阈值，只有累计后才跨过——这是增量写入相对整体写入的关键差异。
    for (let index = 0; index < 8; index += 1) {
      writer.write(Buffer.alloc(32, index));
    }
    const result = await writer.finalize();

    expect(result?.size).toBe(256);
    const files = await bodyWriterFixture.spillFiles();
    expect(files).toContain(result?.hash);
    expect(await bodyWriterFixture.bodyStore.readRange(result!.hash, 0, 32)).toEqual(
      Buffer.alloc(32, 0),
    );
  });

  it('degrades to counting only once the pending queue limit is exceeded', async () => {
    limits.pendingLimitBytes = 128;
    const writer = bodyWriterFixture.bodyStore.createWriter();
    writer.write(Buffer.alloc(64, 1));
    writer.write(Buffer.alloc(512, 2));

    expect(writer.degraded).toBe(true);
    expect(writer.observedBytes).toBe(576);
    await expect(writer.finalize()).resolves.toBeNull();
    expect(bodyWriterFixture.bodyStore.usageBytes).toBe(0);
  });

  it.each(['finalize', 'abort'] as const)('bounds concurrent stalled spill queues until %s finishes', async (ending) => {
    const slowBodyWriters = Array.from({ length: 4 }, () => bodyWriterFixture.bodyStore.createWriter());
    const independentBodyWriter = bodyWriterFixture.bodyStore.createWriter();
    const chunk = Buffer.alloc(2 * 1024 * 1024, 0x71);
    const chunksAtLimit = limits.pendingLimitBytes / chunk.byteLength;
    let releaseSpills!: () => void;
    const spillGate = new Promise<void>((resolve) => { releaseSpills = resolve; });
    let notifySpillsStarted!: () => void;
    const spillsStarted = new Promise<void>((resolve) => { notifySpillsStarted = resolve; });
    let blockedSpills = 0;
    const originalOpen = fs.open.bind(fs);
    const openSpill = vi.spyOn(fs, 'open').mockImplementation(async (...parameters) => {
      if (blockedSpills < slowBodyWriters.length) {
        blockedSpills += 1;
        if (blockedSpills === slowBodyWriters.length) notifySpillsStarted();
        await spillGate;
      }
      return originalOpen(...parameters);
    });
    const copyBuffer = vi.spyOn(Buffer, 'from');

    try {
      for (const bodyWriter of slowBodyWriters) bodyWriter.write(chunk);
      await spillsStarted;
      for (let chunkIndex = 1; chunkIndex < chunksAtLimit; chunkIndex += 1) {
        for (const bodyWriter of slowBodyWriters) bodyWriter.write(chunk);
      }
      for (const bodyWriter of slowBodyWriters) {
        expect(bodyWriter.degraded).toBe(false);
        expect(bodyWriter.observedBytes).toBe(limits.pendingLimitBytes);
      }
      const acceptedCopies = slowBodyWriters.length * chunksAtLimit;
      expect(copyBuffer.mock.calls.filter(([source]) => source === chunk)).toHaveLength(acceptedCopies);
      for (let chunkIndex = 0; chunkIndex < 16; chunkIndex += 1) {
        for (const bodyWriter of slowBodyWriters) bodyWriter.write(chunk);
      }
      expect(copyBuffer.mock.calls.filter(([source]) => source === chunk)).toHaveLength(acceptedCopies);
      for (const bodyWriter of slowBodyWriters) {
        expect(bodyWriter.degraded).toBe(true);
        expect(bodyWriter.observedBytes).toBe(limits.pendingLimitBytes + 16 * chunk.byteLength);
      }
      const finishing = Promise.all(slowBodyWriters.map((bodyWriter) => bodyWriter[ending]()));
      let finished = false;
      void finishing.then(() => { finished = true; }, () => undefined);
      const independentBody = Buffer.alloc(chunk.byteLength, 0x35);
      independentBodyWriter.write(independentBody);
      const stored = await independentBodyWriter.finalize();
      expect(stored?.size).toBe(independentBody.byteLength);
      expect(stored?.hash).toBe(createHash('sha256').update(independentBody).digest('hex'));
      expect(finished).toBe(false);

      releaseSpills();
      expect(await finishing).toEqual(slowBodyWriters.map(() => ending === 'finalize' ? null : undefined));
      for (const bodyWriter of slowBodyWriters) {
        await expect(bodyWriter.snapshot()).resolves.toEqual({ encodedSize: 0, available: false, complete: true });
        await expect(bodyWriter.readRange(0, 16)).resolves.toEqual(Buffer.alloc(0));
      }
      expect(await bodyWriterFixture.spillFiles()).toEqual([stored!.hash]);
      expect(bodyWriterFixture.bodyStore.usageBytes).toBe(independentBody.byteLength);
      const savedBody = await bodyWriterFixture.bodyStore.readRange(stored!.hash, 0, independentBody.byteLength);
      expect(savedBody.equals(independentBody)).toBe(true);
    } finally {
      releaseSpills();
      await Promise.all([...slowBodyWriters, independentBodyWriter].map((bodyWriter) => bodyWriter.abort()));
      copyBuffer.mockRestore();
      openSpill.mockRestore();
    }
  });

  it('removes half-written spill files when aborted', async () => {
    await bodyWriterFixture.useMemoryThreshold(16);
    const writer = bodyWriterFixture.bodyStore.createWriter();
    writer.write(Buffer.alloc(128, 7));
    await writer.abort();

    expect(await bodyWriterFixture.spillFiles()).toHaveLength(0);
    expect(bodyWriterFixture.bodyStore.usageBytes).toBe(0);
  });

  it('deduplicates identical bodies written through separate writers', async () => {
    const first = bodyWriterFixture.bodyStore.createWriter();
    first.write(Buffer.from('same-content'));
    const firstResult = await first.finalize();

    const second = bodyWriterFixture.bodyStore.createWriter();
    second.write(Buffer.from('same-'));
    second.write(Buffer.from('content'));
    const secondResult = await second.finalize();

    expect(secondResult?.hash).toBe(firstResult?.hash);
    expect(secondResult?.deduplicated).toBe(true);
    expect(bodyWriterFixture.bodyStore.usageBytes).toBe(12);
  });
});
