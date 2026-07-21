import {
  CORE_PROTOCOL_VERSION,
  type CoreToMainMessage,
  type MainToCoreMessage,
} from '@interceptor/core-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoreRpcClient } from '../core-rpc-client';
import { CoreRpcError } from '../core-rpc-error';
import type { CoreRpcPort } from '../../interfaces';

class FakeRpcPort implements CoreRpcPort {
  readonly sent: MainToCoreMessage[] = [];
  readonly messageListeners = new Set<(message: unknown) => void>();
  readonly closeListeners = new Set<() => void>();
  started = false;
  closed = false;
  postError: Error | null = null;

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  postMessage(message: MainToCoreMessage): void {
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

  receive(message: CoreToMainMessage | unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  remoteClose(): void {
    for (const listener of this.closeListeners) {
      listener();
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CoreRpcClient', () => {
  it('attaches a port without an extra handshake', () => {
    const client = new CoreRpcClient();
    const port = new FakeRpcPort();

    client.attach(port);

    expect(port.started).toBe(true);
    expect(port.sent).toHaveLength(0);
  });

  it('replaces the previous port and rejects its pending request', async () => {
    const client = new CoreRpcClient();
    const first = new FakeRpcPort();
    const second = new FakeRpcPort();
    client.attach(first);
    const pending = client.request(
      { type: 'echo', payload: { value: 'old' } },
      { requestId: 'request-old', traceId: 'trace-old' },
    );
    const rejection = expect(pending).rejects.toThrow('replaced');

    client.attach(second);

    await rejection;
    expect(first.closed).toBe(true);
    expect(first.messageListeners.size).toBe(0);
    expect(second.started).toBe(true);
  });

  it('correlates a successful response with its request and trace', async () => {
    const { client, port } = connectedClient();
    const response = client.request(
      { type: 'echo', payload: { value: 'hello' } },
      { requestId: 'request-echo', traceId: 'trace-echo' },
    );

    expect(port.sent.at(-1)).toMatchObject({
      kind: 'request',
      requestId: 'request-echo',
      traceId: 'trace-echo',
    });
    port.receive(successResponse('request-echo', 'trace-echo', 'hello'));

    await expect(response).resolves.toMatchObject({
      type: 'echo',
      payload: { value: 'hello' },
    });
  });

  it('returns structured Core errors', async () => {
    const { client, port } = connectedClient();
    const response = client.request(
      {
        type: 'sessions.query',
        payload: { limit: 10, sort: 'started_desc', filter: {} },
      },
      { requestId: 'request-error', traceId: 'trace-error' },
    );

    port.receive({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-error',
      traceId: 'trace-error',
      ok: false,
      error: {
        code: 'unsupported-command',
        message: 'Not implemented yet.',
        retryable: false,
      },
    });

    await expect(response).rejects.toMatchObject({
      code: 'unsupported-command',
      retryable: false,
    } satisfies Partial<CoreRpcError>);
  });

  it('times out, sends cancel, and ignores a late response', async () => {
    vi.useFakeTimers();
    const { client, port } = connectedClient();
    const response = client.request(
      { type: 'echo', payload: { value: 'slow' } },
      {
        requestId: 'request-timeout',
        traceId: 'trace-timeout',
        timeoutMs: 100,
      },
    );
    const rejection = expect(response).rejects.toMatchObject({ code: 'timeout' });

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(port.sent.at(-1)).toEqual({
      kind: 'cancel',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-timeout',
      reason: 'timeout',
    });

    port.receive(successResponse('request-timeout', 'trace-timeout', 'late'));
    expect(port.closed).toBe(false);
  });

  it('sends cancel when AbortSignal aborts a request', async () => {
    const { client, port } = connectedClient();
    const controller = new AbortController();
    const response = client.request(
      { type: 'echo', payload: { value: 'wait' } },
      {
        requestId: 'request-abort',
        signal: controller.signal,
        traceId: 'trace-abort',
      },
    );
    const rejection = expect(response).rejects.toMatchObject({
      code: 'cancelled',
    });

    controller.abort();
    await rejection;
    expect(port.sent.at(-1)).toMatchObject({
      kind: 'cancel',
      requestId: 'request-abort',
      reason: 'caller',
    });
  });

  it('rejects every pending request when the port closes', async () => {
    const { client, port } = connectedClient();
    const first = client.request(
      { type: 'echo', payload: { value: 'one' } },
      { requestId: 'request-1', traceId: 'trace-1' },
    );
    const second = client.request(
      { type: 'echo', payload: { value: 'two' } },
      { requestId: 'request-2', traceId: 'trace-2' },
    );
    const firstRejection = expect(first).rejects.toThrow('closed');
    const secondRejection = expect(second).rejects.toThrow('closed');

    port.remoteClose();

    await firstRejection;
    await secondRejection;
  });

  it('disconnects when result type does not match the command', async () => {
    const { client, port } = connectedClient();
    const response = client.request(
      { type: 'echo', payload: { value: 'hello' } },
      { requestId: 'request-mismatch', traceId: 'trace-mismatch' },
    );
    const rejection = expect(response).rejects.toThrow('does not match');

    port.receive({
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-mismatch',
      traceId: 'trace-mismatch',
      ok: true,
      result: {
        type: 'sessions.page',
        payload: { items: [], hasMore: false },
      },
    });

    await rejection;
    expect(port.closed).toBe(true);
  });

  it('cleans up when attaching or posting fails', async () => {
    const client = new CoreRpcClient();
    const attachFailure = new FakeRpcPort();
    attachFailure.start = () => {
      throw new Error('start failed');
    };
    expect(() => client.attach(attachFailure)).toThrow('Unable to initialize');
    expect(attachFailure.closed).toBe(true);

    const port = new FakeRpcPort();
    client.attach(port);
    port.postError = new Error('post failed');
    await expect(client.request({
      type: 'echo',
      payload: { value: 'hello' },
    })).rejects.toMatchObject({ code: 'disconnected' });
  });
});

function connectedClient(): { client: CoreRpcClient; port: FakeRpcPort } {
  const client = new CoreRpcClient();
  const port = new FakeRpcPort();
  client.attach(port);
  return { client, port };
}

function successResponse(
  requestId: string,
  traceId: string,
  value: string,
): CoreToMainMessage {
  return {
    kind: 'response',
    protocolVersion: CORE_PROTOCOL_VERSION,
    requestId,
    traceId,
    ok: true,
    result: {
      type: 'echo',
      payload: {
        value,
        handledAt: '2026-07-12T00:00:00.000Z',
      },
    },
  };
}