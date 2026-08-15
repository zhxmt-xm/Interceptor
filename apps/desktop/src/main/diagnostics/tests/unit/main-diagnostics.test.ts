import type { DiagnosticIngestPayload } from '@interceptor/core-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MainDiagnostics } from '../../main-diagnostics';
import type { MainDiagnosticsTransport } from '../../../interfaces';

class FakeTransport implements MainDiagnosticsTransport {
  readonly records: DiagnosticIngestPayload[] = [];
  failure: Error | null = null;

  async ingestDiagnostic(payload: DiagnosticIngestPayload): Promise<void> {
    if (this.failure) {
      const failure = this.failure;
      this.failure = null;
      throw failure;
    }
    this.records.push(payload);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MainDiagnostics', () => {
  it('forwards fixed Main and Renderer sources asynchronously', async () => {
    const fakeTransport = new FakeTransport();
    const mainDiagnostics = new MainDiagnostics(fakeTransport);

    mainDiagnostics.warn('main.core-runtime.status', {
      attributes: { state: 'restarting' },
    });
    mainDiagnostics.rendererError('renderer.uncaught-error', {
      errorCode: 'TypeError',
      attributes: { message: 'render failed' },
    });
    expect(fakeTransport.records).toEqual([]);
    await settle();

    expect(fakeTransport.records).toEqual([
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

  it('retains transport failures and sends every record after recovery', async () => {
    const fakeTransport = new FakeTransport();
    fakeTransport.failure = new Error('disconnected');
    const mainDiagnostics = new MainDiagnostics(fakeTransport);

    expect(() => mainDiagnostics.error('main.ipc.failed')).not.toThrow();
    await settle();
    expect(fakeTransport.records).toEqual([]);
    mainDiagnostics.info('main.core-runtime.status');
    await settle();

    expect(fakeTransport.records.map(({ phase }) => phase)).toEqual([
      'main.ipc.failed',
      'main.core-runtime.status',
    ]);
  });
});

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}