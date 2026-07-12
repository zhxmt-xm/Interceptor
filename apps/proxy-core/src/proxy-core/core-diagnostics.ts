import { AsyncLocalStorage } from 'node:async_hooks';
import process from 'node:process';

import type {
  CoreCommand,
  DiagnosticAttribute,
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
} from '@interceptor/core-protocol';

interface DiagnosticContext {
  traceId: string;
  requestId: string;
  command: CoreCommand['type'];
}

interface DiagnosticFields {
  action?: string;
  durationMs?: number;
  outcome?: DiagnosticOutcome;
  errorCode?: string;
  attributes?: Record<string, DiagnosticAttribute>;
}

interface CoreDiagnosticsOptions {
  maxBytes?: number;
  maxOutputRecords?: number;
  maxRecords?: number;
  now?: () => number;
  sink?: (records: readonly DiagnosticLogRecord[]) => Promise<void> | void;
  fallback?: (message: string) => void;
}

interface StoredRecord {
  record: DiagnosticLogRecord;
  bytes: number;
}

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_OUTPUT_RECORDS = 256;
const DEFAULT_MAX_RECORDS = 2_000;

export class CoreDiagnostics {
  private readonly context = new AsyncLocalStorage<DiagnosticContext>();
  private readonly records: StoredRecord[] = [];
  private readonly outputQueue: DiagnosticLogRecord[] = [];
  private readonly maxBytes: number;
  private readonly maxOutputRecords: number;
  private readonly maxRecords: number;
  private readonly now: () => number;
  private readonly sink: (
    records: readonly DiagnosticLogRecord[],
  ) => Promise<void> | void;
  private readonly fallback: (message: string) => void;

  private bytes = 0;
  private droppedCount = 0;
  private outputScheduled = false;
  private sequence = 0;

  constructor(options: CoreDiagnosticsOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxOutputRecords =
      options.maxOutputRecords ?? DEFAULT_MAX_OUTPUT_RECORDS;
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.now = options.now ?? Date.now;
    this.sink = options.sink ?? writeJsonLines;
    this.fallback = options.fallback ?? writeFallback;
  }

  runWithCommand<T>(
    requestId: string,
    traceId: string,
    command: CoreCommand['type'],
    operation: () => T,
  ): T {
    return this.context.run({ requestId, traceId, command }, operation);
  }

  async action<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
    const startedAt = this.now();
    this.info('action.started', { action: name });
    try {
      const result = await operation();
      this.info('action.completed', {
        action: name,
        durationMs: this.now() - startedAt,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.error('action.failed', {
        action: name,
        durationMs: this.now() - startedAt,
        outcome: 'failed',
        errorCode: readErrorCode(error),
      });
      throw error;
    }
  }

  debug(phase: string, fields: DiagnosticFields = {}): void {
    this.record('debug', phase, fields);
  }

  info(phase: string, fields: DiagnosticFields = {}): void {
    this.record('info', phase, fields);
  }

  warn(phase: string, fields: DiagnosticFields = {}): void {
    this.record('warn', phase, fields);
  }

  error(phase: string, fields: DiagnosticFields = {}): void {
    this.record('error', phase, fields);
  }

  recent(limit: number, traceId?: string): {
    records: DiagnosticLogRecord[];
    droppedCount: number;
  } {
    const matching = traceId
      ? this.records.filter(({ record }) => record.traceId === traceId)
      : this.records;
    return {
      records: matching.slice(-limit).map(({ record }) => ({
        ...record,
        attributes: record.attributes ? { ...record.attributes } : undefined,
      })),
      droppedCount: this.droppedCount,
    };
  }

  private record(
    level: DiagnosticLevel,
    phase: string,
    fields: DiagnosticFields,
  ): void {
    const context = this.context.getStore();
    const record: DiagnosticLogRecord = {
      timestamp: new Date(this.now()).toISOString(),
      sequence: ++this.sequence,
      level,
      process: 'proxy-core',
      phase: sanitizeIdentifier(phase, 'log.phase'),
      ...(context ?? {}),
      action: fields.action
        ? sanitizeIdentifier(fields.action, 'log.action')
        : undefined,
      durationMs: sanitizeDuration(fields.durationMs),
      outcome: fields.outcome,
      errorCode: fields.errorCode
        ? sanitizeIdentifier(fields.errorCode, 'log.error')
        : undefined,
      attributes: fields.attributes
        ? sanitizeAttributes(fields.attributes)
        : undefined,
    };
    const bytes = approximateBytes(record);

    if (bytes > this.maxBytes) {
      this.droppedCount += 1;
      this.fallbackSafely('Oversized diagnostic record was dropped.');
      return;
    }

    this.records.push({ record, bytes });
    this.bytes += bytes;
    while (
      this.records.length > this.maxRecords ||
      this.bytes > this.maxBytes
    ) {
      const removed = this.records.shift();
      if (!removed) {
        break;
      }
      this.bytes -= removed.bytes;
      this.droppedCount += 1;
    }

    if (this.outputQueue.length >= this.maxOutputRecords) {
      this.droppedCount += 1;
      return;
    }
    this.outputQueue.push(record);
    this.scheduleOutput();
  }

  private scheduleOutput(): void {
    if (this.outputScheduled) {
      return;
    }
    this.outputScheduled = true;
    setImmediate(() => this.flushOutput());
  }

  private flushOutput(): void {
    this.outputScheduled = false;
    const batch = this.outputQueue.splice(0);
    if (batch.length === 0) {
      return;
    }

    try {
      const output = this.sink(batch);
      if (isPromiseLike(output)) {
        void output.catch((error: unknown) => {
          this.fallbackSafely(
            `Diagnostic sink failed: ${readErrorCode(error)}`,
          );
        });
      }
    } catch (error) {
      this.fallbackSafely(
        `Diagnostic sink failed: ${readErrorCode(error)}`,
      );
    }
  }

  private fallbackSafely(message: string): void {
    try {
      this.fallback(message);
    } catch {
      // Diagnostics must never fail the command or network path.
    }
  }
}

function sanitizeAttributes(
  attributes: Record<string, DiagnosticAttribute>,
): Record<string, DiagnosticAttribute> {
  const sanitized: Record<string, DiagnosticAttribute> = {};
  for (const [index, [key, value]] of Object.entries(attributes).entries()) {
    if (index >= 32) {
      break;
    }
    const safeKey = sanitizeAttributeKey(key, index);
    sanitized[safeKey] = isSensitiveAttributeKey(key)
      ? '[REDACTED]'
      : typeof value === 'string'
        ? value.slice(0, 512)
        : value;
  }
  return sanitized;
}

function sanitizeAttributeKey(key: string, index: number): string {
  const normalized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  const prefixed = /^[A-Za-z]/.test(normalized)
    ? normalized
    : `attribute_${normalized}`;
  const suffix = `_${index}`;
  return `${prefixed.slice(0, 64 - suffix.length)}${suffix}`;
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._:-]/g, '_');
  const prefixed = /^[A-Za-z0-9]/.test(normalized)
    ? normalized
    : `${fallback}_${normalized}`;
  return prefixed.slice(0, 128) || fallback;
}

function sanitizeDuration(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function isSensitiveAttributeKey(key: string): boolean {
  return /authorization|body|cookie|password|query|secret|token/i.test(key);
}

function approximateBytes(record: DiagnosticLogRecord): number {
  try {
    return Buffer.byteLength(JSON.stringify(record), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function writeJsonLines(records: readonly DiagnosticLogRecord[]): void {
  process.stdout.write(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function writeFallback(message: string): void {
  process.stderr.write(`[diagnostics] ${message}\n`);
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 128);
  }
  return error instanceof Error ? error.name : 'unknown';
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function';
}