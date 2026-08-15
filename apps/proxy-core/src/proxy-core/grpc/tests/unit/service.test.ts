import { describe, expect, it } from 'vitest';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { CaptureService } from '../../../capture/entry';
import { GrpcService } from '../../entry';
import { InvalidGrpcCursorError } from '../../internal/errors';

/** 只覆盖 gRPC 扫描用到的两条读取路径，其余继承真实实现且不初始化磁盘。 */
class FakeCaptureService extends CaptureService {
  constructor(
    private readonly exchangeDetail: CaptureExchangeDetail,
    private readonly readRange: (offset: number, length: number) => Buffer,
  ) {
    super();
  }

  override getExchangeDetail(): Promise<CaptureExchangeDetail | null> {
    return Promise.resolve(this.exchangeDetail);
  }

  override readBodyRange(
    _hash: string,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    return Promise.resolve(this.readRange(offset, length));
  }
}

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
    const fakeCaptureService = new FakeCaptureService(detail(body), (offset, length) => {
      reads.push({ offset, length });
      return body.subarray(offset, offset + length);
    });

    const grpcService = new GrpcService(fakeCaptureService);
    const first = await grpcService.query({
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
    const second = await grpcService.query({
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
    const readRange = (offset: number, length: number) =>
      truncated.subarray(offset, offset + length);
    const page = await new GrpcService(
      new FakeCaptureService(grpcDetail, readRange),
    ).query({
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
      new GrpcService(new FakeCaptureService(nonGrpc, readRange)).query({
        exchangeId: 'grpc-1',
        side: 'response',
        limit: 10,
      }),
    ).resolves.toMatchObject({ recognized: false, items: [] });

    const grpcWeb = {
      ...grpcDetail,
      summary: {
        ...grpcDetail.summary,
        responseMime: 'application/grpc-web+proto',
      },
    };
    await expect(
      new GrpcService(new FakeCaptureService(grpcWeb, readRange)).query({
        exchangeId: 'grpc-1',
        side: 'response',
        limit: 10,
      }),
    ).resolves.toMatchObject({ recognized: false, items: [] });
  });

  it('rejects cursors from another side or with invalid offsets', async () => {
    const body = envelope(Buffer.from('message'));
    const fakeCaptureService = new FakeCaptureService(detail(body), () =>
      body.subarray(0, 5),
    );
    await expect(
      new GrpcService(fakeCaptureService).query({
        exchangeId: 'grpc-1',
        side: 'response',
        cursor: Buffer.from('grpc:request:0:0').toString('base64url'),
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(InvalidGrpcCursorError);
  });
});