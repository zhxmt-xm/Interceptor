import 'reflect-metadata';

import { webcrypto } from 'node:crypto';
import type { AddressInfo, Socket } from 'node:net';
import { createServer, type Server as TlsServer } from 'node:tls';

import * as x509 from '@peculiar/x509';

const SIGNING_ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2_048,
} as const;

/** Encode one DER private key for Node TLS. */
function privateKeyPem(data: ArrayBuffer): string {
  const base64 = Buffer.from(data).toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/** Test-owned TLS origin that records handshake and application-data facts. */
export class TlsOriginLab {
  /** Real Node TLS listener. */
  private readonly server: TlsServer;

  /** Accepted sockets retained for deterministic cleanup. */
  private readonly sockets = new Set<Socket>();

  /** Number of completed TLS handshakes. */
  private completedHandshakes = 0;

  /** Number of application bytes received after TLS negotiation. */
  private receivedApplicationBytes = 0;

  /** Random loopback port selected by the operating system. */
  readonly port: number;

  /** Create one running lab after its random port is known. */
  private constructor(server: TlsServer, port: number) {
    this.server = server;
    this.port = port;
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
  }

  /** Generate a self-signed certificate and start a real ALPN-capable TLS origin. */
  static async start(): Promise<TlsOriginLab> {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    const keys = await webcrypto.subtle.generateKey(
      SIGNING_ALGORITHM,
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: '01',
      name: 'CN=Interceptor Requests E2E',
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 60 * 60 * 1000),
      signingAlgorithm: SIGNING_ALGORITHM,
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
          true,
        ),
      ],
    });
    const keyData = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    let tlsOriginLab: TlsOriginLab;
    const server = createServer({
      cert: certificate.toString('pem'),
      key: privateKeyPem(keyData),
      ALPNProtocols: ['h2', 'http/1.1'],
    }, (socket) => {
      tlsOriginLab.completedHandshakes += 1;
      socket.on('data', (chunk) => {
        tlsOriginLab.receivedApplicationBytes += chunk.byteLength;
      });
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('TLS origin did not expose a numeric port.'));
          return;
        }
        resolve((address as AddressInfo).port);
      });
    });
    tlsOriginLab = new TlsOriginLab(server, port);
    return tlsOriginLab;
  }

  /** Return the number of successful TLS handshakes. */
  handshakeCount(): number {
    return this.completedHandshakes;
  }

  /** Return application bytes received after TLS negotiation. */
  applicationByteCount(): number {
    return this.receivedApplicationBytes;
  }

  /** Destroy all accepted sockets and close the listener. */
  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}