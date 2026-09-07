import { createServer, request, type IncomingHttpHeaders } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpTrafficRunner } from '../../server/http/traffic';

describe('HTTP traffic controls', () => {
  let loopbackLab: HttpTrafficRunner | null = null;

  afterEach(async () => {
    await loopbackLab?.close();
    loopbackLab = null;
  });

  it('serves the existing echo body, headers and cookies to external clients', async () => {
    loopbackLab = await HttpTrafficRunner.start();

    const response = await readResponse(loopbackLab.url('/echo?value=one'));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body.toString('utf8'))).toEqual({
      workflow: 'capture',
      method: 'GET',
      path: '/echo?value=one',
      requestBody: '',
      ok: true,
    });
    expect(response.headers['x-interceptor-e2e']).toBe('loopback-lab');
    expect(response.headers['set-cookie']).toEqual([
      'interceptor_e2e=active; Path=/; HttpOnly',
      'workflow=capture; Path=/',
    ]);
  });

  it('preserves custom status, repeated headers and exact binary response bytes', async () => {
    loopbackLab = await HttpTrafficRunner.start();
    const body = Buffer.from([0, 1, 127, 128, 254, 255]);
    loopbackLab.respondWith('/binary', {
      statusCode: 207,
      headers: {
        'content-type': 'application/octet-stream',
        'set-cookie': ['first=one', 'second=two'],
        'x-custom': 'configured',
      },
      body,
    });

    const response = await readResponse(loopbackLab.url('/binary'));

    expect(response.statusCode).toBe(207);
    expect(response.body).toEqual(body);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['set-cookie']).toEqual(['first=one', 'second=two']);
    expect(response.headers['x-custom']).toBe('configured');
  });

  it('sends absolute-form proxy requests with caller headers and unmodified binary bodies', async () => {
    loopbackLab = await HttpTrafficRunner.start();
    const requestPath = '/proxy-upload';
    const absolutePath = loopbackLab.url(requestPath);
    const body = Buffer.from([0, 255, 128, 10]);
    loopbackLab.respondWith(absolutePath, { statusCode: 201, body: 'accepted' });

    const response = await loopbackLab.requestThroughProxy(loopbackLab.port, requestPath, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/octet-stream', 'x-upload': 'binary' },
    });

    expect(response).toEqual({ statusCode: 201, body: 'accepted' });
    expect(loopbackLab.observation(absolutePath)).toMatchObject({
      method: 'PUT',
      path: absolutePath,
      body,
      headers: { 'x-upload': 'binary', 'content-type': 'application/octet-stream' },
    });
    expect(loopbackLab.evidence()).toEqual([
      expect.objectContaining({ path: absolutePath, bodyBase64: body.toString('base64') }),
    ]);
  });

  it('holds only the selected response and releases it after origin observation', async () => {
    loopbackLab = await HttpTrafficRunner.start();
    const release = loopbackLab.holdResponse('/held');
    let completed = false;
    const heldResponse = readResponse(loopbackLab.url('/held')).then((response) => {
      completed = true;
      return response;
    });

    await vi.waitFor(() => expect(loopbackLab?.observation('/held')).toBeDefined());
    expect(completed).toBe(false);
    expect((await readResponse(loopbackLab.url('/unrelated'))).statusCode).toBe(200);
    expect(completed).toBe(false);

    release();

    expect((await heldResponse).statusCode).toBe(200);
    expect(loopbackLab.responseWasAborted('/held')).toBe(false);
  });

  it('aborts a real pending client and observes the origin response disconnect', async () => {
    loopbackLab = await HttpTrafficRunner.start();
    const requestPath = '/cancel';
    const absolutePath = loopbackLab.url(requestPath);
    loopbackLab.holdResponse(absolutePath);
    const pendingRequest = loopbackLab.startAbortableRequestThroughProxy(
      loopbackLab.port,
      requestPath,
    );
    const outcome = pendingRequest.result.catch((error: unknown) => error);
    await vi.waitFor(() => expect(loopbackLab?.observation(absolutePath)).toBeDefined());

    pendingRequest.abort();

    expect(await outcome).toEqual(new Error('E2E client aborted request'));
    await vi.waitFor(() => expect(loopbackLab?.responseWasAborted(absolutePath)).toBe(true));
  });

  it('releases pending responses during shutdown and frees the origin port', async () => {
    loopbackLab = await HttpTrafficRunner.start();
    const port = loopbackLab.port;
    loopbackLab.holdResponse('/shutdown');
    const response = readResponse(loopbackLab.url('/shutdown'));
    await vi.waitFor(() => expect(loopbackLab?.observation('/shutdown')).toBeDefined());

    await loopbackLab.close();
    loopbackLab = null;

    expect((await response).statusCode).toBe(200);
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

function readResponse(url: string): Promise<{
  readonly body: Buffer;
  readonly headers: IncomingHttpHeaders;
  readonly statusCode: number | undefined;
}> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { headers: { connection: 'close' } }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.once('error', reject);
      incoming.once('end', () => resolve({
        body: Buffer.concat(chunks),
        headers: incoming.headers,
        statusCode: incoming.statusCode,
      }));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}