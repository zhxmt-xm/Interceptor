import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
  parseCoreToMainMessage,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from '../core-diagnostics';

afterEach(() => {
  vi.useRealTimers();
});

describe('CoreDiagnostics', () => {
  it('propagates command context through asynchronous actions', async () => {
    const batches: unknown[][] = [];
    const diagnostics = new CoreDiagnostics({
      now: () => 1_000,
      sink: (records) => {
        batches.push([...records]);
      },
    });

    await diagnostics.runWithCommand(
      'request-1',
      'trace-1',
      'echo',
      () => diagnostics.action('echo.copy', async () => 'done'),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    const recent = diagnostics.recent(10, 'trace-1');
    expect(recent.records).toMatchObject([
      {
        requestId: 'request-1',
        traceId: 'trace-1',
        command: 'echo',
        phase: 'action.started',
        action: 'echo.copy',
      },
      {
        requestId: 'request-1',
        traceId: 'trace-1',
        command: 'echo',
        phase: 'action.completed',
        outcome: 'success',
      },
    ]);
    expect(batches.flat()).toHaveLength(2);
  });

  it('keeps records and pending output bounded', async () => {
    const diagnostics = new CoreDiagnostics({
      maxBytes: 10_000,
      maxOutputRecords: 2,
      maxRecords: 3,
      sink: () => undefined,
    });

    for (let index = 0; index < 6; index += 1) {
      diagnostics.debug('test.record', { attributes: { index } });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));

    const recent = diagnostics.recent(10);
    expect(recent.records).toHaveLength(3);
    expect(recent.droppedCount).toBe(7);
  });

  it('falls back without throwing when the sink fails', async () => {
    const fallback = vi.fn();
    const diagnostics = new CoreDiagnostics({
      sink: () => {
        throw new Error('disk unavailable');
      },
      fallback,
    });

    expect(() => diagnostics.error('command.failed')).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(fallback).toHaveBeenCalledWith(
      'Diagnostic sink failed: Error',
    );
  });

  it('contains an asynchronous sink rejection', async () => {
    const fallback = vi.fn();
    const diagnostics = new CoreDiagnostics({
      sink: async () => {
        throw new Error('async disk unavailable');
      },
      fallback,
    });

    diagnostics.error('command.failed');
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();

    expect(fallback).toHaveBeenCalledWith(
      'Diagnostic sink failed: Error',
    );
  });

  it('redacts sensitive attributes and remains protocol-valid', () => {
    const diagnostics = new CoreDiagnostics({ sink: () => undefined });

    diagnostics.runWithCommand('request-1', 'trace-1', 'echo', () => {
      diagnostics.info('command completed', {
        action: 'unsafe action',
        attributes: {
          authorization: 'Bearer secret',
          'bad key': 'safe value',
          cookieValue: 'session=secret',
        },
      });
    });

    const recent = diagnostics.recent(10, 'trace-1');
    expect(recent.records[0]).toMatchObject({
      phase: 'command_completed',
      action: 'unsafe_action',
      attributes: {
        authorization_0: '[REDACTED]',
        bad_key_1: 'safe value',
        cookieValue_2: '[REDACTED]',
      },
    });
    expect(parseCoreToMainMessage({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-diagnostics',
      traceId: 'trace-diagnostics',
      ok: true,
      result: {
        type: 'diagnostics.records',
        payload: recent,
      },
    }).ok).toBe(true);
  });
});