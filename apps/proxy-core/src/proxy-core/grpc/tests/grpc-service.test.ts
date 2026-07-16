import { describe, expect, it } from 'vitest';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { GrpcService } from '../entry';
import { InvalidGrpcCursorError } from '../grpc-invalid-cursor-error';

function envelope(payload: Uint8Array, compressed = false): Buffer {
  const header = Buffer.alloc(5);
  header[0] = compressed ? 1 : 0;
  header.writeUInt32BE(payload.byteLength, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}

function detail(body: Buffer): CaptureExchangeDetail {
  return {
    summary: {
      id: 'grpc-1',
      method: 'POST',
      secure: true,
      protocol: 'h2',
      statusCode: 200,
      responseMime: 'application/grpc+proto',
      state: 'completed',
      startedAt: 1,
      requestBytes: body.byteLength,
      responseBytes: body.byteLength,
    },
    url: 'https://api.test/pkg.Service/Call',
    requestMime: 'application/grpc+proto',
    requestHeaders: [
      { name: 'content-type', value: 'application/grpc+proto' },
      { name: 'grpc-encoding', value: 'gzip' },
    ],
    responseHeaders: [
      { name: 'content-type', value: 'application/grpc+proto' },
    ],
    requestTrailers: [],
    responseTrailers: [{ name: 'grpc-status', value: '0' }],
    requestBody: {
      bodyHash: 'a'.repeat(64),
      encodedSize: body.byteLength,
      truncated: false,
      decodeStatus: 'ok',
    },
    responseBody: {
      bodyHash: 'b'.repeat(64),
      encodedSize: body.byteLength,
      truncated: false,
      decodeStatus: 'ok',
    },
  };
}

describe('queryGrpcMessages', () => {
  it('paginates by envelope offset without loading payload bytes', async () => {
    const body = Buffer.concat([
      envelope(Buffer.from('first')),
      envelope(Buffer.from('second'), true),
    ]);
    const reads: Array<{ offset: number; length: number }> = [];
    const storage = {
      getExchangeDetail: () => Promise.resolve(detail(body)),
      readBodyRange: (_hash: string, offset: number, length: number) => {
        reads.push({ offset, length });
        return Promise.resolve(body.subarray(offset, offset + length));
      },
    };

    const grpc = new GrpcService(storage);
    const first = await grpc.query({
      exchangeId: 'grpc-1',
      side: 'request',
      limit: 1,
    });
    expect(first).toMatchObject({
      recognized: true,
      encoding: 'gzip',
      bodyHash: 'a'.repeat(64),
      items: [
        {
          index: 0,
          envelopeOffset: 0,
          payloadOffset: 5,
          payloadLength: 5,
          compressed: false,
          truncated: false,
        },
      ],
      hasMore: true,
    });
    const second = await grpc.query({
      exchangeId: 'grpc-1',
      side: 'request',
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(second.items).toEqual([
      {
        index: 1,
        envelopeOffset: 10,
        payloadOffset: 15,
        payloadLength: 6,
        compressed: true,
        truncated: false,
      },
    ]);
    expect(second.hasMore).toBe(false);
    expect(reads).toEqual([
      { offset: 0, length: 5 },
      { offset: 10, length: 5 },
    ]);
  });

  it('reports non-gRPC bodies, malformed headers, and truncated payloads', async () => {
    const truncated = Buffer.from([0, 0, 0, 0, 8, 1, 2]);
    const grpcDetail = detail(truncated);
    const storage = {
      getExchangeDetail: () => Promise.resolve(grpcDetail),
      readBodyRange: (_hash: string, offset: number, length: number) =>
        Promise.resolve(truncated.subarray(offset, offset + length)),
    };
    const page = await new GrpcService(storage).query({
      exchangeId: 'grpc-1',
      side: 'response',
      limit: 10,
    });
    expect(page.items[0]).toMatchObject({ truncated: true, payloadLength: 8 });

    const nonGrpc = {
      ...grpcDetail,
      summary: { ...grpcDetail.summary, responseMime: 'application/json' },
    };
    await expect(
      new GrpcService({
        ...storage,
        getExchangeDetail: () => Promise.resolve(nonGrpc),
      }).query({ exchangeId: 'grpc-1', side: 'response', limit: 10 }),
    ).resolves.toMatchObject({ recognized: false, items: [] });

    const grpcWeb = {
      ...grpcDetail,
      summary: {
        ...grpcDetail.summary,
        responseMime: 'application/grpc-web+proto',
      },
    };
    await expect(
      new GrpcService({
        ...storage,
        getExchangeDetail: () => Promise.resolve(grpcWeb),
      }).query({ exchangeId: 'grpc-1', side: 'response', limit: 10 }),
    ).resolves.toMatchObject({ recognized: false, items: [] });
  });

  it('rejects cursors from another side or with invalid offsets', async () => {
    const body = envelope(Buffer.from('message'));
    const storage = {
      getExchangeDetail: () => Promise.resolve(detail(body)),
      readBodyRange: () => Promise.resolve(body.subarray(0, 5)),
    };
    await expect(
      new GrpcService(storage).query({
        exchangeId: 'grpc-1',
        side: 'response',
        cursor: Buffer.from('grpc:request:0:0').toString('base64url'),
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(InvalidGrpcCursorError);
  });
});