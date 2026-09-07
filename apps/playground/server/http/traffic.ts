import { randomUUID } from 'node:crypto';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import type {
  HttpTrafficRequestDraft,
  TrafficRequestFact,
  TrafficScenarioId,
} from '../scenarios/interfaces.ts';
import {
  closeServer,
  elapsed,
  listen,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from '../shared/traffic-utils.ts';

/** origin 实际收到的一次请求，正文保留原始 Buffer 以支持精确字节断言。 */
export interface LoopbackRequestObservation {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

/** 按精确 path 配置的 origin 响应；支持重复 header 和二进制正文。 */
export interface LoopbackResponseDefinition {
  readonly statusCode?: number;
  readonly headers?: OutgoingHttpHeaders;
  readonly body: string | Uint8Array;
}

/** 将网络结果与主动断开控制分开暴露，便于在 UI 操作之间保持请求挂起。 */
export interface AbortableLoopbackRequest {
  readonly result: Promise<{ statusCode: number | undefined; body: string }>;
  abort(): void;
}

/** 程序化 HTTP 客户端的 method、原始正文与 header 输入。 */
interface HttpProxyRequestOptions {
  readonly method?: string;
  readonly body?: string | Uint8Array;
  readonly headers?: OutgoingHttpHeaders;
}

/** 同一个代理客户端的分块发送选项，供上传、early response 和超时场景使用。 */
interface TimedHttpProxyRequestOptions extends HttpProxyRequestOptions {
  readonly bodyChunks?: readonly (string | Uint8Array)[];
  readonly chunkDelayMs?: number;
  readonly timeoutMs?: number;
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/**
 * 明文 HTTP/1.1 的唯一 origin 与显式代理客户端，供 Playground 场景和 E2E 控制共用。
 * 预设场景按 runId 关联网络事实；程序化调用可配置精确响应、挂起/释放或主动取消请求。
 * 此类不接管 HTTPS/H2，也不操作 Interceptor 的配置和录制状态。
 */
export class HttpTrafficRunner {
  /** 接收实际请求并返回场景响应的 loopback HTTP server。 */
  readonly #originServer: Server;
  /** 随机 origin 端口，不是被测代理 listener 的端口。 */
  readonly #originPort: number;
  /** 临时保存各场景的 origin 请求事实，run 取出后删除。 */
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();
  /** 按接收完成顺序保存请求，供多步 workflow 的 origin 断言与证据使用。 */
  readonly #requestObservations: LoopbackRequestObservation[] = [];
  /** 响应尚未完成就被真实客户端或代理断开的 path。 */
  readonly #abortedResponsePaths = new Set<string>();
  /** 只阻塞对应精确 path 的响应 gate，不影响其他请求到达或返回。 */
  readonly #responseGates = new Map<string, { promise: Promise<void>; release: () => void }>();
  /** 调用方指定的响应定义，不修改其他 path 或场景默认值。 */
  readonly #responses = new Map<string, LoopbackResponseDefinition>();

  /** 接管已监听的 origin 及其随机端口。 */
  private constructor(originServer: Server, originPort: number) {
    this.#originServer = originServer;
    this.#originPort = originPort;
  }

  /** 启动支持场景响应与可控 echo 响应的 origin，完整接收请求后记录原始字节。 */
  static async start(): Promise<HttpTrafficRunner> {
    let httpTrafficRunner: HttpTrafficRunner;
    const originServer = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      const requestPath = incoming.url ?? '/';
      response.once('close', () => {
        if (!response.writableEnded) httpTrafficRunner.#abortedResponsePaths.add(requestPath);
      });
      const scenarioId = readHeader(incoming.headers, 'x-playground-scenario-id') as TrafficScenarioId | undefined;
      let respondedEarly = false;
      incoming.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
        if (scenarioId === 'h1-early-response' && !respondedEarly) {
          respondedEarly = true;
          respondJson(response, { response: 'sent-before-request-completed' });
        }
      });
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        const observation: LoopbackRequestObservation = {
          method: incoming.method ?? 'GET',
          path: requestPath,
          headers: { ...incoming.headers },
          body,
        };
        httpTrafficRunner.#requestObservations.push(observation);
        const runId = readHeader(incoming.headers, 'x-playground-run-id');
        if (runId !== undefined) {
          httpTrafficRunner.#requestByRunId.set(runId, {
            body: body.toString('utf8'),
            bodyBytes: body.byteLength,
            bodyEncoding: 'utf8',
            headers: stringHeaders(incoming.headers),
            method: incoming.method ?? 'GET',
            path: incoming.url ?? '/',
            url: `http://127.0.0.1:${httpTrafficRunner.#originPort}${incoming.url ?? '/'}`,
          });
        }
        if (respondedEarly) return;
        const finishResponse = (): void => {
          if (response.destroyed) return;
          const configured = httpTrafficRunner.#responses.get(requestPath);
          if (configured !== undefined || scenarioId === undefined) {
            httpTrafficRunner.#respond(response, observation, configured);
          } else {
            respondToScenario(response, scenarioId, body, incoming.socket);
          }
        };
        const gate = httpTrafficRunner.#responseGates.get(requestPath);
        if (gate === undefined) finishResponse();
        else void gate.promise.then(finishResponse);
      });
    });
    const originPort = await listen(originServer);
    httpTrafficRunner = new HttpTrafficRunner(originServer, originPort);
    return httpTrafficRunner;
  }

  /** 返回 origin 端口，供外部客户端和端口释放检查使用。 */
  get port(): number {
    return this.#originPort;
  }

  /** 生成 origin URL，供 Composer 直连或显式代理的 absolute-form 请求使用。 */
  url(requestPath = '/'): string {
    return `http://127.0.0.1:${this.#originPort}${requestPath}`;
  }

  /** 为一个精确 path 设置 status、headers 和原始响应字节。 */
  respondWith(requestPath: string, response: LoopbackResponseDefinition): void {
    this.#responses.set(requestPath, response);
  }

  /** 返回指定响应；未配置时保留原有 echo、cookies 和观测 header。 */
  #respond(
    response: ServerResponse,
    observation: LoopbackRequestObservation,
    configured: LoopbackResponseDefinition | undefined,
  ): void {
    const body = configured === undefined
      ? Buffer.from(JSON.stringify({
        workflow: 'capture',
        method: observation.method,
        path: observation.path,
        requestBody: observation.body.toString('utf8'),
        ok: true,
      }))
      : Buffer.from(configured.body);
    response.writeHead(configured?.statusCode ?? 200, {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': [
        'interceptor_e2e=active; Path=/; HttpOnly',
        'workflow=capture; Path=/',
      ],
      'x-interceptor-e2e': 'loopback-lab',
      ...configured?.headers,
      connection: 'close',
    });
    response.end(body);
  }

  /** 挂起一个 path 的响应并返回 release，接收请求与 origin 观测仍正常进行。 */
  holdResponse(requestPath: string): () => void {
    let releasePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
      releasePromise = resolve;
    });
    const release = (): void => {
      this.#responseGates.delete(requestPath);
      releasePromise();
    };
    this.#responseGates.set(requestPath, { promise, release });
    return release;
  }

  /** 返回该 path 首次完整到达 origin 的请求，不以客户端发送成功代替接收事实。 */
  observation(requestPath: string): LoopbackRequestObservation | undefined {
    return this.#requestObservations.find((observation) => observation.path === requestPath);
  }

  /** 判断是否发生过响应完成前的真实 socket 断开。 */
  responseWasAborted(requestPath: string): boolean {
    return this.#abortedResponsePaths.has(requestPath);
  }

  /** 将 origin 观测转成可序列化证据，正文使用 base64 保留二进制字节。 */
  evidence(): object[] {
    return this.#requestObservations.map((observation) => ({
      method: observation.method,
      path: observation.path,
      headers: observation.headers,
      bodyBase64: observation.body.toString('base64'),
    }));
  }

  /** 经过指定代理完成请求；返回格式保持为旧 workflow 使用的状态码与 UTF-8 正文。 */
  async requestThroughProxy(
    proxyPort: number,
    requestPath: string,
    options: HttpProxyRequestOptions = {},
  ): Promise<{ statusCode: number | undefined; body: string }> {
    return this.startAbortableRequestThroughProxy(proxyPort, requestPath, options).result;
  }

  /** 立即启动真实代理请求并暴露 abort，不提前等待网络完成。 */
  startAbortableRequestThroughProxy(
    proxyPort: number,
    requestPath: string,
    options: HttpProxyRequestOptions = {},
  ): AbortableLoopbackRequest {
    const pendingRequest = this.#startRequestThroughProxy(proxyPort, requestPath, options);
    return {
      abort: pendingRequest.abort,
      result: pendingRequest.result.then((response) => ({
        statusCode: response.statusCode,
        body: Buffer.from(response.body, response.bodyEncoding).toString('utf8'),
      })),
    };
  }

  /** 执行一次 HTTP/Body/Encoding 场景，返回发送尝试、origin 接收和客户端响应三类事实。 */
  async run(
    scenarioId: TrafficScenarioId,
    draft: HttpTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = randomUUID();
    const attempt = {
      method: draft.method,
      path: draft.path,
      url: this.url(draft.path),
    };
    try {
      const response = await this.#requestThroughProxy(proxyPort, runId, scenarioId, draft);
      const requestFact = await this.#readRequestFact(runId);
      return {
        attempt,
        protocol: 'http/1.1',
        request: requestFact,
        response,
        state: scenarioId === 'h1-abort' || response.statusCode >= 500 ? 'failed' : 'complete',
      };
    } catch (error) {
      const requestFact = await this.#readRequestFact(runId);
      return {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        protocol: 'http/1.1',
        request: requestFact,
        state: 'failed',
      };
    }
  }

  /** 释放全部响应 gate，再关闭 origin，避免由本服务挂起的响应阻塞退出。 */
  async close(): Promise<void> {
    for (const gate of this.#responseGates.values()) gate.release();
    this.#responseGates.clear();
    await closeServer(this.#originServer);
  }

  /** 将场景 Draft 转成通用代理请求，保留定时上传、显式长度和场景追踪 headers。 */
  async #requestThroughProxy(
    proxyPort: number,
    runId: string,
    scenarioId: TrafficScenarioId,
    draft: HttpTrafficRequestDraft,
  ) {
    const bodyChunks = scenarioId === 'h1-upload' || scenarioId === 'h1-early-response'
      ? splitIntoTimedChunks(draft.body)
      : draft.body.length > 0 ? [draft.body] : [];
    const bodyBytes = bodyChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
    return this.#startRequestThroughProxy(proxyPort, draft.path, {
      method: draft.method,
      bodyChunks,
      chunkDelayMs: 30,
      timeoutMs: 15_000,
      headers: {
        connection: scenarioId === 'h1-early-response' ? 'keep-alive' : 'close',
        ...draft.headers,
        ...(bodyChunks.length > 0 ? { 'content-length': String(bodyBytes) } : {}),
        'x-playground-run-id': runId,
        'x-playground-scenario-id': scenarioId,
      },
    }).result;
  }

  /**
   * 场景与 E2E 共用的 absolute-form HTTP 客户端。
   * 普通请求立即发送，场景可定时分块；early response 后仍发送剩余上传数据，错误时清理计时器。
   */
  #startRequestThroughProxy(
    proxyPort: number,
    requestPath: string,
    options: TimedHttpProxyRequestOptions,
  ): { readonly result: Promise<ReturnType<typeof responseFact>>; readonly abort: () => void } {
    const body = Buffer.from(options.body ?? '');
    const bodyChunks = options.bodyChunks ?? (body.byteLength > 0 ? [body] : []);
    let abortRequest = (): void => undefined;
    const result = new Promise<ReturnType<typeof responseFact>>((resolve, reject) => {
      const startedAtMs = performance.now();
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let writeTimer: ReturnType<typeof setTimeout> | undefined;
      const settle = (
        outcome: { readonly error: unknown } | { readonly response: ReturnType<typeof responseFact> },
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if ('error' in outcome) {
          clearTimeout(writeTimer);
          reject(outcome.error);
        } else resolve(outcome.response);
      };
      const outgoing = request({
        host: '127.0.0.1',
        port: proxyPort,
        method: options.method ?? 'GET',
        path: this.url(requestPath),
        headers: {
          connection: 'close',
          host: `127.0.0.1:${this.#originPort}`,
          ...(body.byteLength > 0 && options.headers === undefined ? {
            'content-type': 'application/json',
            'content-length': String(body.byteLength),
          } : {}),
          ...options.headers,
        },
      }, (incoming) => {
        const chunks: Buffer[] = [];
        const chunkTimingsMs: number[] = [];
        incoming.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
          chunkTimingsMs.push(elapsed(startedAtMs));
        });
        incoming.on('error', (error) => settle({ error }));
        incoming.on('aborted', () => settle({ error: new Error('Proxy response was aborted.') }));
        incoming.on('close', () => {
          if (!incoming.complete) settle({ error: new Error('Proxy response closed before completion.') });
        });
        incoming.on('end', () => settle({
          response: responseFact(
            Buffer.concat(chunks),
            stringHeaders(incoming.headers),
            incoming.statusCode ?? 0,
            chunkTimingsMs,
            stringHeaders(incoming.trailers),
          ),
        }));
      });
      outgoing.on('error', (error) => settle({ error }));
      abortRequest = () => outgoing.destroy(new Error('E2E client aborted request'));
      if (options.timeoutMs !== undefined) {
        timeout = setTimeout(() => {
          const error = new Error('Traffic Lab request timed out.');
          outgoing.destroy(error);
          settle({ error });
        }, options.timeoutMs);
      }
      if (options.chunkDelayMs === undefined) {
        for (const chunk of bodyChunks) outgoing.write(chunk);
        outgoing.end();
        return;
      }
      if (bodyChunks.length === 0) {
        outgoing.end();
        return;
      }
      const writeChunk = (index: number): void => {
        const chunk = bodyChunks[index];
        if (chunk === undefined) {
          outgoing.end();
          return;
        }
        outgoing.write(chunk);
        writeTimer = setTimeout(() => writeChunk(index + 1), options.chunkDelayMs);
      };
      writeChunk(0);
    });
    return { result, abort: () => abortRequest() };
  }

  /** 短暂等待 origin 收包记录并消费它；网络未到达 origin 时明确返回 null。 */
  async #readRequestFact(runId: string): Promise<TrafficRequestFact | null> {
    const deadline = performance.now() + 500;
    while (!this.#requestByRunId.has(runId) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const requestFact = this.#requestByRunId.get(runId) ?? null;
    this.#requestByRunId.delete(runId);
    return requestFact;
  }

}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function respondToScenario(
  response: ServerResponse,
  scenarioId: TrafficScenarioId | undefined,
  requestBody: Buffer,
  socket: { destroy: () => void },
): void {
  switch (scenarioId) {
    case 'h1-json':
      respondJson(response, { orderId: 'ord_42', status: 'ready', items: 3 });
      return;
    case 'h1-upload':
      respondJson(response, { receivedBytes: requestBody.byteLength, sha: 'playground-upload' });
      return;
    case 'h1-stream':
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.write('{"chunk":1}\n');
      setTimeout(() => response.write('{"chunk":2}\n'), 35);
      setTimeout(() => response.end('{"chunk":3}\n'), 70);
      return;
    case 'h1-abort':
      socket.destroy();
      return;
    case 'body-json': respond(response, Buffer.from('{"ready":true,"items":[1,2,3]}'), 'application/json'); return;
    case 'body-text': respond(response, Buffer.from('Interceptor plain text body.'), 'text/plain; charset=utf-8'); return;
    case 'body-html': respond(response, Buffer.from('<!doctype html><html><body><h1>Interceptor</h1></body></html>'), 'text/html; charset=utf-8'); return;
    case 'body-css': respond(response, Buffer.from('body { color: #2570e0; }'), 'text/css; charset=utf-8'); return;
    case 'body-javascript': respond(response, Buffer.from('const captured = true;\nconsole.log(captured);'), 'text/javascript; charset=utf-8'); return;
    case 'body-xml': respond(response, Buffer.from('<?xml version="1.0"?><capture ready="true"/>'), 'application/xml'); return;
    case 'body-yaml': respond(response, Buffer.from('capture:\n  ready: true\n  count: 3\n'), 'application/yaml'); return;
    case 'body-svg': respond(response, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#2570e0"/></svg>'), 'image/svg+xml'); return;
    case 'body-markdown': respond(response, Buffer.from('# Capture Lab\n\n- request\n- response\n'), 'text/markdown; charset=utf-8'); return;
    case 'body-form': respond(response, Buffer.from('name=Interceptor&ready=true'), 'application/x-www-form-urlencoded'); return;
    case 'body-png': respond(response, PNG_1X1, 'image/png'); return;
    case 'body-binary': respond(response, Buffer.from([0, 1, 2, 3, 127, 128, 254, 255]), 'application/octet-stream'); return;
    case 'body-audio': respond(response, wavFixture(), 'audio/wav'); return;
    case 'body-video': respond(response, mp4Fixture(), 'video/mp4'); return;
    case 'body-unknown-text': respond(response, Buffer.from('Unknown MIME, valid UTF-8 text.')); return;
    case 'body-unknown-binary': respond(response, Buffer.from([0, 159, 146, 150, 255])); return;
    case 'encoding-gzip': respond(response, gzipSync('{"encoding":"gzip"}'), 'application/json', { 'Content-Encoding': 'gzip' }); return;
    case 'encoding-deflate': respond(response, deflateSync('{"encoding":"deflate"}'), 'application/json', { 'Content-Encoding': 'deflate' }); return;
    case 'encoding-br': respond(response, brotliCompressSync('{"encoding":"br"}'), 'application/json', { 'Content-Encoding': 'br' }); return;
    case 'encoding-corrupt-gzip': respond(response, Buffer.from([0x1f, 0x8b, 0x08, 0, 1, 2, 3]), 'application/json', { 'Content-Encoding': 'gzip' }); return;
    case 'encoding-invalid-image': respond(response, Buffer.from('not-a-png'), 'image/png'); return;
    default:
      response.writeHead(404).end();
  }
}

function respond(
  response: ServerResponse,
  body: Buffer,
  contentType?: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(200, {
    'Content-Length': body.byteLength,
    ...(contentType === undefined ? {} : { 'Content-Type': contentType }),
    ...headers,
  });
  response.end(body);
}

function respondJson(response: ServerResponse, body: Readonly<Record<string, unknown>>): void {
  respond(response, Buffer.from(JSON.stringify(body, null, 2)), 'application/json');
}

function splitIntoTimedChunks(body: string): readonly string[] {
  if (body.length < 3) return [body];
  const firstBoundary = Math.ceil(body.length / 3);
  const secondBoundary = Math.ceil(body.length * 2 / 3);
  return [body.slice(0, firstBoundary), body.slice(firstBoundary, secondBoundary), body.slice(secondBoundary)];
}

function wavFixture(): Buffer {
  const buffer = Buffer.alloc(48);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(40, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8_000, 24);
  buffer.writeUInt32LE(8_000, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(4, 40);
  buffer.set([128, 160, 96, 128], 44);
  return buffer;
}

function mp4Fixture(): Buffer {
  return Buffer.from([
    0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  ]);
}