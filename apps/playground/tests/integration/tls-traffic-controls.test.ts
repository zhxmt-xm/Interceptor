import { once } from 'node:events';
import { createServer } from 'node:net';
import { connect, type TLSSocket } from 'node:tls';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TlsTrafficRunner } from '../../server/tls/traffic';

describe('TLS traffic controls', () => {
  let tlsOriginLab: TlsTrafficRunner | null = null;
  const clients: TLSSocket[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.destroy();
    await tlsOriginLab?.close();
    tlsOriginLab = null;
  });

  it('counts completed ALPN handshakes separately from application bytes', async () => {
    tlsOriginLab = await TlsTrafficRunner.start();
    const client = connect({
      host: '127.0.0.1',
      port: tlsOriginLab.port,
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1'],
    });
    clients.push(client);
    await once(client, 'secureConnect');

    await vi.waitFor(() => expect(tlsOriginLab?.handshakeCount()).toBe(1));
    expect(tlsOriginLab.applicationByteCount()).toBe(0);
    expect(client.alpnProtocol).toBe('h2');
    expect(client.authorized).toBe(false);
  });

  it('records actual received application bytes after negotiation', async () => {
    tlsOriginLab = await TlsTrafficRunner.start();
    const client = connect({
      host: '127.0.0.1',
      port: tlsOriginLab.port,
      rejectUnauthorized: false,
      ALPNProtocols: ['http/1.1'],
    });
    clients.push(client);
    await once(client, 'secureConnect');
    const bytes = Buffer.from('GET /observed HTTP/1.1\r\nHost: localhost\r\n\r\n');

    client.write(bytes);

    await vi.waitFor(() => expect(tlsOriginLab?.applicationByteCount()).toBe(bytes.byteLength));
    expect(tlsOriginLab.handshakeCount()).toBe(1);
  });

  it('records application bytes consumed by the native HTTP/2 parser', async () => {
    tlsOriginLab = await TlsTrafficRunner.start();
    const client = connect({
      host: '127.0.0.1',
      port: tlsOriginLab.port,
      rejectUnauthorized: false,
      ALPNProtocols: ['h2'],
    });
    clients.push(client);
    await once(client, 'secureConnect');
    await vi.waitFor(() => expect(tlsOriginLab?.handshakeCount()).toBe(1));
    const bytes = Buffer.concat([
      Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'),
      Buffer.from([0, 0, 0, 4, 0, 0, 0, 0, 0]),
    ]);

    client.write(bytes);

    await vi.waitFor(() => expect(tlsOriginLab?.applicationByteCount()).toBe(bytes.byteLength));
    const closed = once(client, 'close');
    client.destroy();
    await closed;
    expect(tlsOriginLab.applicationByteCount()).toBe(bytes.byteLength);
  });

  it('closes accepted connections and frees the TLS listener port', async () => {
    tlsOriginLab = await TlsTrafficRunner.start();
    const port = tlsOriginLab.port;
    const client = connect({ host: '127.0.0.1', port, rejectUnauthorized: false });
    clients.push(client);
    await once(client, 'secureConnect');
    await vi.waitFor(() => expect(tlsOriginLab?.handshakeCount()).toBe(1));
    const errorCodes: string[] = [];
    client.on('error', (error: NodeJS.ErrnoException) => {
      errorCodes.push(error.code ?? error.message);
    });
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()));

    await tlsOriginLab.close();
    tlsOriginLab = null;
    await closed;

    expect(client.destroyed).toBe(true);
    expect(errorCodes.every((code) => code === 'ECONNRESET')).toBe(true);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
});