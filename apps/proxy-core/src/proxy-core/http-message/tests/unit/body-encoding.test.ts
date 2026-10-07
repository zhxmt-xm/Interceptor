import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { HttpMessageService } from '../../entry';

describe('HttpMessageService', () => {
  it('encodes text charset and repeated content-encoding layers in declaration order', async () => {
    const content = await new HttpMessageService().buildContent(
      '€',
      'text',
      {
        'content-type': 'text/plain; charset=windows-1252',
        'content-encoding': 'gzip, br, gzip',
      },
    );

    const decoded = zlib.gunzipSync(
      zlib.brotliDecompressSync(zlib.gunzipSync(content)),
    );
    expect(decoded).toEqual(Buffer.from([0x80]));
  });

  it('updates only an inherited content-length that the user did not edit', async () => {
    const httpMessageService = new HttpMessageService();

    await expect(httpMessageService.prepareReplacement({
      body: 'updated',
      source: 'text',
      originalHeaders: { 'content-length': '3' },
      headers: { 'Content-Length': '3' },
      editedHeaderNames: new Set(),
    })).resolves.toMatchObject({
      headers: { 'Content-Length': '7' },
    });

    await expect(httpMessageService.prepareReplacement({
      body: 'updated',
      source: 'text',
      originalHeaders: { 'content-length': '3' },
      headers: {},
      editedHeaderNames: new Set(['content-length']),
    })).resolves.toMatchObject({
      headers: {},
    });

    await expect(httpMessageService.prepareReplacement({
      body: 'updated',
      source: 'text',
      originalHeaders: { 'content-length': '3' },
      headers: { 'Content-Length': '999' },
      editedHeaderNames: new Set(['content-length']),
    })).resolves.toMatchObject({
      headers: { 'Content-Length': '999' },
    });
  });

  it('keeps file bytes independent from the Content-Type charset', async () => {
    await expect(new HttpMessageService().buildContent(
      new Uint8Array([0x00, 0x80, 0xff]),
      'file',
      { 'content-type': 'text/plain; charset=windows-1252' },
    )).resolves.toEqual(new Uint8Array([0x00, 0x80, 0xff]));
  });

  it('rejects unsupported charset and content-encoding values', async () => {
    const httpMessageService = new HttpMessageService();

    await expect(httpMessageService.buildContent(
      'text',
      'text',
      { 'content-type': 'text/plain; charset=not-a-real-charset' },
    )).rejects.toThrow('Unsupported text charset');

    await expect(httpMessageService.buildContent(
      'text',
      'text',
      { 'content-encoding': 'made-up' },
    )).rejects.toThrow('Unsupported Content-Encoding');
  });
});
