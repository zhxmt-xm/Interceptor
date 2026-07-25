import { EventEmitter } from 'node:events';
import process from 'node:process';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

import type { CoreToMainMessage } from '@interceptor/core-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CoreApplication,
  type CoreLifecycleMessage,
  type CoreParentPort,
  type ParentMessageEvent,
} from '../core-application';
import {
  CoreCommandError,
  type RpcMessagePort,
} from '../core-rpc-server';
import type { StorageService } from '../storage/entry';
import type { CleanupScope } from '../storage/interfaces';
import type { HarService } from '../har/entry';
import type { ProxyService } from '../proxy/entry';
import type { CaptureEventQueue } from '../proxy/proxy-capture-event-queue';

class FakeParentPort implements CoreParentPort {
  readonly sent: CoreLifecycleMessage[] = [];
  private messageListener: ((event: ParentMessageEvent) => void) | null = null;

  on(
    _event: 'message',
    listener: (event: ParentMessageEvent) => void,
  ): void {
    this.messageListener = listener;
  }

  postMessage(message: CoreLifecycleMessage): void {
    this.sent.push(message);
  }

  receive(data: unknown, ports?: unknown[]): void {
    this.messageListener?.({ data, ports });
  }
}

class FakeRpcPort extends EventEmitter implements RpcMessagePort {
  started = false;
  closed = false;

  postMessage(_message: CoreToMainMessage): void {}

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }
}

describe('CoreApplication', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(async () => {
    await settle();
    vi.restoreAllMocks();
  });

  it('owns lifecycle, heartbeat, RPC attachment, and graceful shutdown', async () => {
    const parentPort = new FakeParentPort();
    const rpcPort = new FakeRpcPort();
    const exitProcess = vi.spyOn(process, 'exit').mockImplementation(
      (() => undefined) as never,
    );
    const application = new CoreApplication(parentPort);

    application.start();
    parentPort.receive({ type: 'rpc-port' }, [rpcPort]);
    parentPort.receive({ type: 'shutdown' });
    await settleShutdown(parentPort);
    await settle();

    expect(parentPort.sent).toEqual([
      {
        type: 'ready',
        pid: process.pid,
        startedAt: expect.any(String),
      },
      {
        type: 'heartbeat',
        pid: process.pid,
        timestamp: expect.any(String),
      },
      {
        type: 'stopped',
        pid: process.pid,
        timestamp: expect.any(String),
      },
    ]);
    for (const message of parentPort.sent) {
      if (message.type === 'fatal') {
        continue;
      }
      expectIsoTimestamp(
        message.type === 'ready' ? message.startedAt : message.timestamp,
      );
    }
    expect(rpcPort.started).toBe(true);
    expect(rpcPort.closed).toBe(true);
    expect(exitProcess).toHaveBeenCalledWith(0);
  });

  it('executes echo and records its business action', async () => {
    const application = new CoreApplication(new FakeParentPort());

    const result = await application.executeCommand(
      { type: 'echo', payload: { value: 'hello' } },
      new AbortController().signal,
    );

    if (result.type !== 'echo') {
      throw new Error(`Unexpected result type: ${result.type}`);
    }
    expect(result).toMatchObject({
      type: 'echo',
      payload: {
        value: 'hello',
        handledAt: expect.any(String),
      },
    });
    expectIsoTimestamp(result.payload.handledAt);
  });

  it('returns recent diagnostics through its command API', async () => {
    const application = new CoreApplication(new FakeParentPort());
    await application.executeCommand(
      { type: 'echo', payload: { value: 'hello' } },
      new AbortController().signal,
    );

    const result = await application.executeCommand({
      type: 'diagnostics.recent',
      payload: { limit: 10 },
    }, new AbortController().signal);

    expect(result).toMatchObject({
      type: 'diagnostics.records',
      payload: {
        droppedCount: 0,
        records: [{ phase: 'action.completed' }],
      },
    });
  });

  it('rejects aborted commands and unavailable subsystems with structured errors', async () => {
    const application = new CoreApplication(new FakeParentPort());
    const controller = new AbortController();
    controller.abort();

    await expect(application.executeCommand(
      { type: 'echo', payload: { value: 'cancelled' } },
      controller.signal,
    )).rejects.toMatchObject({
      detail: {
        code: 'cancelled',
        message: 'The command was cancelled.',
        retryable: false,
      },
    } satisfies Partial<CoreCommandError>);

    await expect(application.executeCommand({
      type: 'breakpoint.resolve',
      payload: { breakpointId: 'bp-1', action: 'continue' },
    }, new AbortController().signal)).rejects.toMatchObject({
      detail: { code: 'internal', retryable: false },
    });
  });

  it('returns an internal error for storage commands when storage is unavailable', async () => {
    const application = new CoreApplication(new FakeParentPort());
    await expect(
      application.executeCommand(
        { type: 'storage.status', payload: {} },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ detail: { code: 'internal' } });
  });

  it('routes HAR start commands to the HAR facade and get/cancel to the shared job manager', async () => {
    const calls: string[] = [];
    const snapshot = {
      id: 'har-job-1',
      kind: 'har-export' as const,
      state: 'running' as const,
      fileName: 'capture.har',
      processed: 0,
      total: 2,
      startedAt: '2026-07-17T10:00:00.000Z',
      warnings: [],
    };
    const har = {
      startExport: () => {
        calls.push('start-export');
        return snapshot;
      },
      startImport: () => {
        calls.push('start-import');
        return { ...snapshot, kind: 'har-import' as const };
      },
    } as unknown as HarService;
    const application = new CoreApplication(new FakeParentPort(), {
      harService: har,
    });
    const signal = new AbortController().signal;

    await expect(application.executeCommand({
      type: 'har.export.start',
      payload: {
        jobId: 'har-job-1',
        filePath: 'C:\\Exports\\capture.har',
        scope: { kind: 'all' },
        redaction: { authorization: true, cookies: true, bodies: false },
      },
    }, signal)).resolves.toMatchObject({
      type: 'transfer.job',
      payload: { job: { kind: 'har-export', state: 'running' } },
    });
    await expect(application.executeCommand({
      type: 'har.import.start',
      payload: {
        jobId: 'har-job-2',
        filePath: 'C:\\Imports\\capture.har',
      },
    }, signal)).resolves.toMatchObject({
      payload: { job: { kind: 'har-import' } },
    });
    // get/cancel now target the shared TransferJobManager; the injected fake HAR
    // facade does not register jobs there, so unknown IDs resolve to null.
    await expect(application.executeCommand({
      type: 'transfer.job.get',
      payload: { jobId: 'har-job-1' },
    }, signal)).resolves.toMatchObject({
      payload: { job: null },
    });
    await expect(application.executeCommand({
      type: 'transfer.job.cancel',
      payload: { jobId: 'har-job-1' },
    }, signal)).resolves.toMatchObject({
      payload: { job: null },
    });
    expect(calls).toEqual(['start-export', 'start-import']);
  });

  it('routes storage commands to the injected StorageService', async () => {
    const calls: string[] = [];
    const cleanupScopes: CleanupScope[] = [];
    let eventQueueResets = 0;
    const storage = {
      initialize: () => Promise.resolve(),
      querySessions: () => {
        calls.push('query');
        return Promise.resolve({
          items: [
            {
              id: 'e1',
              method: 'GET',
              secure: true,
              protocol: 'http/1.1',
              state: 'completed',
              startedAt: 1,
              requestBytes: 0,
              responseBytes: 0,
            },
            {
              id: 'e2',
              method: 'GET',
              secure: true,
              protocol: 'http/1.1',
              state: 'completed',
              startedAt: 2,
              requestBytes: 0,
              responseBytes: 0,
            },
          ],
          nextCursor: undefined,
          hasMore: false,
        });
      },
      status: () => {
        calls.push('status');
        return Promise.resolve({
          sessionCount: 1,
          exchangeCount: 2,
          bodyCount: 0,
          databaseBytes: 4_096,
          blobBytes: 0,
          totalBytes: 4_096,
        });
      },
      cleanup: (scope: CleanupScope) => {
        calls.push('cleanup');
        cleanupScopes.push(scope);
        return Promise.resolve({
          sessionCount: 0,
          exchangeCount: 0,
          bodyCount: 0,
          databaseBytes: 4_096,
          blobBytes: 0,
          totalBytes: 4_096,
        });
      },
      getExchangeDetail: (exchangeId: string) => {
        calls.push('detail');
        return Promise.resolve({
          summary: {
            id: exchangeId,
            method: 'GET',
            secure: true,
            protocol: 'http/1.1',
            state: 'completed',
            startedAt: 1,
            requestBytes: 0,
            responseBytes: 5,
          },
          url: 'https://api.test/e1',
          requestHeaders: [],
          responseHeaders: [],
        });
      },
      queryWebSocketFrames: () => {
        calls.push('websocket');
        return Promise.resolve({
          items: [
            {
              seq: 1,
              direction: 'client-to-server' as const,
              opcode: 1 as const,
              timestamp: 1_000,
              payloadSize: 5,
            },
          ],
          nextCursor: 'ws-cursor',
          hasMore: false,
        });
      },
      readBodyRange: () => {
        calls.push('body');
        return Promise.resolve(Buffer.from('hello'));
      },
      exportBodyToFile: (
        _bodyId: string,
        _filePath: string,
        _signal: AbortSignal,
        onProgress: (progress: { processed: number; total: number }) => void,
      ) => {
        calls.push('body-export');
        onProgress({ processed: 5, total: 5 });
        return Promise.resolve({ processed: 5, total: 5, warnings: [] });
      },
      dispose: () => Promise.resolve(),
      attachDiagnostics: () => undefined,
    } as unknown as StorageService;
    const proxy = {
      attachDiagnostics: () => undefined,
      prepareCaptureReset: () => 'active-session',
    } as unknown as ProxyService;
    const captureEventQueue = {
      reset: () => {
        eventQueueResets += 1;
      },
    } as unknown as CaptureEventQueue;
    const application = new CoreApplication(new FakeParentPort(), {
      storageService: storage,
      proxyService: proxy,
      captureEventQueue,
    });
    const signal = new AbortController().signal;

    await expect(
      application.executeCommand(
        {
          type: 'sessions.query',
          payload: { limit: 10, sort: 'started_desc', filter: {} },
        },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'sessions.page',
      payload: {
        items: [{ id: 'e1' }, { id: 'e2' }],
        hasMore: false,
      },
    });

    await expect(
      application.executeCommand(
        {
          type: 'grpc.messages',
          payload: { exchangeId: 'e1', side: 'response', limit: 10 },
        },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'grpc.messages',
      payload: {
        recognized: false,
        side: 'response',
        items: [],
        hasMore: false,
      },
    });

    await expect(
      application.executeCommand(
        { type: 'sessions.detail', payload: { exchangeId: 'e1' } },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'sessions.detail',
      payload: { detail: { url: 'https://api.test/e1' } },
    });

    await expect(
      application.executeCommand(
        {
          type: 'websocket.frames',
          payload: { exchangeId: 'e1', limit: 100 },
        },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'websocket.frames',
      payload: {
        items: [{ seq: 1, opcode: 1 }],
        hasMore: false,
        breakpointsEnabled: false,
      },
    });

    await expect(
      application.executeCommand(
        { type: 'body.read-range', payload: { bodyId: 'a'.repeat(64), offset: 0, length: 1024 } },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'body.range',
      payload: { bodyId: 'a'.repeat(64), offset: 0, end: true },
    });

    await expect(
      application.executeCommand(
        {
          type: 'body.export.start',
          payload: {
            jobId: 'body-export-test',
            filePath: 'C:\\Exports\\body.bin',
            bodyId: 'a'.repeat(64),
          },
        },
        signal,
      ),
    ).resolves.toMatchObject({
      type: 'transfer.job',
      payload: { job: { kind: 'body-export', state: 'running' } },
    });

    await expect(
      application.executeCommand(
        { type: 'storage.cleanup', payload: { scope: 'all' } },
        signal,
      ),
    ).resolves.toMatchObject({ type: 'storage.status' });

    expect(calls).toEqual([
      'query',
      'detail',
      'detail',
      'websocket',
      'body',
      'body-export',
      'cleanup',
    ]);
    expect(cleanupScopes).toEqual([
      { kind: 'all-except-session', sessionId: 'active-session' },
    ]);
    expect(eventQueueResets).toBe(1);
  });

  it('decodes a gzip body on demand when body.read-range requests decode', async () => {
    const gzipped = zlib.gzipSync(Buffer.from('{"decoded":true}'));
    const storage = {
      initialize: () => Promise.resolve(),
      readBodyRange: () => Promise.resolve(gzipped),
      openBlobStream: () => Readable.from([gzipped]),
      dispose: () => Promise.resolve(),
      attachDiagnostics: () => undefined,
    } as unknown as StorageService;
    const application = new CoreApplication(new FakeParentPort(), {
      storageService: storage,
    });
    const signal = new AbortController().signal;

    const result = await application.executeCommand(
      {
        type: 'body.read-range',
        payload: {
          bodyId: 'a'.repeat(64),
          offset: 0,
          length: 1024,
          decode: true,
          encoding: 'gzip',
        },
      },
      signal,
    );

    expect(result.type).toBe('body.range');
    if (result.type === 'body.range') {
      expect(result.payload.decodeStatus).toBe('ok');
      expect(result.payload.end).toBe(true);
      expect(new TextDecoder().decode(result.payload.data)).toBe(
        '{"decoded":true}',
      );
    }
  });
});

function expectIsoTimestamp(value: string): void {
  expect(new Date(value).toISOString()).toBe(value);
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function settleShutdown(parentPort: FakeParentPort): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    if (parentPort.sent.some((message) => message.type === 'stopped')) {
      return;
    }
    await settle();
  }
  throw new Error('Core shutdown did not complete within ten event-loop turns.');
}