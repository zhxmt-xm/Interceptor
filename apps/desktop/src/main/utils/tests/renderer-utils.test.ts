import { describe, expect, it } from 'vitest';

import {
  assertBoundedString,
  assertIdentifier,
  toRendererDiagnosticRecord,
} from '../renderer-utils';

describe('renderer utils', () => {
  it('validates bounded strings', () => {
    expect(() => assertBoundedString('hello', 'value', 5)).not.toThrow();
    expect(() => assertBoundedString('too long', 'value', 5)).toThrow(
      'value is invalid',
    );
    expect(() => assertBoundedString(42, 'value', 5)).toThrow(
      'value is invalid',
    );
  });

  it('accepts protocol identifiers and rejects unsafe values', () => {
    expect(() => assertIdentifier('trace-1:a.b', 'traceId')).not.toThrow();
    expect(() => assertIdentifier('../trace', 'traceId')).toThrow(
      'traceId is invalid',
    );
    expect(() => assertIdentifier('', 'traceId')).toThrow(
      'traceId is invalid',
    );
  });

  it('maps only fields exposed to the Renderer', () => {
    expect(toRendererDiagnosticRecord({
      timestamp: '2026-07-13T00:00:00.000Z',
      sequence: 1,
      level: 'info',
      process: 'proxy-core',
      traceId: 'trace-1',
      requestId: 'request-1',
      command: 'echo',
      phase: 'command.completed',
      attributes: { secret: '[REDACTED]' },
    })).toEqual({
      timestamp: '2026-07-13T00:00:00.000Z',
      sequence: 1,
      level: 'info',
      requestId: 'request-1',
      command: 'echo',
      phase: 'command.completed',
      action: undefined,
      durationMs: undefined,
      outcome: undefined,
      errorCode: undefined,
    });
  });
});