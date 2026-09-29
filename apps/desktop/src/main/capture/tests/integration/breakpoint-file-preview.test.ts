import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBreakpointBodyFile } from '../../read-breakpoint-body-file';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-preview-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('selected body file preview', () => {
  it('returns a bounded JSON prefix and preserves the full selected file identity', async () => {
    const source = Buffer.from(`{"data":"${'a'.repeat(3 * 1024 * 1024)}"}`);
    const filePath = path.join(directory, 'body.json');
    await writeFile(filePath, source);
    const file = await readBreakpointBodyFile(filePath);
    expect(file).toMatchObject({
      path: filePath, name: 'body.json', size: source.length, mediaType: 'application/json',
      preview: { truncated: true },
    });
    expect(file.preview?.bytes.byteLength).toBe(2 * 1024 * 1024);
    expect(Buffer.from(file.preview!.bytes).equals(source.subarray(0, 2 * 1024 * 1024))).toBe(true);
    expect((await readFile(filePath)).equals(source)).toBe(true);
  });

  it('keeps a complete 2 MiB text preview complete', async () => {
    const filePath = path.join(directory, 'body.txt');
    await writeFile(filePath, Buffer.alloc(2 * 1024 * 1024, 65));
    const file = await readBreakpointBodyFile(filePath);
    expect(file).toMatchObject({ preview: { truncated: false } });
  });

  it.each(['png', 'mp4', 'bin'])('retains only metadata for an over-limit or non-previewable .%s file', async extension => {
    const filePath = path.join(directory, `body.${extension}`);
    await writeFile(filePath, Buffer.alloc(17 * 1024 * 1024));
    const file = await readBreakpointBodyFile(filePath);
    expect(file).not.toHaveProperty('preview');
    expect(file).not.toHaveProperty('text');
    expect(file.mediaType).not.toBe('text/plain');
  });

  it('returns complete image bytes independently of the text budget', async () => {
    const filePath = path.join(directory, 'body.png');
    const source = Buffer.alloc(3 * 1024 * 1024, 137);
    await writeFile(filePath, source);
    const file = await readBreakpointBodyFile(filePath);
    expect(file).toMatchObject({ mediaType: 'image/png', preview: { truncated: false } });
    expect(Buffer.from(file.preview!.bytes).equals(source)).toBe(true);
  });

  it('includes a complete image at exactly 16 MiB and excludes one byte more', async () => {
    const filePath = path.join(directory, 'boundary.png');
    await writeFile(filePath, Buffer.alloc(16 * 1024 * 1024, 137));
    expect((await readBreakpointBodyFile(filePath)).preview?.bytes.byteLength).toBe(16 * 1024 * 1024);
    await writeFile(filePath, Buffer.alloc(16 * 1024 * 1024 + 1, 137));
    expect(await readBreakpointBodyFile(filePath)).not.toHaveProperty('preview');
  });

  it('rejects an unreadable path explicitly', async () => {
    await expect(readBreakpointBodyFile(path.join(directory, 'missing.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
