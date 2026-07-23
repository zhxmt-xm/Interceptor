import type {
  DiagnosticIngestPayload,
  DiagnosticLevel,
} from '@interceptor/core-protocol';

import type { DiagnosticFields, MainDiagnosticsTransport } from '../interfaces';

/** Main/Renderer 诊断的非阻塞完整转发队列。 */
export class MainDiagnostics {
  private readonly pending: DiagnosticIngestPayload[] = [];
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

  /** Core 新代际 running 后恢复发送断开期间保留的全部记录。 */
  resume(): void {
    this.scheduleFlush();
  }

  private enqueue(
    process: DiagnosticIngestPayload['process'],
    level: Exclude<DiagnosticLevel, 'debug'>,
    phase: string,
    fields: DiagnosticFields,
  ): void {
    this.pending.push({
      process,
      level,
      phase,
      traceId: fields.traceId,
      requestId: fields.requestId,
      action: fields.action,
      durationMs: fields.durationMs,
      outcome: fields.outcome,
      errorCode: fields.errorCode,
      attributes: fields.attributes,
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
        this.pending.unshift(next);
      })
      .finally(() => {
        this.sending = false;
        if (this.pending[0] !== next) {
          this.scheduleFlush();
        }
      });
  }
}