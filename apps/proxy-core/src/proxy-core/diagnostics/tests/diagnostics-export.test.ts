import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { DiagnosticLogRecord } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiagnosticsService } from '../entry';
import { DiagnosticsWorkerHost } from '../host/entry';

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function record(
  sequence: number,
  attributes: DiagnosticLogRecord['attributes'],
): DiagnosticLogRecord {
  return {
    timestamp: new Date(1_700_000_000_000 + sequence).toISOString(),
    sequence,
    level: 'warn',
    process: 'proxy-core',
    phase: 'command.completed',
    outcome: 'failed',
    attributes,
  };
}

describe('DiagnosticsService.exportJsonl', () => {
  it('paginates, forwards filters, atomically writes JSONL, and redacts again', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-diag-'));
    directories.push(directory);
    const filePath = path.join(directory, 'diagnostics.jsonl');
    const query = vi
      .spyOn(DiagnosticsWorkerHost.prototype, 'query')
      .mockResolvedValueOnce({
        records: [record(2, {
          authorization: 'Bearer secret',
          endpoint: 'https://api.test/path?session=secret&safe=visible',
        })],
        nextCursor: 'cursor-2',
        hasMore: true,
        droppedCount: 0,
      })
      .mockResolvedValueOnce({
        records: [record(1, { count: 3 })],
        hasMore: false,
        droppedCount: 0,
      });
    const progress = vi.fn();

    const result = await new DiagnosticsService().exportJsonl(
      filePath,
      { level: 'warn', outcome: 'failed' },
      new AbortController().signal,
      progress,
    );

    expect(result).toEqual({ processed: 2, total: 2, warnings: [] });
    expect(query).toHaveBeenNthCalledWith(1, expect.objectContaining({
      level: 'warn',
      outcome: 'failed',
      cursor: undefined,
    }));
    expect(query).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: 'cursor-2',
    }));
    const text = await readFile(filePath, 'utf8');
    expect(text.trim().split('\n')).toHaveLength(2);
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('Bearer secret');
    expect(text).not.toContain('session=secret');
    expect(await readdir(directory)).toEqual(['diagnostics.jsonl']);
    expect(progress).toHaveBeenLastCalledWith({ processed: 2, total: 2 });
  });

  it('aborts before querying and cleans up the temporary file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-diag-'));
    directories.push(directory);
    const filePath = path.join(directory, 'diagnostics.jsonl');
    const query = vi.spyOn(DiagnosticsWorkerHost.prototype, 'query');
    const controller = new AbortController();
    controller.abort(new Error('cancelled by test'));

    await expect(
      new DiagnosticsService().exportJsonl(filePath, {}, controller.signal),
    ).rejects.toThrow('cancelled by test');

    expect(query).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);
  });
});