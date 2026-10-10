export type TrafficScenarioGroup = 'HTTP' | 'Bodies' | 'Encoding' | 'WebSocket' | 'gRPC' | 'TLS';

export type TrafficScenarioId =
  | 'h1-json'
  | 'h1-upload'
  | 'h1-stream'
  | 'h1-early-response'
  | 'h1-abort'
  | 'h2-json'
  | 'h2-error-goaway-client'
  | 'h2-error-goaway-origin'
  | 'body-json'
  | 'body-text'
  | 'body-html'
  | 'body-css'
  | 'body-javascript'
  | 'body-xml'
  | 'body-yaml'
  | 'body-svg'
  | 'body-markdown'
  | 'body-form'
  | 'body-png'
  | 'body-binary'
  | 'body-audio'
  | 'body-video'
  | 'body-unknown-text'
  | 'body-unknown-binary'
  | 'encoding-gzip'
  | 'encoding-deflate'
  | 'encoding-br'
  | 'encoding-corrupt-gzip'
  | 'encoding-invalid-image'
  | 'ws-text'
  | 'ws-binary'
  | 'ws-bidirectional'
  | 'ws-control'
  | 'grpc-unary-proto'
  | 'grpc-unary-json'
  | 'grpc-trailers-error'
  | 'grpc-compressed'
  | 'grpc-malformed'
  | 'tls-passthrough'
  | 'tls-mitm-h1'
  | 'tls-mitm-h2';

export interface HttpTrafficRequestDraft {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'http';
  readonly method: string;
  readonly path: string;
  readonly protocol: 'h1' | 'h2';
}

export interface TrafficMessageDraft {
  readonly data: string;
  readonly encoding: 'base64' | 'utf8';
}

export interface WebSocketTrafficRequestDraft {
  readonly clientMessages: readonly TrafficMessageDraft[];
  readonly controls: readonly ('close' | 'ping' | 'pong')[];
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'websocket';
  readonly path: string;
  readonly serverMessages: readonly TrafficMessageDraft[];
}

export interface GrpcMessageDraft extends TrafficMessageDraft {
  readonly compressed: boolean;
}

export interface GrpcTrafficRequestDraft {
  readonly framing: 'truncated' | 'valid';
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'grpc';
  readonly path: string;
  readonly requestMessages: readonly GrpcMessageDraft[];
  readonly responseMessages: readonly GrpcMessageDraft[];
  readonly responseTrailers: Readonly<Record<string, string>>;
}

export interface TlsTrafficRequestDraft {
  readonly connectHeaders: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly kind: 'tls';
  readonly method: string;
  readonly mode: 'https-h1' | 'https-h2' | 'tunnel-only';
  readonly path: string;
  readonly targetHost: string;
}

export type TrafficRequestDraft =
  | GrpcTrafficRequestDraft
  | HttpTrafficRequestDraft
  | TlsTrafficRequestDraft
  | WebSocketTrafficRequestDraft;

export interface TrafficScenarioDescriptor {
  readonly defaultDraft: TrafficRequestDraft;
  readonly description: string;
  readonly group: TrafficScenarioGroup;
  readonly id: TrafficScenarioId;
  readonly observations: readonly string[];
  readonly setup: readonly string[];
  readonly title: string;
}

export interface TrafficRequestFact {
  readonly body: string;
  readonly bodyBytes: number;
  readonly bodyEncoding?: 'base64' | 'utf8';
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
  readonly path: string;
  readonly url: string;
}

export interface TrafficResponseFact {
  readonly body: string;
  readonly bodyBytes: number;
  readonly bodyEncoding: 'base64' | 'utf8';
  readonly chunkTimingsMs: readonly number[];
  readonly headers: Readonly<Record<string, string>>;
  readonly statusCode: number;
  readonly trailers?: Readonly<Record<string, string>>;
}

export type TrafficProtocolEvent = {
  readonly data?: string;
  readonly direction?: 'client-to-server' | 'server-to-client';
  readonly encoding?: 'base64' | 'utf8';
  readonly type: 'binary' | 'close' | 'message' | 'open' | 'ping' | 'pong';
} | {
  readonly type: 'goaway';
  readonly direction: 'client-to-server' | 'server-to-client';
  readonly sent: boolean;
  readonly errorCode: number | null;
  readonly declaredBodyBytes: number | null;
  readonly receivedBodyBytes: number;
  readonly receivedBodySha256: string;
  readonly clientEnded: boolean;
  readonly streamResetCode: number | null;
  readonly originRequestCount: number;
  readonly clientErrors: readonly string[];
  readonly originErrors: readonly string[];
  readonly error?: string;
} | {
  readonly type: 'recovery';
  readonly direction: 'client-to-server';
  readonly state: 'complete' | 'failed';
  readonly attempt: TrafficScenarioResult['attempt'];
  readonly request: TrafficRequestFact | null;
  readonly response?: TrafficResponseFact;
  readonly originRequestCount: number;
  readonly differentOriginSession: boolean;
  readonly error?: string;
};

export interface TrafficTlsFact {
  readonly alpn: 'h2' | 'http/1.1' | 'tls';
  readonly cipher: string;
  readonly serverName: string;
}

export interface TrafficScenarioResult {
  readonly attempt: {
    readonly method: string;
    readonly path: string;
    readonly url: string;
  };
  readonly durationMs: number;
  readonly error?: string;
  readonly events?: readonly TrafficProtocolEvent[];
  readonly protocol: 'grpc' | 'h2' | 'http/1.1' | 'tls' | 'websocket';
  readonly request: TrafficRequestFact | null;
  readonly response?: TrafficResponseFact;
  readonly scenarioId: TrafficScenarioId;
  readonly startedAt: string;
  readonly state: 'complete' | 'failed';
  readonly tls?: TrafficTlsFact;
}