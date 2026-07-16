import type { CompletedRequest } from 'mockttp';
import type WebSocket from 'ws';

import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';

import type { RuleHitRecord } from '../../rules/interfaces';
import type {
  CaptureSessionInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';

export interface CaptureEvent {
  readonly sequence: number;
  readonly kind: CaptureExchangeEventKind;
  readonly summary: CaptureExchangeSummary;
}

export interface PendingCaptureEvent {
  sequence: number;
  kind: CaptureExchangeEventKind;
  summary: CaptureExchangeSummary;
  terminal: boolean;
}

export type BodyDecodeOutcome = 'ok' | 'skipped' | 'failed';

export interface DecodeResult {
  readonly status: BodyDecodeOutcome;
  readonly data: Uint8Array;
}

export type WebSocketMessageDirection =
  | 'client-to-server'
  | 'server-to-client';

export interface WebSocketBridgeMessage {
  readonly streamId: string;
  readonly url: string;
  readonly direction: WebSocketMessageDirection;
  readonly content: Buffer;
  readonly isBinary: boolean;
}

export type WebSocketBridgeDecision =
  | {
      readonly action: 'forward';
      readonly content: Uint8Array;
      readonly isBinary: boolean;
    }
  | { readonly action: 'drop' };

export interface WebSocketBridgeOptions {
  readonly intercept: (
    message: WebSocketBridgeMessage,
  ) => Promise<WebSocketBridgeDecision>;
  readonly ignoreCertificateErrors: (hostname: string) => boolean;
  readonly onError?: (error: Error) => void;
}

export interface WebSocketPair {
  readonly downstream: WebSocket;
  readonly upstream: WebSocket;
}

export interface PendingWebSocketCapture {
  readonly request: CompletedRequest;
  readonly exchangeReady: Promise<string | null>;
  resolveExchange(exchangeId: string | null): void;
  writeTail: Promise<void>;
}

export interface ProxyResponseMessageResult {
  statusCode?: number;
  headers?: Record<string, string | string[]>;
  body?: string | Uint8Array;
}

export type ProxyResponseResult =
  | ProxyResponseMessageResult
  | 'close'
  | 'reset';

export interface ProxyRequestResult {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  body?: string | Uint8Array;
  response?: ProxyResponseResult;
}

export interface ProxyPassThroughResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface CaptureSink {
  ensureSession(session: CaptureSessionInput): Promise<void>;
  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]>;
  updateExchange(patch: {
    readonly id: string;
    readonly completedAt?: number;
    readonly state: ExchangeInput['state'];
  }): Promise<void>;
  writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }>;
  appendRuleHits(
    exchangeId: string,
    hits: readonly RuleHitRecord[],
  ): Promise<void>;
  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void>;
}

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

export interface ProxyTlsConfig {
  readonly ca: { readonly key: string; readonly cert: string } | null;
  readonly insecureHosts: readonly string[];
}

export interface ProxyTarget {
  readonly scheme: string;
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
}