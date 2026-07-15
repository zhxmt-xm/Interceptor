import { getLocal, type Mockttp } from 'mockttp';
import type {
  AbortedRequest,
  CompletedRequest,
  CompletedResponse,
} from 'mockttp';

import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';

import { DEFAULT_PROXY_HOST, appVersion } from '../constants';
import type {
  BodyRefInput,
  CaptureSessionInput,
  ExchangeInput,
  HeaderInput,
} from '../storage/types';

/**
 * ProxyService 依赖的捕获落库接口，由 StorageService 结构化实现。
 * 只暴露会话登记、正文写入与 Exchange 追加，Proxy 不直接接触 SQLite 或 Blob。
 */
export interface CaptureSink {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]>;
  writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }>;
}

/** 捕获事件汇：ProxyService 采集/更新 Exchange 后投递，由 CaptureEventQueue 实现。 */
export interface CaptureEventSink {
  enqueue(
    kind: CaptureExchangeEventKind,
    summary: CaptureExchangeSummary,
  ): void;
}

export interface ProxyStartOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface ProxyAddress {
  readonly host: string;
  readonly port: number;
}

export interface ProxyRuntimeStatus {
  readonly listening: boolean;
  readonly host: string | null;
  readonly port: number | null;
  readonly sessionId: string | null;
  readonly capturedExchanges: number;
}

/**
 * HTTPS MITM 配置：CA 材料（null 表示不解密，CONNECT 走字节直通）与 per-host
 * 源站证书不安全例外。私钥由 Main 经内部 tls.configure 命令下发，只在 Core 内存。
 */
export interface ProxyTlsConfig {
  readonly ca: { readonly key: string; readonly cert: string } | null;
  readonly insecureHosts: readonly string[];
}

/**
 * 基于 Mockttp 的显式代理服务，仅绑定 loopback。
 *
 * 用 Mockttp 的 `getLocal()` 作为显式代理：`thenPassThrough()` 转发 HTTP/1.1
 * absolute-form 请求，未配置 HTTPS 解密时对 CONNECT 做不解密的字节直通。通过
 * `request`/`response` 事件按 id 关联，采集规范 Exchange 写入 StorageService。
 * Mockttp 选型的动机与打包方案见 M3.md：它同时支撑 M5 HTTPS MITM 与 M6 HTTP/2，
 * 因其含 WASM/原生依赖不能内联进单文件，故以 external + nft 依赖闭包随包发。
 */
export class ProxyService {
  private readonly pending = new Map<string, CompletedRequest>();

  private server: Mockttp | null = null;
  private address: ProxyAddress | null = null;
  private host = DEFAULT_PROXY_HOST;
  private sessionId: string | null = null;
  private capturedExchanges = 0;
  private tlsConfig: ProxyTlsConfig = { ca: null, insecureHosts: [] };

  constructor(
    private readonly storage: CaptureSink,
    private readonly events: CaptureEventSink,
  ) {}

  /**
   * 启动 Mockttp 代理并登记捕获会话；重复调用先返回既有地址。
   * 调用方：proxy.start command handler（用户显式开始捕获）。
   */
  async start(options: ProxyStartOptions = {}): Promise<ProxyAddress> {
    if (this.server && this.address) {
      return this.address;
    }

    const sessionId = `session-${cryptoRandomId()}`;
    await this.storage.ensureSession({
      id: sessionId,
      name: 'Local capture',
      startedAt: Date.now(),
      captureMode: 'explicit-proxy',
      appVersion,
    });
    this.sessionId = sessionId;
    this.host = options.host ?? DEFAULT_PROXY_HOST;
    this.address = await this.startServer(options.port);
    return this.address;
  }

  /**
   * 更新 HTTPS MITM 配置（CA 材料 + 不安全例外）；代理正在监听时原端口重建。
   * 调用方：tls.configure command handler（Main 内部下发，非 Renderer）。
   */
  async configureTls(config: ProxyTlsConfig): Promise<void> {
    this.tlsConfig = {
      ca: config.ca,
      insecureHosts: [...config.insecureHosts],
    };
    if (this.server) {
      const port = this.address?.port;
      await this.stopServer();
      this.address = await this.startServer(port);
    }
  }

  /** 按当前 TLS 配置创建并启动一个 Mockttp server；有 CA 时开启 HTTPS MITM。 */
  private async startServer(port?: number): Promise<ProxyAddress> {
    const server = this.tlsConfig.ca
      ? getLocal({
          https: {
            key: this.tlsConfig.ca.key,
            cert: this.tlsConfig.ca.cert,
          },
        })
      : getLocal();
    this.registerCaptureListeners(server);
    // 默认验证源站证书（不关闭）；仅对显式不安全例外 host 忽略源站证书错误。
    await server.forAnyRequest().thenPassThrough(
      this.tlsConfig.insecureHosts.length > 0
        ? { ignoreHostHttpsErrors: [...this.tlsConfig.insecureHosts] }
        : {},
    );
    await server.start(port ?? undefined);
    this.server = server;
    return { host: this.host, port: server.port };
  }

  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.pending.clear();
    if (server) {
      await server.stop();
    }
  }

  /**
   * 停止 Mockttp 代理并清空运行态；重复调用保持幂等。
   * 调用方：proxy.stop command handler 与 CoreApplication 关闭路径。
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await this.stopServer();
    this.address = null;
  }

  /** 返回当前代理运行态快照。调用方：proxy.status command handler。 */
  status(): ProxyRuntimeStatus {
    return {
      listening: this.server !== null,
      host: this.address?.host ?? null,
      port: this.address?.port ?? null,
      sessionId: this.sessionId,
      capturedExchanges: this.capturedExchanges,
    };
  }

  private registerCaptureListeners(server: Mockttp): void {
    void server.on('request', (request: CompletedRequest) => {
      this.pending.set(request.id, request);
    });
    void server.on('response', (response: CompletedResponse) => {
      const request = this.pending.get(response.id);
      if (!request) {
        return;
      }
      this.pending.delete(response.id);
      void this.captureExchange(request, response);
    });
    void server.on('abort', (request: AbortedRequest) => {
      const pendingRequest = this.pending.get(request.id) ?? request;
      this.pending.delete(request.id);
      void this.captureExchange(pendingRequest, null, 'aborted');
    });
  }

  private async captureExchange(
    request: CompletedRequest | AbortedRequest,
    response: CompletedResponse | null,
    state: ExchangeInput['state'] = 'completed',
  ): Promise<void> {
    if (!this.sessionId) {
      return;
    }
    const target = parseTarget(request.url);
    const startedAt = request.timingEvents?.startTime ?? Date.now();
    const headers: HeaderInput[] = [
      ...toHeaderInputs('request', request.rawHeaders),
      ...(response ? toHeaderInputs('response', response.rawHeaders) : []),
    ];
    const requestBody = await this.persistBody(
      'body' in request ? request.body : undefined,
      readHeader(request.headers, 'content-type'),
      readHeader(request.headers, 'content-encoding'),
    );
    const responseBody = response
      ? await this.persistBody(
          response.body,
          readHeader(response.headers, 'content-type'),
          readHeader(response.headers, 'content-encoding'),
        )
      : undefined;

    const exchange: ExchangeInput = {
      id: `ex-${cryptoRandomId()}`,
      sessionId: this.sessionId,
      method: request.method.toUpperCase(),
      scheme: target.scheme,
      host: target.hostname,
      port: target.port,
      path: target.path,
      url: request.url,
      protocol: httpVersionToProtocol(request.httpVersion),
      statusCode: response?.statusCode,
      statusText: response?.statusMessage,
      requestMime: readHeader(request.headers, 'content-type'),
      responseMime: response
        ? readHeader(response.headers, 'content-type')
        : undefined,
      startedAt,
      responseStartedAt: response ? Date.now() : undefined,
      completedAt: Date.now(),
      requestBytes: requestBody?.encodedSize ?? readContentLength(request.headers),
      responseBytes: response
        ? responseBody?.encodedSize ?? readContentLength(response.headers)
        : 0,
      state,
      headers,
      requestBody,
      responseBody,
    };
    try {
      await this.storage.appendExchanges([exchange]);
      this.capturedExchanges += 1;
    } catch {
      // 存储失败不得影响已完成的转发；错误由 Storage 层自身诊断。
    }
    this.events.enqueue(state === 'completed' ? 'exchange-added' : 'exchange-updated', {
      id: exchange.id,
      method: exchange.method,
      secure: exchange.scheme === 'https',
      host: exchange.host,
      path: exchange.path,
      protocol: exchange.protocol,
      statusCode: exchange.statusCode,
      responseMime: exchange.responseMime,
      state: exchange.state,
      startedAt: exchange.startedAt,
      durationMs:
        exchange.completedAt !== undefined
          ? Math.max(0, exchange.completedAt - exchange.startedAt)
          : undefined,
      requestBytes: exchange.requestBytes ?? 0,
      responseBytes: exchange.responseBytes ?? 0,
    });
  }

  /**
   * 把一段正文写入内容寻址 Blob Store 并生成 body_ref 引用；超单体上限/配额时
   * 省略正文但保留元数据（size/mime）。注意：Mockttp 默认已在内存缓冲正文，真正的
   * 零内存流式（订阅 body-data 事件增量写盘）留待后续 T3.3 细化。
   */
  private async persistBody(
    body: { buffer?: Uint8Array } | undefined,
    mediaType: string | undefined,
    contentEncoding: string | undefined,
  ): Promise<BodyRefInput | undefined> {
    const buffer = body?.buffer;
    if (!buffer || buffer.byteLength === 0) {
      return undefined;
    }
    const id = `body-${cryptoRandomId()}`;
    try {
      const { hash, size } = await this.storage.writeBody(singleChunk(buffer));
      return {
        id,
        blobHash: hash,
        encodedSize: size,
        mediaType,
        contentEncoding,
        decodeStatus: 'ok',
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return {
        id,
        encodedSize: buffer.byteLength,
        mediaType,
        contentEncoding,
        truncated: name === 'BlobTooLargeError',
        decodeStatus: 'skipped',
      };
    }
  }
}

async function* singleChunk(buffer: Uint8Array): AsyncIterable<Uint8Array> {
  yield buffer;
}

interface ProxyTarget {
  readonly scheme: string;
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
}

function parseTarget(rawUrl: string): ProxyTarget {
  try {
    const url = new URL(rawUrl);
    const scheme = url.protocol.replace(/:$/, '');
    const port = url.port ? Number(url.port) : scheme === 'https' ? 443 : 80;
    return {
      scheme,
      hostname: url.hostname,
      port,
      path: `${url.pathname}${url.search}`,
    };
  } catch {
    return { scheme: 'http', hostname: '', port: 80, path: rawUrl };
  }
}

function httpVersionToProtocol(version: string | undefined): string {
  return version && version.startsWith('2') ? 'h2' : 'http/1.1';
}

function toHeaderInputs(
  kind: 'request' | 'response',
  rawHeaders: readonly (readonly [string, string])[] | undefined,
): HeaderInput[] {
  if (!rawHeaders) {
    return [];
  }
  return rawHeaders.map(([name, value]) => ({ kind, name, value }));
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw.split(';', 1)[0]?.trim() || undefined : undefined;
}

function readContentLength(
  headers: Record<string, string | string[] | undefined>,
): number {
  const value = headers['content-length'];
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
