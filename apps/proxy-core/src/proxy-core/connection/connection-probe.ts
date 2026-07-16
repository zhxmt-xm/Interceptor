import * as tls from 'node:tls';
import type { PeerCertificate } from 'node:tls';

/**
 * 按需 TLS 探测：对目标 host:port 建立 TLS 握手，读取真实协议版本/加密套件/ALPN 与
 * 完整证书链（不发送应用数据）。供 Connection/TLS 详情视图查看当前源站证书信息。
 *
 * 允许自签证书（rejectUnauthorized=false）以便探测任意/开发服务，但如实回传
 * authorized 与证书链供用户检视。
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CHAIN = 10;

export interface ConnectionCertificate {
  readonly subject: string;
  readonly issuer: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly serialNumber: string;
  readonly fingerprint256: string;
}

export interface ConnectionProbeResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly protocol: string;
  readonly cipher: string;
  readonly alpn: string;
  readonly authorized: boolean;
  readonly authorizationError?: string;
  readonly certificates: ConnectionCertificate[];
}

function failure(message: string): ConnectionProbeResult {
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

/** 证书 DN 主体/签发者规范化为 "CN=…, O=…" 简述。 */
function distinguishedName(entry: PeerCertificate['subject'] | undefined): string {
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

/** 沿 issuerCertificate 链向上收集证书，去重并限长，防自签环路。 */
function collectChain(socket: tls.TLSSocket): ConnectionCertificate[] {
  const chain: ConnectionCertificate[] = [];
  const seen = new Set<string>();
  let cert: tls.DetailedPeerCertificate | undefined = socket.getPeerCertificate(true);
  while (
    cert &&
    typeof cert.fingerprint256 === 'string' &&
    cert.fingerprint256.length > 0 &&
    !seen.has(cert.fingerprint256) &&
    chain.length < MAX_CHAIN
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
    const issuer: tls.DetailedPeerCertificate | undefined = cert.issuerCertificate;
    if (!issuer || issuer === cert) {
      break;
    }
    cert = issuer;
  }
  return chain;
}

export function probeConnection(
  host: string,
  port: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ConnectionProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ConnectionProbeResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        ALPNProtocols: ['h2', 'http/1.1'],
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        finish({
          ok: true,
          protocol: socket.getProtocol() ?? '',
          cipher: socket.getCipher()?.name ?? '',
          alpn: typeof socket.alpnProtocol === 'string' ? socket.alpnProtocol : '',
          authorized: socket.authorized,
          authorizationError: socket.authorizationError
            ? String(socket.authorizationError)
            : undefined,
          certificates: collectChain(socket),
        });
        socket.end();
      },
    );

    socket.on('error', (error) => finish(failure(error.message)));
    socket.on('timeout', () => {
      socket.destroy();
      finish(failure('The TLS connection timed out.'));
    });
  });
}
