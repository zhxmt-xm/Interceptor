import type { DiagnosticIngestPayload } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MainDiagnostics } from '../main-diagnostics';
import type { MainDiagnosticsTransport } from '../../interfaces';

class FakeTransport implements MainDiagnosticsTransport {
  readonly records: DiagnosticIngestPayload[] = [];
  failure: Error | null = null;

  async ingestDiagnostic(payload: DiagnosticIngestPayload): Promise<void> {
    this.records.push(payload);
    if (this.failure) {
      const failure = this.failure;
      this.failure = null;
      throw failure;
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MainDiagnostics', () => {
  it('forwards fixed Main and Renderer sources asynchronously', async () => {
    const transport = new FakeTransport();
    const diagnostics = new MainDiagnostics(transport);

    diagnostics.warn('main.core-runtime.status', {
      attributes: { state: 'restarting' },
    });
    diagnostics.rendererError('renderer.uncaught-error', {
      errorCode: 'TypeError',
      attributes: { message: 'render failed' },
    });
    expect(transport.records).toEqual([]);
    await settle();

    expect(transport.records).toEqual([
      {
        process: 'main',
        level: 'warn',
        phase: 'main.core-runtime.status',
        attributes: { state: 'restarting' },
      },
      {
        process: 'renderer',
        level: 'error',
        phase: 'renderer.uncaught-error',
        errorCode: 'TypeError',
        attributes: { message: 'render failed' },
      },
    ]);
  });

  it('contains transport failures and reports an aggregate drop later', async () => {
    const transport = new FakeTransport();
    transport.failure = new Error('disconnected');
    const diagnostics = new MainDiagnostics(transport);

    expect(() => diagnostics.error('main.ipc.failed')).not.toThrow();
    await settle();
    diagnostics.info('main.core-runtime.status');
    await settle();

    expect(transport.records).toEqual([
      {
        process: 'main',
        level: 'error',
        phase: 'main.ipc.failed',
      },
      {
        process: 'main',
        level: 'warn',
        phase: 'main.diagnostics.dropped',
        attributes: { count: 1 },
      },
      {
        process: 'main',
        level: 'info',
        phase: 'main.core-runtime.status',
      },
    ]);
  });
});

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}