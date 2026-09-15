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
    private readonly liveSnapshot?: { encodedSize: number; complete: boolean },
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

  /** 模拟同一Exchange/side的在途或已结束正文快照，不为在途字节编造hash。 */
  override getExchangeBodySnapshot(_exchangeId: string, side: 'request' | 'response') {
    const body = side === 'request' ? this.exchangeDetail.requestBody : this.exchangeDetail.responseBody;
    return Promise.resolve({
      bodyHash: body?.bodyHash,
      encodedSize: this.liveSnapshot?.encodedSize ?? body?.encodedSize ?? 0,
      complete: this.liveSnapshot?.complete ?? true,
      available: this.liveSnapshot !== undefined || body?.bodyHash !== undefined,
    });
  }

  /** 模拟按Exchange/side读取已到达的字节，保留原range观测。 */
  override readExchangeBodyRange(_exchangeId: string, _side: 'request' | 'response', offset: number, length: number) {
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
  it.each(['request', 'response'] as const)('lists complete messages while the %s body is still streaming', async (side) => {
    const first = envelope(Buffer.from('first'));
    const second = envelope(Buffer.from('second'), true);
    const body = Buffer.concat([first, second]);
    const completedDetail = detail(body);
    const streamingDetail: CaptureExchangeDetail = {
      ...completedDetail,
      summary: { ...completedDetail.summary, state: 'response-streaming' },
      requestBody: undefined,
      responseBody: undefined,
    };
    const snapshot = { encodedSize: first.byteLength + 7, complete: false };
    const reads: Array<{ offset: number; length: number }> = [];
    const fakeCaptureService = new FakeCaptureService(streamingDetail, (offset, length) => {
      reads.push({ offset, length });
      return body.subarray(offset, Math.min(offset + length, snapshot.encodedSize));
    }, snapshot);
    const grpcService = new GrpcService(fakeCaptureService);

    const firstPage = await grpcService.query({ exchangeId: 'grpc-1', side, limit: 10 });
    expect(firstPage).toMatchObject({
      recognized: true, bodyAvailable: true, bodyComplete: false, bodySize: snapshot.encodedSize,
      items: [{ index: 0, envelopeOffset: 0, payloadOffset: 5, payloadLength: 5, compressed: false, truncated: false }],
      hasMore: false,
    });
    expect(firstPage.bodyHash).toBeUndefined();
    expect(firstPage.malformedOffset).toBeUndefined();
    expect(firstPage.nextCursor).toBe(Buffer.from(`grpc:${side}:${first.byteLength}:1`).toString('base64url'));
    expect(reads).toEqual([{ offset: 0, length: 5 }, { offset: first.byteLength, length: 5 }]);

    snapshot.encodedSize = body.byteLength;
    const nextPage = await grpcService.query({ exchangeId: 'grpc-1', side, cursor: firstPage.nextCursor, limit: 10 });
    expect(nextPage.items).toHaveLength(1);
    expect(nextPage.items[0]).toMatchObject({ index: 1, envelopeOffset: first.byteLength,
      payloadOffset: first.byteLength + 5, payloadLength: 6, compressed: true, truncated: false });
  });

  it('does not report an incomplete live envelope header as malformed', async () => {
    const body = envelope(Buffer.from('message'));
    const completedDetail = detail(body);
    const streamingDetail: CaptureExchangeDetail = {
      ...completedDetail,
      summary: { ...completedDetail.summary, state: 'response-streaming' },
      responseBody: undefined,
    };
    const snapshot = { encodedSize: 3, complete: false };
    const fakeCaptureService = new FakeCaptureService(streamingDetail,
      (offset, length) => body.subarray(offset, Math.min(offset + length, snapshot.encodedSize)), snapshot);
    const page = await new GrpcService(fakeCaptureService).query({ exchangeId: 'grpc-1', side: 'response', limit: 10 });
    expect(page).toMatchObject({ recognized: true, bodyAvailable: true, bodyComplete: false,
      bodySize: 3, items: [], hasMore: false });
    expect(page.malformedOffset).toBeUndefined();
  });

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

  it.each([false, true])('accepts a cursor at the body end when complete=%s', async (complete) => {
    const body = envelope(Buffer.from('message'));
    const cursor = Buffer.from(`grpc:response:${body.byteLength}:1`).toString('base64url');
    const reads: number[] = [];
    const fakeCaptureService = new FakeCaptureService(detail(body), (offset, length) => {
      reads.push(offset);
      return body.subarray(offset, offset + length);
    }, { encodedSize: body.byteLength, complete });
    const page = await new GrpcService(fakeCaptureService).query({
      exchangeId: 'grpc-1', side: 'response', cursor, limit: 10,
    });

    expect(page).toMatchObject({ items: [], hasMore: false, bodyComplete: complete });
    expect(page.nextCursor).toBe(complete ? undefined : cursor);
    expect(reads).toEqual([]);
  });

  it.each([false, true])('rejects a cursor beyond the body end when complete=%s', async (complete) => {
    const body = envelope(Buffer.from('message'));
    const reads: number[] = [];
    const fakeCaptureService = new FakeCaptureService(detail(body), (offset, length) => {
      reads.push(offset);
      return body.subarray(offset, offset + length);
    }, { encodedSize: body.byteLength, complete });

    await expect(new GrpcService(fakeCaptureService).query({
      exchangeId: 'grpc-1',
      side: 'response',
      cursor: Buffer.from(`grpc:response:${body.byteLength + 1}:1`).toString('base64url'),
      limit: 10,
    })).rejects.toBeInstanceOf(InvalidGrpcCursorError);
    expect(reads).toEqual([]);
  });

  it('rejects cursors from another side', async () => {
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