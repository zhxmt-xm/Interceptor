import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCompleteBody } from '../../data/readCompleteBody';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCompleteBody', () => {
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
    expect(result.bytes).toEqual(source);
    expect(result.end).toBe(true);
  });
});