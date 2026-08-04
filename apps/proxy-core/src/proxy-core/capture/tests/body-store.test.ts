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

import { BodyStore } from '../internal/body-store';

/** BodyStore 的临时目录与字节源夹具。 */
class BodyStoreFixture {
  /** 当前测试根目录。 */
  root = '';
  /** 当前 Store。 */
  bodyStore = new BodyStore();

  /** 重置 spill 阈值并初始化临时目录。 */
  async initialize(): Promise<void> {
    limits.memoryThresholdBytes = 1024 * 1024;
    this.root = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-body-'));
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

describe('BodyStore', () => {
  let bodyStoreFixture: BodyStoreFixture;

  beforeEach(async () => {
    bodyStoreFixture = new BodyStoreFixture();
    await bodyStoreFixture.initialize();
  });

  afterEach(async () => bodyStoreFixture.cleanup());

  it('keeps small bodies in memory and supports range/stream reads', async () => {
    const body = Buffer.from('0123456789');
    const stored = await bodyStoreFixture.bodyStore.writeStream(bodyStoreFixture.chunks(body));

    expect(stored).toMatchObject({ size: 10, deduplicated: false });
    expect(bodyStoreFixture.bodyStore.memoryBytes).toBe(10);
    expect(bodyStoreFixture.bodyStore.spillBytes).toBe(0);
    expect((await bodyStoreFixture.bodyStore.readRange(stored.hash, 2, 4)).toString()).toBe('2345');
    expect((await bodyStoreFixture.readAll(bodyStoreFixture.bodyStore.openReadStream(stored.hash))).toString())
      .toBe('0123456789');
  });

  it('spills large bodies asynchronously and deletes the spill on reset', async () => {
    limits.memoryThresholdBytes = 8;
    bodyStoreFixture.bodyStore = new BodyStore();
    await bodyStoreFixture.bodyStore.init();
    const body = Buffer.from('body larger than threshold');
    const stored = await bodyStoreFixture.bodyStore.writeStream(bodyStoreFixture.chunks(body, 3));

    expect(bodyStoreFixture.bodyStore.memoryBytes).toBe(0);
    expect(bodyStoreFixture.bodyStore.spillBytes).toBe(body.length);
    expect(await bodyStoreFixture.readAll(bodyStoreFixture.bodyStore.openReadStream(stored.hash)))
      .toEqual(body);
    expect(await fs.readdir(limits.captureTempDir)).toEqual([stored.hash]);

    await bodyStoreFixture.bodyStore.reset();
    expect(bodyStoreFixture.bodyStore.usageBytes).toBe(0);
    expect(await fs.readdir(limits.captureTempDir)).toEqual([]);
  });

  it('deduplicates identical content across memory writes', async () => {
    const body = Buffer.from('same content');
    const first = await bodyStoreFixture.bodyStore.writeStream(bodyStoreFixture.chunks(body));
    const second = await bodyStoreFixture.bodyStore.writeStream(bodyStoreFixture.chunks(body));

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(bodyStoreFixture.bodyStore.usageBytes).toBe(body.length);
  });

  it('garbage collects unreferenced memory and spill entries', async () => {
    limits.memoryThresholdBytes = 6;
    bodyStoreFixture.bodyStore = new BodyStore();
    await bodyStoreFixture.bodyStore.init();
    const keep = await bodyStoreFixture.bodyStore.writeStream(
      bodyStoreFixture.chunks(Buffer.from('keep')),
    );
    const drop = await bodyStoreFixture.bodyStore.writeStream(
      bodyStoreFixture.chunks(Buffer.from('drop this body')),
    );

    const result = await bodyStoreFixture.bodyStore.collectGarbage([keep.hash]);
    expect(result.removedBlobs).toBe(1);
    expect(await bodyStoreFixture.bodyStore.has(keep.hash)).toBe(true);
    expect(await bodyStoreFixture.bodyStore.has(drop.hash)).toBe(false);
  });

  it('stores a body larger than the former 64 MiB limit without truncation', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 0x61);
    const tail = Buffer.from('complete');
    const expectedSize = chunk.byteLength * 64 + tail.byteLength;

    const stored = await bodyStoreFixture.bodyStore.writeStream(
      bodyStoreFixture.repeatedChunks(chunk, 64, tail),
    );

    expect(stored.size).toBe(expectedSize);
    expect(bodyStoreFixture.bodyStore.usageBytes).toBe(expectedSize);
    expect(bodyStoreFixture.bodyStore.spillBytes).toBe(expectedSize);
    expect(await bodyStoreFixture.bodyStore.readRange(stored.hash, expectedSize - tail.length, tail.length))
      .toEqual(tail);
  }, 20_000);
});
