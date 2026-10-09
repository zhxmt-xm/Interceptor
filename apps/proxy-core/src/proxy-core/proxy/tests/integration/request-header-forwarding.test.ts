import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

interface ReceivedRequest {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly headers: string[];
  readonly body: Buffer;
}

interface CapturedResponse {
  readonly status: number | undefined;
  readonly headers: string[];
  readonly body: Buffer;
}

const RESPONSE_COOKIES = [
  'first=one; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/',
  'second=two; Path=/; HttpOnly',
];
const ROUTES = ['direct', 'fixed', 'pac-proxy', 'pac-direct'] as const;

function headerValues(headers: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < headers.length; index += 2) {
    if (headers[index]?.toLowerCase() === name) values.push(headers[index + 1]!);
  }
  return values;
}

function sendRequest(
  proxyPort: number,
  target: string,
  headers: readonly string[],
  body?: Buffer,
): Promise<CapturedResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port: proxyPort, method: body ? 'POST' : 'GET',
      path: target, headers: [...headers], setDefaultHeaders: false,
      agent: false, signal: AbortSignal.timeout(5_000),
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.once('error', reject);
      response.once('end', () => resolve({
        status: response.statusCode, headers: response.rawHeaders, body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    if (body) {
      request.write(body.subarray(0, Math.min(2, body.length)));
      request.write(body.subarray(Math.min(2, body.length)));
    }
    request.end();
  });
}

describe.each(ROUTES)('H1 request header forwarding through %s', route => {
  let proxyService: ProxyService;
  let proxyPort: number;
  let originPort: number;
  let target: string;
  let authority: string;
  let requests: ReceivedRequest[];
  let upstreamTargets: string[];
  let servers: http.Server[];
  let sockets: Set<Duplex>;

  async function listen(server: http.Server): Promise<number> {
    servers.push(server);
    server.on('connection', socket => sockets.add(socket));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Header fixture has no TCP address.');
    return address.port;
  }

  beforeEach(async () => {
    requests = [];
    upstreamTargets = [];
    servers = [];
    sockets = new Set();
    originPort = await listen(http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.once('error', error => response.destroy(error));
      request.once('end', () => {
        requests.push({
          method: request.method, path: request.url, headers: request.rawHeaders, body: Buffer.concat(chunks),
        });
        response.writeHead(200, { 'content-length': '2', 'set-cookie': RESPONSE_COOKIES, connection: 'close' });
        response.end('ok');
      });
    }));
    authority = `127.0.0.1:${originPort}`;
    target = `http://${authority}/headers?key=one&key=two`;
    const upstream = http.createServer((request, response) => {
      if (!request.url || !URL.canParse(request.url)) {
        response.writeHead(400).end();
        return;
      }
      const destination = new URL(request.url);
      if (destination.hostname !== '127.0.0.1' || Number(destination.port) !== originPort) {
        response.writeHead(403).end();
        return;
      }
      upstreamTargets.push(`${request.method} ${request.url}`);
      const headers: string[] = [];
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index]!;
        if (!['proxy-authorization', 'proxy-connection'].includes(name.toLowerCase())) {
          headers.push(name, request.rawHeaders[index + 1]!);
        }
      }
      const forwarding = http.request({
        hostname: '127.0.0.1', port: originPort, path: destination.pathname + destination.search,
        method: request.method, headers, setDefaultHeaders: false, agent: false,
      }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.rawHeaders);
        incoming.pipe(response);
      });
      forwarding.once('error', error => response.destroy(error));
      request.pipe(forwarding);
    });
    upstream.on('connect', (request, downstream, head) => {
      if (request.url !== authority) {
        downstream.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      upstreamTargets.push(`CONNECT ${request.url}`);
      const outgoing = net.connect(originPort, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) outgoing.write(head);
        downstream.pipe(outgoing);
        outgoing.pipe(downstream);
      });
      sockets.add(outgoing).add(downstream);
      outgoing.on('error', error => downstream.destroy(error));
      downstream.on('error', error => outgoing.destroy(error));
    });
    const upstreamPort = await listen(upstream);
    const pacPort = await listen(http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig', connection: 'close' });
      response.end(`function FindProxyForURL(url, host) { return "${route === 'pac-direct' ? 'DIRECT' : `PROXY 127.0.0.1:${upstreamPort}`}"; }`);
    }));
    proxyService = new ProxyService(new RecordingCaptureService(), new CaptureEventQueue());
    proxyPort = (await proxyService.start()).port;
    if (route === 'fixed') proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstreamPort}` });
    if (route === 'pac-proxy' || route === 'pac-direct') {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pacPort}/proxy.pac` });
    }
  });

  afterEach(async () => {
    await proxyService?.stop();
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.map(server => new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))));
  });

  function expectRoute(method: string): void {
    if (route === 'fixed') expect(upstreamTargets).toEqual([`CONNECT ${authority}`]);
    else if (route === 'pac-proxy') expect(upstreamTargets).toEqual([`${method} ${target}`]);
    else expect(upstreamTargets).toEqual([]);
  }

  it('normalizes names without losing mixed-case repeated values or empty entries', async () => {
    const response = await sendRequest(proxyPort, target, [
      'Host', authority, 'X-Tag', 'one,two', 'X-Between', 'KeepCase',
      'x-tag', '', 'X-Tag', 'three', 'X-Empty', '',
    ]);
    expect(response.status).toBe(200);
    expectRoute('GET');
    expect(requests).toHaveLength(1);
    const received = requests[0]!;
    expect(received.path).toBe('/headers?key=one&key=two');
    expect(headerValues(received.headers, 'x-tag')).toEqual(['one,two', '', 'three']);
    expect(headerValues(received.headers, 'x-between')).toEqual(['KeepCase']);
    expect(headerValues(received.headers, 'x-empty')).toEqual(['']);
    expect(received.headers.filter((_value, index) => index % 2 === 0 && /^x-/i.test(received.headers[index]!)))
      .toEqual(['x-tag', 'x-tag', 'x-tag', 'x-between', 'x-empty']);
  });

  it('retains an initial empty repeated value and object-property-like field names', async () => {
    const response = await sendRequest(proxyPort, target, [
      'Host', authority, 'X-Tag', '', 'x-tag', 'two',
      '__proto__', 'literal', 'Constructor', 'first', 'constructor', 'second', 'ToString', 'value',
    ]);
    expect(response.status).toBe(200);
    expectRoute('GET');
    expect(requests).toHaveLength(1);
    const received = requests[0]!;
    expect(headerValues(received.headers, 'x-tag')).toEqual(['', 'two']);
    expect(headerValues(received.headers, '__proto__')).toEqual(['literal']);
    expect(headerValues(received.headers, 'constructor')).toEqual(['first', 'second']);
    expect(headerValues(received.headers, 'tostring')).toEqual(['value']);
  });

  it('uses Node Cookie joining while retaining independent Set-Cookie response lines', async () => {
    const response = await sendRequest(proxyPort, target, [
      'Host', authority, 'Cookie', 'session=AbC', 'cookie', 'theme=Dark',
      'Authorization', 'Bearer fixture-AbC',
    ]);
    expect(response.status).toBe(200);
    expectRoute('GET');
    expect(requests).toHaveLength(1);
    expect(headerValues(requests[0]!.headers, 'cookie')).toEqual(['session=AbC; theme=Dark']);
    expect(headerValues(requests[0]!.headers, 'authorization')).toEqual(['Bearer fixture-AbC']);
    expect(headerValues(response.headers, 'set-cookie')).toEqual(RESPONSE_COOKIES);
  });

  it.each(['length', 'chunked', 'gzip'] as const)('preserves binary request content with %s framing', async framing => {
    const payload = Buffer.from([0, 255, 128, 13, 10, 42, 0, 254]);
    const body = framing === 'gzip' ? gzipSync(payload) : payload;
    const framingHeaders = framing === 'chunked'
      ? ['Transfer-Encoding', 'chunked']
      : ['Content-Length', String(body.length)];
    const response = await sendRequest(proxyPort, target, [
      'Host', authority, 'Content-Type', 'application/octet-stream', ...framingHeaders,
      ...(framing === 'gzip' ? ['Content-Encoding', 'gzip'] : []),
    ], body);
    expect(response.status).toBe(200);
    expectRoute('POST');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toEqual(body);
    expect(requests[0]!.method).toBe('POST');
    expect(headerValues(requests[0]!.headers, 'content-length')).toEqual(framing === 'chunked' ? [] : [String(body.length)]);
    expect(headerValues(requests[0]!.headers, 'transfer-encoding')).toEqual(framing === 'chunked' ? ['chunked'] : []);
    expect(headerValues(requests[0]!.headers, 'content-encoding')).toEqual(framing === 'gzip' ? ['gzip'] : []);
  });

  it('does not add absent default content or user-agent headers', async () => {
    const response = await sendRequest(proxyPort, target, ['Host', authority, 'X-Only', 'value']);
    expect(response.status).toBe(200);
    expectRoute('GET');
    expect(requests).toHaveLength(1);
    for (const name of ['user-agent', 'accept', 'accept-encoding', 'content-length', 'transfer-encoding']) {
      expect(headerValues(requests[0]!.headers, name), name).toEqual([]);
    }
  });
});
