import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProxyService } from '../entry';
import { CaptureEventQueue } from '../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

interface StoppableServer {
  readonly port: number;
  close(): Promise<void>;
}

function startOrigin(handler: http.RequestListener): Promise<StoppableServer> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * 最小上游 HTTP 代理：转发普通请求并支持 CONNECT 隧道，记录经过它的目标。
 * 用来证明流量确实走了上游，而不是被 Interceptor 直连源站。
 */
function startUpstreamProxy(): Promise<StoppableServer & { seen: string[] }> {
  const seen: string[] = [];
  // CONNECT 事件回调里的 socket 类型是 Duplex，这里只需要能 destroy。
  const sockets = new Set<Duplex>();
  const server = http.createServer((request, response) => {
    seen.push(`${request.method ?? ''} ${request.url ?? ''}`);
    const target = new URL(request.url ?? '');
    const forwarded = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: request.headers,
      },
      (originResponse) => {
        response.writeHead(originResponse.statusCode ?? 502, originResponse.headers);
        originResponse.pipe(response);
      },
    );
    forwarded.on('error', () => response.destroy());
    request.pipe(forwarded);
  });
  server.on('connect', (request, clientSocket, head) => {
    seen.push(`CONNECT ${request.url ?? ''}`);
    const [host, port] = (request.url ?? '').split(':');
    const originSocket = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        originSocket.write(head);
      }
      originSocket.pipe(clientSocket);
      clientSocket.pipe(originSocket);
    });
    sockets.add(clientSocket).add(originSocket);
    originSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => originSocket.destroy());
  });
  server.on('connection', (socket) => sockets.add(socket));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        seen,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => done());
          }),
      });
    });
  });
}

function proxiedGet(proxyPort: number, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        method: 'GET',
        path: url,
        headers: { host: target.host },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve(body));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

describe('ProxyService upstream proxy chaining', () => {
  let origin: StoppableServer;
  let upstream: Awaited<ReturnType<typeof startUpstreamProxy>>;
  let proxyService: ProxyService;
  let proxyPort: number;

  beforeEach(async () => {
    origin = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('origin-body');
    });
    upstream = await startUpstreamProxy();
    proxyService = new ProxyService(new RecordingCaptureService(), new CaptureEventQueue());
    proxyPort = (await proxyService.start()).port;
  });

  afterEach(async () => {
    await proxyService.stop();
    await upstream.close();
    await origin.close();
  });

  it('goes direct to the origin when no upstream is configured', async () => {
    const body = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/direct`);
    expect(body).toBe('origin-body');
    expect(upstream.seen).toEqual([]);
  });

  // Mockttp 经上游时统一用 CONNECT 隧道（即使目标是明文 HTTP），因此上游只看得到 host:port。
  it('forwards through the upstream proxy once configured', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    const body = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/chained`);
    expect(body).toBe('origin-body');
    expect(upstream.seen).toHaveLength(1);
    expect(upstream.seen[0]).toBe(`CONNECT 127.0.0.1:${origin.port}`);
  });

  // 切换上游不重启监听器：proxyConfig 是每次请求求值的回调。
  it('applies upstream changes without restarting the listener', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/first`);
    proxyService.setUpstreamProxy(null);
    await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/second`);

    expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
  });

  it('bypasses the upstream for hosts listed in noProxy', async () => {
    proxyService.setUpstreamProxy({
      proxyUrl: `http://127.0.0.1:${upstream.port}`,
      noProxy: ['127.0.0.1'],
    });
    const body = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/bypassed`);
    expect(body).toBe('origin-body');
    expect(upstream.seen).toEqual([]);
  });
});
