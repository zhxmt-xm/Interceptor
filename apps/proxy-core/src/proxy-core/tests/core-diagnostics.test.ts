import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
  parseCoreToMainMessage,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from '../core-diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CoreDiagnostics', () => {
  it('rebuilds and redacts externally ingested renderer records', async () => {
    const batches: unknown[][] = [];
    const diagnostics = new CoreDiagnostics({
      sink: (records) => {
        batches.push([...records]);
      },
    });

    diagnostics.runWithCommand(
      'request-ingest',
      'trace-ingest',
      'diagnostics.ingest',
      () => diagnostics.ingest({
        process: 'renderer',
        level: 'error',
        phase: 'renderer.unhandled-error',
        errorCode: 'TypeError',
        attributes: {
          authorization: 'Bearer secret',
          message: 'GET https://example.com/path?token=secret Bearer abc123',
        },
      }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(batches.flat()).toMatchObject([
      {
        process: 'renderer',
        level: 'error',
        phase: 'renderer.unhandled-error',
        errorCode: 'TypeError',
        traceId: undefined,
        requestId: undefined,
        attributes: {
          authorization: '[REDACTED]',
          message:
            'GET https://example.com/path?token=%5BREDACTED%5D Bearer [REDACTED]',
        },
      },
    ]);
    expect(batches.flat()[0]).not.toHaveProperty('command');
  });

  it('propagates command context through asynchronous actions', async () => {
    const batches: unknown[][] = [];
    const diagnostics = new CoreDiagnostics({
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
        phase: 'action.completed',
        action: 'echo.copy',
        outcome: 'success',
      },
    ]);
    expect(batches.flat()).toHaveLength(1);
  });

  it('keeps every record and pending output item', async () => {
    const diagnostics = new CoreDiagnostics({ sink: () => undefined });

    for (let index = 0; index < 6; index += 1) {
      diagnostics.debug('test.record', { attributes: { index } });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));

    const recent = diagnostics.recent(10);
    expect(recent.records).toHaveLength(6);
    expect(recent.droppedCount).toBe(0);
  });

  it('falls back without throwing when the sink fails', async () => {
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true);
    const diagnostics = new CoreDiagnostics({
      sink: () => {
        throw new Error('disk unavailable');
      },
    });

    expect(() => diagnostics.error('command.failed')).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(stderr).toHaveBeenCalledWith(
      '[diagnostics] Diagnostic sink failed: Error\n',
    );
  });

  it('contains an asynchronous sink rejection', async () => {
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockReturnValue(true);
    const diagnostics = new CoreDiagnostics({
      sink: async () => {
        throw new Error('async disk unavailable');
      },
    });

    diagnostics.error('command.failed');
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();

    expect(stderr).toHaveBeenCalledWith(
      '[diagnostics] Diagnostic sink failed: Error\n',
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
      phase: 'command completed',
      action: 'unsafe action',
      attributes: {
        authorization: '[REDACTED]',
        'bad key': 'safe value',
        cookieValue: '[REDACTED]',
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