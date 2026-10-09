import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCompleteBody } from '../../data/readCompleteBody';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCompleteBody', () => {
  it('reads a live gRPC payload in bounded chunks without a content hash', async () => {
    const payloadOffset = 23;
    const source = new Uint8Array(payloadOffset + 1024 * 1024 + 19).fill(0x61);
    const readBody = vi.fn();
    const readGrpcBody = vi.fn(async (request: { exchangeId: string; side: string; offset: number; length: number }) => ({
      offset: request.offset, data: source.slice(request.offset, request.offset + request.length),
      end: request.offset + request.length >= source.byteLength,
    }));
    vi.stubGlobal('window', { interceptor: { readBody, readGrpcBody } });

    const result = await readCompleteBody({ exchangeId: 'grpc-live', side: 'response' },
      payloadOffset, source.byteLength - payloadOffset);
    expect(result.bytes.byteLength).toBe(source.byteLength - payloadOffset);
    expect(Buffer.compare(result.bytes, source.subarray(payloadOffset))).toBe(0);
    expect(result.end).toBe(true);
    expect(readBody).not.toHaveBeenCalled();
    expect(readGrpcBody.mock.calls.map(([request]) => request)).toEqual([
      { exchangeId: 'grpc-live', side: 'response', offset: payloadOffset, length: 1024 * 1024 },
      { exchangeId: 'grpc-live', side: 'response', offset: payloadOffset + 1024 * 1024, length: 19 },
    ]);
  });

  it('reads and joins every byte across multiple IPC chunks', async () => {
    const source = new Uint8Array(1024 * 1024 + 123);
    source.forEach((_value, index) => {
      source[index] = index % 251;
    });
    const readBody = vi.fn(async (
      _hash: string,
      offset: number,
      length: number,
    ) => ({
      bodyId: 'body-1',
      offset,
      data: source.slice(offset, offset + length),
      end: offset + length >= source.byteLength,
    }));
    vi.stubGlobal('window', { interceptor: { readBody } });

    const result = await readCompleteBody(
      'body-1',
      0,
      source.byteLength,
    );

    expect(readBody).toHaveBeenCalledTimes(2);
    expect(result.bytes.byteLength).toBe(source.byteLength);
    expect(Buffer.compare(result.bytes, source)).toBe(0);
    expect(result.end).toBe(true);
  });
});