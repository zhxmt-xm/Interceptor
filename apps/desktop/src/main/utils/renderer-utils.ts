import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import type { CoreDiagnosticRecord } from '../../shared/desktop-api';

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
    requestId: record.requestId,
    command: record.command,
    phase: record.phase,
    action: record.action,
    durationMs: record.durationMs,
    outcome: record.outcome,
    errorCode: record.errorCode,
  };
}