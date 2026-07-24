import http2 from 'node:http2';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';

import { generateCACertificate } from 'mockttp';

import type {
  CaptureSessionInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';
import { RuleEngine } from '../../rules/entry';
import { BreakpointQueue } from '../../rules/rule-breakpoint-queue';
import { ProxyService } from '../entry';
import type { CaptureSink } from '../interfaces';
import { CaptureEventQueue } from '../proxy-capture-event-queue';

/**
 * M6 T6.1/T6.2 端到端集成：真实 HTTP/2 客户端经代理 MITM 隧道，用 ALPN h2 连到真实
 * HTTP/2 源站。验证 Mockttp 的 http2:'fallback' 下游 + passthrough 上游 h2 协商 +
 * 四组协议转换开箱可用，且捕获管线把 Exchange 记为 protocol='h2'。
 */
class RecordingSink implements CaptureSink {
  readonly sessions: CaptureSessionInput[] = [];
  readonly exchanges: ExchangeInput[] = [];
  readonly bodies: Buffer[] = [];

  ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    this.exchanges.push(...exchanges);
    return Promise.resolve(
      exchanges.map((exchange, index) => ({ id: exchange.id, seq: index + 1 })),
    );
  }

  updateExchange(): Promise<void> {
    return Promise.resolve();
  }

  writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }> {
    return (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of source) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      this.bodies.push(body);
      const size = body.byteLength;
      return { hash: `sha-${size}`, size, deduplicated: false };
    })();
  }

  appendRuleHits(): Promise<void> {
    return Promise.resolve();
  }

  appendWebSocketFrames(
    _exchangeId: string,
    _frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    return Promise.resolve();
  }
}

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
          ALPNProtocols: ['h2', 'http/1.1'],
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

async function waitForExchange(sink: RecordingSink): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (sink.exchanges.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('ProxyService HTTP/2 (Mockttp MITM)', () => {
  let proxy: ProxyService | null = null;
  let origin: { port: number; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    await proxy?.stop();
    await origin?.close();
    proxy = null;
    origin = null;
  });

  it('captures an HTTP/2 exchange with h2 downstream and h2 upstream', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const sink = new RecordingSink();
    proxy = new ProxyService(sink, new CaptureEventQueue());
    await proxy.configureTls({
      ca,
      insecureHosts: ['localhost', '127.0.0.1'],
    });
    const address = await proxy.start();
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

    await waitForExchange(sink);
    expect(sink.exchanges).toHaveLength(1);
    expect(sink.exchanges[0]?.protocol).toBe('h2');
    expect(sink.exchanges[0]?.method).toBe('GET');
    expect(sink.exchanges[0]?.statusCode).toBe(200);

    // 响应 trailer 经 Mockttp 暴露并按 kind 归类。
    const responseTrailer = sink.exchanges[0]?.headers?.find(
      (header) =>
        header.kind === 'response-trailer' &&
        header.name === 'x-trailer-check',
    );
    expect(responseTrailer?.value).toBe('h2-trailer');
    // Mockttp 对 h2 保留伪首部，供 Inspector 区分展示。
    expect(sink.exchanges[0]?.headers?.some((header) => header.isPseudo)).toBe(
      true,
    );
  });

  it('matches an HTTP/2 URL written as host/path and applies a response action', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const sink = new RecordingSink();
    const ruleEngine = new RuleEngine(new BreakpointQueue());
    origin = await startH2Origin(
      originCertificate.cert,
      originCertificate.key,
    );
    ruleEngine.setRuleSet({
      revision: 1,
      rules: [{
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
    proxy = new ProxyService(sink, new CaptureEventQueue(), ruleEngine);
    await proxy.configureTls({
      ca,
      insecureHosts: ['localhost', '127.0.0.1'],
    });
    const address = await proxy.start();

    const response = await h2ViaProxy(
      address.port,
      'localhost',
      origin.port,
      ca.cert,
    );
    expect(response.status).toBe(200);
    expect(response.headers.interceptor).toBe('test');
    await waitForExchange(sink);
    expect(
      sink.exchanges[0]?.headers?.find(
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
    const sink = new RecordingSink();
    proxy = new ProxyService(sink, new CaptureEventQueue());
    await proxy.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
    const address = await proxy.start();
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

    await waitForExchange(sink);
    expect(sink.exchanges[0]?.protocol).toBe('h2');
  });

  it('captures native gRPC as a generic HTTP/2 request and response body', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const sink = new RecordingSink();
    proxy = new ProxyService(sink, new CaptureEventQueue());
    await proxy.configureTls({ ca, insecureHosts: ['localhost', '127.0.0.1'] });
    const address = await proxy.start();
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

    await waitForExchange(sink);
    expect(sink.exchanges[0]).toMatchObject({
      protocol: 'h2',
      method: 'POST',
      requestMime: 'application/grpc+proto',
      responseMime: 'application/grpc+proto',
    });
    expect(sink.bodies).toEqual([requestBody, responseBody]);
    expect(
      sink.exchanges[0]?.headers?.find(
        (header) =>
          header.kind === 'response-trailer' &&
          header.name === 'grpc-status',
      )?.value,
    ).toBe('0');
  });
});
