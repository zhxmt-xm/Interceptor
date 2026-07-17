import type { DiagnosticLogRecord, RuleDefinition } from '@interceptor/core-protocol';
import { MAX_QUERY_PAGE_SIZE, MAX_RULES } from '@interceptor/core-protocol';

import type {
  BreakpointEdit,
  CaptureStatus,
  ComposerRequest,
  CoreDiagnosticRecord,
  DiagnosticsExportFilter,
  DiagnosticsQueryRequest,
  GrpcMessageQuery,
  HarExportRequest,
  RendererDiagnosticReport,
  SessionQueryRequest,
  StorageUsage,
  WebSocketFrameQuery,
} from '../../shared/desktop-api';

export function assertBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): asserts value is string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${name} is invalid`);
  }
}

export function assertIdentifier(
  value: unknown,
  name: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new Error(`${name} is invalid`);
  }
}

export function toRendererDiagnosticRecord(
  record: DiagnosticLogRecord,
): CoreDiagnosticRecord {
  return {
    timestamp: record.timestamp,
    sequence: record.sequence,
    level: record.level,
    process: record.process,
    traceId: record.traceId,
    requestId: record.requestId,
    command: record.command,
    phase: record.phase,
    action: record.action,
    durationMs: record.durationMs,
    outcome: record.outcome,
    errorCode: record.errorCode,
  };
}

/**
 * 把 Core storage.status 结果载荷映射为 Renderer 可见的存储用量 DTO。
 * 字段一一对应，映射层保证 Renderer 不直接依赖 core-protocol 结果结构。
 */
export function toRendererStorageUsage(payload: {
  sessionCount: number;
  exchangeCount: number;
  bodyCount: number;
  databaseBytes: number;
  blobBytes: number;
  totalBytes: number;
  quotaBytes: number;
}): StorageUsage {
  return {
    sessionCount: payload.sessionCount,
    exchangeCount: payload.exchangeCount,
    bodyCount: payload.bodyCount,
    databaseBytes: payload.databaseBytes,
    blobBytes: payload.blobBytes,
    totalBytes: payload.totalBytes,
    quotaBytes: payload.quotaBytes,
  };
}

/**
 * 校验 Renderer 传入的可选代理端口：未指定则由 Core 选默认端口。
 * 端口必须是 1..65535 的整数，否则视为不可信输入拒绝。
 */
export function assertOptionalPort(
  value: unknown,
): asserts value is number | undefined {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65_535
  ) {
    throw new Error('port is invalid');
  }
}

/**
 * 把 Core proxy.status 结果载荷映射为 Renderer 可见的捕获状态 DTO。
 * 映射层保证 Renderer 不直接依赖 core-protocol 结果结构。
 */
export function toRendererCaptureStatus(payload: {
  listening: boolean;
  host: string | null;
  port: number | null;
  sessionId: string | null;
  capturedExchanges: number;
}): CaptureStatus {
  return {
    listening: payload.listening,
    host: payload.host,
    port: payload.port,
    sessionId: payload.sessionId,
    capturedExchanges: payload.capturedExchanges,
  };
}

/**
 * 校验并规范化 Renderer 传入的会话查询请求，返回给 Core sessions.query 的载荷。
 * 只在 Main 边界对不可信输入做结构与范围校验；Core 侧协议校验为第二道防线。
 */
export function toCoreSessionQuery(value: unknown): SessionQueryRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('query is invalid');
  }
  const request = value as Record<string, unknown>;

  const limit = request.limit;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_QUERY_PAGE_SIZE
  ) {
    throw new Error('query.limit is invalid');
  }

  if (request.sort !== 'started_desc' && request.sort !== 'started_asc') {
    throw new Error('query.sort is invalid');
  }

  if (request.cursor !== undefined) {
    assertBoundedString(request.cursor, 'query.cursor', 512);
  }

  return {
    limit,
    sort: request.sort,
    cursor: request.cursor as string | undefined,
    filter: toCoreSessionFilter(request.filter),
  };
}

/** 校验会话查询过滤器；每个字段可选，字符串有界，status 为整数 HTTP 状态码。 */
function toCoreSessionFilter(value: unknown): SessionQueryRequest['filter'] {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('query.filter is invalid');
  }
  const filter = value as Record<string, unknown>;

  const status = filter.status;
  if (
    status !== undefined &&
    (typeof status !== 'number' ||
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599)
  ) {
    throw new Error('query.filter.status is invalid');
  }

  assertOptionalBoundedString(filter.host, 'query.filter.host', 512);
  assertOptionalBoundedString(filter.method, 'query.filter.method', 32);
  assertOptionalBoundedString(filter.mime, 'query.filter.mime', 256);
  assertOptionalBoundedString(filter.process, 'query.filter.process', 512);
  assertOptionalBoundedString(filter.search, 'query.filter.search', 512);
  if (
    filter.protocol !== undefined &&
    filter.protocol !== 'h1' &&
    filter.protocol !== 'h2' &&
    filter.protocol !== 'ws'
  ) {
    throw new Error('query.filter.protocol is invalid');
  }

  return {
    host: filter.host as string | undefined,
    method: filter.method as string | undefined,
    status: status as number | undefined,
    mime: filter.mime as string | undefined,
    process: filter.process as string | undefined,
    search: filter.search as string | undefined,
    protocol: filter.protocol as SessionQueryRequest['filter']['protocol'],
  };
}

function assertOptionalBoundedString(
  value: unknown,
  name: string,
  maxLength: number,
): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }
  assertBoundedString(value, name, maxLength);
}

/** 校验并规范化 per-host 不安全例外：有界 host 字符串、去重、上限 200 项。 */
export function toInsecureHosts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error('insecureHosts is invalid');
  }
  const hosts: string[] = [];
  for (const item of value) {
    assertBoundedString(item, 'insecureHosts[]', 256);
    const trimmed = item.trim();
    if (trimmed && !hosts.includes(trimmed)) {
      hosts.push(trimmed);
    }
  }
  return hosts;
}

/** 校验按需正文读取的偏移与长度：非负整数偏移，长度不超过单次分块上限。 */
export function toByteRange(
  offset: unknown,
  length: unknown,
  maxLength: number,
): { offset: number; length: number } {
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new Error('offset is invalid');
  }
  if (
    typeof length !== 'number' ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > maxLength
  ) {
    throw new Error('length is invalid');
  }
  return { offset, length };
}

/** 校验按需正文解码选项：decode 须显式为 true 才生效，encoding 为有界字符串。 */
export function toBodyDecodeOptions(value: unknown): {
  decode?: boolean;
  encoding?: string;
} {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const options = value as { decode?: unknown; encoding?: unknown };
  const result: { decode?: boolean; encoding?: string } = {};
  if (options.decode === true) {
    result.decode = true;
  }
  if (typeof options.encoding === 'string' && options.encoding.length <= 256) {
    result.encoding = options.encoding;
  }
  return result;
}

/**
 * 校验 Renderer 传入的规则数组的结构与上限（第一道防线）。
 * 只做顶层结构与长度校验；matcher/action 的深度语义校验由 Core wire
 * 校验与 collectRuleDiagnostics 权威完成，避免在 Main 重复实现整套规则模型。
 */
export function toCoreRuleDefinitions(value: unknown): RuleDefinition[] {
  if (!Array.isArray(value) || value.length > MAX_RULES) {
    throw new Error('rules is invalid');
  }
  for (const rule of value) {
    if (typeof rule !== 'object' || rule === null) {
      throw new Error('rules[] is invalid');
    }
    const record = rule as Record<string, unknown>;
    assertBoundedString(record.id, 'rule.id', 128);
    assertBoundedString(record.name, 'rule.name', 256);
    if (typeof record.enabled !== 'boolean') {
      throw new Error('rule.enabled is invalid');
    }
    if (typeof record.priority !== 'number' || !Number.isInteger(record.priority)) {
      throw new Error('rule.priority is invalid');
    }
    if (!Array.isArray(record.matchers) || !Array.isArray(record.actions)) {
      throw new Error('rule.matchers/actions is invalid');
    }
  }
  return value as RuleDefinition[];
}

/** 校验乐观并发的期望 revision：非负整数。 */
export function assertRevision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('expectedRevision is invalid');
  }
}
/**
 * 校验 Renderer 传入的 Composer 请求（第一道防线）：method/url/protocol、headers 结构与
 * 上限、可选 body/timeoutMs。深度校验由 Core wire 校验兜底。
 */
export function toComposerRequest(value: unknown): ComposerRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('composer request is invalid');
  }
  const request = value as Record<string, unknown>;
  assertBoundedString(request.method, 'composer.method', 64);
  assertBoundedString(request.url, 'composer.url', 4_096);
  if (
    request.protocol !== 'auto' &&
    request.protocol !== 'http/1.1' &&
    request.protocol !== 'h2'
  ) {
    throw new Error('composer.protocol is invalid');
  }
  if (!Array.isArray(request.headers) || request.headers.length > 200) {
    throw new Error('composer.headers is invalid');
  }
  const headers = request.headers.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('composer.headers[] is invalid');
    }
    const pair = item as Record<string, unknown>;
    assertBoundedString(pair.name, 'composer.headers[].name', 256);
    assertBoundedString(pair.value, 'composer.headers[].value', 8_192);
    return { name: pair.name as string, value: pair.value as string };
  });
  if (request.body !== undefined) {
    assertBoundedString(request.body, 'composer.body', 1_048_576);
  }
  if (
    request.timeoutMs !== undefined &&
    (typeof request.timeoutMs !== 'number' ||
      !Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 1 ||
      request.timeoutMs > 120_000)
  ) {
    throw new Error('composer.timeoutMs is invalid');
  }
  return {
    method: request.method as string,
    url: request.url as string,
    headers,
    body: request.body as string | undefined,
    protocol: request.protocol,
    timeoutMs: request.timeoutMs as number | undefined,
  };
}

/**
 * 校验断点放行时的可选编辑（第一道防线）：method/url/statusCode/headers/body；
 * undefined 直接返回 undefined。深度校验由 Core wire 校验兼底。
 */
export function toBreakpointEdit(value: unknown): BreakpointEdit | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw new Error('breakpoint edit is invalid');
  }
  const edit = value as Record<string, unknown>;
  const result: BreakpointEdit = {};
  if (edit.method !== undefined) {
    assertBoundedString(edit.method, 'edit.method', 64);
    result.method = edit.method;
  }
  if (edit.url !== undefined) {
    assertBoundedString(edit.url, 'edit.url', 4_096);
    result.url = edit.url;
  }
  if (edit.statusCode !== undefined) {
    if (
      typeof edit.statusCode !== 'number' ||
      !Number.isInteger(edit.statusCode) ||
      edit.statusCode < 100 ||
      edit.statusCode > 599
    ) {
      throw new Error('edit.statusCode is invalid');
    }
    result.statusCode = edit.statusCode;
  }
  if (edit.headers !== undefined) {
    if (!Array.isArray(edit.headers) || edit.headers.length > 200) {
      throw new Error('edit.headers is invalid');
    }
    result.headers = edit.headers.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error('edit.headers[] is invalid');
      }
      const pair = item as Record<string, unknown>;
      assertBoundedString(pair.name, 'edit.headers[].name', 256);
      assertBoundedString(pair.value, 'edit.headers[].value', 8_192);
      return { name: pair.name as string, value: pair.value as string };
    });
  }
  if (edit.body !== undefined) {
    assertBoundedString(edit.body, 'edit.body', 1_048_576);
    result.body = edit.body;
  }
  return result;
}

/** 校验 WebSocket 消息分页请求；cursor 不透明，方向仅允许上下游两种。 */
export function toWebSocketFrameQuery(value: unknown): WebSocketFrameQuery {
  if (typeof value !== 'object' || value === null) {
    throw new Error('websocket query is invalid');
  }
  const request = value as Record<string, unknown>;
  assertIdentifier(request.exchangeId, 'websocket query.exchangeId');
  if (
    typeof request.limit !== 'number' ||
    !Number.isInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > MAX_QUERY_PAGE_SIZE
  ) {
    throw new Error('websocket query.limit is invalid');
  }
  assertOptionalBoundedString(request.cursor, 'websocket query.cursor', 1_024);
  if (
    request.direction !== undefined &&
    request.direction !== 'client-to-server' &&
    request.direction !== 'server-to-client'
  ) {
    throw new Error('websocket query.direction is invalid');
  }
  return {
    exchangeId: request.exchangeId,
    limit: request.limit,
    cursor: request.cursor as string | undefined,
    direction: request.direction as WebSocketFrameQuery['direction'],
  };
}

/** 校验 gRPC message metadata 分页请求；payload 仍通过 body range 单独读取。 */
export function toGrpcMessageQuery(value: unknown): GrpcMessageQuery {
  if (typeof value !== 'object' || value === null) {
    throw new Error('grpc query is invalid');
  }
  const request = value as Record<string, unknown>;
  assertIdentifier(request.exchangeId, 'grpc query.exchangeId');
  if (request.side !== 'request' && request.side !== 'response') {
    throw new Error('grpc query.side is invalid');
  }
  if (
    typeof request.limit !== 'number' ||
    !Number.isInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > MAX_QUERY_PAGE_SIZE
  ) {
    throw new Error('grpc query.limit is invalid');
  }
  assertOptionalBoundedString(request.cursor, 'grpc query.cursor', 1_024);
  return {
    exchangeId: request.exchangeId,
    side: request.side,
    cursor: request.cursor as string | undefined,
    limit: request.limit,
  };
}

/** 校验 Renderer HAR 导出意图；文件路径不在此 DTO 中，由 Main 系统对话框产生。 */
export function toHarExportRequest(value: unknown): HarExportRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('HAR export request is invalid');
  }
  const request = value as Record<string, unknown>;
  if (typeof request.scope !== 'object' || request.scope === null) {
    throw new Error('HAR export scope is invalid');
  }
  const rawScope = request.scope as Record<string, unknown>;
  let scope: HarExportRequest['scope'];
  if (rawScope.kind === 'all') {
    scope = { kind: 'all' };
  } else if (rawScope.kind === 'filter') {
    scope = {
      kind: 'filter',
      filter: toCoreSessionFilter(rawScope.filter),
    };
  } else if (rawScope.kind === 'selected') {
    if (
      !Array.isArray(rawScope.exchangeIds) ||
      rawScope.exchangeIds.length < 1 ||
      rawScope.exchangeIds.length > 10_000
    ) {
      throw new Error('HAR export selected IDs are invalid');
    }
    const exchangeIds = rawScope.exchangeIds.map((item) => {
      assertIdentifier(item, 'HAR export exchangeId');
      return item;
    });
    scope = { kind: 'selected', exchangeIds: [...new Set(exchangeIds)] };
  } else {
    throw new Error('HAR export scope kind is invalid');
  }

  if (typeof request.redaction !== 'object' || request.redaction === null) {
    throw new Error('HAR export redaction is invalid');
  }
  const redaction = request.redaction as Record<string, unknown>;
  if (
    typeof redaction.authorization !== 'boolean' ||
    typeof redaction.cookies !== 'boolean' ||
    typeof redaction.bodies !== 'boolean'
  ) {
    throw new Error('HAR export redaction flags are invalid');
  }
  return {
    scope,
    redaction: {
      authorization: redaction.authorization,
      cookies: redaction.cookies,
      bodies: redaction.bodies,
    },
  };
}

const DIAGNOSTIC_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const DIAGNOSTIC_PROCESSES = ['core', 'main', 'renderer'] as const;
const DIAGNOSTIC_OUTCOMES = [
  'success',
  'failed',
  'cancelled',
  'timed_out',
] as const;

/** 校验 Renderer 诊断 JSONL 导出的可选 level/outcome 过滤；文件路径由 Main 对话框产生。 */
export function toDiagnosticsExportFilter(
  value: unknown,
): DiagnosticsExportFilter {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object') {
    throw new Error('Diagnostics export filter is invalid');
  }
  const request = value as Record<string, unknown>;
  const filter: DiagnosticsExportFilter = {};
  if (request.process !== undefined) {
    if (
      typeof request.process !== 'string' ||
      !(DIAGNOSTIC_PROCESSES as readonly string[]).includes(request.process)
    ) {
      throw new Error('Diagnostics export process is invalid');
    }
    filter.process = request.process as DiagnosticsExportFilter['process'];
  }
  if (request.level !== undefined) {
    if (
      typeof request.level !== 'string' ||
      !(DIAGNOSTIC_LEVELS as readonly string[]).includes(request.level)
    ) {
      throw new Error('Diagnostics export level is invalid');
    }
    filter.level = request.level as DiagnosticsExportFilter['level'];
  }
  if (request.outcome !== undefined) {
    if (
      typeof request.outcome !== 'string' ||
      !(DIAGNOSTIC_OUTCOMES as readonly string[]).includes(request.outcome)
    ) {
      throw new Error('Diagnostics export outcome is invalid');
    }
    filter.outcome = request.outcome as DiagnosticsExportFilter['outcome'];
  }
  return filter;
}

/** 校验 Renderer 发起的 Diagnostics 分页查询并填充有界默认 limit。 */
export function toDiagnosticsQueryRequest(
  value: unknown,
): Required<Pick<DiagnosticsQueryRequest, 'limit'>> & DiagnosticsQueryRequest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Diagnostics query is invalid');
  }
  const query = value as Record<string, unknown>;
  const limit = query.limit ?? 200;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 500) {
    throw new Error('Diagnostics query.limit is invalid');
  }
  const filter = toDiagnosticsExportFilter({
    process: query.process,
    level: query.level,
    outcome: query.outcome,
  });
  for (const key of ['cursor', 'command'] as const) {
    if (
      query[key] !== undefined &&
      (typeof query[key] !== 'string' || query[key].length < 1 || query[key].length > 1_024)
    ) {
      throw new Error(`Diagnostics query.${key} is invalid`);
    }
  }
  if (query.traceId !== undefined) {
    assertIdentifier(query.traceId, 'Diagnostics query.traceId');
  }
  for (const key of ['minDurationMs', 'maxDurationMs'] as const) {
    if (
      query[key] !== undefined &&
      (!Number.isInteger(query[key]) || (query[key] as number) < 0 || (query[key] as number) > 86_400_000)
    ) {
      throw new Error(`Diagnostics query.${key} is invalid`);
    }
  }
  if (
    typeof query.minDurationMs === 'number' &&
    typeof query.maxDurationMs === 'number' &&
    query.minDurationMs > query.maxDurationMs
  ) {
    throw new Error('Diagnostics query duration range is invalid');
  }
  return {
    limit: limit as number,
    ...(query.cursor ? { cursor: query.cursor as string } : {}),
    ...filter,
    ...(query.traceId ? { traceId: query.traceId as string } : {}),
    ...(query.command ? { command: query.command as string } : {}),
    ...(query.minDurationMs !== undefined
      ? { minDurationMs: query.minDurationMs as number }
      : {}),
    ...(query.maxDurationMs !== undefined
      ? { maxDurationMs: query.maxDurationMs as number }
      : {}),
  };
}

/** 校验 Renderer 全局错误的固定短摘要；phase/process 由 Main 决定。 */
export function toRendererDiagnosticReport(
  value: unknown,
): RendererDiagnosticReport {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Renderer diagnostic report is invalid');
  }
  const report = value as Record<string, unknown>;
  if (
    report.kind !== 'uncaught-error' &&
    report.kind !== 'unhandled-rejection'
  ) {
    throw new Error('Renderer diagnostic kind is invalid');
  }
  assertIdentifier(report.name, 'Renderer diagnostic name');
  assertBoundedString(report.message, 'Renderer diagnostic message', 512);
  return {
    kind: report.kind,
    name: report.name,
    message: report.message,
  };
}