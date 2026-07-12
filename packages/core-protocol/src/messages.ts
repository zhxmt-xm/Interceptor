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

export type CoreCommand =
  | EchoCommand
  | SessionsQueryCommand
  | BodyReadRangeCommand
  | RulesValidateCommand
  | RulesReplaceCommand
  | BreakpointResolveCommand
  | DiagnosticsRecentCommand;

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
    itemIds: string[];
    nextCursor?: string;
    hasMore: boolean;
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

export type CoreResult =
  | EchoResult
  | SessionsPageResult
  | BodyRangeResult
  | RuleValidationResult
  | RuleRevisionResult
  | BreakpointResolutionResult
  | DiagnosticsRecordsResult;

export type CoreResultForCommand<T extends CoreCommand> =
  T extends EchoCommand ? EchoResult
    : T extends SessionsQueryCommand ? SessionsPageResult
      : T extends BodyReadRangeCommand ? BodyRangeResult
        : T extends RulesValidateCommand ? RuleValidationResult
          : T extends RulesReplaceCommand ? RuleRevisionResult
            : T extends BreakpointResolveCommand
              ? BreakpointResolutionResult
              : T extends DiagnosticsRecentCommand
                ? DiagnosticsRecordsResult
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

export type MainToCoreMessage =
  | CoreRequest
  | CoreCancel;
export type CoreToMainMessage =
  | CoreSuccessResponse
  | CoreErrorResponse;