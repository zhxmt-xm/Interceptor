import { describe, expect, it } from 'vitest';

import {
  bodyLanguage,
  bodyPreviewRequest,
  bodyTextForMode,
  detectTextBody,
  formatJsonBody,
  isMediaMime,
  isJsonMime,
  isTextMime,
  toHexDump,
} from '../RequestInspector/bodyContent';
import { BODY_PREVIEW_MAX_BYTES } from '../../../../shared/desktop-api';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('BodyView content classification', () => {
  it('recognizes common structured and textual MIME families', () => {
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('application/problem+json')).toBe(true);
    expect(isTextMime('application/x-json-stream')).toBe(true);
    expect(isTextMime('application/javascript')).toBe(true);
    expect(isTextMime('application/xml')).toBe(true);
    expect(isTextMime('application/yaml')).toBe(true);
    expect(isTextMime('text/css')).toBe(true);
    expect(isTextMime('image/png')).toBe(false);
    expect(isJsonMime('application/x-json-stream')).toBe(true);
    expect(isMediaMime('video/mp4')).toBe(true);
    expect(isMediaMime('audio/mpeg; codecs=mp3')).toBe(true);
    expect(isMediaMime('image/webp')).toBe(false);
  });

  it('picks a Monaco language from the MIME type', () => {
    expect(bodyLanguage('application/problem+json')).toBe('json');
    expect(bodyLanguage('text/html; charset=utf-8')).toBe('html');
    expect(bodyLanguage('application/atom+xml')).toBe('xml');
    expect(bodyLanguage('application/javascript')).toBe('javascript');
    expect(bodyLanguage('text/css')).toBe('css');
    expect(bodyLanguage('application/x-yaml')).toBe('yaml');
    expect(bodyLanguage('text/plain')).toBe('plaintext');
    expect(bodyLanguage(undefined)).toBe('plaintext');
  });

  it('detects valid unknown textual payloads and rejects binary controls', () => {
    expect(detectTextBody(encode('{"ok":true}'), 'application/octet-stream'))
      .toEqual({ text: '{\n  "ok": true\n}', language: 'json' });
    expect(detectTextBody(new Uint8Array([0, 1, 2, 3]), 'application/octet-stream'))
      .toBeNull();
    expect(detectTextBody(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0xe4]), 'text/html'))
      .toEqual({ text: '<html\ufffd', language: 'html' });
  });

  it('allows explicit Text, JSON and Hex display modes', () => {
    const malformedUtf8 = new Uint8Array([0xff, 0x61]);
    expect(bodyTextForMode(malformedUtf8, 'application/octet-stream', 'auto')).toBeNull();
    expect(bodyTextForMode(malformedUtf8, 'application/octet-stream', 'text'))
      .toEqual({ text: '\ufffda', language: 'plaintext' });
    expect(bodyTextForMode(encode('{"value":1}'), undefined, 'json'))
      .toEqual({ text: '{\n  "value": 1\n}', language: 'json' });
    expect(bodyTextForMode(encode('plain'), 'text/plain', 'hex')).toBeNull();
  });

  it('formats JSON behind an XSSI guard prefix and keeps the guard visible', () => {
    expect(formatJsonBody(')]}\'\n{"ok":true}')).toBe(')]}\'\n{\n  "ok": true\n}');
    expect(formatJsonBody('while(1);{"ok":true}')).toBe('while(1);\n{\n  "ok": true\n}');
    expect(detectTextBody(encode(')]}\',\n{"ok":true}'), 'application/json'))
      .toEqual({ text: ')]}\',\n{\n  "ok": true\n}', language: 'json' });
  });

  it('formats newline and record separated JSON streams document by document', () => {
    expect(formatJsonBody('{"a":1}\n{"b":2}\n')).toBe('{\n  "a": 1\n}\n{\n  "b": 2\n}');
    expect(formatJsonBody('\u001e{"a":1}\n\u001e{"b":2}\n')).toBe('{\n  "a": 1\n}\n{\n  "b": 2\n}');
    expect(detectTextBody(encode('{"a":1}\n{"b":2}'), 'application/x-json-stream'))
      .toEqual({ text: '{\n  "a": 1\n}\n{\n  "b": 2\n}', language: 'json' });
  });

  it('leaves non-JSON and partially parsable payloads untouched', () => {
    expect(formatJsonBody('42')).toBeNull();
    expect(formatJsonBody('{"a":1}\nnot json')).toBeNull();
    expect(formatJsonBody('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(detectTextBody(encode('{"truncated":'), 'application/json'))
      .toEqual({ text: '{"truncated":', language: 'json' });
    expect(detectTextBody(encode('42'), 'text/plain'))
      .toEqual({ text: '42', language: 'plaintext' });
  });

  it('reflows hex output by changing bytes per line', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(toHexDump(bytes, 4).split('\n')).toHaveLength(2);
    expect(toHexDump(bytes, 8).split('\n')).toHaveLength(1);
  });

  it('limits large previews and asks Core to stream-decode compressed input', () => {
    expect(BODY_PREVIEW_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(bodyPreviewRequest({
      bodyHash: 'a'.repeat(64),
      encodedSize: BODY_PREVIEW_MAX_BYTES + 1,
      truncated: false,
      decodeStatus: 'ok',
      contentEncoding: 'gzip',
    })).toEqual({
      length: BODY_PREVIEW_MAX_BYTES,
      decode: true,
      limited: true,
    });
    expect(bodyPreviewRequest({
      bodyHash: 'b'.repeat(64),
      encodedSize: 512,
      truncated: false,
      decodeStatus: 'ok',
      contentEncoding: 'gzip',
    })).toEqual({ length: 512, decode: true, limited: false });
  });
});