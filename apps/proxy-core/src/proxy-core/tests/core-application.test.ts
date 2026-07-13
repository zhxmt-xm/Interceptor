import { EventEmitter } from 'node:events';
import process from 'node:process';

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
        records: [
          { phase: 'action.started' },
          { phase: 'action.completed' },
        ],
      },
    });
  });

  it('rejects aborted and future-stage commands with structured errors', async () => {
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
      type: 'sessions.query',
      payload: { limit: 10, sort: 'started_desc', filter: {} },
    }, new AbortController().signal)).rejects.toMatchObject({
      detail: { code: 'unsupported-command', retryable: false },
    });
  });
});

function expectIsoTimestamp(value: string): void {
  expect(new Date(value).toISOString()).toBe(value);
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}