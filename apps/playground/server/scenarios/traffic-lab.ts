import type {
  TrafficRequestDraft,
  TrafficScenarioDescriptor,
  TrafficScenarioId,
  TrafficScenarioResult,
} from './interfaces.ts';
import { HttpTrafficRunner } from '../http/traffic.ts';
import { TlsTrafficRunner } from '../tls/traffic.ts';
import { elapsed } from '../shared/traffic-utils.ts';
import { WebSocketTrafficRunner } from '../websocket/traffic.ts';

export { HttpTrafficRunner, TlsTrafficRunner, WebSocketTrafficRunner };
export { ProxiedWebSocketClient } from '../websocket/traffic.ts';
export type {
  AbortableLoopbackRequest,
  LoopbackRequestObservation,
  LoopbackResponseDefinition,
} from '../http/traffic.ts';

const GET_HEADERS = { accept: 'application/json' };
const POST_HEADERS = { 'content-type': 'application/json' };

export const TRAFFIC_SCENARIOS: readonly TrafficScenarioDescriptor[] = [
  scenario('h1-json', 'HTTP', 'H1 JSON', 'Structured request and response.', 'GET', '/playground/h1-json'),
  scenario('h1-upload', 'HTTP', 'H1 upload', 'Chunked upload with origin counters.', 'POST', '/playground/h1-upload', '{"part":1,"message":"playground","done":true}'),
  scenario('h1-stream', 'HTTP', 'H1 streaming', 'Timed chunks and first-byte timing.', 'GET', '/playground/h1-stream'),
  scenario('h1-early-response', 'HTTP', 'H1 early response', 'Response before request completion.', 'POST', '/playground/h1-early-response', '{"request":"continues-after-response"}'),
  scenario('h1-abort', 'HTTP', 'H1 abort', 'Client abort and origin reset.', 'GET', '/playground/h1-abort'),
  scenario('h2-json', 'HTTP', 'H2 JSON', 'HTTP/2 stream and pseudo-headers.', 'GET', '/playground/h2-json'),
  scenario('h2-error-goaway-client', 'HTTP', 'H2 client error GOAWAY', 'Client interrupts after 256 KiB of a declared 512 KiB response.', 'POST', '/playground/h2/error-goaway-client', 'single-attempt', { 'content-type': 'text/plain' }),
  scenario('h2-error-goaway-origin', 'HTTP', 'H2 origin error GOAWAY', 'Origin interrupts after the client receives 256 KiB of a declared 512 KiB response.', 'POST', '/playground/h2/error-goaway-origin', 'single-attempt', { 'content-type': 'text/plain' }),
  scenario('body-json', 'Bodies', 'JSON', 'Tree, raw and hex views.', 'POST', '/playground/body/json', '{"ready":true}'),
  scenario('body-text', 'Bodies', 'Plain text', 'UTF-8 text response.', 'POST', '/playground/body/text', 'Interceptor body lab', { 'content-type': 'text/plain; charset=utf-8' }),
  scenario('body-html', 'Bodies', 'HTML', 'Markup syntax and preview.', 'GET', '/playground/body/html'),
  scenario('body-css', 'Bodies', 'CSS', 'Stylesheet syntax.', 'GET', '/playground/body/css'),
  scenario('body-javascript', 'Bodies', 'JavaScript', 'Script syntax.', 'GET', '/playground/body/javascript'),
  scenario('body-xml', 'Bodies', 'XML', 'XML syntax and formatting.', 'GET', '/playground/body/xml'),
  scenario('body-yaml', 'Bodies', 'YAML', 'YAML syntax and formatting.', 'GET', '/playground/body/yaml'),
  scenario('body-svg', 'Bodies', 'SVG', 'Vector image preview.', 'GET', '/playground/body/svg'),
  scenario('body-markdown', 'Bodies', 'Markdown', 'Source, preview and split modes.', 'GET', '/playground/body/markdown'),
  scenario('body-form', 'Bodies', 'Form URL encoded', 'Decoded form fields.', 'POST', '/playground/body/form', 'name=Interceptor&ready=true', { 'content-type': 'application/x-www-form-urlencoded' }),
  scenario('body-png', 'Bodies', 'PNG', 'Raster image preview.', 'GET', '/playground/body/png'),
  scenario('body-binary', 'Bodies', 'Binary', 'Hex and download actions.', 'GET', '/playground/body/binary'),
  scenario('body-audio', 'Bodies', 'Audio', 'Inline media controls.', 'GET', '/playground/body/audio'),
  scenario('body-video', 'Bodies', 'Video', 'Inline media controls.', 'GET', '/playground/body/video'),
  scenario('body-unknown-text', 'Bodies', 'Unknown text', 'Text sniffing without MIME.', 'GET', '/playground/body/unknown-text'),
  scenario('body-unknown-binary', 'Bodies', 'Unknown binary', 'Binary fallback without MIME.', 'GET', '/playground/body/unknown-binary'),
  scenario('encoding-gzip', 'Encoding', 'gzip', 'Decoded compressed response.', 'GET', '/playground/encoding/gzip'),
  scenario('encoding-deflate', 'Encoding', 'deflate', 'Decoded compressed response.', 'GET', '/playground/encoding/deflate'),
  scenario('encoding-br', 'Encoding', 'brotli', 'Decoded compressed response.', 'GET', '/playground/encoding/br'),
  scenario('encoding-corrupt-gzip', 'Encoding', 'Corrupt gzip', 'Decode failure evidence.', 'GET', '/playground/encoding/corrupt-gzip'),
  scenario('encoding-invalid-image', 'Encoding', 'Invalid image', 'Unavailable image evidence.', 'GET', '/playground/encoding/invalid-image'),
  webSocketScenario('ws-text', 'Text echo', 'Client and server text messages.', '/playground/ws/text', [{ data: 'hello from client', encoding: 'utf8' }]),
  webSocketScenario('ws-binary', 'Binary echo', 'Client and server binary messages.', '/playground/ws/binary', [{ data: 'AAECA/8=', encoding: 'base64' }]),
  webSocketScenario('ws-bidirectional', 'Bidirectional', 'Interleaved messages in both directions.', '/playground/ws/bidirectional', [{ data: 'client message', encoding: 'utf8' }], [{ data: 'origin message', encoding: 'utf8' }]),
  webSocketScenario('ws-control', 'Control frames', 'Ping, pong and close frames.', '/playground/ws/control', [], [], ['ping', 'pong', 'close']),
  grpcScenario('grpc-unary-proto', 'Unary proto', 'Binary protobuf envelopes.', '/playground.Capture/UnaryProto', 'application/grpc+proto', [{ compressed: false, data: 'cHJvdG8tcmVxdWVzdA==', encoding: 'base64' }], [{ compressed: false, data: 'cHJvdG8tcmVzcG9uc2U=', encoding: 'base64' }]),
  grpcScenario('grpc-unary-json', 'Unary JSON', 'JSON payload envelope.', '/playground.Capture/UnaryJson', 'application/grpc+json', [{ compressed: false, data: '{"message":"hello"}', encoding: 'utf8' }], [{ compressed: false, data: '{"message":"world"}', encoding: 'utf8' }]),
  grpcScenario('grpc-trailers-error', 'Trailers error', 'Non-zero grpc-status.', '/playground.Capture/TrailersError', 'application/grpc+proto', [{ compressed: false, data: 'cmVxdWVzdA==', encoding: 'base64' }], [], { 'grpc-message': 'Playground failure', 'grpc-status': '13' }),
  grpcScenario('grpc-compressed', 'Compressed envelope', 'Compressed message flag.', '/playground.Capture/Compressed', 'application/grpc+proto', [{ compressed: true, data: 'Y29tcHJlc3NlZCByZXF1ZXN0', encoding: 'base64' }], [{ compressed: true, data: 'Y29tcHJlc3NlZCByZXNwb25zZQ==', encoding: 'base64' }]),
  grpcScenario('grpc-malformed', 'Malformed envelope', 'Truncated frame evidence.', '/playground.Capture/Malformed', 'application/grpc+proto', [{ compressed: false, data: 'cmVxdWVzdA==', encoding: 'base64' }], [{ compressed: false, data: 'dHJ1bmNhdGVk', encoding: 'base64' }], { 'grpc-status': '0' }, 'truncated'),
  tlsScenario('tls-passthrough', 'Passthrough tunnel', 'Opaque CONNECT tunnel.', 'tunnel-only', 'CONNECT', 'localhost', '/'),
  tlsScenario('tls-mitm-h1', 'MITM H1', 'Decrypted HTTPS over HTTP/1.1.', 'https-h1', 'GET', 'localhost', '/playground/tls/h1'),
  tlsScenario('tls-mitm-h2', 'MITM H2', 'Decrypted HTTPS over HTTP/2.', 'https-h2', 'GET', 'localhost', '/playground/tls/h2'),
];

/**
 * Playground 页面与 E2E 共用的协议流量入口和生命周期所有者。
 * HTTP、WebSocket 和按需创建的 TLS origin 各只有一份，场景 run 与细粒度控制复用它们。
 * 此类只产生外部流量和网络事实，不读取或改变 Interceptor 的业务状态。
 */
export class TrafficLab {
  /** 明文 HTTP/1.1 origin、场景和请求控制。 */
  readonly #httpTrafficRunner: HttpTrafficRunner;
  /** 缓存首次 TLS 创建任务，使并发 HTTPS/H2/gRPC 场景共享一个 origin。 */
  #tlsTrafficRunnerPromise: Promise<TlsTrafficRunner> | null = null;
  /** WebSocket origin、普通协议场景与断点原始帧控制。 */
  readonly #webSocketTrafficRunner: WebSocketTrafficRunner;

  /** 接管已经启动的明文协议服务；TLS 保持惰性创建。 */
  private constructor(
    httpTrafficRunner: HttpTrafficRunner,
    webSocketTrafficRunner: WebSocketTrafficRunner,
  ) {
    this.#httpTrafficRunner = httpTrafficRunner;
    this.#webSocketTrafficRunner = webSocketTrafficRunner;
  }

  /** 启动 HTTP 与 WebSocket；后者失败时回收已启动的 HTTP listener。 */
  static async start(): Promise<TrafficLab> {
    const httpTrafficRunner = await HttpTrafficRunner.start();
    try {
      return new TrafficLab(httpTrafficRunner, await WebSocketTrafficRunner.start());
    } catch (error) {
      await httpTrafficRunner.close();
      throw error;
    }
  }

  /** 返回人工页面与 E2E 共用的场景、默认 Draft 和观察要求。 */
  scenarios(): readonly TrafficScenarioDescriptor[] {
    return TRAFFIC_SCENARIOS;
  }

  /** 暴露同一个 HTTP 服务，允许按步骤设置响应、取消请求与查询 origin 证据。 */
  get httpTrafficRunner(): HttpTrafficRunner {
    return this.#httpTrafficRunner;
  }

  /** 暴露同一个 WebSocket 服务，供跨多步 UI 的持续连接操作使用。 */
  get webSocketTrafficRunner(): WebSocketTrafficRunner {
    return this.#webSocketTrafficRunner;
  }

  /** 校验场景与 Draft 的 transport 一致后，分派实际流量并附加统一时间与场景信息。 */
  async run(
    scenarioId: TrafficScenarioId,
    draft: TrafficRequestDraft,
    proxyPort = 8888,
  ): Promise<TrafficScenarioResult> {
    const scenario = TRAFFIC_SCENARIOS.find((item) => item.id === scenarioId);
    if (scenario === undefined) {
      throw new Error(`Unknown Traffic Lab scenario "${scenarioId}".`);
    }
    if (!sameTransport(scenario.defaultDraft, draft)) {
      throw new Error(`Draft transport does not match scenario "${scenarioId}".`);
    }
    const startedAt = new Date().toISOString();
    const startedAtMs = performance.now();
    let execution;
    if (draft.kind === 'http' && draft.protocol === 'h1') {
      execution = await this.#httpTrafficRunner.run(scenarioId, draft, proxyPort);
    } else if (draft.kind === 'websocket') {
      execution = await this.#webSocketTrafficRunner.run(draft, proxyPort);
    } else {
      const tlsTrafficRunner = await this.getTlsTrafficRunner();
      if (draft.kind === 'http') {
        if (scenarioId === 'h2-error-goaway-client' || scenarioId === 'h2-error-goaway-origin') {
          execution = await tlsTrafficRunner.runHttp2ErrorGoaway(
            draft, proxyPort, scenarioId === 'h2-error-goaway-client' ? 'client' : 'origin',
          );
        } else {
          execution = await tlsTrafficRunner.runHttp2(draft, proxyPort);
        }
      } else if (draft.kind === 'grpc') {
        execution = await tlsTrafficRunner.runGrpc(draft, proxyPort);
      } else if (draft.kind === 'tls') {
        execution = await tlsTrafficRunner.runTls(draft, proxyPort);
      } else {
        execution = unsupportedExecution(scenarioId, draft, startedAt, startedAtMs);
      }
    }
    return { ...execution, durationMs: elapsed(startedAtMs), scenarioId, startedAt };
  }

  /** 等待正在创建的 TLS 服务并回收所有协议资源，不因某个服务尚未使用而创建它。 */
  async close(): Promise<void> {
    const tlsTrafficRunnerPromise = this.#tlsTrafficRunnerPromise;
    this.#tlsTrafficRunnerPromise = null;
    const tlsTrafficRunner = await tlsTrafficRunnerPromise?.catch(() => null) ?? null;
    await Promise.all([
      this.#httpTrafficRunner.close(),
      tlsTrafficRunner?.close(),
      this.#webSocketTrafficRunner.close(),
    ]);
  }

  /** 按需创建支持 TLS-only、HTTPS/H1、HTTPS/H2 与 gRPC 的共享服务；创建失败后允许重试。 */
  async getTlsTrafficRunner(): Promise<TlsTrafficRunner> {
    const tlsTrafficRunnerPromise = this.#tlsTrafficRunnerPromise
      ?? TlsTrafficRunner.start();
    this.#tlsTrafficRunnerPromise = tlsTrafficRunnerPromise;
    try {
      return await tlsTrafficRunnerPromise;
    } catch (error) {
      if (this.#tlsTrafficRunnerPromise === tlsTrafficRunnerPromise) {
        this.#tlsTrafficRunnerPromise = null;
      }
      throw error;
    }
  }
}

function sameTransport(expected: TrafficRequestDraft, actual: TrafficRequestDraft): boolean {
  if (expected.kind !== actual.kind) return false;
  if (expected.kind === 'http' && actual.kind === 'http') {
    return expected.protocol === actual.protocol;
  }
  if (expected.kind === 'tls' && actual.kind === 'tls') {
    return expected.mode === actual.mode;
  }
  return true;
}

function scenario(
  id: TrafficScenarioId,
  group: TrafficScenarioDescriptor['group'],
  title: string,
  description: string,
  method: string,
  path: string,
  body = '',
  headers: Readonly<Record<string, string>> = method === 'GET' ? GET_HEADERS : POST_HEADERS,
): TrafficScenarioDescriptor {
  const acceptance = acceptanceSteps(id, group, description);
  return {
    defaultDraft: {
      body,
      headers,
      kind: 'http',
      method,
      path,
      protocol: id.startsWith('h2-') ? 'h2' : 'h1',
    },
    description,
    group,
    id,
    ...acceptance,
    title,
  };
}

function unsupportedExecution(
  scenarioId: TrafficScenarioId,
  draft: TrafficRequestDraft,
  startedAt: string,
  startedAtMs: number,
): TrafficScenarioResult {
  const path = 'path' in draft ? draft.path : scenarioId;
  const method = 'method' in draft ? draft.method : draft.kind === 'grpc' ? 'POST' : 'GET';
  return {
    attempt: { method, path, url: path },
    durationMs: elapsed(startedAtMs),
    error: `Traffic transport "${draft.kind}" is not implemented.`,
    protocol: draft.kind === 'grpc' ? 'grpc' : draft.kind === 'websocket' ? 'websocket' : draft.kind === 'tls' ? 'tls' : 'h2',
    request: null,
    scenarioId,
    startedAt,
    state: 'failed',
  };
}

function webSocketScenario(
  id: Extract<TrafficScenarioId, `ws-${string}`>,
  title: string,
  description: string,
  path: string,
  clientMessages: readonly { readonly data: string; readonly encoding: 'base64' | 'utf8' }[],
  serverMessages: readonly { readonly data: string; readonly encoding: 'base64' | 'utf8' }[] = [],
  controls: readonly ('close' | 'ping' | 'pong')[] = [],
): TrafficScenarioDescriptor {
  const acceptance = acceptanceSteps(id, 'WebSocket', description);
  return {
    defaultDraft: {
      clientMessages,
      controls,
      headers: {},
      kind: 'websocket',
      path,
      serverMessages,
    },
    description,
    group: 'WebSocket',
    id,
    ...acceptance,
    title,
  };
}

function grpcScenario(
  id: Extract<TrafficScenarioId, `grpc-${string}`>,
  title: string,
  description: string,
  path: string,
  contentType: string,
  requestMessages: Extract<TrafficRequestDraft, { kind: 'grpc' }>['requestMessages'],
  responseMessages: Extract<TrafficRequestDraft, { kind: 'grpc' }>['responseMessages'],
  responseTrailers: Readonly<Record<string, string>> = { 'grpc-status': '0' },
  framing: Extract<TrafficRequestDraft, { kind: 'grpc' }>['framing'] = 'valid',
): TrafficScenarioDescriptor {
  const acceptance = acceptanceSteps(id, 'gRPC', description);
  return {
    defaultDraft: {
      framing,
      headers: { 'content-type': contentType },
      kind: 'grpc',
      path,
      requestMessages,
      responseMessages,
      responseTrailers,
    },
    description,
    group: 'gRPC',
    id,
    ...acceptance,
    title,
  };
}

function tlsScenario(
  id: Extract<TrafficScenarioId, `tls-${string}`>,
  title: string,
  description: string,
  mode: Extract<TrafficRequestDraft, { kind: 'tls' }>['mode'],
  method: string,
  targetHost: string,
  path: string,
): TrafficScenarioDescriptor {
  const acceptance = acceptanceSteps(id, 'TLS', description);
  return {
    defaultDraft: {
      connectHeaders: {},
      headers: { accept: 'application/json' },
      kind: 'tls',
      method,
      mode,
      path,
      targetHost,
    },
    description,
    group: 'TLS',
    id,
    ...acceptance,
    title,
  };
}

function acceptanceSteps(
  id: TrafficScenarioId,
  group: TrafficScenarioDescriptor['group'],
  description: string,
): Pick<TrafficScenarioDescriptor, 'observations' | 'setup'> {
  if (id === 'tls-passthrough') {
    return {
      setup: [
        'Add localhost to Settings > TLS passthrough before Run.',
        'Open Capture and keep Recording active.',
      ],
      observations: [
        'Capture shows an opaque CONNECT tunnel without decrypted HTTP details.',
        'The TLS handshake completes through the explicit proxy.',
      ],
    };
  }
  if (group === 'TLS') {
    return {
      setup: [
        'Remove localhost from TLS passthrough, then enable HTTPS decryption.',
        'Trust the Playground localhost origin certificate if Capture asks, then rerun.',
      ],
      observations: [
        `${description} is visible as decrypted traffic.`,
        'ALPN, cipher, request and response facts match Response Detail.',
      ],
    };
  }
  if (id === 'h2-error-goaway-client' || id === 'h2-error-goaway-origin') {
    return {
      setup: [
        'Keep Interceptor listening on 127.0.0.1:8888 with Recording active.',
        'Remove localhost from TLS passthrough, enable HTTPS decryption, and allow the self-signed localhost origin in Settings > Certificates.',
        'Keep the default POST Draft and disable Rules and Breakpoints that would change this request.',
      ],
      observations: [
        'Response Detail > Protocol must show GOAWAY sent=true, errorCode=2, receivedBodyBytes=262144, declaredBodyBytes=524288 and originRequestCount=1. A failed HTTP run is expected, not an automatic Pass.',
        'In Capture, select the latest matching POST path or x-playground-run-id. After the fixed 1-second cleanup window, the same H2/200 row keeps 256 KB and its partial response, not 512 KB; the ended duration must not grow.',
        'The partial response contains only "a" bytes. Compare receivedBodySha256 in Protocol with the reference in the Playground README. No POST replay or completed-response claim is allowed.',
        'The recovery event must show a separate GET to the /recovered path, state=complete, HTTP 200, originRequestCount=1 and differentOriginSession=true. Check its separate Capture row, then record Pass / Fail / Blocked manually.',
      ],
    };
  }
  if (group === 'gRPC' || id === 'h2-json') {
    const primaryObservation = id === 'grpc-compressed'
      ? 'Capture identifies the compressed envelope and preserves its compressed flag.'
      : `${description} is visible in the protocol-specific inspector.`;
    return {
      setup: [
        'Enable HTTPS decryption and keep Recording active.',
        'Trust the Playground localhost origin certificate if Capture asks, then rerun.',
      ],
      observations: [
        primaryObservation,
        'HTTP/2 pseudo-headers, response trailers and ALPN remain visible.',
      ],
    };
  }
  if (group === 'WebSocket') {
    return {
      setup: [
        'Open Capture and keep Recording active.',
        'Keep WebSocket breakpoints disabled unless the breakpoint flow is under test.',
      ],
      observations: [
        `${description} appears in the Messages inspector.`,
        'Direction, opcode, payload encoding and close lifecycle remain visible.',
      ],
    };
  }
  return {
    setup: [
      'Open Capture and keep Recording active.',
      'Keep Interceptor listening on 127.0.0.1:8888.',
    ],
    observations: [
      `${description} is visible in Capture.`,
      'Origin request and client response match the Request Draft.',
    ],
  };
}