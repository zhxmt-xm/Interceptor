import http2, {
  type ClientHttp2Stream,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from 'node:http2';
import { request } from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { gzipSync } from 'node:zlib';

import { generateCACertificate } from 'mockttp';

import type {
  GrpcMessageDraft,
  GrpcTrafficRequestDraft,
  HttpTrafficRequestDraft,
  TlsTrafficRequestDraft,
  TrafficRequestFact,
  TrafficResponseFact,
  TrafficTlsFact,
} from '../interfaces.ts';
import {
  elapsed,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from './traffic-utils.ts';

interface SecureRun {
  readonly kind: 'grpc' | 'http';
  readonly responseBody: Buffer;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly responseTrailers: Readonly<Record<string, string>>;
}

interface SecureExchange {
  readonly request: TrafficRequestFact;
  readonly response: TrafficResponseFact;
  readonly tls: TrafficTlsFact;
}

interface ConnectExchange {
  readonly request: TrafficRequestFact;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly socket: net.Socket;
  readonly statusCode: number;
}

interface TlsConnection extends Omit<ConnectExchange, 'socket'> {
  readonly tlsSocket: tls.TLSSocket;
}

export class SecureTrafficRunner {
  readonly #originServer: http2.Http2SecureServer;
  readonly #originPort: number;
  readonly #outboundSockets = new Set<net.Socket>();
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();
  readonly #runById = new Map<string, SecureRun>();
  readonly #originSockets: Set<net.Socket>;

  private constructor(
    originServer: http2.Http2SecureServer,
    originPort: number,
    originSockets: Set<net.Socket>,
  ) {
    this.#originServer = originServer;
    this.#originPort = originPort;
    this.#originSockets = originSockets;
  }

  static async start(): Promise<SecureTrafficRunner> {
    const certificate = await generateCACertificate({
      subject: { commonName: 'Interceptor Playground Origin' },
    });
    const originServer = http2.createSecureServer({
      allowHTTP1: true,
      cert: certificate.cert,
      key: certificate.key,
    });
    const sockets = new Set<net.Socket>();
    originServer.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    let secureTrafficRunner: SecureTrafficRunner;
    originServer.on('request', (incoming, response) => {
      secureTrafficRunner.#receiveRequest(incoming, response);
    });
    const originPort = await new Promise<number>((resolve, reject) => {
      originServer.once('error', reject);
      originServer.listen(0, '127.0.0.1', () => {
        const address = originServer.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('Secure Traffic origin did not expose a numeric port.'));
          return;
        }
        resolve(address.port);
      });
    });
    secureTrafficRunner = new SecureTrafficRunner(originServer, originPort, sockets);
    return secureTrafficRunner;
  }

  targetHost(): string {
    return `localhost:${this.#originPort}`;
  }

  async runHttp2(
    draft: HttpTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = crypto.randomUUID();
    const targetHost = this.targetHost();
    const attempt = { method: draft.method, path: draft.path, url: `https://${targetHost}${draft.path}` };
    this.#runById.set(runId, {
      kind: 'http',
      responseBody: Buffer.from(JSON.stringify({ protocol: 'h2', path: draft.path }, null, 2)),
      responseHeaders: { 'content-type': 'application/json' },
      responseTrailers: { 'x-playground-trailer': 'h2-complete' },
    });
    try {
      const requestBody = Buffer.from(draft.body);
      const exchange = await this.#requestHttp2(
        proxyPort,
        targetHost,
        draft.method,
        draft.path,
        { ...draft.headers, 'x-playground-run-id': runId },
        requestBody,
      );
      return {
        attempt,
        protocol: 'h2',
        request: exchange.request,
        response: exchange.response,
        state: 'complete',
        tls: exchange.tls,
      };
    } catch (error) {
      return failedExecution(attempt, 'h2', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  async runGrpc(
    draft: GrpcTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = crypto.randomUUID();
    const targetHost = this.targetHost();
    const attempt = { method: 'POST', path: draft.path, url: `https://${targetHost}${draft.path}` };
    const contentType = draft.headers['content-type'] ?? 'application/grpc+proto';
    this.#runById.set(runId, {
      kind: 'grpc',
      responseBody: grpcMessages(draft.responseMessages, draft.framing),
      responseHeaders: {
        'content-type': contentType,
        ...(draft.responseMessages.some((message) => message.compressed)
          ? { 'grpc-encoding': 'gzip' }
          : {}),
      },
      responseTrailers: draft.responseTrailers,
    });
    try {
      const exchange = await this.#requestHttp2(
        proxyPort,
        targetHost,
        'POST',
        draft.path,
        {
          ...draft.headers,
          'content-type': contentType,
          te: 'trailers',
          'x-playground-run-id': runId,
        },
        grpcMessages(draft.requestMessages, 'valid'),
      );
      return {
        attempt,
        protocol: 'grpc',
        request: exchange.request,
        response: exchange.response,
        state: 'complete',
        tls: exchange.tls,
      };
    } catch (error) {
      return failedExecution(attempt, 'grpc', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  async runTls(
    draft: TlsTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = crypto.randomUUID();
    const targetHost = normalizeTargetHost(draft.targetHost, this.#originPort);
    const attempt = {
      method: draft.mode === 'tunnel-only' ? 'CONNECT' : draft.method,
      path: draft.mode === 'tunnel-only' ? targetHost : draft.path,
      url: draft.mode === 'tunnel-only' ? targetHost : `https://${targetHost}${draft.path}`,
    };
    try {
      if (draft.mode === 'tunnel-only') {
        const connection = await connectTls(
          proxyPort,
          targetHost,
          draft.connectHeaders,
          [],
          this.#outboundSockets,
        );
        const tlsSocket = connection.tlsSocket;
        const tlsFact = readTlsFact(tlsSocket, targetHost, 'tls');
        tlsSocket.destroy();
        return {
          attempt,
          protocol: 'tls',
          request: connection.request,
          response: responseFact(
            Buffer.alloc(0),
            connection.responseHeaders,
            connection.statusCode,
            [],
          ),
          state: 'complete',
          tls: tlsFact,
        };
      }
      this.#runById.set(runId, {
        kind: 'http',
        responseBody: Buffer.from(JSON.stringify({ mode: draft.mode, secure: true }, null, 2)),
        responseHeaders: { 'content-type': 'application/json' },
        responseTrailers: {},
      });
      const headers = { ...draft.headers, 'x-playground-run-id': runId };
      const exchange = draft.mode === 'https-h2'
        ? await this.#requestHttp2(proxyPort, targetHost, draft.method, draft.path, headers, Buffer.alloc(0), draft.connectHeaders)
        : await this.#requestHttp1(proxyPort, targetHost, draft.method, draft.path, headers, draft.connectHeaders);
      return {
        attempt,
        protocol: 'tls',
        request: exchange.request,
        response: exchange.response,
        state: 'complete',
        tls: exchange.tls,
      };
    } catch (error) {
      return failedExecution(attempt, 'tls', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  async close(): Promise<void> {
    for (const socket of this.#outboundSockets) socket.destroy();
    for (const socket of this.#originSockets) socket.destroy();
    if (!this.#originServer.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.#originServer.close((error) => error ? reject(error) : resolve());
    });
  }

  #receiveRequest(incoming: Http2ServerRequest, response: Http2ServerResponse): void {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    incoming.on('end', () => {
      const runId = readHeader(incoming.headers['x-playground-run-id']);
      if (runId !== undefined) {
        this.#requestByRunId.set(runId, requestFact(
          Buffer.concat(chunks),
          stringHeaders(incoming.headers),
          incoming.method ?? 'GET',
          incoming.url ?? '/',
          `https://${this.targetHost()}${incoming.url ?? '/'}`,
        ));
      }
      const run = runId === undefined ? undefined : this.#runById.get(runId);
      if (run === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, run.responseHeaders);
      response.addTrailers(run.responseTrailers);
      response.end(run.responseBody);
    });
  }

  async #requestHttp1(
    proxyPort: number,
    targetHost: string,
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    connectHeaders: Readonly<Record<string, string>>,
  ): Promise<SecureExchange> {
    const { tlsSocket } = await connectTls(
      proxyPort,
      targetHost,
      connectHeaders,
      ['http/1.1'],
      this.#outboundSockets,
    );
    const tlsFact = readTlsFact(tlsSocket, targetHost, 'http/1.1');
    const startedAtMs = performance.now();
    let response: TrafficResponseFact;
    try {
      response = await new Promise<TrafficResponseFact>((resolve, reject) => {
        const outgoing = request({
          agent: false,
          createConnection: () => tlsSocket,
          headers: { connection: 'close', ...headers },
          host: targetHostName(targetHost),
          method,
          path,
          port: targetHostPort(targetHost),
          rejectUnauthorized: false,
        }, (incoming) => {
          const chunks: Buffer[] = [];
          const chunkTimingsMs: number[] = [];
          incoming.on('data', (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
            chunkTimingsMs.push(elapsed(startedAtMs));
          });
          incoming.on('error', reject);
          incoming.on('end', () => resolve(responseFact(
            Buffer.concat(chunks),
            stringHeaders(incoming.headers),
            incoming.statusCode ?? 0,
            chunkTimingsMs,
            stringHeaders(incoming.trailers),
          )));
        });
        outgoing.on('error', reject);
        outgoing.end();
      });
    } finally {
      tlsSocket.destroy();
    }
    return { request: await this.#waitForRequest(headers['x-playground-run-id']), response, tls: tlsFact };
  }

  async #requestHttp2(
    proxyPort: number,
    targetHost: string,
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    body: Buffer,
    connectHeaders: Readonly<Record<string, string>> = {},
  ): Promise<SecureExchange> {
    const { tlsSocket } = await connectTls(
      proxyPort,
      targetHost,
      connectHeaders,
      ['h2'],
      this.#outboundSockets,
    );
    const tlsFact = readTlsFact(tlsSocket, targetHost, 'h2');
    const client = http2.connect(`https://${targetHost}`, { createConnection: () => tlsSocket });
    try {
      const response = await requestHttp2Stream(client.request({
        ':method': method,
        ':path': path,
        ...headers,
      }, { endStream: body.byteLength === 0 }), body);
      return {
        request: await this.#waitForRequest(headers['x-playground-run-id']),
        response,
        tls: tlsFact,
      };
    } finally {
      client.destroy();
    }
  }

  async #waitForRequest(runId: string | undefined): Promise<TrafficRequestFact> {
    if (runId === undefined) throw new Error('Secure Traffic request is missing its run ID.');
    const deadline = performance.now() + 1_000;
    while (!this.#requestByRunId.has(runId) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const request = this.#requestByRunId.get(runId);
    if (request === undefined) throw new Error('Secure Traffic origin did not record the request.');
    return request;
  }
}

async function connectTls(
  proxyPort: number,
  targetHost: string,
  connectHeaders: Readonly<Record<string, string>>,
  alpnProtocols: readonly string[],
  outboundSockets: Set<net.Socket>,
): Promise<TlsConnection> {
  const tunnel = await openTunnel(proxyPort, targetHost, connectHeaders, outboundSockets);
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      ALPNProtocols: [...alpnProtocols],
      rejectUnauthorized: false,
      servername: net.isIP(targetHostName(targetHost)) ? undefined : targetHostName(targetHost),
      socket: tunnel.socket,
    }, () => resolve({
      request: tunnel.request,
      responseHeaders: tunnel.responseHeaders,
      statusCode: tunnel.statusCode,
      tlsSocket,
    }));
    tlsSocket.once('error', (error) => {
      tlsSocket.destroy();
      reject(error);
    });
  });
}

function failedExecution(
  attempt: TrafficExecution['attempt'],
  protocol: TrafficExecution['protocol'],
  error: unknown,
): TrafficExecution {
  return {
    attempt,
    error: error instanceof Error ? error.message : String(error),
    protocol,
    request: null,
    state: 'failed',
  };
}

function grpcMessages(
  messages: readonly GrpcMessageDraft[],
  framing: 'truncated' | 'valid',
): Buffer {
  const encoded = messages.map((message) => {
    const decoded = Buffer.from(message.data, message.encoding);
    const payload = message.compressed ? gzipSync(decoded) : decoded;
    const header = Buffer.alloc(5);
    header[0] = message.compressed ? 1 : 0;
    header.writeUInt32BE(payload.byteLength, 1);
    return Buffer.concat([header, payload]);
  });
  const body = Buffer.concat(encoded);
  if (framing !== 'truncated') return body;
  if (body.byteLength < 2) return Buffer.from([0, 0, 0, 0, 8, 1]);
  return body.subarray(0, body.byteLength - 2);
}

function normalizeTargetHost(targetHost: string, fallbackPort: number): string {
  if (/^[^:]+:\d+$/.test(targetHost)) return targetHost;
  return `${targetHost || 'localhost'}:${fallbackPort}`;
}

function openTunnel(
  proxyPort: number,
  targetHost: string,
  connectHeaders: Readonly<Record<string, string>>,
  outboundSockets: Set<net.Socket>,
): Promise<ConnectExchange> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1');
    outboundSockets.add(socket);
    socket.once('close', () => outboundSockets.delete(socket));
    let response = Buffer.alloc(0);
    let settled = false;
    const requestHeaders = { Host: targetHost, ...connectHeaders };
    const request: TrafficRequestFact = {
      body: '',
      bodyBytes: 0,
      bodyEncoding: 'utf8',
      headers: requestHeaders,
      method: 'CONNECT',
      path: targetHost,
      url: targetHost,
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };
    const onError = (error: Error): void => fail(error);
    const onClose = (): void => fail(new Error('CONNECT socket closed before the proxy response completed.'));
    const onData = (chunk: Buffer): void => {
      response = Buffer.concat([response, chunk]);
      const headersEnd = response.indexOf('\r\n\r\n');
      if (headersEnd < 0) return;
      const head = response.subarray(0, headersEnd).toString('utf8');
      const { headers, statusCode, statusLine } = parseHttpResponseHead(head);
      if (statusCode !== 200) {
        fail(new Error(`CONNECT failed: ${statusLine}`));
        return;
      }
      settled = true;
      cleanup();
      const remainder = response.subarray(headersEnd + 4);
      if (remainder.byteLength > 0) socket.unshift(remainder);
      resolve({ request, responseHeaders: headers, socket, statusCode });
    };
    const timeout = setTimeout(
      () => fail(new Error('CONNECT request timed out.')),
      15_000,
    );
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.on('data', onData);
    socket.once('connect', () => {
      const headers = Object.entries(requestHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join('\r\n');
      socket.write(`CONNECT ${targetHost} HTTP/1.1\r\n${headers}\r\n\r\n`);
    });
  });
}

function parseHttpResponseHead(head: string): {
  readonly headers: Readonly<Record<string, string>>;
  readonly statusCode: number;
  readonly statusLine: string;
} {
  const [statusLine = '', ...headerLines] = head.split('\r\n');
  const statusCode = Number(statusLine.split(' ')[1] ?? 0);
  const headers = Object.fromEntries(headerLines.flatMap((line) => {
    const separator = line.indexOf(':');
    if (separator < 0) return [];
    return [[line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]];
  }));
  return { headers, statusCode, statusLine };
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readTlsFact(
  tlsSocket: tls.TLSSocket,
  targetHost: string,
  fallbackAlpn: TrafficTlsFact['alpn'],
): TrafficTlsFact {
  const alpn = tlsSocket.alpnProtocol;
  return {
    alpn: alpn === 'h2' || alpn === 'http/1.1' ? alpn : fallbackAlpn,
    cipher: tlsSocket.getCipher().name,
    serverName: targetHostName(targetHost),
  };
}

function requestFact(
  body: Buffer,
  headers: Readonly<Record<string, string>>,
  method: string,
  path: string,
  url: string,
): TrafficRequestFact {
  const bodyEncoding = headers['content-type']?.includes('grpc') === true ? 'base64' : 'utf8';
  return {
    body: body.toString(bodyEncoding),
    bodyBytes: body.byteLength,
    bodyEncoding,
    headers,
    method,
    path,
    url,
  };
}

function requestHttp2Stream(
  stream: ClientHttp2Stream,
  body: Buffer,
): Promise<TrafficResponseFact> {
  return new Promise((resolve, reject) => {
    const startedAtMs = performance.now();
    const chunks: Buffer[] = [];
    const chunkTimingsMs: number[] = [];
    let headers: Readonly<Record<string, string>> = {};
    let statusCode = 0;
    let trailers: Readonly<Record<string, string>> = {};
    stream.on('response', (responseHeaders) => {
      statusCode = Number(responseHeaders[':status'] ?? 0);
      headers = stringHeaders(responseHeaders);
    });
    stream.on('trailers', (responseTrailers) => {
      trailers = stringHeaders(responseTrailers);
    });
    stream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      chunkTimingsMs.push(elapsed(startedAtMs));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(responseFact(
      Buffer.concat(chunks),
      headers,
      statusCode,
      chunkTimingsMs,
      trailers,
    )));
    if (body.byteLength > 0) stream.end(body);
  });
}

function targetHostName(targetHost: string): string {
  return new URL(`https://${targetHost}`).hostname;
}

function targetHostPort(targetHost: string): number {
  return Number(new URL(`https://${targetHost}`).port || 443);
}