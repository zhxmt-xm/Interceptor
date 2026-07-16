import { describe, expect, it } from 'vitest';

import { HarDocumentParser } from '../har-document';

class HarDocumentFixtures {
  /** 构造含文本请求和 base64 响应的标准 HAR 1.2 fixture。 */
  static valid(body = '<script>globalThis.__harExecuted = true</script>') {
    return {
      log: {
        version: '1.2',
        creator: { name: 'Fixture', version: '1.0' },
        entries: [
          {
            startedDateTime: '2026-07-17T10:00:00.000Z',
            time: 12,
            request: {
              method: 'POST',
              url: 'https://api.example.test/v1/items?draft=1',
              httpVersion: 'HTTP/2',
              headers: [{ name: 'content-type', value: 'text/html' }],
              queryString: [{ name: 'draft', value: '1' }],
              cookies: [],
              headersSize: -1,
              bodySize: Buffer.byteLength(body),
              postData: { mimeType: 'text/html', text: body },
            },
            response: {
              status: 201,
              statusText: 'Created',
              httpVersion: 'HTTP/2',
              headers: [{ name: 'content-type', value: 'application/json' }],
              cookies: [],
              content: {
                size: 11,
                mimeType: 'application/json',
                text: Buffer.from('{"ok":true}').toString('base64'),
                encoding: 'base64',
              },
              redirectURL: '',
              headersSize: -1,
              bodySize: 11,
            },
            cache: {},
            timings: { send: 1, wait: 8, receive: 3 },
          },
        ],
      },
    };
  }
}

describe('parseHarDocument', () => {
  it('parses HAR 1.2 without executing captured script content', () => {
    delete (globalThis as { __harExecuted?: boolean }).__harExecuted;

    const parsed = HarDocumentParser.parse(
      JSON.stringify(HarDocumentFixtures.valid()),
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.example.test/v1/items?draft=1',
      protocol: 'h2',
      statusCode: 201,
    });
    expect(parsed.entries[0]?.requestBody?.toString('utf8')).toContain('<script>');
    expect(parsed.entries[0]?.responseBody?.toString('utf8')).toBe('{"ok":true}');
    expect((globalThis as { __harExecuted?: boolean }).__harExecuted).toBeUndefined();
  });

  it('rejects malformed and oversized entry arrays', () => {
    expect(() => HarDocumentParser.parse('{"log":{"version":"1.2"}}')).toThrow(
      /entries/i,
    );
    const oversized = HarDocumentFixtures.valid();
    const [entry] = HarDocumentFixtures.valid().log.entries;
    if (!entry) {
      throw new Error('HAR fixture entry is missing.');
    }
    oversized.log.entries = Array.from({ length: 100_001 }, () => entry);
    expect(() => HarDocumentParser.parse(JSON.stringify(oversized))).toThrow(
      /100000/,
    );
  });
});