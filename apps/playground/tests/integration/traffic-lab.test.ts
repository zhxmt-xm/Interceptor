import { createServer, request, type Server } from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TlsTrafficRunner } from '../../server/tls/traffic';
import { TrafficLab } from '../../server/scenarios/traffic-lab';

describe('TrafficLab', () => {
  const closeables: Array<() => Promise<void>> = [];

  afterEach(async () => {
    const errors: unknown[] = [];
    for (const close of closeables.splice(0).reverse()) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Traffic Lab test cleanup failed.');
  });

  it('describes every currently supported Capture scenario with an editable default draft', async () => {
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const scenarios = trafficLab.scenarios();

    expect(scenarios).toHaveLength(41);
    expect(new Set(scenarios.map((scenario) => scenario.group))).toEqual(new Set([
      'HTTP',
      'Bodies',
      'Encoding',
      'WebSocket',
      'gRPC',
      'TLS',
    ]));
    expect(scenarios.every((scenario) => (
      scenario.defaultDraft.kind.length > 0
      && typeof scenario.defaultDraft === 'object'
    ))).toBe(true);
  });

  it('rejects a Draft whose transport no longer matches the selected scenario', async () => {
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const webSocketScenario = trafficLab.scenarios().find((scenario) => scenario.id === 'ws-text');
    if (webSocketScenario === undefined) throw new Error('WebSocket text scenario is missing.');

    await expect(trafficLab.run('h1-json', webSocketScenario.defaultDraft, 1)).rejects.toThrow(
      'Draft transport does not match scenario "h1-json".',
    );
  });

  it('shares one HTTP origin between scenarios and programmable response controls', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const httpTrafficRunner = trafficLab.httpTrafficRunner;
    httpTrafficRunner.respondWith('/shared-http', { statusCode: 202, body: 'configured response' });

    const result = await trafficLab.run('h1-json', {
      body: 'shared request',
      headers: { 'content-type': 'text/plain' },
      kind: 'http',
      method: 'POST',
      path: '/shared-http',
      protocol: 'h1',
    }, proxy.port);

    expect(result.response).toMatchObject({ statusCode: 202, body: 'configured response' });
    expect(result.attempt.url).toBe(httpTrafficRunner.url('/shared-http'));
    expect(httpTrafficRunner.observation('/shared-http')?.body.toString('utf8')).toBe('shared request');
  });

  it('shares one WebSocket origin between scenarios and persistent clients', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const webSocketTrafficRunner = trafficLab.webSocketTrafficRunner;
    const client = await webSocketTrafficRunner.openThroughProxy(proxy.port, '/persistent');
    const scenario = trafficLab.scenarios().find((item) => item.id === 'ws-text');
    if (scenario === undefined) throw new Error('WebSocket text scenario is missing.');

    const result = await trafficLab.run(scenario.id, scenario.defaultDraft, proxy.port);
    webSocketTrafficRunner.sendFromOrigin('after scenario');
    await client.waitForText('after scenario');

    expect(result.state).toBe('complete');
    expect(new URL(result.attempt.url).port).toBe(String(webSocketTrafficRunner.port));
    expect(webSocketTrafficRunner.hasMessage('hello from client')).toBe(true);
    expect(client.isClosed()).toBe(false);
  });

  it('shares one secure origin between scenarios and handshake observations', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
    const scenario = trafficLab.scenarios().find((item) => item.id === 'h2-json');
    if (scenario === undefined) throw new Error('H2 JSON scenario is missing.');

    const result = await trafficLab.run(scenario.id, scenario.defaultDraft, proxy.port);

    expect(result.state).toBe('complete');
    expect(await trafficLab.getTlsTrafficRunner()).toBe(tlsTrafficRunner);
    expect(new URL(result.attempt.url).port).toBe(String(tlsTrafficRunner.port));
    expect(tlsTrafficRunner.handshakeCount()).toBe(1);
  });

  it('shares one TLS runner when the first TLS scenarios start concurrently', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const tlsTrafficRunner = await TlsTrafficRunner.start();
    const startSpy = vi.spyOn(TlsTrafficRunner, 'start').mockResolvedValue(tlsTrafficRunner);
    const trafficLab = await TrafficLab.start();
    try {
      const h2Scenario = trafficLab.scenarios().find((scenario) => scenario.id === 'h2-json');
      const grpcScenario = trafficLab.scenarios().find((scenario) => scenario.id === 'grpc-unary-json');
      if (h2Scenario === undefined || grpcScenario === undefined) throw new Error('Secure scenarios are missing.');

      const results = await Promise.all([
        trafficLab.run('h2-json', h2Scenario.defaultDraft, proxy.port),
        trafficLab.run('grpc-unary-json', grpcScenario.defaultDraft, proxy.port),
      ]);

      expect(results.map((result) => result.state)).toEqual(['complete', 'complete']);
      expect(startSpy).toHaveBeenCalledTimes(1);
    } finally {
      startSpy.mockRestore();
      await trafficLab.close();
    }
  });

  it('runs H1 JSON through an explicit proxy and returns client and origin facts', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const result = await trafficLab.run('h1-json', {
      body: 'edited request body',
      headers: { 'content-type': 'text/plain', 'x-draft': 'edited' },
      kind: 'http',
      method: 'POST',
      path: '/playground/h1-json?draft=edited',
      protocol: 'h1',
    }, proxy.port);

    expect(result).toMatchObject({
      scenarioId: 'h1-json',
      state: 'complete',
      request: {
        body: 'edited request body',
        headers: { 'x-draft': 'edited' },
        method: 'POST',
        path: '/playground/h1-json?draft=edited',
      },
      response: {
        statusCode: 200,
      },
    });
    expect(result.response?.body).toContain('ord_42');
    expect(result.request?.bodyBytes).toBe(Buffer.byteLength('edited request body'));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the exact body received by the origin for a timed H1 upload', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-upload');
    if (scenario === undefined) throw new Error('H1 upload scenario is missing.');
    const result = await trafficLab.run('h1-upload', scenario.defaultDraft, proxy.port);

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

    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-stream');
    if (scenario === undefined) throw new Error('H1 stream scenario is missing.');
    const result = await trafficLab.run('h1-stream', scenario.defaultDraft, proxy.port);

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

    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-abort');
    if (scenario === undefined) throw new Error('H1 abort scenario is missing.');
    const result = await trafficLab.run('h1-abort', scenario.defaultDraft, proxy.port);

    expect(result.state).toBe('failed');
    expect(result.request).toMatchObject({
      method: 'GET',
      path: '/playground/h1-abort',
    });
    expect(result.response).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('records the complete request after an H1 origin responds early', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-early-response');
    if (scenario === undefined) throw new Error('H1 early response scenario is missing.');

    const result = await trafficLab.run('h1-early-response', scenario.defaultDraft, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.request?.bodyBytes).toBeGreaterThan(0);
    expect(result.response?.body).toContain('sent-before-request-completed');
  });

  it('does not fabricate origin facts when the proxy cannot be reached', async () => {
    const unavailableProxy = await startForwardProxy();
    const proxyPort = unavailableProxy.port;
    await unavailableProxy.close();
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-json');
    if (scenario === undefined) throw new Error('H1 JSON scenario is missing.');
    const result = await trafficLab.run('h1-json', scenario.defaultDraft, proxyPort);

    expect(result.state).toBe('failed');
    expect(result.request).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('settles as failed when a proxy closes a partially received response', async () => {
    const proxy = await startPartialResponseProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());

    const scenario = trafficLab.scenarios().find((item) => item.id === 'h1-stream');
    if (scenario === undefined) throw new Error('H1 stream scenario is missing.');
    const result = await trafficLab.run('h1-stream', scenario.defaultDraft, proxy.port);

    expect(result.state).toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it.each([
    ['body-json', 'application/json'],
    ['body-text', 'text/plain'],
    ['body-html', 'text/html'],
    ['body-css', 'text/css'],
    ['body-javascript', 'text/javascript'],
    ['body-xml', 'application/xml'],
    ['body-yaml', 'application/yaml'],
    ['body-svg', 'image/svg+xml'],
    ['body-markdown', 'text/markdown'],
    ['body-form', 'application/x-www-form-urlencoded'],
    ['body-png', 'image/png'],
    ['body-binary', 'application/octet-stream'],
    ['body-audio', 'audio/wav'],
    ['body-video', 'video/mp4'],
    ['body-unknown-text', undefined],
    ['body-unknown-binary', undefined],
    ['encoding-invalid-image', 'image/png'],
  ] as const)('serves %s with its real body bytes and MIME', async (scenarioId, contentType) => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === scenarioId);
    if (scenario === undefined) throw new Error(`${scenarioId} scenario is missing.`);

    const result = await trafficLab.run(scenarioId, scenario.defaultDraft, proxy.port);

    expect(result.state).toBe('complete');
    expect(result.response?.bodyBytes).toBeGreaterThan(0);
    if (contentType === undefined) expect(result.response?.headers['content-type']).toBeUndefined();
    else expect(result.response?.headers['content-type']).toContain(contentType);
  });

  it.each([
    ['encoding-gzip', 'gzip'],
    ['encoding-deflate', 'deflate'],
    ['encoding-br', 'br'],
    ['encoding-corrupt-gzip', 'gzip'],
  ] as const)('serves %s with %s wire encoding', async (scenarioId, encoding) => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === scenarioId);
    if (scenario === undefined) throw new Error(`${scenarioId} scenario is missing.`);

    const result = await trafficLab.run(scenarioId, scenario.defaultDraft, proxy.port);

    expect(result.state).toBe('complete');
    expect(result.response?.headers['content-encoding']).toBe(encoding);
    expect(result.response?.bodyEncoding).toBe('base64');
  });

  it.each([
    ['ws-text', ['message']],
    ['ws-binary', ['binary']],
    ['ws-bidirectional', ['message']],
    ['ws-control', ['ping', 'pong']],
  ] as const)('runs %s messages and control frames through the proxy', async (scenarioId, expectedTypes) => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === scenarioId);
    if (scenario === undefined) throw new Error(`${scenarioId} scenario is missing.`);

    const result = await trafficLab.run(scenarioId, scenario.defaultDraft, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.protocol).toBe('websocket');
    expect(result.events?.map((event) => event.type)).toEqual(expect.arrayContaining([
      'open',
      'close',
      ...expectedTypes,
    ]));
  });

  it('returns the WebSocket handshake facts observed at both network boundaries', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === 'ws-text');
    if (scenario?.defaultDraft.kind !== 'websocket') {
      throw new Error('WebSocket text scenario is missing.');
    }

    const result = await trafficLab.run('ws-text', {
      ...scenario.defaultDraft,
      headers: { 'x-draft': 'edited' },
      path: '/playground/ws/text?draft=edited',
    }, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.request).toMatchObject({
      headers: {
        connection: 'Upgrade',
        host: expect.stringMatching(/^127\.0\.0\.1:\d+$/),
        'sec-websocket-version': '13',
        upgrade: 'websocket',
        'x-draft': 'edited',
      },
      method: 'GET',
      path: '/playground/ws/text?draft=edited',
    });
    expect(result.response).toMatchObject({
      headers: {
        connection: 'Upgrade',
        'sec-websocket-accept': expect.any(String),
        upgrade: 'websocket',
      },
      statusCode: 101,
    });
  });

  it.each([
    ['h2-json', 'h2'],
    ['grpc-unary-proto', 'grpc'],
    ['grpc-unary-json', 'grpc'],
    ['grpc-trailers-error', 'grpc'],
    ['grpc-compressed', 'grpc'],
    ['grpc-malformed', 'grpc'],
  ] as const)('runs %s through CONNECT and ALPN as %s', async (scenarioId, protocol) => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === scenarioId);
    if (scenario === undefined) throw new Error(`${scenarioId} scenario is missing.`);

    const result = await trafficLab.run(scenarioId, scenario.defaultDraft, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.protocol).toBe(protocol);
    expect(result.tls?.alpn).toBe('h2');
    if (protocol === 'grpc') expect(result.response?.headers['content-type']).toContain('application/grpc');
  });

  it.each([
    ['tls-passthrough', 'tls'],
    ['tls-mitm-h1', 'http/1.1'],
    ['tls-mitm-h2', 'h2'],
  ] as const)('runs %s through a real CONNECT tunnel with %s ALPN', async (scenarioId, alpn) => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === scenarioId);
    if (scenario === undefined) throw new Error(`${scenarioId} scenario is missing.`);

    const result = await trafficLab.run(scenarioId, scenario.defaultDraft, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.protocol).toBe('tls');
    expect(result.tls?.alpn).toBe(alpn);
  });

  it('returns the exact CONNECT request and proxy response facts for a tunnel', async () => {
    const proxy = await startForwardProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    closeables.push(() => trafficLab.close());
    const scenario = trafficLab.scenarios().find((item) => item.id === 'tls-passthrough');
    if (scenario?.defaultDraft.kind !== 'tls') throw new Error('TLS passthrough scenario is missing.');

    const result = await trafficLab.run('tls-passthrough', {
      ...scenario.defaultDraft,
      connectHeaders: { 'x-connect-draft': 'edited' },
    }, proxy.port);

    expect(result.state, result.error).toBe('complete');
    expect(result.request?.headers).toMatchObject({
      Host: expect.stringMatching(/^localhost:\d+$/),
      'x-connect-draft': 'edited',
    });
    expect(result.response).toMatchObject({
      headers: { 'proxy-agent': 'Playground-Test-Proxy' },
      statusCode: 200,
    });
  });

  it('aborts a stalled CONNECT when Traffic Lab closes', async () => {
    const proxy = await startStalledConnectProxy();
    closeables.push(proxy.close);
    const trafficLab = await TrafficLab.start();
    const scenario = trafficLab.scenarios().find((item) => item.id === 'h2-json');
    if (scenario === undefined) throw new Error('H2 JSON scenario is missing.');

    const resultPromise = trafficLab.run('h2-json', scenario.defaultDraft, proxy.port);
    await proxy.accepted;
    await trafficLab.close();
    const outcome = await Promise.race([
      resultPromise.then((result) => result.state),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);

    expect(outcome).toBe('failed');
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
  const sockets = new Set<Duplex>();
  const trackSocket = (socket: Duplex): void => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  const server = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url ?? '/');
    const forwarded = request(target, {
      headers: { ...incoming.headers, host: target.host },
      method: incoming.method,
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on('socket', trackSocket);
    forwarded.on('error', (error) => outgoing.destroy(error));
    incoming.pipe(forwarded);
  });
  server.on('connection', trackSocket);
  server.on('upgrade', (incoming, socket, head) => {
    const target = new URL(incoming.url ?? '/');
    const upstream = net.connect(Number(target.port || 80), target.hostname, () => {
      const path = `${target.pathname}${target.search}`;
      const headers = Object.entries({ ...incoming.headers, host: target.host })
        .flatMap(([name, value]) => value === undefined
          ? []
          : [`${name}: ${Array.isArray(value) ? value.join(', ') : value}`])
        .join('\r\n');
      upstream.write(`${incoming.method ?? 'GET'} ${path} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.byteLength > 0) upstream.write(head);
    });
    trackSocket(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  server.on('connect', (incoming, socket, head) => {
    const target = new URL(`http://${incoming.url ?? ''}`);
    const upstream = net.connect(Number(target.port || 443), target.hostname, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: Playground-Test-Proxy\r\n\r\n');
      if (head.byteLength > 0) upstream.write(head);
    });
    trackSocket(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const port = await listen(server);
  return {
    port,
    close: async () => {
      const closed = close(server);
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}

async function startStalledConnectProxy(): Promise<{
  readonly accepted: Promise<void>;
  readonly close: () => Promise<void>;
  readonly port: number;
}> {
  const server = createServer();
  const sockets = new Set<Duplex>();
  let acceptConnection: (() => void) | undefined;
  const accepted = new Promise<void>((resolve) => {
    acceptConnection = resolve;
  });
  server.on('connect', (_incoming, socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    acceptConnection?.();
  });
  const port = await listen(server);
  return {
    accepted,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await close(server);
    },
    port,
  };
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