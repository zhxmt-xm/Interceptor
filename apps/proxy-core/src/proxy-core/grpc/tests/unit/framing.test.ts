import { describe, expect, it } from 'vitest';

import { parseGrpcEnvelopes } from '../../utils';

function envelope(payload: Uint8Array, compressed = false): Buffer {
  const header = Buffer.alloc(5);
  header[0] = compressed ? 1 : 0;
  header.writeUInt32BE(payload.byteLength, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}

describe('parseGrpcEnvelopes', () => {
  it('parses ordered compressed and uncompressed messages', () => {
    const body = Buffer.concat([
      envelope(Buffer.from('hello')),
      envelope(Uint8Array.from([1, 2, 3]), true),
      envelope(new Uint8Array()),
    ]);

    expect(parseGrpcEnvelopes(body)).toEqual({
      messages: [
        {
          index: 0,
          envelopeOffset: 0,
          payloadOffset: 5,
          payloadLength: 5,
          compressed: false,
          truncated: false,
        },
        {
          index: 1,
          envelopeOffset: 10,
          payloadOffset: 15,
          payloadLength: 3,
          compressed: true,
          truncated: false,
        },
        {
          index: 2,
          envelopeOffset: 18,
          payloadOffset: 23,
          payloadLength: 0,
          compressed: false,
          truncated: false,
        },
      ],
      nextOffset: 23,
    });
  });

  it('reports a truncated payload without reading past the body', () => {
    const body = Buffer.from([0, 0, 0, 0, 8, 1, 2, 3]);
    expect(parseGrpcEnvelopes(body, 100, 4)).toEqual({
      messages: [
        {
          index: 4,
          envelopeOffset: 100,
          payloadOffset: 105,
          payloadLength: 8,
          compressed: false,
          truncated: true,
        },
      ],
      nextOffset: 108,
    });
  });

  it('reports incomplete headers and unsupported flags as malformed', () => {
    expect(parseGrpcEnvelopes(Uint8Array.from([0, 0, 0]))).toEqual({
      messages: [],
      malformedOffset: 0,
      nextOffset: 3,
    });
    expect(parseGrpcEnvelopes(Uint8Array.from([2, 0, 0, 0, 0]))).toEqual({
      messages: [],
      malformedOffset: 0,
      nextOffset: 0,
    });
  });
});