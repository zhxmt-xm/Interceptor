import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BlobQuotaExceededError,
  BlobStore,
  BlobTooLargeError,
} from '../blob-store';

async function* chunksOf(data: Buffer, chunkSize = 4): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    yield data.subarray(offset, offset + chunkSize);
  }
}

describe('BlobStore', () => {
  let rootDir: string;
  let store: BlobStore;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-blob-'));
    store = new BlobStore({ rootDir });
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('writes content and deduplicates identical bodies', async () => {
    const body = Buffer.from('hello content-addressed world');
    const first = await store.writeStream(chunksOf(body));
    expect(first.deduplicated).toBe(false);
    expect(first.size).toBe(body.length);
    expect(await store.has(first.hash)).toBe(true);

    const usageAfterFirst = store.usageBytes;
    const second = await store.writeStream(chunksOf(body));
    expect(second.hash).toBe(first.hash);
    expect(second.deduplicated).toBe(true);
    expect(store.usageBytes).toBe(usageAfterFirst);
  });

  it('reads a byte range from a stored blob', async () => {
    const body = Buffer.from('0123456789');
    const { hash } = await store.writeStream(chunksOf(body));
    const range = await store.readRange(hash, 2, 4);
    expect(range.toString()).toBe('2345');
  });

  it('rejects a body over the per-body limit without leaving partial files', async () => {
    store = new BlobStore({ rootDir, maxBodyBytes: 8 });
    await store.init();
    await expect(
      store.writeStream(chunksOf(Buffer.from('way too long body'))),
    ).rejects.toBeInstanceOf(BlobTooLargeError);
    const tempEntries = await fs.readdir(path.join(rootDir, 'tmp'));
    expect(tempEntries).toEqual([]);
  });

  it('rejects a write that would exceed the global quota', async () => {
    store = new BlobStore({ rootDir, globalQuotaBytes: 4 });
    await store.init();
    await expect(
      store.writeStream(chunksOf(Buffer.from('12345'))),
    ).rejects.toBeInstanceOf(BlobQuotaExceededError);
  });

  it('collects unreferenced blobs and keeps referenced ones', async () => {
    const keep = await store.writeStream(chunksOf(Buffer.from('keep me')));
    const drop = await store.writeStream(chunksOf(Buffer.from('drop me')));

    const result = await store.collectGarbage([keep.hash]);
    expect(result.removedBlobs).toBe(1);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(await store.has(keep.hash)).toBe(true);
    expect(await store.has(drop.hash)).toBe(false);
  });

  it('cleans stale temp files on init for crash safety', async () => {
    const stale = path.join(rootDir, 'tmp', 'leftover.tmp');
    await fs.writeFile(stale, 'partial');
    const reopened = new BlobStore({ rootDir });
    await reopened.init();
    await expect(fs.access(stale)).rejects.toThrow();
  });
});
