/** Main-layer stateless DTO mappers and shared process runner. */

import { execFile } from 'node:child_process';
import path from 'node:path';

import type {
  CollectionNode,
  DiagnosticLogRecord,
  RuleNode,
  TlsPassthroughSettings,
} from '@interceptor/core-protocol';

import type {
  BreakpointEdit,
  BodyExportRequest,
  CaptureStatus,
  ComposerRequest,
  CoreDiagnosticRecord,
  DiagnosticsExportFilter,
  DiagnosticsQueryRequest,
  GrpcMessageQuery,
  HarExportRequest,
  RendererDiagnosticReport,
  SessionQueryRequest,
  CaptureUsage,
  WebSocketFrameQuery,
} from '../../shared/desktop-api';
import type { SystemProxyCommandRunner } from '../interfaces';

/** Read an Error name for structured diagnostics. */
export function readErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/** Read an Error message without changing its content. */
export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Map the intentionally public diagnostic fields; attributes remain private. */
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

/** Map Core storage status to the Renderer-owned DTO. */
export function toRendererCaptureUsage(payload: CaptureUsage): CaptureUsage {
  return { ...payload };
}

/** Map Core proxy status to the Renderer-owned DTO. */
export function toRendererCaptureStatus(payload: CaptureStatus): CaptureStatus {
  return { ...payload };
}

/** Pass a trusted Renderer session query through without limits or normalization. */
export function toCoreSessionQuery(value: unknown): SessionQueryRequest {
  return value as SessionQueryRequest;
}

/** Preserve trusted per-host exceptions exactly as supplied by the Renderer. */
export function toInsecureHosts(value: unknown): string[] {
  return value as string[];
}

/** 断点替换正文按扩展名猜 media type；猜不出按纯文本处理。 */
const BREAKPOINT_BODY_MEDIA_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
};

export function breakpointBodyMediaType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return BREAKPOINT_BODY_MEDIA_TYPES[extension] ?? 'text/plain';
}

/** Preserve trusted body range values without imposing an IPC allocation limit. */
export function toByteRange(
  offset: unknown,
  length: unknown,
): { offset: number; length: number } {
  return { offset: offset as number, length: length as number };
}

/** Preserve optional body decode values without truncation. */
export function toBodyDecodeOptions(value: unknown): {
  decode?: boolean;
  encoding?: string;
} {
  return (value ?? {}) as { decode?: boolean; encoding?: string };
}

/** Pass a trusted body export intent through; Main still owns the final path. */
export function toBodyExportRequest(value: unknown): BodyExportRequest {
  return value as BodyExportRequest;
}

/** Reduce an untrusted URL-derived suggestion to a portable file basename. */
export function toSafeBodyFileName(value: string): string {
  const basename = path.win32.basename(path.posix.basename(value))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return basename || 'response-body.bin';
}

/** Pass a trusted Renderer rule tree through to the Core rule engine. */
export function toCoreRuleNodes(value: unknown): RuleNode[] {
  return value as RuleNode[];
}

/** Pass a trusted Composer collection tree through to the Core workspace store. */
export function toCollectionNodes(value: unknown): CollectionNode[] {
  return value as CollectionNode[];
}

/** Pass a trusted Composer request through unchanged. */
export function toComposerRequest(value: unknown): ComposerRequest {
  return value as ComposerRequest;
}

/** Pass a trusted breakpoint edit through unchanged. */
export function toBreakpointEdit(value: unknown): BreakpointEdit | undefined {
  return value == null ? undefined : value as BreakpointEdit;
}

/** Pass a trusted WebSocket frame query through unchanged. */
export function toWebSocketFrameQuery(value: unknown): WebSocketFrameQuery {
  return value as WebSocketFrameQuery;
}

/** Pass a trusted gRPC message query through unchanged. */
export function toGrpcMessageQuery(value: unknown): GrpcMessageQuery {
  return value as GrpcMessageQuery;
}

/** Pass trusted HAR export options through; Main still owns the file path. */
export function toHarExportRequest(value: unknown): HarExportRequest {
  return value as HarExportRequest;
}

/** Preserve trusted Diagnostics export filters without enum filtering. */
export function toDiagnosticsExportFilter(
  value: unknown,
): DiagnosticsExportFilter {
  return (value ?? {}) as DiagnosticsExportFilter;
}

/** Preserve trusted Diagnostics query values and provide only the UI default limit. */
export function toDiagnosticsQueryRequest(
  value: unknown,
): Required<Pick<DiagnosticsQueryRequest, 'limit'>> & DiagnosticsQueryRequest {
  const query = value as DiagnosticsQueryRequest;
  return {
    ...query,
    limit: query.limit ?? 200,
  };
}

/** Pass a trusted Renderer diagnostic report through unchanged. */
export function toRendererDiagnosticReport(
  value: unknown,
): RendererDiagnosticReport {
  return value as RendererDiagnosticReport;
}

/** Execute native helper commands without a shell. */
export const systemProxyCommandRunner: SystemProxyCommandRunner = {
  run(command, args) {
    return new Promise((resolve) => {
      execFile(
        command,
        [...args],
        { windowsHide: true },
        (error, stdout, stderr) => {
          const rawCode = (error as { code?: number | string } | null)?.code;
          resolve({
            code: typeof rawCode === 'number' ? rawCode : error ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
          });
        },
      );
    });
  },
};