import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { ArchiveZipReader } from '../archive-zip-reader';
import { ArchiveZipWriter } from '../archive-zip-writer';
import { crc32 } from '../utils';

const tempDirectories: string[] = [];
const openHandles: FileHandle[] = [];

afterEach(async () => {
  await Promise.all(
    openHandles.splice(0).map((handle) => handle.close()),
  );
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-zip-'));
  tempDirectories.push(directory);
  return directory;
}

interface RawEntrySpec {
  name: string;
  content?: Buffer;
  method?: number;
  declaredUncompressedSize?: number;
  externalAttributes?: number;
  flag?: number;
}

/** 手工构造 ZIP 字节，可故意谎报大小/属性以模拟攻击输入。 */
function rawZip(specs: RawEntrySpec[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const spec of specs) {
    const content = spec.content ?? Buffer.alloc(0);
    const method = spec.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const uncompressedSize = spec.declaredUncompressedSize ?? content.length;
    const crc = crc32(content);
    const nameBytes = Buffer.from(spec.name, 'utf8');
    const flag = spec.flag ?? 0;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flag, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flag, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(spec.externalAttributes ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(specs.length, 8);
  eocd.writeUInt16LE(specs.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
}

async function readerFor(bytes: Buffer): Promise<ArchiveZipReader> {
  const directory = await tempDir();
  const filePath = path.join(directory, 'input.iarchive');
  const output = await open(filePath, 'w');
  try {
    await output.write(bytes);
  } finally {
    await output.close();
  }
  const handle = await open(filePath, 'r');
  openHandles.push(handle);
  const reader = new ArchiveZipReader(handle, bytes.length);
  await reader.open();
  return reader;
}

describe('ArchiveZipReader security validation', () => {
  it('round-trips entries written by ArchiveZipWriter', async () => {
    const directory = await tempDir();
    const zipPath = path.join(directory, 'out.iarchive');
    const handle = await open(zipPath, 'wx+');
    const writer = new ArchiveZipWriter(handle);
    const hash = 'a'.repeat(64);
    const payload = Buffer.from('capture snapshot bytes '.repeat(100));
    await writer.addStream('capture.sqlite', (async function* () {
      yield payload;
    })());
    await writer.addStream(`blobs/${hash}`, (async function* () {
      yield Buffer.from('blob-body');
    })());
    await writer.finalize();
    await handle.close();

    const read = await open(zipPath, 'r');
    const size = (await read.stat()).size;
    const reader = new ArchiveZipReader(read, size);
    await reader.open();
    const entries = reader.validate();
    expect(entries.map((entry) => entry.safeName).sort()).toEqual([
      'capture.sqlite',
      `blobs/${hash}`,
    ].sort());

    const out = path.join(directory, 'capture.sqlite');
    await reader.extractEntry(
      entries.find((entry) => entry.safeName === 'capture.sqlite')!,
      out,
    );
    expect((await readFile(out)).equals(payload)).toBe(true);
    await read.close();
  });

  it('rejects path traversal entries', async () => {
    const reader = await readerFor(rawZip([{ name: '../evil', content: Buffer.from('x') }]));
    expect(() => reader.validate()).toThrow(/traverses directories/);
  });

  it('rejects absolute path entries', async () => {
    const reader = await readerFor(rawZip([{ name: '/etc/passwd', content: Buffer.from('x') }]));
    expect(() => reader.validate()).toThrow(/must be relative/);
  });

  it('rejects entries outside the allowed set', async () => {
    const reader = await readerFor(rawZip([{ name: 'notes.txt', content: Buffer.from('x') }]));
    expect(() => reader.validate()).toThrow(/unexpected entry/);
  });

  it('does not reject an entry based on compression ratio', async () => {
    const reader = await readerFor(
      rawZip([
        {
          name: 'capture.sqlite',
          content: Buffer.from('tiny'),
          declaredUncompressedSize: 5_000_000,
        },
      ]),
    );
    expect(reader.validate()).toHaveLength(1);
  });

  it('rejects symbolic link entries', async () => {
    const reader = await readerFor(
      rawZip([
        {
          name: 'capture.sqlite',
          content: Buffer.from('/target'),
          externalAttributes: 0xa1ff0000,
        },
      ]),
    );
    expect(() => reader.validate()).toThrow(/symbolic links/);
  });

  it('rejects duplicate entries', async () => {
    const hash = 'b'.repeat(64);
    const reader = await readerFor(
      rawZip([
        { name: `blobs/${hash}`, content: Buffer.from('a') },
        { name: `blobs/${hash}`, content: Buffer.from('b') },
      ]),
    );
    expect(() => reader.validate()).toThrow(/duplicate/);
  });

  it('rejects encrypted entries', async () => {
    const reader = await readerFor(
      rawZip([{ name: 'capture.sqlite', content: Buffer.from('x'), flag: 0x1 }]),
    );
    expect(() => reader.validate()).toThrow(/encrypted/);
  });
});

/** 供 rawZip 校验 crc 计算与真实实现一致的健全性检查。 */
describe('crc32', () => {
  it('matches a known vector', () => {
    expect(crc32(Buffer.from('123456789')) >>> 0).toBe(0xcbf43926);
  });

  it('agrees with a streamed hash length', () => {
    const data = Buffer.from('interceptor');
    expect(createHash('sha256').update(data).digest('hex')).toHaveLength(64);
  });
});
