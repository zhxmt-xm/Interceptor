import type { BodyRemainderNotice, BodyRemainderSample } from '../state/types';

export type ReadonlyBodyDescription =
  | { readonly kind: 'text'; readonly text: string; readonly mediaType: string; readonly name: string }
  | { readonly kind: 'image'; readonly byteLength: number; readonly prefixBase64: string; readonly suffixBase64: string; readonly fillByte: number; readonly mediaType: string; readonly name: string };

export function describeReadonlyBody(sample: BodyRemainderSample, notice: BodyRemainderNotice): ReadonlyBodyDescription {
  if (notice === 'image-limit') {
    return {
      kind: 'image',
      byteLength: 17 * 1024 * 1024,
      prefixBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAQ//rnRFWHRmaXh0dXJlAA==',
      suffixBase64: 'r7BfBgAAAA1JREFUeAFjyIr+8B8ABZ0CtV+36z4AAAAASUVORK5CYII=',
      fillByte: 32,
      mediaType: 'image/png',
      name: 'checkout-receipt.png',
    };
  }
  const itemCount = notice === 'manual-format' ? 18500
    : notice === 'truncated' ? 29500
      : notice === 'auto-format' ? 6000 : 24;
  const order = {
    cartId: 'c_9f83a1',
    requestId: 'checkout-batch-4281',
    currency: 'USD',
    coupon: 'WELCOME20',
    items: Array.from({ length: itemCount }, (_, index) => ({
      sku: `keyboard-${1042 + index}`,
      quantity: index % 3 + 1,
      unitPrice: 89.9,
      warehouse: 'ap-east-1',
    })),
    delivery: { method: 'standard', country: 'US' },
  };
  const json = JSON.stringify(order, null, notice === 'manual-format' ? undefined : 2);
  return {
    kind: 'text',
    text: sample === 'invalid-json' ? json.slice(0, -1) : json,
    mediaType: 'application/json',
    name: 'checkout-batch.json',
  };
}

export function describeLimitedCaptureBody(): ReadonlyBodyDescription {
  const start = '<!doctype html>\n<html lang="zh-CN">\n  <head>\n    <meta charset="utf-8" />\n    <title>大唐 EV</title>\n  </head>\n  <body>\n';
  const row = '    <section>配置参数 · 大唐 EV</section>\n';
  const end = '  </body>\n</html>';
  const encoder = new TextEncoder();
  const remaining = 12 * 1024 * 1024 - encoder.encode(start + end).byteLength;
  const rowBytes = encoder.encode(row).byteLength;
  return {
    kind: 'text',
    text: start + row.repeat(Math.floor(remaining / rowBytes)) + ' '.repeat(remaining % rowBytes) + end,
    mediaType: 'text/html; charset=utf-8',
    name: 'datang-response.html',
  };
}

export function readonlyBodyBytes(description: ReadonlyBodyDescription): Uint8Array {
  if (description.kind === 'text') return new TextEncoder().encode(description.text);
  // A valid 1px PNG with a large, CRC-checked ancillary tEXt chunk.
  const bytes = new Uint8Array(description.byteLength).fill(description.fillByte);
  const prefix = atob(description.prefixBase64);
  const suffix = atob(description.suffixBase64);
  bytes.set(Uint8Array.from(prefix, (character) => character.charCodeAt(0)));
  bytes.set(Uint8Array.from(suffix, (character) => character.charCodeAt(0)), bytes.byteLength - suffix.length);
  return bytes;
}

export function padReadonlyText(source: string, byteLength: number): string {
  return source + ' '.repeat(byteLength - new TextEncoder().encode(source).byteLength);
}
