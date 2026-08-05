import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { decodeBody, decodeBodyStream } from '../utils';

const TEXT = 'hello http/2 content decoding — 压缩测试 🎈';
const RAW = new TextEncoder().encode(TEXT);

function decodeText(data: Uint8Array): string {
  return new TextDecoder('utf-8').decode(data);
}

describe('decodeBody', () => {
  it('decodes gzip', async () => {
    const result = await decodeBody(new Uint8Array(zlib.gzipSync(RAW)), 'gzip');
    expect(result.status).toBe('ok');
    expect(decodeText(result.data)).toBe(TEXT);
  });

  it('decodes deflate (zlib-wrapped)', async () => {
    const result = await decodeBody(
      new Uint8Array(zlib.deflateSync(RAW)),
      'deflate',
    );
    expect(result.status).toBe('ok');
    expect(decodeText(result.data)).toBe(TEXT);
  });

  it('decodes deflate (raw)', async () => {
    const result = await decodeBody(
      new Uint8Array(zlib.deflateRawSync(RAW)),
      'deflate',
    );
    expect(result.status).toBe('ok');
    expect(decodeText(result.data)).toBe(TEXT);
  });

  it('decodes brotli', async () => {
    const result = await decodeBody(
      new Uint8Array(zlib.brotliCompressSync(RAW)),
      'br',
    );
    expect(result.status).toBe('ok');
    expect(decodeText(result.data)).toBe(TEXT);
  });

  it('decodes multi-layer encoding in reverse (gzip, br)', async () => {
    // Content-Encoding 顺序为应用顺序：先 gzip 再 br。
    const layered = zlib.brotliCompressSync(zlib.gzipSync(RAW));
    const result = await decodeBody(new Uint8Array(layered), 'gzip, br');
    expect(result.status).toBe('ok');
    expect(decodeText(result.data)).toBe(TEXT);
  });

  it('skips when no content-encoding', async () => {
    const result = await decodeBody(RAW, undefined);
    expect(result.status).toBe('skipped');
    expect(result.data).toBe(RAW);
  });

  it('skips identity encoding', async () => {
    const result = await decodeBody(RAW, 'identity');
    expect(result.status).toBe('skipped');
    expect(result.data).toBe(RAW);
  });

  it('skips unsupported encoding without touching data', async () => {
    const result = await decodeBody(RAW, 'compress');
    expect(result.status).toBe('skipped');
    expect(result.data).toBe(RAW);
  });

  it('returns failed on corrupt gzip without throwing', async () => {
    const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03]);
    const result = await decodeBody(corrupt, 'gzip');
    expect(result.status).toBe('failed');
    expect(result.data).toBe(corrupt);
  });

  it('returns a finite decoded prefix when output exceeds the preview limit', async () => {
    const raw = Buffer.alloc(128 * 1024, 0x61);
    const compressed = new Uint8Array(zlib.gzipSync(raw));
    const result = await decodeBody(compressed, 'gzip', 64 * 1024);
    expect(result.status).toBe('limited');
    expect(Buffer.from(result.data)).toEqual(raw.subarray(0, 64 * 1024));
  });

  it('limits large brotli HTML to a decoded text prefix', async () => {
    const raw = Buffer.from(`<html>${'BYD'.repeat(64 * 1024)}</html>`);
    const compressed = new Uint8Array(zlib.brotliCompressSync(raw));
    const result = await decodeBody(compressed, 'br', 64 * 1024);
    expect(result.status).toBe('limited');
    expect(decodeText(result.data).startsWith('<html>BYDBYD')).toBe(true);
    expect(result.data).toHaveLength(64 * 1024);
  });

  it('stream-decodes a compressed input larger than the preview limit', async () => {
    const raw = randomBytes(1_200_000);
    const compressed = zlib.gzipSync(raw);
    expect(compressed.byteLength).toBeGreaterThan(1024 * 1024);
    const chunks = [
      compressed.subarray(0, 400_000),
      compressed.subarray(400_000, 900_000),
      compressed.subarray(900_000),
    ];

    const result = await decodeBodyStream(
      () => (async function* () {
        yield* chunks;
      })(),
      'gzip',
      1024 * 1024,
    );

    expect(result.status).toBe('limited');
    expect(Buffer.from(result.data)).toEqual(raw.subarray(0, 1024 * 1024));
  }, 10_000);

  it('retries raw deflate inside a multi-layer stream', async () => {
    const raw = Buffer.from('multi-layer raw deflate'.repeat(10_000));
    const compressed = zlib.brotliCompressSync(zlib.deflateRawSync(raw));
    const result = await decodeBodyStream(
      () => (async function* () {
        yield compressed.subarray(0, Math.floor(compressed.byteLength / 2));
        yield compressed.subarray(Math.floor(compressed.byteLength / 2));
      })(),
      'deflate, br',
      1024 * 1024,
    );

    expect(result.status).toBe('ok');
    expect(Buffer.from(result.data)).toEqual(raw);
  });

  it('distinguishes an exact-size raw stream from one with more data', async () => {
    const exact = await decodeBodyStream(
      () => (async function* () { yield Buffer.alloc(8, 1); })(),
      undefined,
      8,
    );
    const longer = await decodeBodyStream(
      () => (async function* () {
        yield Buffer.alloc(8, 1);
        yield Buffer.from([2]);
      })(),
      undefined,
      8,
    );

    expect(exact.status).toBe('skipped');
    expect(longer.status).toBe('limited');
    expect(longer.data).toHaveLength(8);
  });
});
