import { describe, expect, it } from 'vitest';

import {
  bodyTextForMode,
  detectTextBody,
  isJsonMime,
  isTextMime,
  toHexDump,
} from '../RequestInspector/BodyView';

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
  });

  it('detects valid unknown textual payloads and rejects binary controls', () => {
    expect(detectTextBody(encode('{"ok":true}'), 'application/octet-stream'))
      .toEqual({ text: '{\n  "ok": true\n}', json: true });
    expect(detectTextBody(new Uint8Array([0, 1, 2, 3]), 'application/octet-stream'))
      .toBeNull();
  });

  it('allows explicit Text, JSON and Hex display modes', () => {
    const malformedUtf8 = new Uint8Array([0xff, 0x61]);
    expect(bodyTextForMode(malformedUtf8, 'application/octet-stream', 'auto')).toBeNull();
    expect(bodyTextForMode(malformedUtf8, 'application/octet-stream', 'text'))
      .toEqual({ text: '�a', json: false });
    expect(bodyTextForMode(encode('{"value":1}'), undefined, 'json'))
      .toEqual({ text: '{\n  "value": 1\n}', json: true });
    expect(bodyTextForMode(encode('plain'), 'text/plain', 'hex')).toBeNull();
  });

  it('reflows hex output by changing bytes per line', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(toHexDump(bytes, 4).split('\n')).toHaveLength(2);
    expect(toHexDump(bytes, 8).split('\n')).toHaveLength(1);
  });
});