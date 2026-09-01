import { createServer, request, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { TrafficLab } from '../../server/traffic-lab';

describe('TrafficLab', () => {
  const closeables: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(closeables.splice(0).map((close) => close()));
  });

  it('runs H1 JSON through an explicit proxy and returns client and origin facts', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-json', proxy.port);

    expect(result).toMatchObject({
      scenarioId: 'h1-json',
      state: 'complete',
      request: {
        method: 'GET',
        path: '/playground/h1-json',
      },
      response: {
        statusCode: 200,
      },
    });
    expect(result.response?.body).toContain('ord_42');
    expect(result.request?.bodyBytes).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the exact body received by the origin for a timed H1 upload', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-upload', proxy.port);

    expect(result.state).toBe('complete');
    expect(result.request?.method).toBe('POST');
    expect(result.request?.body).toBe('{"part":1,"message":"playground","done":true}');
    expect(result.request?.bodyBytes).toBe(Buffer.byteLength(result.request?.body ?? ''));
    expect(result.response?.body).toContain(`"receivedBytes": ${result.request?.bodyBytes}`);
  });

  it('reports every timed response chunk for an H1 stream', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-stream', proxy.port);

    expect(result.state).toBe('complete');
    expect(result.response?.body).toBe('{"chunk":1}\n{"chunk":2}\n{"chunk":3}\n');
    expect(result.response?.chunkTimingsMs).toHaveLength(3);
    expect(result.response?.chunkTimingsMs[1]).toBeGreaterThan(
      result.response?.chunkTimingsMs[0] ?? 0,
    );
  });

  it('keeps origin request facts when the H1 origin resets the connection', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-failure', proxy.port);

    expect(result.state).toBe('failed');
    expect(result.request).toMatchObject({
      method: 'GET',
      path: '/playground/h1-failure',
    });
    expect(result.response).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('does not fabricate origin facts when the proxy cannot be reached', async () => {
    const unavailableProxy = await startForwardProxy();
    const proxyPort = unavailableProxy.port;
    await unavailableProxy.close();
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-json', proxyPort);

    expect(result.state).toBe('failed');
    expect(result.request).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('settles as failed when a proxy closes a partially received response', async () => {
    const proxy = await startPartialResponseProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-stream', proxy.port);

    expect(result.state).toBe('failed');
    expect(result.error).toBeTruthy();
  });
});

async function startPartialResponseProxy(): Promise<{
  close: () => Promise<void>;
  port: number;
}> {
  const server = createServer((_incoming, outgoing) => {
    outgoing.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    outgoing.write('{"chunk":1}\n');
    setTimeout(() => outgoing.destroy(new Error('partial response closed')), 10);
  });
  const port = await listen(server);
  return { close: () => close(server), port };
}

async function startForwardProxy(): Promise<{
  close: () => Promise<void>;
  port: number;
}> {
  const server = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url ?? '/');
    const forwarded = request(target, {
      headers: { ...incoming.headers, host: target.host },
      method: incoming.method,
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on('error', (error) => outgoing.destroy(error));
    incoming.pipe(forwarded);
  });
  const port = await listen(server);
  return { close: () => close(server), port };
}

async function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Test proxy did not expose a numeric port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

async function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}