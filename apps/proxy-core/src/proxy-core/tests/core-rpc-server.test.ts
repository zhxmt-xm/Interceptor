import { EventEmitter } from 'node:events';

import {
  CORE_PROTOCOL_VERSION,
  type CoreResult,
  type CoreToMainMessage,
} from '@interceptor/core-protocol';
import { describe, expect, it, vi } from 'vitest';

import {
  CoreRpcServer,
  type CoreCommandHandler,
  type RpcMessagePort,
} from '../core-rpc-server';
import { CoreDiagnostics } from '../core-diagnostics';

class FakeRpcPort extends EventEmitter implements RpcMessagePort {
  readonly sent: CoreToMainMessage[] = [];
  started = false;
  closed = false;
  postError: Error | null = null;

  postMessage(message: CoreToMainMessage): void {
    if (this.postError) {
      throw this.postError;
    }
    this.sent.push(message);
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  receive(data: unknown): void {
    this.emit('message', { data });
  }

  remoteClose(): void {
    this.emit('close');
  }
}

describe('CoreRpcServer', () => {
  it('accepts a request without an extra handshake', async () => {
    const server = createServer(echoCommandHandler());
    const fakeRpcPort = new FakeRpcPort();
    server.attach(fakeRpcPort);

    fakeRpcPort.receive(request('request-1', 'trace-1', 'hello'));
    await settle();

    expect(fakeRpcPort.started).toBe(true);
    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      kind: 'response',
      requestId: 'request-1',
      ok: true,
      result: { type: 'echo', payload: { value: 'hello' } },
    });
  });

  it('isolates invalid messages without closing the connection', async () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const fakeRpcPort = new FakeRpcPort();
    server.attach(fakeRpcPort);

    fakeRpcPort.receive({ kind: 'unknown' });
    fakeRpcPort.receive({
      kind: 'request',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-invalid',
      traceId: 'trace-invalid',
      command: { payload: {} },
    });
    await settle();

    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      kind: 'response',
      requestId: 'request-invalid',
      ok: false,
      error: { code: 'invalid-message' },
    });
    expect(fakeRpcPort.closed).toBe(false);
    expect(fatal).not.toHaveBeenCalled();

    fakeRpcPort.receive(request('request-after-invalid', 'trace-after-invalid', 'ok'));
    await settle();
    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      requestId: 'request-after-invalid',
      ok: true,
    });
  });

  it('closes the previous port without treating replacement as fatal', () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const first = new FakeRpcPort();
    const second = new FakeRpcPort();

    server.attach(first);
    server.attach(second);

    expect(first.closed).toBe(true);
    expect(first.listenerCount('message')).toBe(0);
    expect(second.started).toBe(true);
    expect(fatal).not.toHaveBeenCalled();
  });

  it('ignores delayed callbacks captured from a replaced port', () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const first = new FakeRpcPort();
    const second = new FakeRpcPort();
    server.attach(first);
    const staleMessage = first.listeners('message')[0] as (
      event: { data: unknown },
    ) => void;
    const staleClose = first.listeners('close')[0] as () => void;

    server.attach(second);
    staleMessage({ data: { kind: 'invalid' } });
    staleClose();

    expect(second.closed).toBe(false);
    expect(fatal).not.toHaveBeenCalled();
  });

  it('does not send an old in-flight response to a replacement port', async () => {
    const resolvers: Array<(result: CoreResult) => void> = [];
    const executeCommand = vi.fn<CoreCommandHandler>();
    executeCommand.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));
    const server = createServer(executeCommand);
    const first = new FakeRpcPort();
    server.attach(first);
    first.receive(request('request-shared', 'trace-old', 'old'));

    const second = new FakeRpcPort();
    server.attach(second);
    second.receive(request('request-shared', 'trace-new', 'new'));

    resolvers[0]?.(echoResult('old'));
    await settle();
    expect(
      second.sent.some(
        (message) =>
          message.kind === 'response' && message.traceId === 'trace-old',
      ),
    ).toBe(false);

    resolvers[1]?.(echoResult('new'));
    await settle();
    expect(second.sent.at(-1)).toMatchObject({
      requestId: 'request-shared',
      traceId: 'trace-new',
      ok: true,
    });
  });

  it('treats remote close as fatal but isolates one send failure', async () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const remoteClose = new FakeRpcPort();
    server.attach(remoteClose);
    remoteClose.remoteClose();
    expect(fatal).toHaveBeenCalledWith('remote-close');

    const sendFailure = new FakeRpcPort();
    sendFailure.postError = new Error('closed');
    server.attach(sendFailure);
    sendFailure.receive(request('request-send', 'trace-send', 'hello'));
    await settle();
    expect(sendFailure.closed).toBe(false);
    expect(fatal).not.toHaveBeenCalledWith('send-failed');

    sendFailure.postError = null;
    sendFailure.receive(request('request-after-send', 'trace-after-send', 'ok'));
    await settle();
    expect(sendFailure.sent.at(-1)).toMatchObject({
      requestId: 'request-after-send',
      ok: true,
    });
  });

  it('keeps the connection after one event batch send failure', () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const fakeRpcPort = new FakeRpcPort();
    server.attach(fakeRpcPort);
    fakeRpcPort.postError = new Error('message rejected');

    expect(server.sendEventBatch([{
      kind: 'exchange-added',
      summary: {
        id: 'exchange-1',
        method: 'GET',
        secure: false,
        protocol: 'h1',
        state: 'completed',
        startedAt: 1,
        requestBytes: 0,
        responseBytes: 0,
      },
    }])).toBeNull();
    expect(fakeRpcPort.closed).toBe(false);
    expect(fatal).not.toHaveBeenCalled();

    fakeRpcPort.postError = null;
    expect(server.sendEventBatch([{
      kind: 'exchange-added',
      summary: {
        id: 'exchange-1',
        method: 'GET',
        secure: false,
        protocol: 'h1',
        state: 'completed',
        startedAt: 1,
        requestBytes: 0,
        responseBytes: 0,
      },
    }])).not.toBeNull();
  });

  it('forwards the exact event batch acknowledgement sequence', () => {
    const handleEventAck = vi.fn();
    const coreRpcServer = new CoreRpcServer({
      coreDiagnostics: createDiagnostics(),
      executeCommand: echoCommandHandler(),
      handleRpcFatalError: vi.fn(),
      handleEventAck,
    });
    const fakeRpcPort = new FakeRpcPort();
    coreRpcServer.attach(fakeRpcPort);

    fakeRpcPort.receive({
      kind: 'event-ack',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 42,
    });

    expect(handleEventAck).toHaveBeenCalledOnce();
    expect(handleEventAck).toHaveBeenCalledWith(42);
    expect(fakeRpcPort.closed).toBe(false);
  });

  it('records a concise command.completed trace', async () => {
    const coreDiagnostics = createDiagnostics();
    const coreRpcServer = new CoreRpcServer({
      coreDiagnostics,
      executeCommand: echoCommandHandler(),
      handleRpcFatalError: () => undefined,
      handleEventAck: () => undefined,
    });
    const fakeRpcPort = new FakeRpcPort();
    coreRpcServer.attach(fakeRpcPort);

    fakeRpcPort.receive(request('request-trace', 'trace-complete', 'hello'));
    await settle();

    expect(coreDiagnostics.recent(20, 'trace-complete').records.map(
      ({ phase }) => phase,
    )).toEqual(['command.completed']);
  });

  it('rejects duplicate request IDs and cancels active requests', async () => {
    const executeCommand = vi.fn<CoreCommandHandler>();
    executeCommand.mockImplementation((_command, abortSignal) => new Promise(
      (_resolve, reject) => {
        abortSignal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      },
    ));
    const server = createServer(executeCommand);
    const fakeRpcPort = new FakeRpcPort();
    server.attach(fakeRpcPort);
    const first = request('request-active', 'trace-first', 'first');
    fakeRpcPort.receive(first);
    fakeRpcPort.receive({ ...first, traceId: 'trace-duplicate' });
    await settle();
    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });

    fakeRpcPort.receive({
      kind: 'cancel',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-active',
      reason: 'caller',
    });
    await settle();
    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      requestId: 'request-active',
      ok: false,
      error: { code: 'cancelled' },
    });
  });
});

function createServer(
  executeCommand: CoreCommandHandler,
  onFatalError = vi.fn(),
): CoreRpcServer {
  return new CoreRpcServer({
    coreDiagnostics: createDiagnostics(),
    executeCommand,
    handleRpcFatalError: onFatalError,
    handleEventAck: () => undefined,
  });
}

function createDiagnostics(): CoreDiagnostics {
  return new CoreDiagnostics({ sink: () => undefined });
}

function echoCommandHandler(): CoreCommandHandler {
  const executeCommand = vi.fn<CoreCommandHandler>();
  executeCommand.mockImplementation(async (command) => {
    if (command.type !== 'echo') {
      throw new Error('Unexpected command');
    }
    return echoResult(command.payload.value);
  });
  return executeCommand;
}

function request(requestId: string, traceId: string, value: string) {
  return {
    kind: 'request' as const,
    protocolVersion: CORE_PROTOCOL_VERSION,
    requestId,
    traceId,
    command: { type: 'echo' as const, payload: { value } },
  };
}

function echoResult(value: string): CoreResult {
  return {
    type: 'echo',
    payload: { value, handledAt: '2026-07-12T00:00:00.000Z' },
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}