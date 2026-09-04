import { createServer, type Server } from 'node:http';
import {
  createSecureServer,
  type ServerHttp2Session,
} from 'node:http2';
import type { AddressInfo } from 'node:net';

import { generateCACertificate } from 'mockttp';
import { afterEach, describe, expect, it } from 'vitest';

import { ComposerService } from '../../entry';

const servers: Server[] = [];

/** Start an HTTP origin that holds its response and reports client disconnect. */
async function startHeldOrigin(): Promise<{
  readonly aborted: Promise<void>;
  readonly received: Promise<void>;
  readonly url: string;
}> {
  let reportReceived!: () => void;
  let reportAborted!: () => void;
  const received = new Promise<void>((resolve) => { reportReceived = resolve; });
  const aborted = new Promise<void>((resolve) => { reportAborted = resolve; });
  const server = createServer((request, response) => {
    request.resume();
    request.once('end', reportReceived);
    response.once('close', () => {
      if (!response.writableEnded) reportAborted();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return { aborted, received, url: `http://127.0.0.1:${port}/cancel` };
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('ComposerService integration', () => {
  it('closes a successful HTTP/1.1 socket instead of pooling it', async () => {
    let reportClosed!: () => void;
    const closed = new Promise<void>((resolve) => { reportClosed = resolve; });
    const server = createServer((_request, response) => {
      response.setHeader('connection', 'keep-alive');
      response.socket?.once('close', reportClosed);
      response.end('ok');
    });
    server.keepAliveTimeout = 60_000;
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;

    await expect(new ComposerService().send({
      method: 'GET',
      url: `http://127.0.0.1:${port}/success`,
      headers: [],
      protocol: 'auto',
    })).resolves.toMatchObject({ ok: true, status: 200 });

    await closed;
  });

  it.each(['auto', 'h2'] as const)(
    'does not reach an origin when %s is already cancelled',
    async (protocol) => {
      let connectionCount = 0;
      const server = createServer((_request, response) => response.end());
      server.on('connection', () => { connectionCount += 1; });
      servers.push(server);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const port = (server.address() as AddressInfo).port;
      const abortController = new AbortController();
      abortController.abort();

      const result = await new ComposerService().send({
        method: 'POST',
        url: `${protocol === 'h2' ? 'https' : 'http'}://127.0.0.1:${port}/cancelled`,
        headers: [],
        body: 'request-body',
        protocol,
      }, abortController.signal);

      expect(result).toMatchObject({
        ok: false,
        error: 'Composer request was cancelled.',
      });
      expect(connectionCount).toBe(0);
    },
  );

  it('destroys a real HTTP request when its caller aborts', async () => {
    const origin = await startHeldOrigin();
    const abortController = new AbortController();
    const result = new ComposerService().send({
      method: 'POST',
      url: origin.url,
      headers: [],
      body: 'request-body',
      protocol: 'auto',
      timeoutMs: 500,
    }, abortController.signal);
    await origin.received;

    abortController.abort();

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: 'Composer request was cancelled.',
    });
    await expect(origin.aborted).resolves.toBeUndefined();
  });

  it('destroys a real HTTP/2 stream and session when its caller aborts', async () => {
    const certificate = await generateCACertificate({
      subject: { commonName: '127.0.0.1' },
    });
    const sessions = new Set<ServerHttp2Session>();
    let reportReceived!: () => void;
    let reportClosed!: () => void;
    const received = new Promise<void>((resolve) => { reportReceived = resolve; });
    const closed = new Promise<void>((resolve) => { reportClosed = resolve; });
    const server = createSecureServer({
      cert: certificate.cert,
      key: certificate.key,
      allowHTTP1: false,
    });
    server.on('session', (session) => {
      sessions.add(session);
      session.once('close', () => sessions.delete(session));
    });
    server.on('stream', (stream) => {
      stream.resume();
      stream.once('end', reportReceived);
      stream.once('close', reportClosed);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const abortController = new AbortController();
    const result = new ComposerService().send({
      method: 'POST',
      url: `https://127.0.0.1:${port}/cancel-h2`,
      headers: [],
      body: 'request-body',
      protocol: 'h2',
      timeoutMs: 500,
    }, abortController.signal);

    try {
      await received;
      abortController.abort();

      await expect(result).resolves.toMatchObject({
        ok: false,
        error: 'Composer request was cancelled.',
      });
      await closed;
    } finally {
      for (const session of sessions) session.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not let HTTP/2 headers override the approved method or URL', async () => {
    const certificate = await generateCACertificate({
      subject: { commonName: '127.0.0.1' },
    });
    let receivedHeaders: Readonly<Record<string, unknown>> = {};
    const server = createSecureServer({
      cert: certificate.cert,
      key: certificate.key,
      allowHTTP1: false,
    });
    server.on('stream', (stream, headers) => {
      receivedHeaders = headers;
      stream.respond({ ':status': 200 });
      stream.end('ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(new ComposerService().send({
        method: 'POST',
        url: `https://127.0.0.1:${port}/approved?mode=tool`,
        headers: [
          { name: ':method', value: 'DELETE' },
          { name: ':path', value: '/unapproved' },
          { name: ':authority', value: 'evil.test' },
        ],
        protocol: 'h2',
      })).resolves.toMatchObject({ ok: true, status: 200 });

      expect(receivedHeaders).toMatchObject({
        ':method': 'POST',
        ':path': '/approved?mode=tool',
        ':authority': `127.0.0.1:${port}`,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});