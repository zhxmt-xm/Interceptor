import type {
  DiagnosticIngestPayload,
  DiagnosticLevel,
} from '@interceptor/core-protocol';

import type { DiagnosticFields, MainDiagnosticsTransport } from '../interfaces';

/** Main/Renderer 安全摘要的有界、非阻塞转发队列。 */
export class MainDiagnostics {
  /** 未投递记录的有界上限；超过即丢弃并累计计数。 */
  private static readonly MAX_PENDING_RECORDS = 128;

  private readonly pending: DiagnosticIngestPayload[] = [];
  private droppedCount = 0;
  private flushScheduled = false;
  private sending = false;

  constructor(private readonly transport: MainDiagnosticsTransport) {}

  info(phase: string, fields: DiagnosticFields = {}): void {
    this.enqueue('main', 'info', phase, fields);
  }

  warn(phase: string, fields: DiagnosticFields = {}): void {
    this.enqueue('main', 'warn', phase, fields);
  }

  error(phase: string, fields: DiagnosticFields = {}): void {
    this.enqueue('main', 'error', phase, fields);
  }

  rendererError(
    phase: 'renderer.uncaught-error' | 'renderer.unhandled-rejection',
    fields: DiagnosticFields,
  ): void {
    this.enqueue('renderer', 'error', phase, fields);
  }

  private enqueue(
    process: DiagnosticIngestPayload['process'],
    level: Exclude<DiagnosticLevel, 'debug'>,
    phase: string,
    fields: DiagnosticFields,
  ): void {
    if (this.pending.length >= MainDiagnostics.MAX_PENDING_RECORDS) {
      this.droppedCount += 1;
      return;
    }

    if (
      this.droppedCount > 0 &&
      this.pending.length < MainDiagnostics.MAX_PENDING_RECORDS - 1
    ) {
      this.pending.push({
        process: 'main',
        level: 'warn',
        phase: 'main.diagnostics.dropped',
        attributes: { count: this.droppedCount },
      });
      this.droppedCount = 0;
    }
    this.pending.push({
      process,
      level,
      phase: MainDiagnostics.sanitizeIdentifier(phase, 'main.diagnostic'),
      traceId: MainDiagnostics.sanitizeOptionalIdentifier(fields.traceId),
      requestId: MainDiagnostics.sanitizeOptionalIdentifier(fields.requestId),
      action: MainDiagnostics.sanitizeOptionalIdentifier(fields.action),
      durationMs: MainDiagnostics.sanitizeDuration(fields.durationMs),
      outcome: fields.outcome,
      errorCode: MainDiagnostics.sanitizeOptionalIdentifier(fields.errorCode),
      attributes: MainDiagnostics.sanitizeAttributes(fields.attributes),
    });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.sending) {
      return;
    }
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      this.flushNext();
    });
  }

  private flushNext(): void {
    const next = this.pending.shift();
    if (!next) {
      return;
    }
    this.sending = true;
    void this.transport
      .ingestDiagnostic(next)
      .catch(() => {
        this.droppedCount += 1 + this.pending.length;
        this.pending.length = 0;
      })
      .finally(() => {
        this.sending = false;
        this.scheduleFlush();
      });
  }

  /** 归一化 identifier：非法字符转下划线并截断到 128；空则回退。 */
  private static sanitizeIdentifier(value: string, fallback: string): string {
    const normalized = value.replace(/[^A-Za-z0-9._:-]/g, '_');
    return normalized.slice(0, 128) || fallback;
  }

  /** 归一化可选 identifier；undefined 透传。 */
  private static sanitizeOptionalIdentifier(
    value: string | undefined,
  ): string | undefined {
    return value === undefined
      ? undefined
      : MainDiagnostics.sanitizeIdentifier(value, 'unknown');
  }

  /** 归一化时长：非负整数且不超过一天，否则丢弃。 */
  private static sanitizeDuration(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? Math.min(value, 86_400_000)
      : undefined;
  }

  /** 归一化属性表：最多 32 项、键规范化、字符串截断、非有限数归零。 */
  private static sanitizeAttributes(
    attributes: DiagnosticFields['attributes'],
  ): DiagnosticFields['attributes'] {
    if (!attributes) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(attributes)
        .slice(0, 32)
        .map(([key, value], index) => {
          const safeKey = MainDiagnostics.sanitizeAttributeKey(key, index);
          if (typeof value === 'string') {
            return [safeKey, value.slice(0, 512)];
          }
          if (typeof value === 'number' && !Number.isFinite(value)) {
            return [safeKey, 0];
          }
          return [safeKey, value];
        }),
    );
  }

  /** 归一化属性键：非法字符转下划线、确保字母开头、截断到 64。 */
  private static sanitizeAttributeKey(key: string, index: number): string {
    const normalized = key.replace(/[^A-Za-z0-9._-]/g, '_');
    const prefixed = /^[A-Za-z]/.test(normalized)
      ? normalized
      : `attribute_${normalized}`;
    return prefixed.slice(0, 64) || `attribute_${index}`;
  }
}