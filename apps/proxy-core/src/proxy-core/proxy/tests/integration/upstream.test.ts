import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';
import { generateCACertificate } from 'mockttp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';
import { decryptWithCertificate } from './test-tls-setup';

interface StoppableServer {
  readonly port: number;
  close(): Promise<void>;
}

const UPSTREAM_USERNAME = 'proxy-user';
const UPSTREAM_PASSWORD = 'test@password:with%encoding';
const UPSTREAM_AUTHORIZATION = `Basic ${Buffer.from(`${UPSTREAM_USERNAME}:${UPSTREAM_PASSWORD}`).toString('base64')}`;

function authenticatedProxyUrl(port: number, password = UPSTREAM_PASSWORD): string {
  const url = new URL(`http://127.0.0.1:${port}`);
  url.username = encodeURIComponent(UPSTREAM_USERNAME);
  url.password = encodeURIComponent(password);
  return url.toString();
}

function startOrigin(handler: http.RequestListener, listenHost = '127.0.0.1'): Promise<StoppableServer> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, listenHost, () => {
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
function startUpstreamProxy(expectedAuthorization?: string): Promise<StoppableServer & {
  seen: string[];
  authorizationHeaders: Array<string | undefined>;
  rejected: string[];
}> {
  const seen: string[] = [];
  const authorizationHeaders: Array<string | undefined> = [];
  const rejected: string[] = [];
  // CONNECT 事件回调里的 socket 类型是 Duplex，这里只需要能 destroy。
  const sockets = new Set<Duplex>();
  const server = http.createServer((request, response) => {
    seen.push(`${request.method ?? ''} ${request.url ?? ''}`);
    authorizationHeaders.push(request.headers['proxy-authorization']);
    if (expectedAuthorization !== undefined && request.headers['proxy-authorization'] !== expectedAuthorization) {
      rejected.push(request.url ?? '');
      response.writeHead(407, { 'proxy-authenticate': 'Basic realm="upstream-fixture"', 'content-length': '0' });
      response.end();
      return;
    }
    const target = new URL(request.url ?? '');
    const forwarded = http.request(
      {
        host: target.hostname.replace(/^\[|\]$/g, ''),
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
    authorizationHeaders.push(request.headers['proxy-authorization']);
    if (expectedAuthorization !== undefined && request.headers['proxy-authorization'] !== expectedAuthorization) {
      rejected.push(request.url ?? '');
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="upstream-fixture"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    const target = new URL(`http://${request.url}`);
    const originSocket = net.connect(Number(target.port), target.hostname.replace(/^\[|\]$/g, ''), () => {
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
        authorizationHeaders,
        rejected,
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

function proxiedGet(proxyPort: number, url: string, signal?: AbortSignal, agent?: http.Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        method: 'GET',
        path: url,
        headers: { host: target.host },
        signal,
        agent,
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
  let recordingCaptureService: RecordingCaptureService;
  let originHeaders: http.IncomingHttpHeaders[];

  beforeEach(async () => {
    originHeaders = [];
    origin = await startOrigin((request, response) => {
      originHeaders.push({ ...request.headers });
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('origin-body');
    });
    upstream = await startUpstreamProxy();
    recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
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

  it('keeps one HTTP forwarding rule for the Windows runtime branch', async () => {
    await proxyService.stop();
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    try {
      Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
      proxyPort = (await proxyService.start()).port;
      expect(await proxyService['server']!.getMockedEndpoints()).toHaveLength(2);
      proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
      expect(await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/windows-route`)).toBe('origin-body');
      expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  // 固定HTTP上游使用CONNECT，即使目标是明文HTTP；PAC另有普通HTTP转发分支。
  it('forwards through the upstream proxy once configured', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    const body = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/chained`);
    expect(body).toBe('origin-body');
    expect(upstream.seen).toHaveLength(1);
    expect(upstream.seen[0]).toBe(`CONNECT 127.0.0.1:${origin.port}`);
  });

  it('forwards plain HTTP through a PAC-selected proxy with the full target and Host header', async () => {
    const pac = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/x-ns-proxy-autoconfig' });
      response.end(`function FindProxyForURL(url, host) { return "PROXY 127.0.0.1:${upstream.port}"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      const body = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/plain-pac`);
      expect(body).toBe('origin-body');
      expect(upstream.seen).toEqual([`GET http://127.0.0.1:${origin.port}/plain-pac`]);
      expect(originHeaders).toHaveLength(1);
      expect(originHeaders[0]?.host).toBe(`127.0.0.1:${origin.port}`);
    } finally {
      await pac.close();
    }
  });

  it('supplies the actual HTTP target port and query when evaluating PAC', async () => {
    const target = `http://127.0.0.1:${origin.port}/pac-port?key=one&key=two`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url === ${JSON.stringify(target)} ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await proxiedGet(proxyPort, target)).toBe('origin-body');
      expect(upstream.seen).toEqual([`GET ${target}`]);
      expect(originHeaders[0]?.host).toBe(`127.0.0.1:${origin.port}`);
    } finally {
      await pac.close();
    }
  });

  it('does not reuse a PAC target port across different origins on one downstream connection', async () => {
    const secondOrigin = await startOrigin((_request, response) => response.end('second-origin-body'));
    const firstTarget = `http://127.0.0.1:${origin.port}/first-origin`;
    const secondTarget = `http://127.0.0.1:${secondOrigin.port}/second-origin`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url === ${JSON.stringify(firstTarget)} || url === ${JSON.stringify(secondTarget)} ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    const downstreamAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await proxiedGet(proxyPort, firstTarget, undefined, downstreamAgent)).toBe('origin-body');
      expect(await proxiedGet(proxyPort, secondTarget, undefined, downstreamAgent)).toBe('second-origin-body');
      expect(upstream.seen).toEqual([`GET ${firstTarget}`, `GET ${secondTarget}`]);
    } finally {
      downstreamAgent.destroy();
      await pac.close();
      await secondOrigin.close();
    }
  });

  it('evaluates the PAC route again for the next request on a kept-alive downstream connection', async () => {
    const directTarget = `http://127.0.0.1:${origin.port}/pac-direct-first`;
    const proxyTarget = `http://127.0.0.1:${origin.port}/pac-proxy-next`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url.indexOf("/pac-proxy-next") >= 0 ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    const downstreamAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await proxiedGet(proxyPort, directTarget, undefined, downstreamAgent)).toBe('origin-body');
      expect(upstream.seen).toEqual([]);
      expect(await proxiedGet(proxyPort, proxyTarget, undefined, downstreamAgent)).toBe('origin-body');
      expect(upstream.seen).toEqual([`GET ${proxyTarget}`]);
      expect(originHeaders).toHaveLength(2);
    } finally {
      downstreamAgent.destroy();
      await pac.close();
    }
  });

  it('keeps IPv6 authority and port in the PAC decision and HTTP proxy request', async () => {
    const ipv6Origin = await startOrigin((_request, response) => response.end('ipv6-origin-body'), '::1');
    const target = `http://[::1]:${ipv6Origin.port}/ipv6-pac?value=one&value=two`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url === ${JSON.stringify(target)} ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await proxiedGet(proxyPort, target)).toBe('ipv6-origin-body');
      expect(upstream.seen).toEqual([`GET ${target}`]);
    } finally {
      await pac.close();
      await ipv6Origin.close();
    }
  });

  it.runIf(process.platform === 'darwin')('selects the HTTP upstream independently of HTTPS', async () => {
    proxyService.setUpstreamProxy({
      httpProxyUrl: `http://127.0.0.1:${upstream.port}`, httpsProxyUrl: 'http://127.0.0.1:1',
      exceptions: [], excludeSimpleHostnames: false,
    });
    expect(await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/protocol-route`)).toBe('origin-body');
    expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
  });

  it.runIf(process.platform === 'darwin').each([
    { host: '127.0.0.1', exceptions: ['127.0.0.0/8'], simple: false },
    { host: '127.0.0.1', exceptions: ['127.*'], simple: false },
    { host: 'localhost', exceptions: [], simple: true },
  ])('applies system proxy exceptions without changing protocol routes $host $exceptions', async ({ host, exceptions, simple }) => {
    proxyService.setUpstreamProxy({
      httpProxyUrl: 'http://127.0.0.1:1', httpsProxyUrl: 'http://127.0.0.1:1',
      exceptions, excludeSimpleHostnames: simple,
    });
    expect(await proxiedGet(proxyPort, `http://${host}:${origin.port}/bypassed-system-route`)).toBe('origin-body');
    expect(upstream.seen).toEqual([]);
  });

  it.runIf(process.platform === 'darwin')('honors explicit HTTP direct while HTTPS has an upstream', async () => {
    proxyService.setUpstreamProxy({
      httpProxyUrl: null, httpsProxyUrl: 'http://127.0.0.1:1',
      exceptions: [], excludeSimpleHostnames: false,
    });
    expect(await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/direct-http`)).toBe('origin-body');
    expect(upstream.seen).toEqual([]);
  });

  // 切换上游不重启监听器：proxyConfig 是每次请求求值的回调。
  it('applies upstream changes without restarting the listener', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/first`);
    proxyService.setUpstreamProxy(null);
    await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/second`);

    expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
  });

  it.each(['proxy', 'direct'] as const)('keeps an in-flight response intact while new requests switch to %s', async nextRoute => {
    await origin.close();
    const paths: string[] = [];
    let releaseResponse: (() => void) | undefined;
    let received!: () => void;
    const waitingResponse = new Promise<void>(resolve => { received = resolve; });
    origin = await startOrigin((request, response) => {
      paths.push(request.url ?? '');
      if (request.url === '/held') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.write('first-');
        releaseResponse = () => response.end('complete');
        received();
      } else {
        response.end('next-route');
      }
    });
    const nextUpstream = await startUpstreamProxy();
    const controller = new AbortController();
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });
    const first = proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/held`, controller.signal)
      .then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
    try {
      await waitingResponse;
      proxyService.setUpstreamProxy(nextRoute === 'proxy' ? { proxyUrl: `http://127.0.0.1:${nextUpstream.port}` } : null);
      expect(await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/next`, controller.signal)).toBe('next-route');
      releaseResponse?.();
      expect(await first).toEqual({ status: 'fulfilled', value: 'first-complete' });
      expect(paths).toEqual(['/held', '/next']);
      expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
      expect(nextUpstream.seen).toHaveLength(nextRoute === 'proxy' ? 1 : 0);
      expect(proxyService.status().port).toBe(proxyPort);
    } finally {
      releaseResponse?.();
      controller.abort();
      await first;
      await nextUpstream.close();
    }
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

  it('authenticates the upstream CONNECT without sending credentials to the HTTP origin or Capture', async () => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({ proxyUrl: authenticatedProxyUrl(upstream.port) });

    await expect(proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/authenticated`)).resolves.toBe('origin-body');
    expect(upstream.seen).toEqual([`CONNECT 127.0.0.1:${origin.port}`]);
    expect(upstream.authorizationHeaders).toEqual([UPSTREAM_AUTHORIZATION]);
    expect(upstream.rejected).toEqual([]);
    expect(originHeaders).toHaveLength(1);
    expect(originHeaders[0]).not.toHaveProperty('proxy-authorization');
    await vi.waitFor(() => expect(recordingCaptureService.exchanges).toHaveLength(1));
    const capture = JSON.stringify(recordingCaptureService.exchanges);
    expect(capture).not.toContain(UPSTREAM_USERNAME);
    expect(capture).not.toContain(UPSTREAM_PASSWORD);
    expect(capture).not.toContain(UPSTREAM_AUTHORIZATION);
  });

  it.each(['missing', 'incorrect'] as const)('does not reach the origin or fall back to direct with %s credentials', async (credentialState) => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({
      proxyUrl: credentialState === 'missing'
        ? `http://127.0.0.1:${upstream.port}`
        : authenticatedProxyUrl(upstream.port, 'wrong-password'),
    });

    const response = await proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/unauthorized`)
      .catch(() => null);
    expect(response).not.toBe('origin-body');
    expect(upstream.rejected).toEqual([`127.0.0.1:${origin.port}`]);
    expect(originHeaders).toEqual([]);
  });

  it('keeps authenticated proxy credentials out of a noProxy request', async () => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({ proxyUrl: authenticatedProxyUrl(upstream.port), noProxy: ['127.0.0.1'] });

    await expect(proxiedGet(proxyPort, `http://127.0.0.1:${origin.port}/bypassed-auth`)).resolves.toBe('origin-body');
    expect(upstream.seen).toEqual([]);
    expect(upstream.authorizationHeaders).toEqual([]);
    expect(originHeaders).toHaveLength(1);
    expect(originHeaders[0]).not.toHaveProperty('proxy-authorization');
  });
});

/** HTTPS 源站；证书自签，客户端与 Interceptor 均按不安全例外处理。 */
async function startTlsOrigin(listenHost = '127.0.0.1'): Promise<StoppableServer & { headers: http.IncomingHttpHeaders[] }> {
  const certificate = await generateCACertificate();
  const headers: http.IncomingHttpHeaders[] = [];
  const server = https.createServer(
    { key: certificate.key, cert: certificate.cert },
    (request, response) => {
      headers.push({ ...request.headers });
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('tls-origin-body');
    },
  );
  const sockets = new Set<Duplex>();
  server.on('connection', (socket) => sockets.add(socket));
  return new Promise((resolve) => {
    server.listen(0, listenHost, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        headers,
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
  targetHost = 'localhost',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const authority = `${net.isIPv6(targetHost) ? `[${targetHost}]` : targetHost}:${originPort}`;
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: authority,
    });
    request.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        reject(new Error(`CONNECT rejected with ${response.statusCode ?? 0}`));
        return;
      }
      const secure = tls.connect(
        { socket, servername: net.isIP(targetHost) === 0 ? targetHost : undefined, rejectUnauthorized: false },
        () => {
          secure.write(
            `GET ${path} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`,
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
  let tlsOrigin: Awaited<ReturnType<typeof startTlsOrigin>>;
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

  it.runIf(process.platform === 'darwin').each([false, true])('selects the HTTPS upstream independently of HTTP (MITM=%s)', async (mitmEnabled) => {
    if (mitmEnabled) {
      const certificate = await generateCACertificate();
      await decryptWithCertificate(proxyService, certificate, ['localhost']);
    }
    proxyService.setUpstreamProxy({
      httpProxyUrl: 'http://127.0.0.1:1', httpsProxyUrl: `http://127.0.0.1:${upstream.port}`,
      exceptions: [], excludeSimpleHostnames: false,
    });
    expect(await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/protocol-route')).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
  });

  it('evaluates the saved PAC for passthrough HTTPS instead of connecting directly', async () => {
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return "PROXY 127.0.0.1:${upstream.port}"; }`);
    });
    try {
      const proxyUrl = `pac+http://127.0.0.1:${pac.port}/proxy.pac`;
      proxyService.setUpstreamProxy({ httpProxyUrl: proxyUrl, httpsProxyUrl: proxyUrl, exceptions: [], excludeSimpleHostnames: false });
      expect(await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/pac-route')).toContain('tls-origin-body');
      expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
    } finally {
      await pac.close();
    }
  });

  it('passes an HTTPS URL to PAC when choosing the TLS passthrough route', async () => {
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url.indexOf("https:") === 0 ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/pac-https-scheme')).toContain('tls-origin-body');
      expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
    } finally {
      await pac.close();
    }
  });

  it('preserves the non-default CONNECT port in the TLS PAC target', async () => {
    const expectedUrl = `https://localhost:${tlsOrigin.port}/`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url === ${JSON.stringify(expectedUrl)} && host === "localhost" ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/pac-actual-port')).toContain('tls-origin-body');
      expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
    } finally {
      await pac.close();
    }
  });

  it('preserves IPv6 TLS authority without adding another TLS layer', async () => {
    const ipv6Origin = await startTlsOrigin('::1');
    const expectedUrl = `https://[::1]:${ipv6Origin.port}/`;
    const pac = await startOrigin((_request, response) => {
      response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return url === ${JSON.stringify(expectedUrl)} ? "PROXY 127.0.0.1:${upstream.port}" : "DIRECT"; }`);
    });
    try {
      proxyService.setUpstreamProxy({ proxyUrl: `pac+http://127.0.0.1:${pac.port}/proxy.pac` });
      expect(await tunnelledHttpsGet(proxyPort, ipv6Origin.port, '/ipv6-pac-tls', '::1')).toContain('tls-origin-body');
      expect(upstream.seen).toEqual([`CONNECT [::1]:${ipv6Origin.port}`]);
      expect(ipv6Origin.headers[0]?.host).toBe(`[::1]:${ipv6Origin.port}`);
    } finally {
      await pac.close();
      await ipv6Origin.close();
    }
  });

  it.each([false, true])('authenticates HTTPS upstream CONNECT without origin credential leakage (MITM=%s)', async (mitmEnabled) => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    if (mitmEnabled) {
      const certificate = await generateCACertificate();
      await decryptWithCertificate(proxyService, certificate, ['localhost']);
    }
    proxyService.setUpstreamProxy({ proxyUrl: authenticatedProxyUrl(upstream.port) });

    const raw = await tunnelledHttpsGet(proxyPort, tlsOrigin.port, '/authenticated-tls');
    expect(raw).toContain('tls-origin-body');
    expect(upstream.seen).toEqual([`CONNECT localhost:${tlsOrigin.port}`]);
    expect(upstream.authorizationHeaders).toEqual([UPSTREAM_AUTHORIZATION]);
    expect(upstream.rejected).toEqual([]);
    expect(tlsOrigin.headers).toHaveLength(1);
    expect(tlsOrigin.headers[0]).not.toHaveProperty('proxy-authorization');
    await vi.waitFor(() => expect(recordingCaptureService.exchanges).toHaveLength(1));
    const capture = JSON.stringify(recordingCaptureService.exchanges);
    expect(capture).not.toContain(UPSTREAM_USERNAME);
    expect(capture).not.toContain(UPSTREAM_PASSWORD);
    expect(capture).not.toContain(UPSTREAM_AUTHORIZATION);
  });

  it('keeps configured passthrough hosts on upstream CONNECT while MITM is enabled', async () => {
    const ca = await generateCACertificate();
    await decryptWithCertificate(proxyService, ca, ['localhost'], ['localhost']);
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
