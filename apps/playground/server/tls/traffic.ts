import http2, {
  type ClientHttp2Stream,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from 'node:http2';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import net from 'node:net';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tls from 'node:tls';
import { gzipSync } from 'node:zlib';

import { generateCACertificate } from 'mockttp';

import type {
  GrpcMessageDraft,
  GrpcTrafficRequestDraft,
  HttpTrafficRequestDraft,
  TlsTrafficRequestDraft,
  TrafficProtocolEvent,
  TrafficRequestFact,
  TrafficResponseFact,
  TrafficTlsFact,
} from '../scenarios/interfaces.ts';
import {
  elapsed,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from '../shared/traffic-utils.ts';

/** 一次 HTTP/gRPC 场景在 origin 端预期返回的真实响应。 */
interface TlsRunDefinition {
  readonly kind: 'grpc' | 'http';
  readonly statusCode?: number;
  readonly responseBody: Buffer | AsyncIterable<Uint8Array>;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly responseTrailers: Readonly<Record<string, string>>;
  readonly onOriginStream?: (stream: http2.ServerHttp2Stream) => void;
}

/** 复用同一H2连接的受控流量，客户端stream仍由Node原生API负责。 */
interface Http2RunOptions {
  readonly session?: http2.ClientHttp2Session;
  readonly response?: Omit<TlsRunDefinition, 'kind' | 'onOriginStream'>;
  readonly onStream?: (stream: ClientHttp2Stream) => void;
  readonly onOriginStream?: (stream: http2.ServerHttp2Stream) => void;
}

/** HTTP 请求、响应及承载它们的 TLS 连接事实。 */
interface TlsHttpExchange {
  readonly request: TrafficRequestFact;
  readonly response: TrafficResponseFact;
  readonly tls: TrafficTlsFact;
  readonly error?: string;
}

/** 代理返回的实际 CONNECT 响应及隧道 socket，不等同于已经完成 TLS 握手。 */
interface ConnectExchange {
  readonly request: TrafficRequestFact;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly socket: net.Socket;
  readonly statusCode: number;
}

/** CONNECT 成功后，在原隧道内完成握手的 TLS 连接。 */
interface TlsConnection extends Omit<ConnectExchange, 'socket'> {
  readonly tlsSocket: tls.TLSSocket;
}

/**
 * 按 TLS 传输边界组织的流量服务，不是 HTTP/2 的别名。
 * 一个自签名 origin 通过 ALPN 同时支持 HTTPS/H1 和 HTTPS/H2；gRPC 复用 H2。
 * TLS-only 场景只建立 CONNECT 与握手，不发送 HTTP；E2E 也可单独连接 origin 检查探测行为。
 */
export class TlsTrafficRunner {
  /** 开启 allowHTTP1 的 Node HTTP/2 TLS server，统一承载 HTTPS 与 gRPC。 */
  readonly #originServer: http2.Http2SecureServer;
  /** origin 的随机端口，与 Interceptor listener 端口相互独立。 */
  readonly #originPort: number;
  /** 经过代理的在途 socket，包括尚未完成 CONNECT 的连接。 */
  readonly #outboundSockets = new Set<net.Socket>();
  /** 按 runId 保存 origin 收到的请求，避免用客户端发送意图代替接收事实。 */
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();
  /** 各 run 独立的响应定义，供 origin 按实际收到的 runId 选择。 */
  readonly #runById = new Map<string, TlsRunDefinition>();
  /** origin 接受的 TCP 连接，用于最终销毁，包括未完成 TLS 的连接。 */
  readonly #originSockets: Set<net.Socket>;
  /** 已完成握手且尚未关闭的 TLS stream，读取其真实入站明文字节计数。 */
  readonly #tlsSockets = new Set<tls.TLSSocket>();
  /** origin 完成的握手次数，不包含失败握手。 */
  #completedHandshakes = 0;
  /** 已关闭 TLS stream 的累计应用字节，连接退出后仍保留证据。 */
  #closedApplicationBytes = 0;

  /** 绑定已启动的 TLS listener 和用于回收的 origin sockets。 */
  private constructor(
    originServer: http2.Http2SecureServer,
    originPort: number,
    originSockets: Set<net.Socket>,
  ) {
    this.#originServer = originServer;
    this.#originPort = originPort;
    this.#originSockets = originSockets;
  }

  /** 生成局部自签名证书并启动支持 H1/H2 的 origin；不安装 CA 或修改产品信任配置。 */
  static async start(): Promise<TlsTrafficRunner> {
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
    let tlsTrafficRunner: TlsTrafficRunner;
    originServer.on('secureConnection', (socket) => {
      tlsTrafficRunner.#completedHandshakes += 1;
      tlsTrafficRunner.#tlsSockets.add(socket);
      socket.once('close', () => {
        tlsTrafficRunner.#closedApplicationBytes += socket.bytesRead;
        tlsTrafficRunner.#tlsSockets.delete(socket);
      });
    });
    originServer.on('request', (incoming, response) => {
      tlsTrafficRunner.#receiveRequest(incoming, response);
    });
    const originPort = await new Promise<number>((resolve, reject) => {
      originServer.once('error', reject);
      originServer.listen(0, '127.0.0.1', () => {
        const address = originServer.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('TLS Traffic origin did not expose a numeric port.'));
          return;
        }
        resolve(address.port);
      });
    });
    tlsTrafficRunner = new TlsTrafficRunner(originServer, originPort, sockets);
    return tlsTrafficRunner;
  }

  /** 暴露 origin 端口，供 Composer 的 TLS-only 探测及释放检查使用。 */
  get port(): number {
    return this.#originPort;
  }

  /** 返回真实完成的 TLS 握手次数，用于断言拒绝授权或重启没有新网络动作。 */
  handshakeCount(): number {
    return this.#completedHandshakes;
  }

  /**
   * 汇总活跃与已关闭 stream 的解密后入站字节；只握手应为零。
   * 必须读取 bytesRead，不能监听 data 计数：H2 原生 parser 会直接消费 TLS stream。
   */
  applicationByteCount(): number {
    let receivedApplicationBytes = this.#closedApplicationBytes;
    for (const socket of this.#tlsSockets) receivedApplicationBytes += socket.bytesRead;
    return receivedApplicationBytes;
  }

  /** 返回场景默认的 localhost authority，与自签名 origin 的使用方式一致。 */
  targetHost(): string {
    return `localhost:${this.#originPort}`;
  }

  /** 经显式代理与 TLS 发送普通 H2 请求，记录 pseudo-headers、正文和 trailers。 */
  async runHttp2(
    draft: HttpTrafficRequestDraft,
    proxyPort: number,
    options: Http2RunOptions = {},
  ): Promise<TrafficExecution> {
    const runId = crypto.randomUUID();
    const targetHost = this.targetHost();
    const attempt = { method: draft.method, path: draft.path, url: `https://${targetHost}${draft.path}` };
    this.#runById.set(runId, {
      kind: 'http',
      responseBody: Buffer.from(JSON.stringify({ protocol: 'h2', path: draft.path }, null, 2)),
      responseHeaders: { 'content-type': 'application/json' },
      responseTrailers: { 'x-playground-trailer': 'h2-complete' },
      ...options.response,
      onOriginStream: options.onOriginStream,
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
        {},
        options,
      );
      return {
        attempt,
        protocol: 'h2',
        request: exchange.request,
        response: exchange.response,
        state: exchange.error === undefined ? 'complete' : 'failed',
        tls: exchange.tls,
        ...(exchange.error === undefined ? {} : { error: exchange.error }),
      };
    } catch (error) {
      return failedExecution(attempt, 'h2', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  /** 在实际收到首段时发送错误GOAWAY，保留部分正文与独立恢复请求的网络事实。 */
  async runHttp2ErrorGoaway(
    draft: HttpTrafficRequestDraft,
    proxyPort: number,
    direction: 'client' | 'origin',
  ): Promise<TrafficExecution> {
    const prefix = Buffer.alloc(256 * 1024, 0x61);
    const responseStream = new PassThrough();
    const clientErrors: string[] = [];
    const originErrors: string[] = [];
    const receivedHash = createHash('sha256');
    let receivedBytes = 0;
    let clientEnded = false;
    let goawaySent = false;
    let originRequestCount = 0;
    let originSession: http2.Http2Session | undefined;
    let clientStream: ClientHttp2Stream | undefined;
    const session = await this.openHttp2Session(proxyPort);
    session.on('error', (error) => clientErrors.push(error.message));
    const timeout = setTimeout(() => {
      session.destroy(new Error('HTTP/2 error GOAWAY scenario did not close within 10 seconds.'));
    }, 10_000);
    timeout.unref();
    try {
      const pendingExecution = this.runHttp2(draft, proxyPort, {
        session,
        response: {
          statusCode: 200,
          responseBody: responseStream,
          responseHeaders: {
            'content-type': 'text/plain; charset=utf-8',
            'content-length': String(prefix.byteLength * 2),
          },
          responseTrailers: {},
        },
        onStream: (stream) => {
          clientStream = stream;
          stream.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.byteLength;
            receivedHash.update(chunk);
            if (goawaySent || receivedBytes < prefix.byteLength) return;
            const sender = direction === 'client' ? session : originSession;
            if (sender === undefined || sender.closed || sender.destroyed) return;
            sender.goaway(http2.constants.NGHTTP2_INTERNAL_ERROR);
            goawaySent = true;
          });
          stream.on('end', () => { clientEnded = true; });
          stream.on('error', (error) => clientErrors.push(error.message));
        },
        onOriginStream: (stream) => {
          originRequestCount += 1;
          originSession = stream.session!;
          stream.on('error', (error) => originErrors.push(error.message));
          originSession.on('error', (error) => originErrors.push(error.message));
        },
      });
      responseStream.write(prefix);
      const execution = await pendingExecution;
      clearTimeout(timeout);
      session.destroy();
      const error = execution.error ?? (goawaySent ? undefined : 'GOAWAY was not sent: the client did not receive the required response prefix.');
      const goaway: TrafficProtocolEvent = {
        type: 'goaway',
        direction: direction === 'client' ? 'client-to-server' : 'server-to-client',
        sent: goawaySent,
        errorCode: goawaySent ? http2.constants.NGHTTP2_INTERNAL_ERROR : null,
        declaredBodyBytes: execution.response?.headers['content-length'] === undefined
          ? null : Number(execution.response.headers['content-length']),
        receivedBodyBytes: receivedBytes,
        receivedBodySha256: receivedHash.digest('hex'),
        clientEnded,
        streamResetCode: clientStream?.rstCode ?? null,
        originRequestCount,
        clientErrors,
        originErrors,
        ...(error === undefined ? {} : { error }),
      };
      if (!goawaySent) {
        return { ...execution, state: 'failed', error, events: [goaway] };
      }
      const recoveryUrl = new URL(draft.path, `https://${this.targetHost()}`);
      recoveryUrl.pathname = `${recoveryUrl.pathname.replace(/\/$/, '')}/recovered`;
      let recoveryOriginRequestCount = 0;
      let recoveryOriginSession: http2.Http2Session | undefined;
      const recovery = await this.runHttp2({
        kind: 'http', protocol: 'h2', method: 'GET', body: '',
        headers: { accept: 'application/json' },
        path: `${recoveryUrl.pathname}${recoveryUrl.search}`,
      }, proxyPort, {
        onOriginStream: (stream) => {
          recoveryOriginRequestCount += 1;
          recoveryOriginSession = stream.session;
        },
      });
      return {
        ...execution,
        events: [goaway, {
          type: 'recovery',
          direction: 'client-to-server',
          state: recovery.state,
          attempt: recovery.attempt,
          request: recovery.request,
          ...(recovery.response === undefined ? {} : { response: recovery.response }),
          originRequestCount: recoveryOriginRequestCount,
          differentOriginSession: recoveryOriginSession !== undefined && recoveryOriginSession !== originSession,
          ...(recovery.error === undefined ? {} : { error: recovery.error }),
        }],
      };
    } finally {
      clearTimeout(timeout);
      responseStream.destroy();
      session.destroy();
    }
  }

  /** 建立真实CONNECT/TLS/H2连接，调用方在全部stream结束后关闭session。 */
  async openHttp2Session(
    proxyPort: number,
    targetHost = this.targetHost(),
    connectHeaders: Readonly<Record<string, string>> = {},
  ): Promise<http2.ClientHttp2Session> {
    const { tlsSocket } = await connectTls(
      proxyPort, targetHost, connectHeaders, ['h2'], this.#outboundSockets,
    );
    return http2.connect(`https://${targetHost}`, { createConnection: () => tlsSocket });
  }

  /** 在同一 TLS/H2 origin 上运行 gRPC envelope、压缩标记和 trailers 场景。 */
  async runGrpc(
    draft: GrpcTrafficRequestDraft,
    proxyPort: number,
    responseChunks?: AsyncIterable<Uint8Array>,
    requestChunks?: AsyncIterable<Uint8Array>,
  ): Promise<TrafficExecution> {
    const runId = crypto.randomUUID();
    const targetHost = this.targetHost();
    const attempt = { method: 'POST', path: draft.path, url: `https://${targetHost}${draft.path}` };
    const contentType = draft.headers['content-type'] ?? 'application/grpc+proto';
    this.#runById.set(runId, {
      kind: 'grpc',
      responseBody: responseChunks ?? grpcMessages(draft.responseMessages, draft.framing),
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
        requestChunks ?? grpcMessages(draft.requestMessages, 'valid'),
      );
      return {
        attempt,
        protocol: 'grpc',
        request: exchange.request,
        response: exchange.response,
        state: exchange.error === undefined ? 'complete' : 'failed',
        tls: exchange.tls,
        ...(exchange.error === undefined ? {} : { error: exchange.error }),
      };
    } catch (error) {
      return failedExecution(attempt, 'grpc', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  /** 按 Draft 选择只握手、HTTPS/H1 或 HTTPS/H2，不擅自修改 Interceptor 的 MITM/passthrough 设置。 */
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
        state: exchange.error === undefined ? 'complete' : 'failed',
        tls: exchange.tls,
        ...(exchange.error === undefined ? {} : { error: exchange.error }),
      };
    } catch (error) {
      return failedExecution(attempt, 'tls', error);
    } finally {
      this.#runById.delete(runId);
      this.#requestByRunId.delete(runId);
    }
  }

  /** 销毁在途客户端与全部 origin 连接，再关闭 listener，包含未结算的 CONNECT。 */
  async close(): Promise<void> {
    for (const socket of this.#outboundSockets) socket.destroy();
    for (const socket of this.#originSockets) socket.destroy();
    if (!this.#originServer.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.#originServer.close((error) => error ? reject(error) : resolve());
    });
  }

  /** 从实际请求记录正文与 headers，并按 runId 返回所属场景的响应和 trailers。 */
  #receiveRequest(incoming: Http2ServerRequest, response: Http2ServerResponse): void {
    const chunks: Buffer[] = [];
    const runId = readHeader(incoming.headers['x-playground-run-id']);
    const run = runId === undefined ? undefined : this.#runById.get(runId);
    if (incoming.httpVersionMajor === 2) run?.onOriginStream?.(incoming.stream);
    const respond = (): void => {
      if (run === undefined) {
        if (incoming.method === 'GET' && incoming.url === '/playground/tls/browser-trust') {
          response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Interceptor TLS browser trust');
        } else {
          response.writeHead(404).end();
        }
        return;
      }
      response.writeHead(run.statusCode ?? 200, run.responseHeaders);
      response.addTrailers(run.responseTrailers);
      const source = run.responseBody instanceof Readable ? run.responseBody : Readable.from(run.responseBody);
      void pipeline(source, response).catch(() => response.destroy());
    };
    incoming.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    incoming.on('error', () => undefined);
    incoming.on('end', () => {
      if (runId !== undefined) {
        this.#requestByRunId.set(runId, requestFact(
          Buffer.concat(chunks),
          stringHeaders(incoming.headers),
          incoming.method ?? 'GET',
          incoming.url ?? '/',
          `https://${this.targetHost()}${incoming.url ?? '/'}`,
        ));
      }
      if (run === undefined || Buffer.isBuffer(run.responseBody)) respond();
    });
    if (run !== undefined && !Buffer.isBuffer(run.responseBody)) respond();
  }

  /** 在 CONNECT 隧道内完成TLS，再将HTTP/1.1字节写入同一个加密socket。 */
  async #requestHttp1(
    proxyPort: number,
    targetHost: string,
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    connectHeaders: Readonly<Record<string, string>>,
  ): Promise<TlsHttpExchange> {
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
          createConnection: () => tlsSocket,
          headers: { connection: 'close', ...headers },
          host: targetHostName(targetHost),
          method,
          path,
          port: targetHostPort(targetHost),
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
    } catch (error) {
      throw new Error(`HTTP/1.1 over TLS failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    } finally {
      tlsSocket.destroy();
    }
    return { request: await this.#waitForRequest(headers['x-playground-run-id']), response, tls: tlsFact };
  }

  /** 通过H2 stream发送请求，只销毁本方法自己建立的session，不关闭调用方共享连接。 */
  async #requestHttp2(
    proxyPort: number,
    targetHost: string,
    method: string,
    path: string,
    headers: Readonly<Record<string, string>>,
    body: Buffer | AsyncIterable<Uint8Array>,
    connectHeaders: Readonly<Record<string, string>> = {},
    options: Pick<Http2RunOptions, 'session' | 'onStream'> = {},
  ): Promise<TlsHttpExchange> {
    const client = options.session ?? await this.openHttp2Session(proxyPort, targetHost, connectHeaders);
    const tlsFact = readTlsFact(client.socket as tls.TLSSocket, targetHost, 'h2');
    try {
      const stream = client.request({
        ':method': method,
        ':path': path,
        ...headers,
      }, { endStream: Buffer.isBuffer(body) && body.byteLength === 0 });
      options.onStream?.(stream);
      const result = await requestHttp2Stream(stream, body);
      return {
        request: await this.#waitForRequest(headers['x-playground-run-id']),
        ...result,
        tls: tlsFact,
      };
    } finally {
      if (options.session === undefined) client.destroy();
    }
  }

  /** 等待对应 run 的 origin 记录；缺失时明确失败，不从客户端 Draft 拼造接收事实。 */
  async #waitForRequest(runId: string | undefined): Promise<TrafficRequestFact> {
    if (runId === undefined) throw new Error('TLS Traffic request is missing its run ID.');
    const deadline = performance.now() + 1_000;
    while (!this.#requestByRunId.has(runId) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const request = this.#requestByRunId.get(runId);
    if (request === undefined) throw new Error('TLS Traffic origin did not record the request.');
    return request;
  }
}

/** 先完成真实 HTTP CONNECT，再在返回的同一个 socket 内建立 TLS 并指定 ALPN。 */
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
      reject(new Error(`TLS handshake after CONNECT failed: ${error.message}`, { cause: error }));
    });
  });
}

/** 保留本次网络尝试和错误，不把未发生的 origin 请求伪造为成功事实。 */
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

/** 将场景消息编码为 gRPC envelope，按 Draft 保留压缩或故意截断的 wire 输入。 */
export function grpcMessages(
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

/** 为未指定端口的目标补上当前 origin 端口。 */
function normalizeTargetHost(targetHost: string, fallbackPort: number): string {
  if (/^[^:]+:\d+$/.test(targetHost)) return targetHost;
  return `${targetHost || 'localhost'}:${fallbackPort}`;
}

/** 建立并记录真实 CONNECT 交换，登记 socket 以便 runner.close 取消停滞连接。 */
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

/** 解析代理实际返回的状态行和 headers，供 CONNECT 证据使用。 */
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

/** 从 Node 的单值或多值 header 中读取首个值。 */
function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 从已协商的 TLS socket 读取 ALPN、cipher 和目标名称。 */
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

/** 将实际请求字节及 headers 转成 Browser 可显示的网络事实。 */
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

/** 收集真实H2响应；异常close也保留已收字节，EOF不能掩盖reset或声明长度不足。 */
function requestHttp2Stream(
  stream: ClientHttp2Stream,
  body: Buffer | AsyncIterable<Uint8Array>,
): Promise<Pick<TlsHttpExchange, 'response' | 'error'>> {
  return new Promise((resolve, reject) => {
    const startedAtMs = performance.now();
    const chunks: Buffer[] = [];
    const chunkTimingsMs: number[] = [];
    let headers: Readonly<Record<string, string>> = {};
    let statusCode = 0;
    let trailers: Readonly<Record<string, string>> = {};
    let responseError: Error | undefined;
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
    stream.on('error', (error) => { responseError = error; });
    stream.on('close', () => {
      if (statusCode === 0) {
        reject(responseError ?? new Error('HTTP/2 stream closed before receiving response headers.'));
        return;
      }
      const response = responseFact(Buffer.concat(chunks), headers, statusCode, chunkTimingsMs, trailers);
      let error = responseError?.message;
      if (error === undefined && (stream.rstCode !== 0 || !stream.readableEnded)) {
        error = `HTTP/2 stream closed before completion (reset code ${stream.rstCode}).`;
      }
      const declaredBytes = headers['content-length'];
      const expectsBody = stream.sentHeaders?.[':method'] !== 'HEAD' && statusCode !== 204 && statusCode !== 304;
      if (error === undefined && expectsBody && declaredBytes !== undefined && response.bodyBytes !== Number(declaredBytes)) {
        error = `HTTP/2 response ended after ${response.bodyBytes} of ${declaredBytes} declared bytes.`;
      }
      resolve({ response, ...(error === undefined ? {} : { error }) });
    });
    if (Buffer.isBuffer(body)) {
      if (body.byteLength > 0) stream.end(body);
    } else {
      void pipeline(Readable.from(body), stream).catch(reject);
    }
  });
}

/** 从 authority 提取用于连接和 SNI 的主机名。 */
function targetHostName(targetHost: string): string {
  return new URL(`https://${targetHost}`).hostname;
}

/** 从 authority 提取目标端口。 */
function targetHostPort(targetHost: string): number {
  return Number(new URL(`https://${targetHost}`).port || 443);
}