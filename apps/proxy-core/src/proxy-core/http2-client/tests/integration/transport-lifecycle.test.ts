import { createHash } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { once } from 'node:events';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';

import { generateCACertificate } from 'mockttp';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { CoreApplication, type CoreLifecycleMessage } from '../../../core-application';

describe('Core TLS/H2 client lifecycle', () => {
  let server: http2.Http2SecureServer;
  let coreApplication: CoreApplication;
  let lifecycleMessages: CoreLifecycleMessage[];
  let exitProcess: MockInstance<typeof process.exit>;
  let stopped = false;
  let originUrl = '';
  const sourceSessions = new Set<http2.ServerHttp2Session>();
  const sourceSockets = new Set<TLSSocket>();
  const clientSessions = new Set<http2.ClientHttp2Session>();
  const sourceErrors: string[] = [];
  const sessionErrors: string[] = [];
  const createdChannel = channel('http2.client.stream.created');
  let hadSubscribers = false;

  /** Start one Core generation without a process exit or unrelated storage. */
  function startCore(): void {
    stopped = false;
    lifecycleMessages = [];
    coreApplication = new CoreApplication({
      on: () => undefined,
      postMessage: (message) => lifecycleMessages.push(message),
    });
    coreApplication.start();
    coreApplication.start();
  }

  /** Await the same stopped/exit boundary used by Main. */
  async function stopCore(): Promise<void> {
    if (stopped) return;
    stopped = true;
    const previousExits = exitProcess.mock.calls.length;
    coreApplication.stop();
    coreApplication.stop();
    await expect.poll(() => exitProcess.mock.calls.length).toBe(previousExits + 1);
    expect(lifecycleMessages.at(-1)?.type).toBe('stopped');
  }

  /** Open a real TLS/H2 client in the Core process. */
  async function connectClient(initialWindowSize = 8 * 1024 * 1024): Promise<http2.ClientHttp2Session> {
    const session = http2.connect(originUrl, {
      rejectUnauthorized: false,
      settings: { initialWindowSize },
    });
    clientSessions.add(session);
    session.on('error', (error) => sessionErrors.push(error.message));
    await once(session, 'connect');
    return session;
  }

  /** Collect only test-client bytes, optionally applying real stream backpressure. */
  function receive(stream: http2.ClientHttp2Stream, pauseAfter = Infinity) {
    const result = {
      bytes: 0, ended: false, closed: false, paused: false,
      hash: createHash('sha256'), errors: [] as string[],
    };
    stream.on('data', (chunk: Buffer) => {
      result.bytes += chunk.length;
      result.hash.update(chunk);
      if (!result.paused && result.bytes >= pauseAfter) {
        result.paused = true;
        stream.pause();
      }
    });
    stream.on('end', () => { result.ended = true; });
    stream.on('close', () => { result.closed = true; });
    stream.on('error', (error: NodeJS.ErrnoException) => result.errors.push(error.code ?? error.message));
    return result;
  }

  beforeEach(async () => {
    hadSubscribers = createdChannel.hasSubscribers;
    sourceErrors.length = 0;
    sessionErrors.length = 0;
    exitProcess = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const certificate = await generateCACertificate();
    server = http2.createSecureServer(certificate);
    server.on('secureConnection', (socket) => sourceSockets.add(socket));
    server.on('session', (session) => {
      sourceSessions.add(session);
      session.on('error', (error) => sourceErrors.push(error.message));
    });
    server.on('stream', (stream) => {
      stream.on('error', (error) => sourceErrors.push(error.message));
      stream.resume();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    originUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    startCore();
  });

  afterEach(async () => {
    try {
      await stopCore();
    } finally {
      for (const session of clientSessions) session.destroy();
      for (const session of sourceSessions) session.destroy();
      for (const socket of sourceSockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      clientSessions.clear();
      sourceSessions.clear();
      sourceSockets.clear();
      exitProcess.mockRestore();
    }
  });

  it.each([
    ['no-headers', false], ['no-headers', true],
    ['empty-body', false], ['empty-body', true],
    ['partial-body', false], ['partial-body', true],
  ] as const)('fails premature TLS EOF with %s (GOAWAY=%s)', async (stage, goaway) => {
    let sourceStream: http2.ServerHttp2Stream | undefined;
    server.on('stream', (stream) => {
      sourceStream = stream;
      if (stage !== 'no-headers') {
        stream.respond({ ':status': 200 });
        if (stage === 'partial-body') stream.write(Buffer.alloc(64 * 1024, 0x61));
      }
    });
    const client = await connectClient();
    const stream = client.request({ ':path': '/incomplete', ':method': 'POST' });
    let headersReceived = false;
    let ended = false;
    let closed = false;
    let bytes = 0;
    const errors: string[] = [];
    stream.on('response', () => { headersReceived = true; });
    stream.on('end', () => { ended = true; });
    stream.on('close', () => { closed = true; });
    stream.on('error', (error: NodeJS.ErrnoException) => errors.push(error.code ?? error.message));
    if (stage !== 'no-headers') stream.on('data', (chunk: Buffer) => { bytes += chunk.length; });
    stream.end('send-once');
    await expect.poll(() => sourceStream).toBeDefined();
    if (stage !== 'no-headers') await expect.poll(() => headersReceived).toBe(true);
    if (stage === 'partial-body') await expect.poll(() => bytes).toBe(64 * 1024);
    if (goaway) sourceStream!.session!.goaway(http2.constants.NGHTTP2_NO_ERROR);
    for (const socket of sourceSockets) socket.end();

    await expect.poll(() => closed).toBe(true);
    expect(ended).toBe(false);
    expect(errors).toEqual(['ERR_H2_UPSTREAM_INCOMPLETE']);
    await expect.poll(() => client.destroyed).toBe(true);
  });

  it('drains a paused stream independently of a completed sibling before closing TLS', async () => {
    const body = Buffer.alloc(4 * 1024 * 1024, 0x62);
    const sourceStreamsByPath = new Map<string, http2.ServerHttp2Stream>();
    const requestCounts = new Map<string, number>();
    server.on('stream', (stream, headers) => {
      const requestPath = String(headers[':path']);
      sourceStreamsByPath.set(requestPath, stream);
      requestCounts.set(requestPath, (requestCounts.get(requestPath) ?? 0) + 1);
      stream.respond({ ':status': 200, 'content-length': requestPath === '/paused' ? body.length : 2 });
      if (requestPath === '/paused') stream.write(body.subarray(0, 256 * 1024));
      else stream.end('ok');
    });
    const client = await connectClient();
    const pausedStream = client.request({ ':path': '/paused', ':method': 'POST' });
    const paused = receive(pausedStream, 64 * 1024);
    pausedStream.end('paused-post');
    const siblingStream = client.request({ ':path': '/sibling', ':method': 'POST' });
    const sibling = receive(siblingStream);
    siblingStream.end('sibling-post');
    await expect.poll(() => paused.paused).toBe(true);
    await expect.poll(() => sibling.ended).toBe(true);
    const sourceStream = sourceStreamsByPath.get('/paused')!;
    const sourceSession = sourceStream.session!;
    sourceSession.close();
    sourceStream.end(body.subarray(256 * 1024));
    await expect.poll(() => sourceSession.destroyed).toBe(true);

    expect(pausedStream.destroyed).toBe(false);
    expect(pausedStream.readableLength).toBeGreaterThan(0);
    pausedStream.resume();
    await expect.poll(() => paused.ended).toBe(true);
    expect(paused.bytes).toBe(body.length);
    expect(paused.hash.digest('hex')).toBe(createHash('sha256').update(body).digest('hex'));
    expect(paused.errors).toEqual([]);
    expect(sibling.errors).toEqual([]);
    expect([...requestCounts.entries()]).toEqual([['/paused', 1], ['/sibling', 1]]);
    await expect.poll(() => client.destroyed).toBe(true);
    expect(sourceErrors).toEqual([]);
    expect(sessionErrors).toEqual([]);
  });

  it('preserves END_STREAM on an empty response', async () => {
    server.on('stream', (stream) => {
      stream.session!.close();
      stream.respond({ ':status': 204 }, { endStream: true });
    });
    const client = await connectClient();
    const stream = client.request({ ':path': '/empty' });
    const received = receive(stream);
    stream.end();
    await expect.poll(() => received.ended).toBe(true);
    expect(received.bytes).toBe(0);
    expect(received.errors).toEqual([]);
    await expect.poll(() => client.destroyed).toBe(true);
  });

  it('keeps a response larger than the receive window under real backpressure', async () => {
    const windowSize = 128 * 1024;
    const bodySize = 32 * 1024 * 1024;
    const chunk = Buffer.alloc(64 * 1024, 0x63);
    const expectedHash = createHash('sha256');
    for (let bytes = 0; bytes < bodySize; bytes += chunk.length) expectedHash.update(chunk);
    let sentBytes = 0;
    let sourceStream: http2.ServerHttp2Stream | undefined;
    server.on('stream', (stream) => {
      sourceStream = stream;
      stream.session!.close();
      stream.respond({ ':status': 200, 'content-length': bodySize });
      const writeUntilBlocked = (): void => {
        while (sentBytes < bodySize) {
          sentBytes += chunk.length;
          if (!stream.write(chunk)) {
            stream.once('drain', writeUntilBlocked);
            return;
          }
        }
        stream.end();
      };
      writeUntilBlocked();
    });
    const client = await connectClient(windowSize);
    const stream = client.request({ ':path': '/larger-than-window' });
    const received = receive(stream, chunk.length);
    stream.end();
    await expect.poll(() => received.paused).toBe(true);
    await expect.poll(() => stream.readableLength).toBeGreaterThanOrEqual(windowSize - chunk.length);
    expect(stream.readableLength).toBeLessThanOrEqual(windowSize);
    expect(sentBytes).toBeLessThan(bodySize);
    expect(sourceStream!.writableFinished).toBe(false);

    stream.resume();
    await expect.poll(() => received.ended).toBe(true);
    expect(received.bytes).toBe(bodySize);
    expect(received.hash.digest('hex')).toBe(expectedHash.digest('hex'));
    expect(received.errors).toEqual([]);
    await expect.poll(() => client.destroyed).toBe(true);
    expect(sourceErrors).toEqual([]);
  });

  it.each(['origin-cancel', 'client-cancel', 'error-goaway'] as const)(
    'preserves existing %s without classifying it as premature EOF', async (ending) => {
      let sourceStream: http2.ServerHttp2Stream | undefined;
      server.on('stream', (stream) => {
        sourceStream = stream;
        stream.respond({ ':status': 200 });
        stream.write('prefix');
      });
      const client = await connectClient();
      const stream = client.request({ ':path': '/cancel' });
      const received = receive(stream);
      stream.end();
      await expect.poll(() => received.bytes).toBe(6);
      if (ending === 'origin-cancel') sourceStream!.close(http2.constants.NGHTTP2_CANCEL);
      else if (ending === 'client-cancel') stream.close(http2.constants.NGHTTP2_CANCEL);
      else sourceStream!.session!.goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
      await expect.poll(() => received.closed).toBe(true);
      expect(received.errors).not.toContain('ERR_H2_UPSTREAM_INCOMPLETE');
      expect(coreApplication.coreDiagnostics.recent(100).records
        .some((record) => record.errorCode === 'ERR_H2_UPSTREAM_INCOMPLETE')).toBe(false);
    },
  );

  it('closes owned sessions and removes observation across Core generations', async () => {
    server.on('stream', (stream) => {
      stream.respond({ ':status': 200 });
      stream.write(Buffer.alloc(256 * 1024));
    });
    for (let generation = 0; generation < 2; generation += 1) {
      if (generation > 0) startCore();
      const client = await connectClient();
      const stream = client.request({ ':path': `/generation/${generation}` });
      const received = receive(stream, 64 * 1024);
      stream.end();
      await expect.poll(() => received.paused).toBe(true);
      expect(createdChannel.hasSubscribers).toBe(true);
      await stopCore();
      expect(client.destroyed).toBe(true);
      expect(received.closed).toBe(true);
      expect(createdChannel.hasSubscribers).toBe(hadSubscribers);
    }
    const outsideCore = await connectClient();
    const stream = outsideCore.request({ ':path': '/outside-core' });
    const received = receive(stream);
    stream.end();
    await expect.poll(() => received.bytes).toBeGreaterThan(0);
    expect(outsideCore.socket.allowHalfOpen).toBe(false);
  });

  it.each(['complete', 'incomplete', 'cancel', 'timeout'] as const)(
    'shares lifecycle with the Composer %s path', async (ending) => {
      let sourceStream: http2.ServerHttp2Stream | undefined;
      const body = 'composer-response';
      server.on('stream', (stream) => {
        sourceStream = stream;
        if (ending === 'complete') {
          stream.session!.close();
          stream.respond({ ':status': 200 });
          stream.end(body);
        }
      });
      const abortController = new AbortController();
      const response = coreApplication.executeCommand({
        type: 'composer.send',
        payload: {
          url: `${originUrl}/composer`, method: 'POST', protocol: 'h2',
          headers: [], body: 'composer-post',
          ...(ending === 'timeout' ? { timeoutMs: 200 } : {}),
        },
      }, abortController.signal);
      await expect.poll(() => sourceStream).toBeDefined();
      if (ending === 'incomplete') for (const socket of sourceSockets) socket.end();
      if (ending === 'cancel') abortController.abort();
      let result: Awaited<typeof response> | undefined;
      void response.then((value) => { result = value; });
      await expect.poll(() => result).toBeDefined();
      if (ending === 'complete') {
        expect(result).toMatchObject({
          type: 'composer.response',
          payload: { ok: true, status: 200, totalBytes: Buffer.byteLength(body), body: new TextEncoder().encode(body) },
        });
      } else {
        expect(result).toMatchObject({
          type: 'composer.response',
          payload: {
            ok: false,
            error: ending === 'cancel' ? 'Composer request was cancelled.'
              : ending === 'timeout' ? 'Composer request timed out.'
                : 'Upstream TLS ended before the HTTP/2 response completed.',
          },
        });
      }
      await expect.poll(() => [...sourceSessions].every((session) => session.destroyed)).toBe(true);
    },
  );
});
