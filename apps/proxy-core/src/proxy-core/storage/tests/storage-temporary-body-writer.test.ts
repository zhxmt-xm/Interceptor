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

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
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

import { TemporaryBodyStore } from '../storage-temporary-body-store';

/** 增量写入器测试的临时目录夹具。 */
class BodyWriterFixture {
  /** 当前测试根目录。 */
  root = '';
  /** 当前 Store。 */
  store = new TemporaryBodyStore();

  /** 重置阈值并初始化临时目录。 */
  async initialize(): Promise<void> {
    limits.memoryThresholdBytes = 1024 * 1024;
    limits.pendingLimitBytes = 8 * 1024 * 1024;
    this.root = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-writer-'));
    limits.captureTempDir = path.join(this.root, 'capture-temp');
    this.store = new TemporaryBodyStore();
    await this.store.init();
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
    this.store = new TemporaryBodyStore();
    await this.store.init();
  }

  /** 当前 spill 目录下的文件名列表。 */
  async spillFiles(): Promise<string[]> {
    return fs.readdir(limits.captureTempDir);
  }
}

describe('TemporaryBodyWriter', () => {
  const fixture = new BodyWriterFixture();

  beforeEach(async () => {
    await fixture.initialize();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('hashes incrementally written chunks identically to a single write', async () => {
    const writer = fixture.store.createWriter();
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
      await fixture.store.readRange(result!.hash, 0, expected.byteLength),
    ).toEqual(expected);
  });

  it('reports observed bytes as chunks arrive, before finalize', async () => {
    const writer = fixture.store.createWriter();
    expect(writer.observedBytes).toBe(0);
    writer.write(Buffer.alloc(10));
    expect(writer.observedBytes).toBe(10);
    writer.write(Buffer.alloc(25));
    expect(writer.observedBytes).toBe(35);
    await writer.finalize();
  });

  it('returns null for an empty body without creating an entry', async () => {
    const writer = fixture.store.createWriter();
    const result = await writer.finalize();
    expect(result).toBeNull();
    expect(fixture.store.usageBytes).toBe(0);
  });

  it('spills to disk once the accumulated size crosses the memory threshold', async () => {
    await fixture.useMemoryThreshold(64);
    const writer = fixture.store.createWriter();
    // 每片都小于阈值，只有累计后才跨过——这是增量写入相对整体写入的关键差异。
    for (let index = 0; index < 8; index += 1) {
      writer.write(Buffer.alloc(32, index));
    }
    const result = await writer.finalize();

    expect(result?.size).toBe(256);
    const files = await fixture.spillFiles();
    expect(files).toContain(result?.hash);
    expect(await fixture.store.readRange(result!.hash, 0, 32)).toEqual(
      Buffer.alloc(32, 0),
    );
  });

  it('degrades to counting only once the pending queue limit is exceeded', async () => {
    limits.pendingLimitBytes = 128;
    const writer = fixture.store.createWriter();
    writer.write(Buffer.alloc(64, 1));
    writer.write(Buffer.alloc(512, 2));

    expect(writer.degraded).toBe(true);
    expect(writer.observedBytes).toBe(576);
    await expect(writer.finalize()).resolves.toBeNull();
    expect(fixture.store.usageBytes).toBe(0);
  });

  it('removes half-written spill files when aborted', async () => {
    await fixture.useMemoryThreshold(16);
    const writer = fixture.store.createWriter();
    writer.write(Buffer.alloc(128, 7));
    await writer.abort();

    expect(await fixture.spillFiles()).toHaveLength(0);
    expect(fixture.store.usageBytes).toBe(0);
  });

  it('deduplicates identical bodies written through separate writers', async () => {
    const first = fixture.store.createWriter();
    first.write(Buffer.from('same-content'));
    const firstResult = await first.finalize();

    const second = fixture.store.createWriter();
    second.write(Buffer.from('same-'));
    second.write(Buffer.from('content'));
    const secondResult = await second.finalize();

    expect(secondResult?.hash).toBe(firstResult?.hash);
    expect(secondResult?.deduplicated).toBe(true);
    expect(fixture.store.usageBytes).toBe(12);
  });
});
