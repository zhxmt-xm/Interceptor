import { buildInterceptorToolRegistry, type InterceptorToolDefinition } from '@interceptor/tools';

export const PLAYGROUND_TOOLS = buildInterceptorToolRegistry();

interface PlaygroundHttpDraft {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'http';
  readonly method: string;
  readonly path: string;
  readonly protocol: 'h1' | 'h2';
}

interface PlaygroundMessageDraft {
  readonly data: string;
  readonly encoding: 'base64' | 'utf8';
}

interface PlaygroundWebSocketDraft {
  readonly clientMessages: readonly PlaygroundMessageDraft[];
  readonly controls: readonly ('close' | 'ping' | 'pong')[];
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'websocket';
  readonly path: string;
  readonly serverMessages: readonly PlaygroundMessageDraft[];
}

interface PlaygroundGrpcDraft {
  readonly framing: 'truncated' | 'valid';
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'grpc';
  readonly path: string;
  readonly requestMessages: readonly (PlaygroundMessageDraft & { readonly compressed: boolean })[];
  readonly responseMessages: readonly (PlaygroundMessageDraft & { readonly compressed: boolean })[];
  readonly responseTrailers: Readonly<Record<string, string>>;
}

interface PlaygroundTlsDraft {
  readonly connectHeaders: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'tls';
  readonly method: string;
  readonly mode: 'https-h1' | 'https-h2' | 'tunnel-only';
  readonly path: string;
  readonly targetHost: string;
}

export type PlaygroundRequestDraft = PlaygroundGrpcDraft | PlaygroundHttpDraft | PlaygroundTlsDraft | PlaygroundWebSocketDraft;

export interface PlaygroundTrafficScenario {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly draft: PlaygroundRequestDraft;
  readonly observations: readonly string[];
  readonly setup: readonly string[];
}

interface PlaygroundTrafficGroup {
  readonly id: string;
  readonly title: string;
  readonly scenarios: readonly PlaygroundTrafficScenario[];
}

function trafficScenario(
  id: string,
  title: string,
  detail: string,
  method: string,
  path: string,
  body = '',
): PlaygroundTrafficScenario {
  const acceptance = acceptanceSteps(id, 'HTTP', detail);
  return {
    id,
    title,
    detail,
    draft: {
      body,
      headers: method === 'GET'
        ? { accept: 'application/json' }
        : { 'content-type': 'application/json' },
      kind: 'http',
      method,
      path,
      protocol: id === 'h2-json' ? 'h2' : 'h1',
    },
    ...acceptance,
  };
}

function webSocketScenario(
  id: string,
  title: string,
  detail: string,
  clientMessages: readonly PlaygroundMessageDraft[],
  serverMessages: readonly PlaygroundMessageDraft[] = [],
  controls: readonly ('close' | 'ping' | 'pong')[] = [],
): PlaygroundTrafficScenario {
  const acceptance = acceptanceSteps(id, 'WebSocket', detail);
  return {
    id,
    title,
    detail,
    draft: {
      clientMessages,
      controls,
      headers: {},
      kind: 'websocket',
      path: `/playground/${id}`,
      serverMessages,
    },
    ...acceptance,
  };
}

function grpcScenario(
  id: string,
  title: string,
  detail: string,
  path: string,
  contentType: string,
  requestMessages: PlaygroundGrpcDraft['requestMessages'],
  responseMessages: PlaygroundGrpcDraft['responseMessages'],
  responseTrailers: Readonly<Record<string, string>> = { 'grpc-status': '0' },
  framing: PlaygroundGrpcDraft['framing'] = 'valid',
): PlaygroundTrafficScenario {
  const acceptance = acceptanceSteps(id, 'gRPC', detail);
  return {
    id,
    title,
    detail,
    draft: {
      framing,
      headers: { 'content-type': contentType },
      kind: 'grpc',
      path,
      requestMessages,
      responseMessages,
      responseTrailers,
    },
    ...acceptance,
  };
}

function tlsScenario(
  id: string,
  title: string,
  detail: string,
  mode: PlaygroundTlsDraft['mode'],
  method: string,
  path: string,
): PlaygroundTrafficScenario {
  const acceptance = acceptanceSteps(id, 'TLS', detail);
  return {
    id,
    title,
    detail,
    draft: {
      connectHeaders: {},
      headers: { accept: 'application/json' },
      kind: 'tls',
      method,
      mode,
      path,
      targetHost: 'localhost',
    },
    ...acceptance,
  };
}

function acceptanceSteps(
  id: string,
  group: 'HTTP' | 'TLS' | 'WebSocket' | 'gRPC',
  detail: string,
): Pick<PlaygroundTrafficScenario, 'observations' | 'setup'> {
  if (id === 'tls-passthrough') {
    return {
      setup: ['Add localhost to Settings > TLS passthrough before Run.', 'Open Capture and keep Recording active.'],
      observations: ['Capture shows an opaque CONNECT tunnel without decrypted HTTP details.', 'The TLS handshake completes through the explicit proxy.'],
    };
  }
  if (group === 'TLS') {
    return {
      setup: ['Remove localhost from TLS passthrough, then enable HTTPS decryption.', 'Trust the Playground localhost origin certificate if Capture asks, then rerun.'],
      observations: [`${detail} is visible as decrypted traffic.`, 'ALPN, cipher, request and response facts match Response Detail.'],
    };
  }
  if (group === 'gRPC' || id === 'h2-json') {
    return {
      setup: ['Enable HTTPS decryption and keep Recording active.', 'Trust the Playground localhost origin certificate if Capture asks, then rerun.'],
      observations: [id === 'grpc-compressed' ? 'Capture identifies the compressed envelope and preserves its compressed flag.' : `${detail} is visible in the protocol-specific inspector.`, 'HTTP/2 pseudo-headers, response trailers and ALPN remain visible.'],
    };
  }
  if (group === 'WebSocket') {
    return {
      setup: ['Open Capture and keep Recording active.', 'Keep WebSocket breakpoints disabled unless the breakpoint flow is under test.'],
      observations: [`${detail} appears in the Messages inspector.`, 'Direction, opcode, payload encoding and close lifecycle remain visible.'],
    };
  }
  return {
    setup: ['Open Capture and keep Recording active.', 'Keep Interceptor listening on 127.0.0.1:8888.'],
    observations: [`${detail} is visible in Capture.`, 'Origin request and client response match the Request Draft.'],
  };
}

export const PLAYGROUND_TRAFFIC_GROUPS: readonly PlaygroundTrafficGroup[] = [
  {
    id: 'http',
    title: 'HTTP',
    scenarios: [
      trafficScenario('h1-json', 'H1 JSON', 'Structured request and response', 'GET', '/playground/h1-json'),
      trafficScenario('h1-upload', 'H1 upload', 'Chunked upload with origin counters', 'POST', '/playground/h1-upload', '{\n  "items": [1, 2, 3]\n}'),
      trafficScenario('h1-stream', 'H1 streaming', 'Timed chunks and first-byte timing', 'GET', '/playground/h1-stream'),
      trafficScenario('h1-early-response', 'H1 early response', 'Response before request completion', 'POST', '/playground/h1-early-response'),
      trafficScenario('h1-abort', 'H1 abort', 'Client abort and origin reset', 'GET', '/playground/h1-abort'),
      trafficScenario('h2-json', 'H2 JSON', 'HTTP/2 stream and pseudo-headers', 'GET', '/playground/h2-json'),
    ],
  },
  {
    id: 'bodies',
    title: 'Bodies',
    scenarios: [
      trafficScenario('body-json', 'JSON', 'Tree, raw and hex views', 'POST', '/playground/body/json', '{\n  "ready": true\n}'),
      trafficScenario('body-text', 'Plain text', 'UTF-8 text response', 'POST', '/playground/body/text', 'Interceptor body lab'),
      trafficScenario('body-html', 'HTML', 'Markup syntax and preview', 'GET', '/playground/body/html'),
      trafficScenario('body-css', 'CSS', 'Stylesheet syntax', 'GET', '/playground/body/css'),
      trafficScenario('body-javascript', 'JavaScript', 'Script syntax', 'GET', '/playground/body/javascript'),
      trafficScenario('body-xml', 'XML', 'XML syntax and formatting', 'GET', '/playground/body/xml'),
      trafficScenario('body-yaml', 'YAML', 'YAML syntax and formatting', 'GET', '/playground/body/yaml'),
      trafficScenario('body-svg', 'SVG', 'Vector image preview', 'GET', '/playground/body/svg'),
      trafficScenario('body-markdown', 'Markdown', 'Source, preview and split modes', 'GET', '/playground/body/markdown'),
      trafficScenario('body-form', 'Form URL encoded', 'Decoded form fields', 'POST', '/playground/body/form', 'name=Interceptor&ready=true'),
      trafficScenario('body-png', 'PNG', 'Raster image preview', 'GET', '/playground/body/png'),
      trafficScenario('body-binary', 'Binary', 'Hex and download actions', 'GET', '/playground/body/binary'),
      trafficScenario('body-audio', 'Audio', 'Inline media controls', 'GET', '/playground/body/audio'),
      trafficScenario('body-video', 'Video', 'Inline media controls', 'GET', '/playground/body/video'),
      trafficScenario('body-unknown-text', 'Unknown text', 'Text sniffing without MIME', 'GET', '/playground/body/unknown-text'),
      trafficScenario('body-unknown-binary', 'Unknown binary', 'Binary fallback without MIME', 'GET', '/playground/body/unknown-binary'),
    ],
  },
  {
    id: 'encoding',
    title: 'Encoding',
    scenarios: [
      trafficScenario('encoding-gzip', 'gzip', 'Decoded compressed response', 'GET', '/playground/encoding/gzip'),
      trafficScenario('encoding-deflate', 'deflate', 'Decoded compressed response', 'GET', '/playground/encoding/deflate'),
      trafficScenario('encoding-br', 'brotli', 'Decoded compressed response', 'GET', '/playground/encoding/br'),
      trafficScenario('encoding-corrupt-gzip', 'Corrupt gzip', 'Decode failure evidence', 'GET', '/playground/encoding/corrupt-gzip'),
      trafficScenario('encoding-invalid-image', 'Invalid image', 'Unavailable image evidence', 'GET', '/playground/encoding/invalid-image'),
    ],
  },
  {
    id: 'websocket',
    title: 'WebSocket',
    scenarios: [
      webSocketScenario('ws-text', 'Text echo', 'Client and server text messages', [{ data: 'client text', encoding: 'utf8' }]),
      webSocketScenario('ws-binary', 'Binary echo', 'Client and server binary messages', [{ data: 'AAECA/8=', encoding: 'base64' }]),
      webSocketScenario('ws-bidirectional', 'Bidirectional', 'Interleaved messages in both directions', [{ data: 'client message', encoding: 'utf8' }], [{ data: 'origin message', encoding: 'utf8' }]),
      webSocketScenario('ws-control', 'Control frames', 'Ping, pong and close frames', [], [], ['ping', 'pong', 'close']),
    ],
  },
  {
    id: 'grpc',
    title: 'gRPC',
    scenarios: [
      grpcScenario('grpc-unary-proto', 'Unary proto', 'Binary protobuf envelopes', '/playground.Capture/UnaryProto', 'application/grpc+proto', [{ compressed: false, data: 'cHJvdG8tcmVxdWVzdA==', encoding: 'base64' }], [{ compressed: false, data: 'cHJvdG8tcmVzcG9uc2U=', encoding: 'base64' }]),
      grpcScenario('grpc-unary-json', 'Unary JSON', 'JSON transcoding payload', '/playground.Capture/UnaryJson', 'application/grpc+json', [{ compressed: false, data: '{"message":"hello"}', encoding: 'utf8' }], [{ compressed: false, data: '{"message":"world"}', encoding: 'utf8' }]),
      grpcScenario('grpc-trailers-error', 'Trailers error', 'Non-zero grpc-status', '/playground.Capture/TrailersError', 'application/grpc+proto', [{ compressed: false, data: 'cmVxdWVzdA==', encoding: 'base64' }], [], { 'grpc-message': 'Playground failure', 'grpc-status': '13' }),
      grpcScenario('grpc-compressed', 'Compressed envelope', 'Compressed message flag', '/playground.Capture/Compressed', 'application/grpc+proto', [{ compressed: true, data: 'Y29tcHJlc3NlZCByZXF1ZXN0', encoding: 'base64' }], [{ compressed: true, data: 'Y29tcHJlc3NlZCByZXNwb25zZQ==', encoding: 'base64' }]),
      grpcScenario('grpc-malformed', 'Malformed envelope', 'Truncated frame evidence', '/playground.Capture/Malformed', 'application/grpc+proto', [{ compressed: false, data: 'cmVxdWVzdA==', encoding: 'base64' }], [{ compressed: false, data: 'dHJ1bmNhdGVk', encoding: 'base64' }], { 'grpc-status': '0' }, 'truncated'),
    ],
  },
  {
    id: 'tls',
    title: 'TLS',
    scenarios: [
      tlsScenario('tls-passthrough', 'Passthrough tunnel', 'Opaque CONNECT tunnel', 'tunnel-only', 'CONNECT', '/'),
      tlsScenario('tls-mitm-h1', 'MITM H1', 'Decrypted HTTPS over HTTP/1.1', 'https-h1', 'GET', '/playground/tls/h1'),
      tlsScenario('tls-mitm-h2', 'MITM H2', 'Decrypted HTTPS over HTTP/2', 'https-h2', 'GET', '/playground/tls/h2'),
    ],
  },
];

export const PLAYGROUND_TRAFFIC_SCENARIOS = PLAYGROUND_TRAFFIC_GROUPS.flatMap((group) => group.scenarios);

export function playgroundTrafficScenario(id: string): PlaygroundTrafficScenario {
  const scenario = PLAYGROUND_TRAFFIC_SCENARIOS.find((item) => item.id === id) ?? PLAYGROUND_TRAFFIC_SCENARIOS[0];
  if (scenario === undefined) throw new Error('Playground Traffic catalog is empty.');
  return scenario;
}

export function playgroundTool(name: string): InterceptorToolDefinition {
  const tool = PLAYGROUND_TOOLS.find((item) => item.name === name) ?? PLAYGROUND_TOOLS[0];
  if (tool === undefined) throw new Error('Playground Tool registry is empty.');
  return tool;
}

export function playgroundSchema(name: string): string {
  return JSON.stringify(playgroundTool(name).inputSchema, null, 2);
}