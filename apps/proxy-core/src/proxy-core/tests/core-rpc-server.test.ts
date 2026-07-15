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
    const port = new FakeRpcPort();
    server.attach(port);

    port.receive(request('request-1', 'trace-1', 'hello'));
    await settle();

    expect(port.started).toBe(true);
    expect(port.sent.at(-1)).toMatchObject({
      kind: 'response',
      requestId: 'request-1',
      ok: true,
      result: { type: 'echo', payload: { value: 'hello' } },
    });
  });

  it('closes a connection that sends an invalid message', () => {
    const fatal = vi.fn();
    const server = createServer(echoCommandHandler(), fatal);
    const port = new FakeRpcPort();
    server.attach(port);

    port.receive({ kind: 'unknown' });

    expect(port.closed).toBe(true);
    expect(fatal).toHaveBeenCalledWith('invalid-message');
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

  it('reports remote close and send failure as fatal', async () => {
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
    expect(fatal).toHaveBeenCalledWith('send-failed');
  });

  it('records a concise command.completed trace', async () => {
    const diagnostics = createDiagnostics();
    const server = new CoreRpcServer({
      diagnostics,
      executeCommand: echoCommandHandler(),
      handleRpcFatalError: () => undefined,
      handleEventAck: () => undefined,
    });
    const port = new FakeRpcPort();
    server.attach(port);

    port.receive(request('request-trace', 'trace-complete', 'hello'));
    await settle();

    expect(diagnostics.recent(20, 'trace-complete').records.map(
      ({ phase }) => phase,
    )).toEqual(['command.completed']);
  });

  it('rejects duplicate request IDs and cancels active requests', async () => {
    const executeCommand = vi.fn<CoreCommandHandler>();
    executeCommand.mockImplementation((_command, signal) => new Promise(
      (_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      },
    ));
    const server = createServer(executeCommand);
    const port = new FakeRpcPort();
    server.attach(port);
    const first = request('request-active', 'trace-first', 'first');
    port.receive(first);
    port.receive({ ...first, traceId: 'trace-duplicate' });
    await settle();
    expect(port.sent.at(-1)).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });

    port.receive({
      kind: 'cancel',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-active',
      reason: 'caller',
    });
    await settle();
    expect(port.sent.at(-1)).toMatchObject({
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
    diagnostics: createDiagnostics(),
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