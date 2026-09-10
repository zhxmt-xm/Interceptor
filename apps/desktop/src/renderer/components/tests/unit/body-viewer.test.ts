import { describe, expect, it } from 'vitest';

import {
  bodyFormat,
  bodyLanguage,
  isJsonMime,
  isMediaMime,
  isTextMime,
} from '../../BodyViewer/bodyFormats';
import {
  decodeUtf8,
  formatJsonBody,
  hexLine,
  hexLineCount,
  parseFormBody,
  toHexDump,
} from '../../BodyViewer/bodyText';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('body format resolution', () => {
  it('recognizes common structured and textual MIME families', () => {
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('application/problem+json')).toBe(true);
    expect(isTextMime('application/javascript')).toBe(true);
    expect(isTextMime('application/yaml')).toBe(true);
    expect(isTextMime('image/png')).toBe(false);
    expect(isJsonMime('application/x-json-stream')).toBe(true);
    expect(isMediaMime('video/mp4')).toBe(true);
    expect(isMediaMime('audio/mpeg; codecs=mp3')).toBe(true);
    expect(isMediaMime('image/webp')).toBe(false);
  });

  it('picks a syntax language from the MIME type', () => {
    expect(bodyLanguage('application/problem+json')).toBe('json');
    expect(bodyLanguage('text/html; charset=utf-8')).toBe('html');
    expect(bodyLanguage('application/atom+xml')).toBe('xml');
    expect(bodyLanguage('application/javascript')).toBe('javascript');
    expect(bodyLanguage('text/css')).toBe('css');
    expect(bodyLanguage('application/x-yaml')).toBe('yaml');
    expect(bodyLanguage(undefined)).toBe('plaintext');
  });

  it('derives the segmented options from the content kind', () => {
    expect(bodyFormat('application/json').modes).toEqual(['default', 'tree', 'raw', 'hex']);
    expect(bodyFormat('text/html').modes).toEqual(['default', 'raw', 'hex']);
    expect(bodyFormat('image/png').modes).toEqual(['default', 'hex']);
    expect(bodyFormat('video/mp4').modes).toEqual([]);
    expect(bodyFormat('application/x-www-form-urlencoded').kind).toBe('form');
  });

  it('keeps SVG on the code path instead of handing it to an img element', () => {
    const svg = bodyFormat('image/svg+xml');
    expect(svg.kind).toBe('code');
    expect(svg.language).toBe('xml');
  });

  it('binary bodies open on hex and still offer a text escape hatch', () => {
    const format = bodyFormat('font/woff2');
    expect(format.kind).toBe('binary');
    expect(format.defaultMode).toBe('hex');
    expect(format.modes).toEqual(['raw', 'hex']);
  });

  it('probes the payload only when the MIME cannot decide', () => {
    expect(bodyFormat('application/octet-stream', encode('{"ok":true}')).kind).toBe('json');
    expect(bodyFormat('application/octet-stream', encode('plain text')).kind).toBe('text');
    expect(bodyFormat('application/octet-stream', new Uint8Array([0, 1, 2, 3])).kind).toBe('binary');
    // A declared type wins over the payload: servers lie about octet-stream, not about JSON.
    expect(bodyFormat('text/html', encode('{"ok":true}')).kind).toBe('code');
  });

  it.each([undefined, 'application/octet-stream'])('recognizes limited UTF-8 text without an explicit text MIME (%s)', (mediaType) => {
    const text = new Uint8Array([0x61, 0xe4, 0xbd]);
    const json = new Uint8Array([...encode('{"text":"'), 0xe4, 0xbd]);

    expect(bodyFormat(mediaType, text, true).kind).toBe('text');
    expect(bodyFormat(mediaType, json, true).kind).toBe('json');
    expect(bodyFormat(mediaType, text, false).kind).toBe('binary');
    expect(bodyFormat(mediaType, new Uint8Array([0x61, 0xff, 0xe4, 0xbd]), true).kind).toBe('binary');
    expect(bodyFormat(mediaType, new Uint8Array([0x00, 0xe4, 0xbd]), true).kind).toBe('binary');
  });
});

describe('body text helpers', () => {
  it.each(['\u00e9', '\u4e2d', '\u{1f642}'])('omits only the unfinished UTF-8 suffix in a truncated preview of %s', (character) => {
    const prefix = encode('body: ');
    const source = encode(`body: ${character}`);
    for (let suffixLength = 1; suffixLength < encode(character).byteLength; suffixLength += 1) {
      const preview = source.slice(0, prefix.byteLength + suffixLength);
      const originalBytes = preview.slice();

      expect(decodeUtf8(preview, true)).toBe('body: ');
      expect(preview).toEqual(originalBytes);
    }
  });

  it('retains complete characters and malformed bytes in a truncated preview', () => {
    const complete = encode('body: \u00e9\u4e2d\u{1f642}');
    expect(decodeUtf8(complete, true)).toBe('body: \u00e9\u4e2d\u{1f642}');
    expect(decodeUtf8(new Uint8Array([0x61, 0xff, 0x62, 0xe4, 0xbd]), true))
      .toBe('a\ufffdb');
    expect(decodeUtf8(new Uint8Array([0xc0, 0xaf, 0x80]), true)).toBe('\ufffd\ufffd\ufffd');
  });

  it('reports incomplete UTF-8 in a complete body instead of hiding malformed data', () => {
    const incomplete = new Uint8Array([0x61, 0xe4, 0xbd]);
    expect(decodeUtf8(incomplete)).toBe('a\ufffd');
    expect(decodeUtf8(incomplete, false)).toBe('a\ufffd');
  });

  it('formats JSON behind an XSSI guard prefix and keeps the guard visible', () => {
    expect(formatJsonBody(')]}\'\n{"ok":true}')).toBe(')]}\'\n{\n  "ok": true\n}');
    expect(formatJsonBody('while(1);{"ok":true}')).toBe('while(1);\n{\n  "ok": true\n}');
  });

  it('formats newline and record separated JSON streams document by document', () => {
    expect(formatJsonBody('{"a":1}\n{"b":2}\n')).toBe('{\n  "a": 1\n}\n{\n  "b": 2\n}');
    expect(formatJsonBody('\u001e{"a":1}\n\u001e{"b":2}\n')).toBe('{\n  "a": 1\n}\n{\n  "b": 2\n}');
  });

  it('leaves non-JSON and partially parsable payloads untouched', () => {
    expect(formatJsonBody('42')).toBeNull();
    expect(formatJsonBody('{"a":1}\nnot json')).toBeNull();
    expect(formatJsonBody('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('decodes urlencoded fields and keeps broken escapes readable', () => {
    expect(parseFormBody('grant_type=client_credentials&scope=repo+read%3Auser')).toEqual([
      { name: 'grant_type', value: 'client_credentials' },
      { name: 'scope', value: 'repo read:user' },
    ]);
    expect(parseFormBody('flag&bad=%E0%A4%A')).toEqual([
      { name: 'flag', value: '' },
      { name: 'bad', value: '%E0%A4%A' },
    ]);
  });

  it('generates hex lines individually so the full dump never reaches the DOM', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(hexLineCount(bytes.byteLength, 4)).toBe(2);
    expect(hexLineCount(bytes.byteLength, 8)).toBe(1);
    expect(hexLine(bytes, 0, 4)).toBe('00000000  00 01 02 03  ....');
    expect(toHexDump(bytes, 4).split('\n')).toHaveLength(2);
  });
});
