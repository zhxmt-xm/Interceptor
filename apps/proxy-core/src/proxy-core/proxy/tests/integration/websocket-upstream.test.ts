import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

interface StoppableServer {
  readonly port: number;
  close(): Promise<void>;
}

const UPSTREAM_USERNAME = 'ws-proxy-user';
const UPSTREAM_PASSWORD = 'test@password:with%encoding';
const UPSTREAM_AUTHORIZATION = `Basic ${Buffer.from(`${UPSTREAM_USERNAME}:${UPSTREAM_PASSWORD}`).toString('base64')}`;

function authenticatedProxyUrl(port: number, password = UPSTREAM_PASSWORD): string {
  const url = new URL(`http://127.0.0.1:${port}`);
  url.username = encodeURIComponent(UPSTREAM_USERNAME);
  url.password = encodeURIComponent(password);
  return url.toString();
}

/** 最小 WebSocket 源站：回显收到的第一条消息。 */
function startWebSocketOrigin(): Promise<StoppableServer & { headers: http.IncomingHttpHeaders[] }> {
  const headers: http.IncomingHttpHeaders[] = [];
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (socket, request) => {
    headers.push({ ...request.headers });
    socket.on('message', (data) => socket.send(`echo:${String(data)}`));
  });
  return new Promise((resolve) => {
    server.on('listening', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        headers,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 记录 CONNECT 目标的最小上游代理，用来证明流量确实走了上游。 */
function startUpstreamProxy(expectedAuthorization?: string): Promise<StoppableServer & {
  seen: string[];
  authorizationHeaders: Array<string | undefined>;
  rejected: string[];
}> {
  const seen: string[] = [];
  const authorizationHeaders: Array<string | undefined> = [];
  const rejected: string[] = [];
  const sockets = new Set<Duplex>();
  const server = http.createServer();
  server.on('connect', (request, clientSocket, head) => {
    seen.push(`CONNECT ${request.url ?? ''}`);
    authorizationHeaders.push(request.headers['proxy-authorization']);
    if (expectedAuthorization !== undefined && request.headers['proxy-authorization'] !== expectedAuthorization) {
      rejected.push(request.url ?? '');
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="upstream-fixture"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
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

/** 经 Interceptor 打开 WebSocket 并完成一次回显往返。 */
function echoThroughProxy(proxyPort: number, originPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${originPort}`, {
      // ws 没有 proxy 选项，指向 Interceptor 需要显式改写握手目标。
      agent: new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`),
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('timeout'));
    }, 10_000);
    socket.on('open', () => socket.send('ping'));
    socket.on('message', (data) => {
      clearTimeout(timer);
      socket.close();
      resolve(String(data));
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// WebSocketBridge 自己建上游连接，不走 forAnyRequest().thenPassThrough()，
// 因此拿不到规则上的 proxyConfig；不单独注入上游就会绕过代理直连源站。
describe('WebSocket upstream proxy chaining', () => {
  let origin: Awaited<ReturnType<typeof startWebSocketOrigin>>;
  let upstream: Awaited<ReturnType<typeof startUpstreamProxy>>;
  let proxyService: ProxyService;
  let proxyPort: number;
  let recordingCaptureService: RecordingCaptureService;

  beforeEach(async () => {
    origin = await startWebSocketOrigin();
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

  it('goes direct when no upstream is configured', async () => {
    expect(await echoThroughProxy(proxyPort, origin.port)).toBe('echo:ping');
    expect(upstream.seen).toEqual([]);
  });

  it('forwards the bridge upstream connection through the proxy', async () => {
    proxyService.setUpstreamProxy({ proxyUrl: `http://127.0.0.1:${upstream.port}` });

    expect(await echoThroughProxy(proxyPort, origin.port)).toBe('echo:ping');
    expect(upstream.seen).toContain(`CONNECT 127.0.0.1:${origin.port}`);
  });

  it('bypasses the upstream for hosts listed in noProxy', async () => {
    proxyService.setUpstreamProxy({
      proxyUrl: `http://127.0.0.1:${upstream.port}`,
      noProxy: ['127.0.0.1'],
    });

    expect(await echoThroughProxy(proxyPort, origin.port)).toBe('echo:ping');
    expect(upstream.seen).toEqual([]);
  });

  it('authenticates the bridge CONNECT without exposing credentials to the WebSocket origin or Capture', async () => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({ proxyUrl: authenticatedProxyUrl(upstream.port) });

    await expect(echoThroughProxy(proxyPort, origin.port)).resolves.toBe('echo:ping');
    expect(upstream.seen).toContain(`CONNECT 127.0.0.1:${origin.port}`);
    expect(upstream.authorizationHeaders).toContain(UPSTREAM_AUTHORIZATION);
    expect(upstream.rejected).toEqual([]);
    expect(origin.headers).toHaveLength(1);
    expect(origin.headers[0]).not.toHaveProperty('proxy-authorization');
    await vi.waitFor(() => expect(recordingCaptureService.webSocketFrames.length).toBeGreaterThan(0));
    const capture = JSON.stringify({ exchanges: recordingCaptureService.exchanges, frames: recordingCaptureService.webSocketFrames });
    expect(capture).not.toContain(UPSTREAM_USERNAME);
    expect(capture).not.toContain(UPSTREAM_PASSWORD);
    expect(capture).not.toContain(UPSTREAM_AUTHORIZATION);
  });

  it.each(['missing', 'incorrect'] as const)('rejects the WebSocket upgrade without direct fallback when credentials are %s', async (credentialState) => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({
      proxyUrl: credentialState === 'missing'
        ? `http://127.0.0.1:${upstream.port}`
        : authenticatedProxyUrl(upstream.port, 'wrong-password'),
    });

    await expect(echoThroughProxy(proxyPort, origin.port)).rejects.toThrow();
    expect(upstream.rejected).toContain(`127.0.0.1:${origin.port}`);
    expect(origin.headers).toEqual([]);
  });

  it('bypasses an authenticated upstream without leaking credentials into the WebSocket handshake', async () => {
    await upstream.close();
    upstream = await startUpstreamProxy(UPSTREAM_AUTHORIZATION);
    proxyService.setUpstreamProxy({ proxyUrl: authenticatedProxyUrl(upstream.port), noProxy: ['127.0.0.1'] });

    await expect(echoThroughProxy(proxyPort, origin.port)).resolves.toBe('echo:ping');
    expect(upstream.seen).toEqual([]);
    expect(upstream.authorizationHeaders).toEqual([]);
    expect(origin.headers).toHaveLength(1);
    expect(origin.headers[0]).not.toHaveProperty('proxy-authorization');
  });
});
