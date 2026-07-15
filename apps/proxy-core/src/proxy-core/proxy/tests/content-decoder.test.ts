import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { decodeBody } from '../content-decoder';

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
});
