export const CORE_PROTOCOL_VERSION = 1 as const;
export const MAX_BODY_CHUNK_BYTES = 1024 * 1024;
export const MAX_DIAGNOSTIC_RECORDS = 200;
export const MAX_QUERY_PAGE_SIZE = 500;

export interface EchoCommand {
  type: 'echo';
  payload: {
    value: string;
  };
}

export interface SessionsQueryCommand {
  type: 'sessions.query';
  payload: {
    cursor?: string;
    limit: number;
    sort: 'started_desc' | 'started_asc';
    filter: {
      host?: string;
      method?: string;
      status?: number;
      mime?: string;
      process?: string;
      search?: string;
    };
  };
}

export interface BodyReadRangeCommand {
  type: 'body.read-range';
  payload: {
    bodyId: string;
    offset: number;
    length: number;
  };
}

export interface SessionsDetailCommand {
  type: 'sessions.detail';
  payload: {
    exchangeId: string;
  };
}

export interface RulesValidateCommand {
  type: 'rules.validate';
  payload: {
    draftId: string;
    revision: number;
    ruleCount: number;
  };
}

export interface RulesReplaceCommand {
  type: 'rules.replace';
  payload: {
    draftId: string;
    expectedRevision: number;
    revision: number;
  };
}

export interface BreakpointResolveCommand {
  type: 'breakpoint.resolve';
  payload: {
    breakpointId: string;
    action: 'continue' | 'drop' | 'timeout';
  };
}

export interface DiagnosticsRecentCommand {
  type: 'diagnostics.recent';
  payload: {
    limit: number;
    traceId?: string;
  };
}

export interface DiagnosticsQueryCommand {
  type: 'diagnostics.query';
  payload: {
    cursor?: string;
    limit: number;
    level?: DiagnosticLevel;
    traceId?: string;
  };
}

export interface StorageStatusCommand {
  type: 'storage.status';
  payload: Record<string, never>;
}

export interface StorageCleanupCommand {
  type: 'storage.cleanup';
  payload: {
    scope: 'all' | 'session';
    sessionId?: string;
  };
}

export interface ProxyStartCommand {
  type: 'proxy.start';
  payload: {
    port?: number;
  };
}

export interface ProxyStopCommand {
  type: 'proxy.stop';
  payload: Record<string, never>;
}

export interface ProxyStatusCommand {
  type: 'proxy.status';
  payload: Record<string, never>;
}

/**
 * 由 Main 内部下发的 TLS 配置（非 Renderer 发起）：下发解密后的 CA 材料
 * 供 Core 做 HTTPS MITM，以及 per-host 不安全例外。ca 为 null 时关闭 MITM。
 * 私钥只在 Main↔Core 内部通道流转，绝不经 Renderer。
 */
export interface TlsConfigureCommand {
  type: 'tls.configure';
  payload: {
    ca: { key: string; cert: string } | null;
    insecureHosts: string[];
  };
}

export type CoreCommand =
  | EchoCommand
  | SessionsQueryCommand
  | SessionsDetailCommand
  | BodyReadRangeCommand
  | RulesValidateCommand
  | RulesReplaceCommand
  | BreakpointResolveCommand
  | DiagnosticsRecentCommand
  | DiagnosticsQueryCommand
  | StorageStatusCommand
  | StorageCleanupCommand
  | ProxyStartCommand
  | ProxyStopCommand
  | ProxyStatusCommand
  | TlsConfigureCommand;

export interface EchoResult {
  type: 'echo';
  payload: {
    value: string;
    handledAt: string;
  };
}

export interface SessionsPageResult {
  type: 'sessions.page';
  payload: {
    items: CaptureExchangeSummary[];
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface SessionsDetailResult {
  type: 'sessions.detail';
  payload: {
    detail: CaptureExchangeDetail | null;
  };
}

export interface BodyRangeResult {
  type: 'body.range';
  payload: {
    bodyId: string;
    offset: number;
    data: Uint8Array;
    end: boolean;
  };
}

export interface RuleValidationResult {
  type: 'rules.validation';
  payload: {
    draftId: string;
    valid: boolean;
    diagnostics: ProtocolDiagnostic[];
  };
}

export interface RuleRevisionResult {
  type: 'rules.revision';
  payload: {
    revision: number;
  };
}

export interface BreakpointResolutionResult {
  type: 'breakpoint.resolution';
  payload: {
    breakpointId: string;
    state: 'continued' | 'dropped' | 'timed_out';
  };
}

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticOutcome =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'timed_out';
export type DiagnosticAttribute = string | number | boolean;

export interface DiagnosticLogRecord {
  timestamp: string;
  sequence: number;
  level: DiagnosticLevel;
  process: 'proxy-core';
  traceId?: string;
  requestId?: string;
  command?: CoreCommand['type'];
  phase: string;
  action?: string;
  durationMs?: number;
  outcome?: DiagnosticOutcome;
  errorCode?: string;
  attributes?: Record<string, DiagnosticAttribute>;
}

export interface DiagnosticsRecordsResult {
  type: 'diagnostics.records';
  payload: {
    records: DiagnosticLogRecord[];
    droppedCount: number;
  };
}

export interface DiagnosticsPageResult {
  type: 'diagnostics.page';
  payload: {
    records: DiagnosticLogRecord[];
    nextCursor?: string;
    hasMore: boolean;
    droppedCount: number;
  };
}

export interface StorageStatusResult {
  type: 'storage.status';
  payload: {
    sessionCount: number;
    exchangeCount: number;
    bodyCount: number;
    databaseBytes: number;
    blobBytes: number;
    totalBytes: number;
    quotaBytes: number;
  };
}

export interface ProxyStatusResult {
  type: 'proxy.status';
  payload: {
    listening: boolean;
    host: string | null;
    port: number | null;
    sessionId: string | null;
    capturedExchanges: number;
  };
}

export interface TlsConfiguredResult {
  type: 'tls.configured';
  payload: {
    mitmEnabled: boolean;
  };
}

export type CoreResult =
  | EchoResult
  | SessionsPageResult
  | SessionsDetailResult
  | BodyRangeResult
  | RuleValidationResult
  | RuleRevisionResult
  | BreakpointResolutionResult
  | DiagnosticsRecordsResult
  | DiagnosticsPageResult
  | StorageStatusResult
  | ProxyStatusResult
  | TlsConfiguredResult;

export type CoreResultForCommand<T extends CoreCommand> =
  T extends EchoCommand ? EchoResult
    : T extends SessionsQueryCommand ? SessionsPageResult
      : T extends SessionsDetailCommand ? SessionsDetailResult
        : T extends BodyReadRangeCommand ? BodyRangeResult
          : T extends RulesValidateCommand ? RuleValidationResult
            : T extends RulesReplaceCommand ? RuleRevisionResult
              : T extends BreakpointResolveCommand
                ? BreakpointResolutionResult
                : T extends DiagnosticsRecentCommand
                  ? DiagnosticsRecordsResult
                  : T extends DiagnosticsQueryCommand
                    ? DiagnosticsPageResult
                    : T extends StorageStatusCommand
                      ? StorageStatusResult
                      : T extends StorageCleanupCommand
                        ? StorageStatusResult
                        : T extends ProxyStartCommand
                          ? ProxyStatusResult
                          : T extends ProxyStopCommand
                            ? ProxyStatusResult
                            : T extends ProxyStatusCommand
                              ? ProxyStatusResult
                              : T extends TlsConfigureCommand
                                ? TlsConfiguredResult
                                : never;

export interface ProtocolDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface CoreError {
  code:
    | 'invalid-message'
    | 'unsupported-command'
    | 'timeout'
    | 'cancelled'
    | 'disconnected'
    | 'conflict'
    | 'internal';
  message: string;
  retryable: boolean;
}

export interface CoreRequest {
  kind: 'request';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  command: CoreCommand;
}

export interface CoreCancel {
  kind: 'cancel';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  reason?: 'caller' | 'timeout' | 'shutdown';
}

export interface CoreSuccessResponse {
  kind: 'response';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  ok: true;
  result: CoreResult;
}

export interface CoreErrorResponse {
  kind: 'response';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  requestId: string;
  traceId: string;
  ok: false;
  error: CoreError;
}

export type CaptureExchangeEventKind = 'exchange-added' | 'exchange-updated';

/**
 * 面向订阅端与会话列表的有限 Exchange 摘要（不含正文、不 hydrate header）。
 * 实时事件与分页查询共用同一类型；Renderer 按 id 去重、按 startedAt 排序。
 */
export interface CaptureExchangeSummary {
  id: string;
  method: string;
  secure: boolean;
  host?: string;
  path?: string;
  protocol: string;
  statusCode?: number;
  responseMime?: string;
  state: string;
  startedAt: number;
  durationMs?: number;
  requestBytes: number;
  responseBytes: number;
}

export interface CaptureExchangeEvent {
  kind: CaptureExchangeEventKind;
  summary: CaptureExchangeSummary;
}

/** 单个 HTTP 头部（名/值）；detail 请求/响应头按 ordinal 顺序返回。 */
export interface CaptureHeader {
  name: string;
  value: string;
}

/** 正文引用元数据；bodyHash 供 body.read-range 分块读取，无正文时省略。 */
export interface CaptureBodyRef {
  bodyHash?: string;
  mediaType?: string;
  encodedSize: number;
  decodedSize?: number;
  truncated: boolean;
  decodeStatus: string;
}

/**
 * 单条 Exchange 的按需详情：在摘要基础上补齐 URL、头部与正文引用。
 * 由 Inspector 选中行时拉取；正文字节仍通过 body.read-range 单独按需读取。
 */
export interface CaptureExchangeDetail {
  summary: CaptureExchangeSummary;
  url: string;
  scheme?: string;
  port?: number;
  statusText?: string;
  requestMime?: string;
  errorCode?: string;
  requestHeaders: CaptureHeader[];
  responseHeaders: CaptureHeader[];
  requestBody?: CaptureBodyRef;
  responseBody?: CaptureBodyRef;
}

export interface CoreEventBatch {
  kind: 'event-batch';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  batchSequence: number;
  events: CaptureExchangeEvent[];
}

export interface CoreEventAck {
  kind: 'event-ack';
  protocolVersion: typeof CORE_PROTOCOL_VERSION;
  batchSequence: number;
}

export type MainToCoreMessage =
  | CoreRequest
  | CoreCancel
  | CoreEventAck;
export type CoreToMainMessage =
  | CoreSuccessResponse
  | CoreErrorResponse
  | CoreEventBatch;

export const MAX_EVENT_BATCH_SIZE = 500;