import { describe, expect, it } from 'vitest';

import {
  CoreBackend,
  CoreCommandError,
} from '../core-backend';
import { CoreDiagnostics } from '../core-diagnostics';

describe('CoreBackend', () => {
  it('executes echo and records its business action', async () => {
    const diagnostics = createDiagnostics();
    const backend = new CoreBackend(diagnostics, {
      now: () => Date.parse('2026-07-12T00:00:00.000Z'),
    });

    const result = await diagnostics.runWithCommand(
      'request-1',
      'trace-1',
      'echo',
      () => backend.execute(
        { type: 'echo', payload: { value: 'hello' } },
        new AbortController().signal,
      ),
    );

    expect(result).toEqual({
      type: 'echo',
      payload: {
        value: 'hello',
        handledAt: '2026-07-12T00:00:00.000Z',
      },
    });
    expect(diagnostics.recent(10, 'trace-1').records.map(
      ({ phase }) => phase,
    )).toEqual(['action.started', 'action.completed']);
  });

  it('returns recent diagnostics for a trace', async () => {
    const diagnostics = createDiagnostics();
    diagnostics.runWithCommand('request-1', 'trace-1', 'echo', () => {
      diagnostics.info('command.completed');
    });
    const backend = new CoreBackend(diagnostics);

    const result = await backend.execute({
      type: 'diagnostics.recent',
      payload: { limit: 10, traceId: 'trace-1' },
    }, new AbortController().signal);

    expect(result).toMatchObject({
      type: 'diagnostics.records',
      payload: {
        droppedCount: 0,
        records: [{ traceId: 'trace-1', phase: 'command.completed' }],
      },
    });
  });

  it('rejects aborted and future-stage commands with structured errors', async () => {
    const backend = new CoreBackend(createDiagnostics());
    const controller = new AbortController();
    controller.abort();

    await expect(backend.execute(
      { type: 'echo', payload: { value: 'cancelled' } },
      controller.signal,
    )).rejects.toMatchObject({
      detail: {
        code: 'cancelled',
        message: 'The command was cancelled.',
        retryable: false,
      },
    } satisfies Partial<CoreCommandError>);

    await expect(backend.execute({
      type: 'sessions.query',
      payload: { limit: 10, sort: 'started_desc', filter: {} },
    }, new AbortController().signal)).rejects.toMatchObject({
      detail: { code: 'unsupported-command', retryable: false },
    });
  });
});

function createDiagnostics(): CoreDiagnostics {
  return new CoreDiagnostics({ sink: () => undefined });
}