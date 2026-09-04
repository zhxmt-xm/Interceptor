import {
  createServer as createTcpServer,
  type Server as TcpServer,
  type Socket,
} from 'node:net';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:tls';
import type { AddressInfo } from 'node:net';

import { generateCACertificate } from 'mockttp';
import { afterEach, describe, expect, it } from 'vitest';

import { TlsProbeService } from '../../entry';

const servers: Array<TcpServer | TlsServer> = [];
const sockets = new Set<Socket>();

/** Listen on a random loopback port and return it. */
async function listen(server: TcpServer | TlsServer): Promise<number> {
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('TlsProbeService integration', () => {
  it('reads a real TLS handshake without sending application data', async () => {
    const certificate = await generateCACertificate({
      subject: { commonName: '127.0.0.1' },
    });
    let applicationBytes = 0;
    const server = createTlsServer({
      cert: certificate.cert,
      key: certificate.key,
      ALPNProtocols: ['h2', 'http/1.1'],
    }, (socket) => {
      socket.on('data', (chunk) => { applicationBytes += chunk.byteLength; });
    });
    const port = await listen(server);

    const result = await new TlsProbeService().probe('127.0.0.1', port, 1_000);

    expect(result).toMatchObject({
      ok: true,
      alpn: 'h2',
      authorized: false,
    });
    expect(result.protocol).toMatch(/^TLSv1\.[23]$/);
    expect(result.cipher.length).toBeGreaterThan(0);
    expect(result.certificates).toHaveLength(1);
    expect(applicationBytes).toBe(0);
  });

  it('destroys a stalled TLS socket when its caller aborts', async () => {
    let reportAccepted!: () => void;
    let reportClosed!: () => void;
    const accepted = new Promise<void>((resolve) => { reportAccepted = resolve; });
    const closed = new Promise<void>((resolve) => { reportClosed = resolve; });
    const server = createTcpServer((socket) => {
      reportAccepted();
      socket.once('close', reportClosed);
    });
    const port = await listen(server);
    const abortController = new AbortController();
    const result = new TlsProbeService().probe(
      '127.0.0.1',
      port,
      1_000,
      abortController.signal,
    );
    await accepted;

    abortController.abort();

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: 'The TLS probe was cancelled.',
    });
    await closed;
  });
});