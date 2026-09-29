import { describe, expect, it } from 'vitest';

import {
  BODY_PREVIEW_MAX_BYTES,
  IMAGE_PREVIEW_MAX_BYTES,
} from '../../../../../shared/desktop-api';
import { bodyPreviewRequest } from '../../utils';

describe('body preview read range', () => {
  it('limits large previews and asks Core to stream-decode compressed input', () => {
    expect(BODY_PREVIEW_MAX_BYTES).toBe(2 * 1024 * 1024);
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
      oversizeImage: false,
    });
    expect(bodyPreviewRequest({
      bodyHash: 'b'.repeat(64),
      encodedSize: 512,
      truncated: false,
      decodeStatus: 'ok',
      contentEncoding: 'gzip',
    })).toEqual({ length: BODY_PREVIEW_MAX_BYTES, decode: true, limited: false, oversizeImage: false });
  });

  it('keeps the image read and decoded-output budgets separate from text previews', () => {
    for (const contentEncoding of [undefined, 'gzip']) {
      expect(bodyPreviewRequest({
        bodyHash: 'd'.repeat(64), mediaType: 'image/png', encodedSize: 3 * 1024 * 1024,
        truncated: false, decodeStatus: 'ok', contentEncoding,
      })).toEqual({
        length: contentEncoding ? IMAGE_PREVIEW_MAX_BYTES : 3 * 1024 * 1024,
        decode: Boolean(contentEncoding), limited: false, oversizeImage: false,
      });
    }
  });

  it('flags images past their own ceiling so no half image is ever decoded', () => {
    expect(IMAGE_PREVIEW_MAX_BYTES).toBe(16 * 1024 * 1024);
    expect(bodyPreviewRequest({
      bodyHash: 'c'.repeat(64),
      encodedSize: IMAGE_PREVIEW_MAX_BYTES + 1,
      truncated: false,
      decodeStatus: 'ok',
    }).oversizeImage).toBe(true);
    expect(bodyPreviewRequest({
      bodyHash: 'd'.repeat(64),
      encodedSize: IMAGE_PREVIEW_MAX_BYTES,
      truncated: false,
      decodeStatus: 'ok',
    }).oversizeImage).toBe(false);
  });
});
