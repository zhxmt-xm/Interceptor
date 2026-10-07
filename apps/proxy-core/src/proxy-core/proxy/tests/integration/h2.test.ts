import { promises as fs } from 'node:fs';
import { once } from 'node:events';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateCACertificate } from 'mockttp';

import { CaptureService } from '../../../capture/entry';
import { CoreApplication, type CoreLifecycleMessage, type CoreParentPort } from '../../../core-application';
import { initializeRuntime } from '../../../constants';
import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';
import { decryptWithCertificate } from './test-tls-setup';

/**
 * M6 T6.1/T6.2 端到端集成：真实 HTTP/2 客户端经代理 MITM 隧道，用 ALPN h2 连到真实
 * HTTP/2 源站。验证 Mockttp 的 http2:true 对双协议与 H2-only/gRPC 下游协商 H2。
 */

function grpcEnvelope(payload: Uint8Array, compressed = false): Buffer {
  const header = Buffer.alloc(5);
  header[0] = compressed ? 1 : 0;
  header.writeUInt32BE(payload.byteLength, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}

function startGrpcH2Origin(
  cert: string,
  key: string,
  responseBody: Buffer,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http2.createSecureServer({ cert, key });
  server.on('stream', (stream) => {
    stream.respond(
      { ':status': 200, 'content-type': 'application/grpc+proto' },
      { waitForTrailers: true },
    );
    stream.on('wantTrailers', () => {
      stream.sendTrailers({ 'grpc-status': '0', 'grpc-message': 'OK' });
    });
    stream.end(responseBody);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function startH2Origin(
  cert: string,
  key: string,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http2.createSecureServer({ cert, key, allowHTTP1: true });
  server.on('stream', (stream) => {
    stream.respond(
      { ':status': 200, 'content-type': 'application/json' },
      { waitForTrailers: true },
    );
    stream.on('wantTrailers', () => {
      stream.sendTrailers({ 'x-trailer-check': 'h2-trailer' });
    });
    stream.end('{"h2":true}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 记录 origin 实际收到的请求正文，并以 gzip 正文回复，用于校验 H2 双向线上保真。 */
function startCompressedH2Origin(
  cert: string,
  key: string,
  responseWire: Buffer,
): Promise<{
  port: number;
  received: () => Buffer;
  close: () => Promise<void>;
}> {
  let received = Buffer.alloc(0);
  const server = http2.createSecureServer({ cert, key });
  server.on('stream', (stream) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => {
      received = Buffer.concat(chunks);
      stream.respond({
        ':status': 200,
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      });
      stream.end(responseWire);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        received: () => received,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function startH1Origin(
  cert: string,
  key: string,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = https.createServer({ cert, key }, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"h1":true}');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 经代理 MITM 隧道用 HTTP/2 发 POST，并原样收集响应字节（不做任何自动解压）。 */
function h2PostViaProxy(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
  requestBody: Buffer,
  headers: Record<string, string>,
): Promise<{
  status: number | undefined;
  headers: http2.IncomingHttpHeaders;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(
        `CONNECT ${originHost}:${originPort} HTTP/1.1\r\n` +
          `Host: ${originHost}:${originPort}\r\n\r\n`,
      );
    });
    socket.once('data', (chunk: Buffer) => {
      const statusLine = chunk.toString('utf8').split('\r\n', 1)[0] ?? '';
      if (!statusLine.includes(' 200 ')) {
        reject(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      const tlsSocket = tls.connect(
        { socket, servername: originHost, ALPNProtocols: ['h2'], ca: [caCert] },
        () => {
          const client = http2.connect(`https://${originHost}:${originPort}`, {
            createConnection: () => tlsSocket,
          });
          client.on('error', reject);
          const req = client.request({
            ...headers,
            ':path': '/compressed',
            ':method': 'POST',
          });
          let status: number | undefined;
          let receivedHeaders: http2.IncomingHttpHeaders = {};
          const chunks: Buffer[] = [];
          req.on('response', (responseHeaders) => {
            status = responseHeaders[':status'];
            receivedHeaders = responseHeaders;
          });
          req.on('data', (data: Buffer) => chunks.push(Buffer.from(data)));
          req.on('end', () => {
            client.close();
            resolve({
              status,
              headers: receivedHeaders,
              body: Buffer.concat(chunks),
            });
          });
          req.on('error', reject);
          req.end(requestBody);
        },
      );
      tlsSocket.on('error', reject);
    });
    socket.on('error', reject);
  });
}

async function connectH2ViaProxy(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
): Promise<http2.ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: proxyPort, method: 'CONNECT',
      path: `${originHost}:${originPort}` });
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`CONNECT failed: ${response.statusCode}`));
        return;
      }
      if (head.byteLength > 0) socket.unshift(head);
      const tlsSocket = tls.connect({ socket, servername: originHost, ALPNProtocols: ['h2'], ca: [caCert] }, () => {
        const client = http2.connect(`https://${originHost}:${originPort}`, { createConnection: () => tlsSocket });
        client.once('error', reject);
        client.once('connect', () => resolve(client));
      });
      tlsSocket.once('error', reject);
    });
    request.once('error', reject);
    request.end();
  });
}

// 经显式代理 CONNECT 建隧道，在隧道上以 ALPN h2 完成 TLS，再用 HTTP/2 发 GET。
async function h2ViaProxy(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
): Promise<{
  status: number | undefined;
  headers: http2.IncomingHttpHeaders;
  body: string;
  alpn: string | false;
}> {
  const client = await connectH2ViaProxy(proxyPort, originHost, originPort, caCert);
  return new Promise((resolve, reject) => {
    client.on('error', reject);
    const request = client.request({ ':path': '/h2', ':method': 'GET' });
    let status: number | undefined;
    let responseHeaders: http2.IncomingHttpHeaders = {};
    let body = '';
    request.on('response', (headers) => {
      status = headers[':status'];
      responseHeaders = headers;
    });
    request.setEncoding('utf8');
    request.on('data', (data: string) => { body += data; });
    request.on('end', () => {
      const alpn = client.alpnProtocol ?? false;
      client.close();
      resolve({ status, headers: responseHeaders, body, alpn });
    });
    request.on('error', (error) => { client.destroy(); reject(error); });
    request.end();
  });
}

/** 只协商 TLS ALPN，用于验证普通双协议客户端仍优先 H2。 */
function negotiateAlpnViaProxy(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
): Promise<string | false> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(
        `CONNECT ${originHost}:${originPort} HTTP/1.1\r\n` +
          `Host: ${originHost}:${originPort}\r\n\r\n`,
      );
    });
    socket.once('data', (chunk: Buffer) => {
      const statusLine = chunk.toString('utf8').split('\r\n', 1)[0] ?? '';
      if (!statusLine.includes(' 200 ')) {
        reject(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      const tlsSocket = tls.connect({
        socket,
        servername: originHost,
        ALPNProtocols: ['h2', 'http/1.1'],
        ca: [caCert],
      }, () => {
        const negotiated = tlsSocket.alpnProtocol ?? false;
        tlsSocket.destroy();
        resolve(negotiated);
      });
      tlsSocket.on('error', reject);
    });
    socket.on('error', reject);
  });
}

function grpcViaProxy(
  proxyPort: number,
  originHost: string,
  originPort: number,
  caCert: string,
  requestBody: Buffer,
): Promise<{ status: number | undefined; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(
        `CONNECT ${originHost}:${originPort} HTTP/1.1\r\n` +
          `Host: ${originHost}:${originPort}\r\n\r\n`,
      );
    });
    socket.once('data', (chunk: Buffer) => {
      const statusLine = chunk.toString('utf8').split('\r\n', 1)[0] ?? '';
      if (!statusLine.includes(' 200 ')) {
        reject(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      const tlsSocket = tls.connect(
        {
          socket,
          servername: originHost,
          ALPNProtocols: ['h2'],
          ca: [caCert],
        },
        () => {
          const client = http2.connect(`https://${originHost}:${originPort}`, {
            createConnection: () => tlsSocket,
          });
          client.on('error', reject);
          const req = client.request({
            ':path': '/orders.v1.OrderService/Watch',
            ':method': 'POST',
            'content-type': 'application/grpc+proto',
            'te': 'trailers',
          });
          let status: number | undefined;
          const chunks: Buffer[] = [];
          req.on('response', (headers) => {
            status = headers[':status'];
          });
          req.on('data', (data: Buffer) => chunks.push(Buffer.from(data)));
          req.on('end', () => {
            client.close();
            resolve({ status, body: Buffer.concat(chunks) });
          });
          req.on('error', reject);
          req.end(requestBody);
        },
      );
      tlsSocket.on('error', reject);
    });
    socket.on('error', reject);
  });
}

async function waitForExchange(recordingCaptureService: RecordingCaptureService): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (recordingCaptureService.exchanges.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('ProxyService HTTP/2 (Mockttp MITM)', () => {
  let proxyService: ProxyService | null = null;
  let origin: { port: number; close: () => Promise<void> } | null = null;
  let captureService: CaptureService | null = null;
  let clientSession: http2.ClientHttp2Session | null = null;
  let temporaryDirectory = '';

  afterEach(async () => {
    clientSession?.destroy();
    await proxyService?.stop();
    await origin?.close();
    await captureService?.dispose();
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
    proxyService = null;
    origin = null;
    captureService = null;
    clientSession = null;
    temporaryDirectory = '';
  });

  it.each(['trailers', 'data-end', 'large', 'incomplete'] as const)(
    'finishes paused upstream TLS/H2 responses through Core lifecycle: %s', async (ending) => {
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-h2-core-close-'));
      initializeRuntime([`--data-dir=${temporaryDirectory}`]);
      const activeCaptureService = new CaptureService();
      captureService = activeCaptureService;
      await activeCaptureService.initialize();
      const breakpointQueue = new BreakpointQueue();
      const ruleService = new RuleService(breakpointQueue);
      const captureEventQueue = new CaptureEventQueue();
      const requestPath = `/core-origin-goaway/${ending}`;
      const nextPath = `/core-after-goaway/${ending}`;
      const bodySize = ending === 'large' ? 4 * 1024 * 1024 : 384 * 1024;
      const prefixSize = 256 * 1024;
      const body = Buffer.concat([Buffer.alloc(prefixSize, 0x61), Buffer.alloc(bodySize - prefixSize, 0x62)]);
      const expectedHash = createHash('sha256').update(body).digest('hex');
      const ca = await generateCACertificate();
      const originCertificate = await generateCACertificate();
      const server = http2.createSecureServer({ cert: originCertificate.cert, key: originCertificate.key });
      const sourceSessions = new Set<http2.ServerHttp2Session>();
      const sourceSessionsByPath = new Map<string, http2.Http2Session>();
      const requestCounts = new Map<string, number>();
      let sourceStream: http2.ServerHttp2Stream | undefined;
      let sourceSocket: tls.TLSSocket | undefined;
      let sourceClosed = false;
      const sourceErrors: string[] = [];
      server.on('secureConnection', (socket) => { sourceSocket = socket; });
      server.on('session', (session) => {
        sourceSessions.add(session);
        session.on('error', (error) => sourceErrors.push(error.message));
      });
      server.on('stream', (stream, headers) => {
        const currentPath = String(headers[':path']);
        requestCounts.set(currentPath, (requestCounts.get(currentPath) ?? 0) + 1);
        sourceSessionsByPath.set(currentPath, stream.session!);
        stream.on('error', (error) => sourceErrors.push(error.message));
        stream.resume();
        if (currentPath !== requestPath) {
          stream.respond({ ':status': 200 });
          stream.end('new-session');
          return;
        }
        sourceStream = stream;
        stream.on('close', () => { sourceClosed = true; });
        const withTrailers = ending !== 'data-end' && ending !== 'incomplete';
        if (withTrailers) stream.on('wantTrailers', () => stream.sendTrailers({ 'x-complete': expectedHash }));
        stream.respond({ ':status': 200, 'content-type': 'application/octet-stream', 'content-length': body.length },
          { waitForTrailers: withTrailers });
        stream.write(body.subarray(0, prefixSize));
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      origin = {
        port: (server.address() as AddressInfo).port,
        close: async () => {
          for (const session of sourceSessions) session.destroy();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        },
      };
      ruleService.setRuleSet({ revision: 1, nodes: [{
        kind: 'rule', id: 'pause-origin-response', name: 'Pause origin response', enabled: true, priority: 100,
        matchers: [{ type: 'path', mode: 'exact', value: requestPath }],
        actions: [{ type: 'breakpoint', phase: 'response' }],
      }] });
      const activeProxyService = new ProxyService(activeCaptureService, captureEventQueue, ruleService);
      proxyService = activeProxyService;
      await decryptWithCertificate(activeProxyService, ca, ['localhost', '127.0.0.1']);
      const lifecycleMessages: CoreLifecycleMessage[] = [];
      const parentPort: CoreParentPort = {
        on: () => undefined,
        postMessage: (message) => { lifecycleMessages.push(message); },
      };
      const exitProcess = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const coreApplication = new CoreApplication(parentPort, {
        captureService: activeCaptureService, proxyService: activeProxyService,
        captureEventQueue, breakpointQueue, ruleService,
      });
      coreApplication.start();
      try {
        const address = await activeProxyService.start({ port: 0 });
        clientSession = await connectH2ViaProxy(address.port, 'localhost', origin.port, ca.cert);
        const stream = clientSession.request({ ':method': 'POST', ':path': requestPath });
        const received = { bytes: 0, ended: false, closed: false, hash: createHash('sha256'),
          trailers: {} as http2.IncomingHttpHeaders, errors: [] as string[] };
        stream.on('data', (chunk: Buffer) => { received.bytes += chunk.byteLength; received.hash.update(chunk); });
        stream.on('trailers', (trailers) => { received.trailers = trailers; });
        stream.on('end', () => { received.ended = true; });
        stream.on('close', () => { received.closed = true; });
        stream.on('error', (error) => received.errors.push(error.message));
        stream.end('single-post');
        await expect.poll(() => breakpointQueue.size).toBe(1);
        expect(received.bytes).toBe(0);
        const originalSession = sourceSessionsByPath.get(requestPath)!;
        originalSession.close();
        if (ending === 'incomplete') {
          expect(sourceSocket).toBeDefined();
          const finished = once(sourceSocket!, 'finish');
          sourceSocket!.end();
          await finished;
        } else {
          sourceStream!.end(body.subarray(prefixSize));
          await expect.poll(() => sourceClosed).toBe(true);
        }
        const pending = breakpointQueue.list()[0]!;
        expect(breakpointQueue.resolve(pending.id, 'continue')).toBe('continued');
        if (ending === 'incomplete') {
          await expect.poll(() => received.closed).toBe(true);
          expect(received.ended).toBe(false);
          expect(received.errors.length).toBeGreaterThan(0);
        } else {
          await expect.poll(() => received.bytes).toBe(body.length);
          await expect.poll(() => received.ended).toBe(true);
          expect(received.hash.digest('hex')).toBe(expectedHash);
          expect(received.errors).toEqual([]);
          if (ending !== 'data-end') expect(received.trailers['x-complete']).toBe(expectedHash);
        }
        await expect.poll(async () => {
          const page = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
          return page.items.find((exchange) => exchange.path === requestPath)?.state;
        }).toBe(ending === 'incomplete' ? 'aborted' : 'completed');
        const captured = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
        const capturedId = captured.items.find((exchange) => exchange.path === requestPath)!.id;
        const detail = await activeCaptureService.getExchangeDetail(capturedId);
        if (ending !== 'incomplete') {
          expect(detail?.responseBody).toMatchObject({ encodedSize: body.length, bodyHash: expectedHash, truncated: false });
          await expect(activeCaptureService.readExchangeBodyRange(capturedId, 'response', body.length - 32, 32))
            .resolves.toEqual(body.subarray(-32));
        }
        const next = clientSession.request({ ':method': 'POST', ':path': nextPath });
        const nextEnded = once(next, 'end');
        next.resume();
        next.end('new-post');
        await nextEnded;
        expect(sourceSessionsByPath.get(nextPath) === originalSession).toBe(false);
        expect([...requestCounts.entries()]).toEqual([[requestPath, 1], [nextPath, 1]]);
        if (ending !== 'incomplete') expect(sourceErrors).toEqual([]);
      } finally {
        breakpointQueue.closeAll();
        clientSession?.destroy();
        clientSession = null;
        coreApplication.stop();
        await expect.poll(() => exitProcess.mock.calls.length).toBe(1);
        expect(lifecycleMessages.at(-1)?.type).toBe('stopped');
        exitProcess.mockRestore();
        proxyService = null;
        captureService = null;
      }
    }, 20_000,
  );

  it.each(['complete', 'clear', 'cancel', 'settings', 'goaway'] as const)('streams concurrent H2 ranges through response rules and %s', async (ending) => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-h2-ranges-'));
    initializeRuntime([`--data-dir=${temporaryDirectory}`]);
    const activeCaptureService = new CaptureService();
    captureService = activeCaptureService;
    await activeCaptureService.initialize();
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const rangeSize = 6 * 1024 * 1024;
    const prefixSize = 2 * 1024 * 1024;
    const resource = Buffer.concat([Buffer.alloc(rangeSize, 0x61), Buffer.alloc(rangeSize, 0x62)]);
    const ranges = [0, rangeSize].map((offset) => ({
      path: `/range/${offset}`, body: resource.subarray(offset, offset + rangeSize),
      requestRange: `bytes=${offset}-${offset + rangeSize - 1}`,
      contentRange: `bytes ${offset}-${offset + rangeSize - 1}/${resource.byteLength}`,
    }));
    const sourceStreamsByPath = new Map<string, http2.ServerHttp2Stream>();
    const sourceHeadersByPath = new Map<string, http2.IncomingHttpHeaders>();
    const sourceSessions = new Set<http2.ServerHttp2Session>();
    const sourceErrors: Error[] = [];
    const server = http2.createSecureServer({ cert: originCertificate.cert, key: originCertificate.key });
    server.on('session', (session) => {
      sourceSessions.add(session);
      session.on('close', () => sourceSessions.delete(session));
      session.on('error', (error) => sourceErrors.push(error));
    });
    server.on('stream', (stream, headers) => {
      stream.on('error', (error) => sourceErrors.push(error));
      const range = ranges.find((candidate) => candidate.path === headers[':path']);
      if (!range) {
        stream.respond({ ':status': 200, 'content-type': 'text/plain' });
        stream.end('after-clear');
        return;
      }
      sourceStreamsByPath.set(range.path, stream);
      sourceHeadersByPath.set(range.path, headers);
      stream.respond({ ':status': 206, 'content-type': 'application/octet-stream',
        'accept-ranges': 'bytes', 'content-range': range.contentRange, 'content-length': range.body.byteLength });
      stream.write(range.body.subarray(0, prefixSize));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = {
      port: (server.address() as AddressInfo).port,
      close: async () => {
        for (const session of sourceSessions) session.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({ revision: 1, nodes: [{ kind: 'rule', id: 'range-response', name: 'Range response',
      enabled: true, priority: 100,
      matchers: [{ type: 'url', value: `localhost:${origin.port}/range/`, mode: 'contains' }],
      actions: [{ type: 'header', phase: 'response', op: 'append', name: 'x-streaming-rule', value: 'active' }],
    }] });
    const captureEventQueue = new CaptureEventQueue();
    proxyService = new ProxyService(activeCaptureService, captureEventQueue, ruleService);
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    clientSession = await connectH2ViaProxy(address.port, 'localhost', origin.port, ca.cert);
    const responses = ranges.map((range) => {
      const stream = clientSession!.request({ ':path': range.path, ':method': 'GET', range: range.requestRange });
      const state = { bytes: 0, ended: false, headers: {} as http2.IncomingHttpHeaders, hash: createHash('sha256') };
      stream.on('response', (headers) => { state.headers = headers; });
      stream.on('data', (chunk: Buffer) => { state.bytes += chunk.byteLength; state.hash.update(chunk); });
      const completed = once(stream, 'end').then(() => { state.ended = true; });
      void completed.catch(() => undefined);
      stream.end();
      return { range, stream, state, completed };
    });
    await expect.poll(() => responses.map(({ state }) => state.bytes)).toEqual([prefixSize, prefixSize]);
    expect(clientSession.alpnProtocol).toBe('h2');
    expect(new Set(responses.map(({ stream }) => stream.id)).size).toBe(2);
    for (const { range, state } of responses) {
      expect(state.headers).toMatchObject({ ':status': 206, 'content-range': range.contentRange,
        'content-length': String(rangeSize), 'x-streaming-rule': 'active' });
      expect(sourceHeadersByPath.get(range.path)?.range).toBe(range.requestRange);
      expect(sourceStreamsByPath.get(range.path)?.writableEnded).toBe(false);
      expect(state.ended).toBe(false);
    }
    await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
      .items.map((exchange) => exchange.responseBytes)).toEqual([prefixSize, prefixSize]);
    const pending = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
    for (const summary of pending.items) {
      expect(summary).toMatchObject({ state: 'response-streaming', protocol: 'h2', statusCode: 206 });
      await expect(activeCaptureService.getExchangeBodySnapshot(summary.id, 'response')).resolves.toMatchObject({
        encodedSize: prefixSize, available: true, complete: false,
      });
    }

    if (ending === 'clear') {
      const activeSessionId = await proxyService.prepareCaptureReset();
      expect(activeSessionId).not.toBeNull();
      captureEventQueue.reset();
      await activeCaptureService.cleanup({ kind: 'all-except-session', sessionId: activeSessionId! });
      await expect(activeCaptureService.status()).resolves.toMatchObject({ exchangeCount: 0, bodyCount: 0, blobBytes: 0 });
    }
    if (ending === 'cancel') {
      const cancelledResponse = responses[0]!;
      const sourceStream = sourceStreamsByPath.get(cancelledResponse.range.path)!;
      const sourceClosed = once(sourceStream, 'close');
      const clientClosed = once(cancelledResponse.stream, 'close');
      cancelledResponse.stream.close(http2.constants.NGHTTP2_CANCEL);
      await Promise.all([sourceClosed, clientClosed]);
      expect(cancelledResponse.stream.rstCode).toBe(http2.constants.NGHTTP2_CANCEL);
      expect(cancelledResponse.state.bytes).toBe(prefixSize);
      expect(sourceStream.closed).toBe(true);
    }
    if (ending === 'settings') {
      const updatedSettings = { initialWindowSize: 32 * 1024, headerTableSize: 0, maxFrameSize: 32 * 1024 };
      for (const session of [clientSession, ...sourceSessions]) {
        await new Promise<void>((resolve, reject) => {
          session.settings(updatedSettings, (error) => error ? reject(error) : resolve());
        });
        expect(session.localSettings).toMatchObject(updatedSettings);
      }
      expect(responses.map(({ state }) => state.bytes)).toEqual([prefixSize, prefixSize]);
      expect(responses.every(({ state }) => !state.ended)).toBe(true);
    }
    const sessionClosed = ending === 'goaway' ? once(clientSession, 'close') : null;
    if (ending === 'goaway') {
      clientSession.close();
      expect(clientSession.closed).toBe(true);
      expect(clientSession.destroyed).toBe(false);
      expect(responses.every(({ state }) => !state.ended)).toBe(true);
    }
    const completedResponses = ending === 'cancel' ? responses.slice(1) : responses;
    for (const { range } of completedResponses) sourceStreamsByPath.get(range.path)!.end(range.body.subarray(prefixSize));
    await Promise.all(completedResponses.map(({ completed }) => completed));
    for (const { range, state } of completedResponses) {
      expect(state.bytes).toBe(rangeSize);
      expect(state.hash.digest('hex')).toBe(createHash('sha256').update(range.body).digest('hex'));
    }
    if (ending !== 'clear') {
      await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
        .items.map((exchange) => exchange.state).sort()).toEqual(ending === 'cancel' ? ['aborted', 'completed'] : ['completed', 'completed']);
      for (const summary of pending.items) {
        const detail = await activeCaptureService.getExchangeDetail(summary.id);
        const range = ranges.find((candidate) => detail?.url.endsWith(candidate.path))!;
        const expectedSize = ending === 'cancel' && range.path === ranges[0]!.path ? prefixSize : rangeSize;
        const expectedBody = range.body.subarray(0, expectedSize);
        expect(detail?.responseBody).toMatchObject({ encodedSize: expectedSize,
          bodyHash: createHash('sha256').update(expectedBody).digest('hex') });
        await expect(activeCaptureService.readExchangeBodyRange(summary.id, 'response', expectedSize - 32, 64))
          .resolves.toEqual(expectedBody.subarray(expectedSize - 32));
      }
    } else {
      const nextStream = clientSession.request({ ':path': '/after-clear', ':method': 'GET' });
      const nextCompleted = once(nextStream, 'end');
      nextStream.resume();
      nextStream.end();
      await nextCompleted;
      await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
        .items.map((exchange) => exchange.state)).toEqual(['completed']);
      for (const summary of pending.items) await expect(activeCaptureService.getExchangeDetail(summary.id)).resolves.toBeNull();
      const current = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
      await expect(activeCaptureService.getExchangeDetail(current.items[0]!.id)).resolves.toMatchObject({
        url: `https://localhost:${origin.port}/after-clear`, responseBody: { encodedSize: 11 },
      });
      expect(captureEventQueue.drain(10).map((event) => event.summary.id)).toEqual([current.items[0]!.id]);
    }
    if (sessionClosed) {
      await sessionClosed;
      expect(clientSession.destroyed).toBe(true);
      clientSession = await connectH2ViaProxy(address.port, 'localhost', origin.port, ca.cert);
      const nextStream = clientSession.request({ ':path': '/after-goaway', ':method': 'GET' });
      const nextCompleted = once(nextStream, 'end');
      nextStream.resume();
      nextStream.end();
      await nextCompleted;
      await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
        .items.map((exchange) => exchange.state)).toEqual(['completed', 'completed', 'completed']);
      const nextCapture = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
      const nextSummary = nextCapture.items.find((exchange) => exchange.path === '/after-goaway');
      expect(nextSummary).toMatchObject({ protocol: 'h2', statusCode: 200 });
      expect(pending.items.some((exchange) => exchange.id === nextSummary!.id)).toBe(false);
    }
    expect(sourceErrors).toEqual([]);
  }, 20_000);

  it.each(['origin', 'client'] as const)('retains interrupted H2 bodies after %s error GOAWAY without replay and recovers', async (direction) => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-h2-error-goaway-'));
    initializeRuntime([`--data-dir=${temporaryDirectory}`]);
    const activeCaptureService = new CaptureService();
    captureService = activeCaptureService;
    await activeCaptureService.initialize();
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const prefix = Buffer.alloc(256 * 1024, 0x61);
    const requestPath = '/error-goaway';
    const nextPath = '/after-error-goaway';
    const requestCountsByPath = new Map<string, number>();
    const sourceStreamsByPath = new Map<string, http2.ServerHttp2Stream>();
    const sourceSessions = new Set<http2.ServerHttp2Session>();
    const sourceErrors: Array<{ code?: string; message: string }> = [];
    const server = http2.createSecureServer({ cert: originCertificate.cert, key: originCertificate.key });
    server.on('session', (session) => {
      sourceSessions.add(session);
      session.on('error', (error: NodeJS.ErrnoException) => sourceErrors.push({ code: error.code, message: error.message }));
      session.on('close', () => sourceSessions.delete(session));
    });
    server.on('stream', (stream, headers) => {
      stream.on('error', (error: NodeJS.ErrnoException) => sourceErrors.push({ code: error.code, message: error.message }));
      const receivedPath = headers[':path']!;
      sourceStreamsByPath.set(receivedPath, stream);
      requestCountsByPath.set(receivedPath, (requestCountsByPath.get(receivedPath) ?? 0) + 1);
      stream.resume();
      if (receivedPath === requestPath) {
        stream.respond({ ':status': 200, 'content-type': 'application/octet-stream', 'content-length': prefix.byteLength * 2 });
        stream.write(prefix);
      } else {
        stream.respond({ ':status': 200, 'content-type': 'text/plain' });
        stream.end('recovered');
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = { port: (server.address() as AddressInfo).port, close: async () => {
      for (const session of sourceSessions) session.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } };
    proxyService = new ProxyService(activeCaptureService, new CaptureEventQueue(), new RuleService(new BreakpointQueue()));
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    clientSession = await connectH2ViaProxy(address.port, 'localhost', origin.port, ca.cert);
    const sessionErrors: Error[] = [];
    clientSession.on('error', (error) => sessionErrors.push(error));
    const request = clientSession.request({ ':path': requestPath, ':method': 'POST' });
    const received = { bytes: 0, ended: false, closed: false, status: undefined as number | undefined,
      errors: [] as Array<{ code?: string; message: string }>, hash: createHash('sha256') };
    request.on('response', (headers) => { received.status = headers[':status']; });
    request.on('data', (chunk: Buffer) => { received.bytes += chunk.byteLength; received.hash.update(chunk); });
    request.on('end', () => { received.ended = true; });
    request.on('close', () => { received.closed = true; });
    request.on('error', (error: NodeJS.ErrnoException) => received.errors.push({ code: error.code, message: error.message }));
    request.end('single-attempt');
    await expect.poll(() => received.bytes).toBe(prefix.byteLength);
    await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
      .items.find((exchange) => exchange.path === requestPath)?.state).toBe('response-streaming');
    const sourceSession = sourceStreamsByPath.get(requestPath)!.session!;
    (direction === 'origin' ? sourceSession : clientSession).goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
    await expect.poll(() => received.closed, { timeout: 5_000 }).toBe(true);
    expect(received.status).toBe(200);
    expect(received.bytes).toBe(prefix.byteLength);
    if (direction === 'origin') {
      expect(received.ended).toBe(false);
      expect(received.errors.length).toBeGreaterThan(0);
    }
    expect(received.hash.digest('hex')).toBe(createHash('sha256').update(prefix).digest('hex'));
    await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
      .items.find((exchange) => exchange.path === requestPath)?.state).toMatch(/^(aborted|failed)$/);
    const interrupted = (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
      .items.find((exchange) => exchange.path === requestPath)!;
    expect(interrupted).toMatchObject({ protocol: 'h2', statusCode: 200, responseBytes: prefix.byteLength });
    await expect(activeCaptureService.getExchangeDetail(interrupted.id)).resolves.toMatchObject({
      responseBody: { encodedSize: prefix.byteLength, bodyHash: createHash('sha256').update(prefix).digest('hex') },
    });
    expect(requestCountsByPath.get(requestPath)).toBe(1);
    clientSession.destroy();
    clientSession = await connectH2ViaProxy(address.port, 'localhost', origin.port, ca.cert);
    const nextRequest = clientSession.request({ ':path': nextPath, ':method': 'GET' });
    const nextCompleted = once(nextRequest, 'end');
    let nextBody = '';
    nextRequest.setEncoding('utf8');
    nextRequest.on('data', (chunk: string) => { nextBody += chunk; });
    nextRequest.end();
    await nextCompleted;
    expect(nextBody).toBe('recovered');
    await expect.poll(async () => (await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} }))
      .items.find((exchange) => exchange.path === nextPath)?.state).toBe('completed');
    expect(requestCountsByPath.get(requestPath)).toBe(1);
    expect(requestCountsByPath.get(nextPath)).toBe(1);
    const final = await activeCaptureService.querySessions({ limit: 10, sort: 'started_desc', filter: {} });
    expect(final.items).toHaveLength(2);
    expect(final.items.find((exchange) => exchange.id === interrupted.id)?.state).toMatch(/^(aborted|failed)$/);
  }, 15_000);

  it('prefers HTTP/2 for dual-protocol browser clients', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    origin = await startH2Origin(originCertificate.cert, originCertificate.key);

    await expect(negotiateAlpnViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
    )).resolves.toBe('h2');
  });

  it('captures an HTTP/2 exchange with h2 downstream and h2 upstream', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    origin = await startH2Origin(
      originCertificate.cert,
      originCertificate.key,
    );

    const response = await h2ViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
    );
    expect(response.alpn).toBe('h2');
    expect(response.status).toBe(200);
    expect(response.body).toBe('{"h2":true}');

    await waitForExchange(recordingCaptureService);
    expect(recordingCaptureService.exchanges).toHaveLength(1);
    expect(recordingCaptureService.exchanges[0]?.protocol).toBe('h2');
    expect(recordingCaptureService.exchanges[0]?.method).toBe('GET');
    expect(recordingCaptureService.exchanges[0]?.statusCode).toBe(200);

    // 响应 trailer 经 Mockttp 暴露并按 kind 归类。
    const responseTrailer = recordingCaptureService.exchanges[0]?.headers?.find(
      (header) =>
        header.kind === 'response-trailer' &&
        header.name === 'x-trailer-check',
    );
    expect(responseTrailer?.value).toBe('h2-trailer');
    // Mockttp 对 h2 保留伪首部，供 Inspector 区分展示。
    expect(recordingCaptureService.exchanges[0]?.headers?.some((header) => header.isPseudo)).toBe(
      true,
    );
  });

  it('forwards compressed HTTP/2 bodies byte-for-byte and records the content-encoding', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    // 随机二进制经 gzip：任何转码、截断或字符集损坏都会让逐字节比较失败。
    const responsePlain = randomBytes(192 * 1024);
    const responseWire = zlib.gzipSync(responsePlain);
    const requestPlain = randomBytes(64 * 1024);
    const requestWire = zlib.gzipSync(requestPlain);
    const compressedOrigin = await startCompressedH2Origin(
      originCertificate.cert,
      originCertificate.key,
      responseWire,
    );
    origin = compressedOrigin;

    const response = await h2PostViaProxy(
      address.port,
      'localhost',
      compressedOrigin.port,
      ca.cert,
      requestWire,
      { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    );

    // Origin 侧：上游收到的请求正文与客户端发出的完全一致。
    expect(response.status).toBe(200);
    expect(compressedOrigin.received().equals(requestWire)).toBe(true);
    expect(zlib.gunzipSync(compressedOrigin.received()).equals(requestPlain)).toBe(true);

    // Client 侧：客户端收到的响应正文与源站发出的完全一致。
    expect(response.body.equals(responseWire)).toBe(true);
    expect(zlib.gunzipSync(response.body).equals(responsePlain)).toBe(true);

    // Capture 侧：落库的是线上编码字节，且记录了还原所需的 content-encoding。
    await expect.poll(() => recordingCaptureService.exchanges[0]?.responseBody).toMatchObject({
      contentEncoding: 'gzip',
      encodedSize: responseWire.byteLength,
    });
    expect(recordingCaptureService.exchanges[0]?.protocol).toBe('h2');
    expect(recordingCaptureService.exchanges[0]?.requestBody).toMatchObject({
      mediaType: 'application/json',
      contentEncoding: 'gzip',
      encodedSize: requestWire.byteLength,
    });
    expect(
      recordingCaptureService.bodies.some((body) => body.equals(responseWire)),
    ).toBe(true);
    expect(
      recordingCaptureService.bodies.some((body) => body.equals(requestWire)),
    ).toBe(true);
  }, 20_000);

  it('constructs request and response replacement content bytes before HTTP/2 framing', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
        id: 'h2-body-rule',
        name: 'H2 body replacement',
        enabled: true,
        priority: 100,
        matchers: [{ type: 'host', value: 'localhost', mode: 'exact' }],
        actions: [
          {
            type: 'header',
            phase: 'request',
            op: 'set',
            name: 'content-type',
            value: 'text/plain; charset=windows-1252',
          },
          {
            type: 'header',
            phase: 'request',
            op: 'set',
            name: 'content-encoding',
            value: 'gzip, br',
          },
          {
            type: 'body',
            phase: 'request',
            format: 'text',
            content: '€',
          },
          {
            type: 'header',
            phase: 'response',
            op: 'set',
            name: 'content-type',
            value: 'text/plain; charset=windows-1252',
          },
          {
            type: 'header',
            phase: 'response',
            op: 'set',
            name: 'content-encoding',
            value: 'gzip, br',
          },
          {
            type: 'body',
            phase: 'response',
            format: 'text',
            content: '€',
          },
        ],
      }],
    });
    proxyService = new ProxyService(
      new RecordingCaptureService(),
      new CaptureEventQueue(),
      ruleService,
    );
    await decryptWithCertificate(proxyService, ca, ['localhost']);
    const address = await proxyService.start();
    const compressedOrigin = await startCompressedH2Origin(
      originCertificate.cert,
      originCertificate.key,
      zlib.gzipSync(Buffer.from('origin')),
    );
    origin = compressedOrigin;

    const response = await h2PostViaProxy(
      address.port,
      'localhost',
      compressedOrigin.port,
      ca.cert,
      Buffer.from('original'),
      { 'content-type': 'text/plain' },
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip, br');
    expect(response.headers['content-length']).toBeUndefined();
    expect(
      zlib.gunzipSync(zlib.brotliDecompressSync(compressedOrigin.received())),
    ).toEqual(Buffer.from([0x80]));
    expect(
      zlib.gunzipSync(zlib.brotliDecompressSync(response.body)),
    ).toEqual(Buffer.from([0x80]));
  });

  it('matches an HTTP/2 URL written as host/path and applies a response action', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    const ruleService = new RuleService(new BreakpointQueue());
    origin = await startH2Origin(
      originCertificate.cert,
      originCertificate.key,
    );
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
        id: 'h2-url-rule',
        name: 'H2 URL rule',
        enabled: true,
        priority: 100,
        matchers: [{
          type: 'url',
          value: `localhost:${origin.port}/h2`,
          mode: 'contains',
        }],
        actions: [{
          type: 'header',
          phase: 'response',
          op: 'append',
          name: 'interceptor',
          value: 'test',
        }],
      }],
    });
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();

    const response = await h2ViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
    );
    expect(response.status).toBe(200);
    expect(response.headers.interceptor).toBe('test');
    await waitForExchange(recordingCaptureService);
    expect(
      recordingCaptureService.exchanges[0]?.headers?.find(
        (header) =>
          header.kind === 'response'
          && header.name === 'interceptor'
          && header.ruleEffect === 'append',
      )?.value,
    ).toBe('test');
  });

  it('converts an h2 downstream request to an h1 upstream origin', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    origin = await startH1Origin(
      originCertificate.cert,
      originCertificate.key,
    );

    const response = await h2ViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
    );
    expect(response.status).toBe(200);
    expect(response.body).toBe('{"h1":true}');

    await waitForExchange(recordingCaptureService);
    expect(recordingCaptureService.exchanges[0]?.protocol).toBe('h2');
  });

  it('captures native gRPC as a generic HTTP/2 request and response body', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
    const address = await proxyService.start();
    const requestBody = grpcEnvelope(Buffer.from('request-message'));
    const responseBody = Buffer.concat([
      grpcEnvelope(Buffer.from('response-one')),
      grpcEnvelope(Buffer.from('response-two'), true),
    ]);
    origin = await startGrpcH2Origin(
      originCertificate.cert,
      originCertificate.key,
      responseBody,
    );

    const response = await grpcViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
      requestBody,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(responseBody);

    await waitForExchange(recordingCaptureService);
    expect(recordingCaptureService.exchanges[0]).toMatchObject({
      protocol: 'h2',
      method: 'POST',
      requestMime: 'application/grpc+proto',
      responseMime: 'application/grpc+proto',
    });
    expect(recordingCaptureService.bodies).toEqual([requestBody, responseBody]);
    expect(
      recordingCaptureService.exchanges[0]?.headers?.find(
        (header) =>
          header.kind === 'response-trailer' &&
          header.name === 'grpc-status',
      )?.value,
    ).toBe('0');
  });
});
