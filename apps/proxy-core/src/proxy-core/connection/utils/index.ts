import type { PeerCertificate } from 'node:tls';
import type * as tls from 'node:tls';

import type {
  ConnectionCertificate,
  ConnectionProbeResult,
} from '../interfaces';

/** 构造不含握手数据的稳定失败结果。 */
export function failure(message: string): ConnectionProbeResult {
  return {
    ok: false,
    error: message,
    protocol: '',
    cipher: '',
    alpn: '',
    authorized: false,
    certificates: [],
  };
}

/** 将证书 DN 主体或签发者规范化为简短文本。 */
export function distinguishedName(
  entry: PeerCertificate['subject'] | undefined,
): string {
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const parts: string[] = [];
  const cn = (entry as Record<string, unknown>).CN;
  const org = (entry as Record<string, unknown>).O;
  if (typeof cn === 'string' && cn) {
    parts.push(`CN=${cn}`);
  }
  if (typeof org === 'string' && org) {
    parts.push(`O=${org}`);
  }
  return parts.join(', ');
}

/** 沿 issuerCertificate 收集完整去重证书链，并防止自签环路。 */
export function collectChain(socket: tls.TLSSocket): ConnectionCertificate[] {
  const chain: ConnectionCertificate[] = [];
  const seen = new Set<string>();
  let cert: tls.DetailedPeerCertificate | undefined =
    socket.getPeerCertificate(true);
  while (
    cert &&
    typeof cert.fingerprint256 === 'string' &&
    cert.fingerprint256.length > 0 &&
    !seen.has(cert.fingerprint256)
  ) {
    seen.add(cert.fingerprint256);
    chain.push({
      subject: distinguishedName(cert.subject),
      issuer: distinguishedName(cert.issuer),
      validFrom: cert.valid_from ?? '',
      validTo: cert.valid_to ?? '',
      serialNumber: cert.serialNumber ?? '',
      fingerprint256: cert.fingerprint256,
    });
    const issuer: tls.DetailedPeerCertificate | undefined =
      cert.issuerCertificate;
    if (!issuer || issuer === cert) {
      break;
    }
    cert = issuer;
  }
  return chain;
}