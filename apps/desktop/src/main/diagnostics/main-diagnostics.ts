import type {
  DiagnosticIngestPayload,
  DiagnosticLevel,
} from '@interceptor/core-protocol';

const MAX_PENDING_RECORDS = 128;

type DiagnosticFields = Omit<
  DiagnosticIngestPayload,
  'process' | 'level' | 'phase'
>;

export interface MainDiagnosticsTransport {
  ingestDiagnostic(payload: DiagnosticIngestPayload): Promise<void>;
}

/** Main/Renderer 安全摘要的有界、非阻塞转发队列。 */
export class MainDiagnostics {
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
    if (this.pending.length >= MAX_PENDING_RECORDS) {
      this.droppedCount += 1;
      return;
    }

    if (this.droppedCount > 0 && this.pending.length < MAX_PENDING_RECORDS - 1) {
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
      phase: sanitizeIdentifier(phase, 'main.diagnostic'),
      traceId: sanitizeOptionalIdentifier(fields.traceId),
      requestId: sanitizeOptionalIdentifier(fields.requestId),
      action: sanitizeOptionalIdentifier(fields.action),
      durationMs: sanitizeDuration(fields.durationMs),
      outcome: fields.outcome,
      errorCode: sanitizeOptionalIdentifier(fields.errorCode),
      attributes: sanitizeAttributes(fields.attributes),
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
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._:-]/g, '_');
  return normalized.slice(0, 128) || fallback;
}

function sanitizeOptionalIdentifier(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeIdentifier(value, 'unknown');
}

function sanitizeDuration(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, 86_400_000)
    : undefined;
}

function sanitizeAttributes(
  attributes: DiagnosticFields['attributes'],
): DiagnosticFields['attributes'] {
  if (!attributes) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(attributes)
      .slice(0, 32)
      .map(([key, value], index) => {
        const safeKey = sanitizeAttributeKey(key, index);
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

function sanitizeAttributeKey(key: string, index: number): string {
  const normalized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  const prefixed = /^[A-Za-z]/.test(normalized)
    ? normalized
    : `attribute_${normalized}`;
  return prefixed.slice(0, 64) || `attribute_${index}`;
}