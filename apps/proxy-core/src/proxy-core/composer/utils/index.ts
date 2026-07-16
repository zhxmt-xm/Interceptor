import type { OutgoingHttpHeaders } from 'node:http';
import type * as http2 from 'node:http2';
import type { TLSSocket } from 'node:tls';

import type {
  ComposerHeaderPair,
  ComposerTlsInfo,
} from '../interfaces';

/** 把用户 header 对合并为 Node 出站 header 对象，同名值合并为数组。 */
export function buildOutgoingHeaders(
  pairs: readonly ComposerHeaderPair[],
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const pair of pairs) {
    const key = pair.name;
    if (!key) {
      continue;
    }
    const existing = headers[key];
    if (existing === undefined) {
      headers[key] = pair.value;
    } else if (Array.isArray(existing)) {
      existing.push(pair.value);
    } else {
      headers[key] = [String(existing), pair.value];
    }
  }
  return headers;
}

/** 把 HTTP/1.1 rawHeaders 扁平数组转为有序 name/value 对。 */
export function rawHeaderPairs(raw: string[]): ComposerHeaderPair[] {
  const pairs: ComposerHeaderPair[] = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    pairs.push({ name: raw[index] ?? '', value: raw[index + 1] ?? '' });
  }
  return pairs;
}

/** 把 HTTP/2 响应头对象转为 name/value 对并跳过伪头。 */
export function h2HeaderPairs(
  headers: http2.IncomingHttpHeaders,
): ComposerHeaderPair[] {
  const pairs: ComposerHeaderPair[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(':') || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        pairs.push({ name, value: item });
      }
    } else {
      pairs.push({ name, value: String(value) });
    }
  }
  return pairs;
}

/** 从 TLS socket 提取协议、套件、ALPN 和证书摘要。 */
export function readTls(socket: TLSSocket | undefined): ComposerTlsInfo | null {
  if (!socket || typeof socket.getProtocol !== 'function') {
    return null;
  }
  const cipher = socket.getCipher?.();
  const cert = socket.getPeerCertificate?.();
  const subject = cert && typeof cert.subject === 'object'
    ? dnField(cert.subject.CN)
    : '';
  const issuer = cert && typeof cert.issuer === 'object'
    ? dnField(cert.issuer.CN)
    : '';
  return {
    protocol: socket.getProtocol() ?? '',
    cipher: cipher?.name ?? '',
    alpn: typeof socket.alpnProtocol === 'string'
      ? socket.alpnProtocol
      : 'http/1.1',
    subject,
    issuer,
    validFrom: cert?.valid_from ?? '',
    validTo: cert?.valid_to ?? '',
  };
}

/** 将可能多值的证书 DN 字段规范化为单个字符串。 */
function dnField(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : value ?? '';
}