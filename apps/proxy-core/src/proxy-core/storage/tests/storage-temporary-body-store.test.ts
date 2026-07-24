import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { limits } = vi.hoisted(() => ({
  limits: {
    memoryThresholdBytes: 1024 * 1024,
    captureTempDir: '',
  },
}));

vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  get BODY_MEMORY_THRESHOLD_BYTES() {
    return limits.memoryThresholdBytes;
  },
  get captureTempDirectory() {
    return limits.captureTempDir;
  },
}));

import { TemporaryBodyStore } from '../storage-temporary-body-store';

/** TemporaryBodyStore 的临时目录与字节源夹具。 */
class TemporaryBodyStoreFixture {
  /** 当前测试根目录。 */
  root = '';
  /** 当前 Store。 */
  store = new TemporaryBodyStore();

  /** 重置 spill 阈值并初始化临时目录。 */
  async initialize(): Promise<void> {
    limits.memoryThresholdBytes = 1024 * 1024;
    this.root = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-body-'));
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

  /** 把 Buffer 按指定大小切成异步 chunk。 */
  async *chunks(
    data: Buffer,
    chunkSize = 4,
  ): AsyncIterable<Uint8Array> {
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      yield data.subarray(offset, offset + chunkSize);
    }
  }

  /** 生成不预先聚合到内存的重复大块正文。 */
  async *repeatedChunks(
    chunk: Buffer,
    count: number,
    tail: Buffer,
  ): AsyncIterable<Uint8Array> {
    for (let index = 0; index < count; index += 1) {
      yield chunk;
    }
    yield tail;
  }

  /** 读取异步流的全部内容。 */
  async readAll(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

describe('TemporaryBodyStore', () => {
  let fixture: TemporaryBodyStoreFixture;

  beforeEach(async () => {
    fixture = new TemporaryBodyStoreFixture();
    await fixture.initialize();
  });

  afterEach(async () => fixture.cleanup());

  it('keeps small bodies in memory and supports range/stream reads', async () => {
    const body = Buffer.from('0123456789');
    const stored = await fixture.store.writeStream(fixture.chunks(body));

    expect(stored).toMatchObject({ size: 10, deduplicated: false });
    expect(fixture.store.memoryBytes).toBe(10);
    expect(fixture.store.spillBytes).toBe(0);
    expect((await fixture.store.readRange(stored.hash, 2, 4)).toString()).toBe('2345');
    expect((await fixture.readAll(fixture.store.openReadStream(stored.hash))).toString())
      .toBe('0123456789');
  });

  it('spills large bodies asynchronously and deletes the spill on reset', async () => {
    limits.memoryThresholdBytes = 8;
    fixture.store = new TemporaryBodyStore();
    await fixture.store.init();
    const body = Buffer.from('body larger than threshold');
    const stored = await fixture.store.writeStream(fixture.chunks(body, 3));

    expect(fixture.store.memoryBytes).toBe(0);
    expect(fixture.store.spillBytes).toBe(body.length);
    expect(await fixture.readAll(fixture.store.openReadStream(stored.hash)))
      .toEqual(body);
    expect(await fs.readdir(limits.captureTempDir)).toEqual([stored.hash]);

    await fixture.store.reset();
    expect(fixture.store.usageBytes).toBe(0);
    expect(await fs.readdir(limits.captureTempDir)).toEqual([]);
  });

  it('deduplicates identical content across memory writes', async () => {
    const body = Buffer.from('same content');
    const first = await fixture.store.writeStream(fixture.chunks(body));
    const second = await fixture.store.writeStream(fixture.chunks(body));

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(fixture.store.usageBytes).toBe(body.length);
  });

  it('garbage collects unreferenced memory and spill entries', async () => {
    limits.memoryThresholdBytes = 6;
    fixture.store = new TemporaryBodyStore();
    await fixture.store.init();
    const keep = await fixture.store.writeStream(
      fixture.chunks(Buffer.from('keep')),
    );
    const drop = await fixture.store.writeStream(
      fixture.chunks(Buffer.from('drop this body')),
    );

    const result = await fixture.store.collectGarbage([keep.hash]);
    expect(result.removedBlobs).toBe(1);
    expect(await fixture.store.has(keep.hash)).toBe(true);
    expect(await fixture.store.has(drop.hash)).toBe(false);
  });

  it('stores a body larger than the former 64 MiB limit without truncation', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 0x61);
    const tail = Buffer.from('complete');
    const expectedSize = chunk.byteLength * 64 + tail.byteLength;

    const stored = await fixture.store.writeStream(
      fixture.repeatedChunks(chunk, 64, tail),
    );

    expect(stored.size).toBe(expectedSize);
    expect(fixture.store.usageBytes).toBe(expectedSize);
    expect(fixture.store.spillBytes).toBe(expectedSize);
    expect(await fixture.store.readRange(stored.hash, expectedSize - tail.length, tail.length))
      .toEqual(tail);
  }, 20_000);
});
