import http2 from 'node:http2';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { generateCACertificate } from 'mockttp';

import { RuleService } from '../../rules/entry';
import { BreakpointQueue } from '../../rules/internal/breakpoint-queue';
import { ProxyService } from '../entry';
import { CaptureEventQueue } from '../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

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
          const chunks: Buffer[] = [];
          req.on('response', (responseHeaders) => {
            status = responseHeaders[':status'];
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

// 经显式代理 CONNECT 建隧道，在隧道上以 ALPN h2 完成 TLS，再用 HTTP/2 发 GET。
function h2ViaProxy(
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
          const req = client.request({ ':path': '/h2', ':method': 'GET' });
          let status: number | undefined;
          let responseHeaders: http2.IncomingHttpHeaders = {};
          let body = '';
          req.on('response', (headers) => {
            status = headers[':status'];
            responseHeaders = headers;
          });
          req.setEncoding('utf8');
          req.on('data', (data: string) => {
            body += data;
          });
          req.on('end', () => {
            client.close();
            resolve({
              status,
              headers: responseHeaders,
              body,
              alpn: tlsSocket.alpnProtocol ?? false,
            });
          });
          req.on('error', reject);
          req.end();
        },
      );
      tlsSocket.on('error', reject);
    });
    socket.on('error', reject);
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

  afterEach(async () => {
    await proxyService?.stop();
    await origin?.close();
    proxyService = null;
    origin = null;
  });

  it('prefers HTTP/2 for dual-protocol browser clients', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    await proxyService.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
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
    await proxyService.configureTls({
      ca,
      insecureHosts: ['localhost', '127.0.0.1'],
    });
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
    await proxyService.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
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
    await proxyService.configureTls({
      ca,
      insecureHosts: ['localhost', '127.0.0.1'],
    });
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
    await proxyService.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
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
    await proxyService.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
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
