import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { MAX_QUERY_PAGE_SIZE } from '@interceptor/core-protocol';

import type {
  CaptureStatus,
  CoreDiagnosticRecord,
  SessionQueryRequest,
  StorageUsage,
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

  return {
    host: filter.host as string | undefined,
    method: filter.method as string | undefined,
    status: status as number | undefined,
    mime: filter.mime as string | undefined,
    process: filter.process as string | undefined,
    search: filter.search as string | undefined,
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