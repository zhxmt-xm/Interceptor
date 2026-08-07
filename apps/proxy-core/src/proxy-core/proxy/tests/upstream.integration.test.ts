import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import { generateCACertificate } from 'mockttp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** HTTPS 源站；证书自签，客户端与 Interceptor 均按不安全例外处理。 */
async function startTlsOrigin(): Promise<StoppableServer> {
  const certificate = await generateCACertificate();
  const server = https.createServer(
    { key: certificate.key, cert: certificate.cert },
    (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('tls-origin-body');
    },
  );
  const sockets = new Set<Duplex>();
  server.on('connection', (socket) => sockets.add(socket));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
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

/** 经 Interceptor 发 CONNECT，再在隧道里完成端到端 TLS，返回原始响应报文。 */
function tunnelledHttpsGet(
  proxyPort: number,
  originPort: number,
  path: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `localhost:${originPort}`,
    });
    request.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        reject(new Error(`CONNECT rejected with ${response.statusCode ?? 0}`));
        return;
      }
      const secure = tls.connect(
        { socket, servername: 'localhost', rejectUnauthorized: false },
        () => {
          secure.write(
            `GET ${path} HTTP/1.1\r\nHost: localhost:${originPort}\r\nConnection: close\r\n\r\n`,
          );
        },
      );
      let raw = '';
      secure.setEncoding('utf8');
      secure.on('data', (chunk: string) => {
        raw += chunk;
      });
      secure.on('end', () => resolve(raw));
      secure.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

// MITM 关闭时 HTTPS 不解密，走 Mockttp 的 TLS passthrough 隧道。该路径必须同样
// 经上游转发，否则接管系统代理后所有 HTTPS 都会直连源站——在只有代理才能出网的
// 网络里等同于整机断网，而 HTTP 却仍然正常，故障表现极具迷惑性。
describe('ProxyService upstream proxy chaining without MITM', () => {
  let tlsOrigin: StoppableServer;
  let upstream: Awaited<ReturnType<typeof startUpstreamProxy>>;
  let recordingCaptureService: RecordingCaptureService;
  let proxyService: ProxyService;
  let proxyPort: number;

  beforeEach(async () => {
    tlsOrigin = await startTlsOrigin();
    upstream = await startUpstreamProxy();
    recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    proxyPort = (await proxyService.start()).port;
  });

  afterEach(async () => {
    await proxyService.stop();
    await upstream.close();
    await tlsOrigin.close();
  });

  it('tunnels passthrough HTTPS through the upstream proxy', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    const raw = await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/tunnelled');
    expect(raw).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
  });

  it('keeps configured passthrough hosts on upstream CONNECT while MITM is enabled', async () => {
    const ca = await generateCACertificate();
    await proxyService.configureTls({
      ca,
      insecureHosts: ['localhost'],
      passthroughHosts: ['localhost'],
    });
    proxyService.setUpstreamProxy({
      proxyUrl: `http://127.0.0.1:${upstream.port}`,
    });

    const raw = await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/selective');

    expect(raw).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
    await vi.waitFor(() => {
      expect(recordingCaptureService.exchanges).toHaveLength(1);
    });
    expect(recordingCaptureService.exchanges[0]).toMatchObject({
      method: 'CONNECT',
      protocol: 'tls',
      responseMime: 'application/x-encrypted-tunnel',
    });
  });

  it('goes direct for passthrough HTTPS when no upstream is configured', async () => {
    const raw = await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/direct');
    expect(raw).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([]);
  });

  it('bypasses the upstream for passthrough HTTPS hosts listed in noProxy', async () => {
    proxyService.setUpstreamProxy({
      proxyUrl: `http://127.0.0.1:${upstream.port}`,
      noProxy: ['localhost'],
    });
    const raw = await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/bypassed');
    expect(raw).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([]);
  });

  // 上游连不上时隧道永远不会接线，但 opened 事件已经发出去了；若不补发 closed，
  // pendingTunnels 会一直留着这条记录，Capture 里的隧道也永远停在 opened。
  it('still closes the tunnel record when the upstream proxy is unreachable', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: 'http://127.0.0.1:1' });

    await expect(tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/unreachable')).rejects.toThrow();

    // Capture 落库是异步的，并行跑集成测试时默认 1s 超时不够。
    await vi.waitFor(
      () => {
        expect(recordingCaptureService.exchanges).toHaveLength(1);
        expect(recordingCaptureService.exchangeUpdates).toHaveLength(1);
      },
      { timeout: 5000 },
    );
    expect(upstream.seen).toEqual([]);
  });
});
