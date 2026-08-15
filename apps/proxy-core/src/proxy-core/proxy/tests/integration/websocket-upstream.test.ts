import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

interface StoppableServer {
  readonly port: number;
  close(): Promise<void>;
}

/** 最小 WebSocket 源站：回显收到的第一条消息。 */
function startWebSocketOrigin(): Promise<StoppableServer> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (socket) => {
    socket.on('message', (data) => socket.send(`echo:${String(data)}`));
  });
  return new Promise((resolve) => {
    server.on('listening', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 记录 CONNECT 目标的最小上游代理，用来证明流量确实走了上游。 */
function startUpstreamProxy(): Promise<StoppableServer & { seen: string[] }> {
  const seen: string[] = [];
  const sockets = new Set<Duplex>();
  const server = http.createServer();
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
  let origin: StoppableServer;
  let upstream: Awaited<ReturnType<typeof startUpstreamProxy>>;
  let proxyService: ProxyService;
  let proxyPort: number;

  beforeEach(async () => {
    origin = await startWebSocketOrigin();
    upstream = await startUpstreamProxy();
    proxyService = new ProxyService(new RecordingCaptureService(), new CaptureEventQueue());
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
});
