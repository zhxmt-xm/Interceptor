import type { CompletedRequest } from 'mockttp';
import type WebSocket from 'ws';

import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';

import type { RuleHitRecord } from '../../rules/interfaces';
import type { BodyWriter } from '../../capture/internal/body-writer';
import type {
  CaptureSessionInput,
  ExchangeInput,
  ExchangePatch,
  HeaderInput,
  WebSocketFrameInput,
} from '../../capture/interfaces';

export interface CaptureEvent {
  readonly sequence: number;
  readonly kind: CaptureExchangeEventKind;
  readonly summary: CaptureExchangeSummary;
}

export interface PendingCaptureEvent {
  sequence: number;
  kind: CaptureExchangeEventKind;
  summary: CaptureExchangeSummary;
}

export type BodyDecodeOutcome = 'ok' | 'limited' | 'skipped' | 'failed';

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

/** Mockttp `ProxySetting` 中 Bridge 用得到的那部分。 */
export interface UpstreamProxySetting {
  readonly proxyUrl: string;
  readonly noProxy?: readonly string[];
}

export interface WebSocketBridgeOptions {
  readonly intercept: (
    message: WebSocketBridgeMessage,
  ) => Promise<WebSocketBridgeDecision>;
  readonly ignoreCertificateErrors: (hostname: string) => boolean;
  /**
   * 当前上游代理；undefined 表示直连。
   * Bridge 不走 `forAnyRequest().thenPassThrough()`，拿不到规则上的 `proxyConfig`，
   * 不单独注入就会让所有 WebSocket 绕过上游直连源站。
   */
  readonly upstreamProxy?: () => UpstreamProxySetting | undefined;
  readonly onError?: (error: Error) => void;
  /**
   * 上游 Upgrade 失败时回调（streamId 即 request.id）。
   * Mockttp 对这条路径只发 completed `response`，Capture 为避免全量缓冲已退订，
   * 不显式回调就会让 Exchange 永远停在 `pending`。
   */
  readonly onUpgradeFailed?: (streamId: string, error: Error) => void;
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

/** 请求侧生命周期阶段。 */
export type RequestPhase = 'headers' | 'body' | 'complete' | 'aborted';

/** 响应侧生命周期阶段；请求与响应独立推进以支持早期响应。 */
export type ResponsePhase =
  | 'none'
  | 'headers'
  | 'body'
  | 'complete'
  | 'aborted';

/** 单条进行中 Exchange 的聚合状态；由 ExchangeTracker 独占维护。 */
export interface TrackedExchange {
  /** 分配的 Exchange id。 */
  readonly exchangeId: string;
  /** 创建时固定的 capture generation；Clear 后旧代际事件全部丢弃。 */
  readonly generation: number;
  /** 客户端请求开始时间。 */
  readonly startedAt: number;
  /** 是否 HTTPS/WSS。 */
  readonly secure: boolean;
  /** 归一化后的请求元数据。 */
  readonly method: string;
  readonly host?: string;
  readonly path?: string;
  readonly protocol: string;
  /** 请求侧阶段。 */
  requestPhase: RequestPhase;
  /** 响应侧阶段。 */
  responsePhase: ResponsePhase;
  /** 是否已进入终态，终态不可回退。 */
  terminal: boolean;
  /** 请求正文增量写入器；无正文时为 null。 */
  requestWriter: BodyWriter | null;
  /** 响应正文增量写入器。 */
  responseWriter: BodyWriter | null;
  /** 已观察到的请求/响应字节数。 */
  requestBytes: number;
  responseBytes: number;
  /** 请求正文的 content-type；无正文时为 undefined。 */
  requestMime?: string;
  /** 请求正文的 content-encoding；未压缩时为 undefined。 */
  requestEncoding?: string;
  /** 最终响应状态。 */
  statusCode?: number;
  responseMime?: string;
  /** 响应正文的 content-encoding；未压缩时为 undefined。 */
  responseEncoding?: string;
  /** 命中的规则 id，按首次出现顺序去重。 */
  readonly ruleIds: Set<string>;
  /** 发起该请求的本机应用 id；远程客户端或解析失败时为 undefined。 */
  appId?: string;
  /** 发起该请求的本机应用展示名。 */
  appName?: string;
  /** 应用归属正在异步反查；解析结束（无论成败）后置为 false。 */
  appPending?: boolean;
  /** 串行化该 Exchange 的所有存储写入，保证顺序与幂等。 */
  tail: Promise<void>;
}

/** request-initiated 之前到达的规则结果，等 Exchange 建立后合并。 */
export interface OrphanRuleOutcome {
  hits: RuleHitRecord[];
  headers: HeaderInput[];
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

/** headers 阶段规则判定所需的最小请求字段。 */
export interface RuleRequestInput {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
}

/** headers 阶段规则判定所需的最小响应字段。 */
export interface RuleResponseInput {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
}

/** 已持久化的原始 CONNECT 隧道，用于 close 事件更新同一条 Exchange。 */
export interface PendingTunnelCapture {
  readonly exchangeId: string;
  readonly startedAt: number;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly protocol: string;
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
  /** 是否正在记录新流量；监听器暂停时为 false，但 listening 仍可为 true。 */
  readonly recording: boolean;
  readonly host: string | null;
  readonly port: number | null;
  readonly sessionId: string | null;
  readonly capturedExchanges: number;
}

export interface ProxyTlsConfig {
  readonly ca: { readonly key: string; readonly cert: string } | null;
  readonly insecureHosts: readonly string[];
  readonly passthroughHosts: readonly string[];
}

export interface ProxyTarget {
  readonly scheme: string;
  readonly hostname: string;
  readonly port: number;
  readonly path: string;
}