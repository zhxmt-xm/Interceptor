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
    const coreRpcClient = new CoreRpcClient();
    const fakeRpcPort = new FakeRpcPort();

    coreRpcClient.attach(fakeRpcPort);

    expect(fakeRpcPort.started).toBe(true);
    expect(fakeRpcPort.sent).toHaveLength(0);
  });

  it('replaces the previous port and rejects its pending request', async () => {
    const coreRpcClient = new CoreRpcClient();
    const first = new FakeRpcPort();
    const second = new FakeRpcPort();
    coreRpcClient.attach(first);
    const pending = coreRpcClient.request(
      { type: 'echo', payload: { value: 'old' } },
      { requestId: 'request-old', traceId: 'trace-old' },
    );
    const rejection = expect(pending).rejects.toThrow('replaced');

    coreRpcClient.attach(second);

    await rejection;
    expect(first.closed).toBe(true);
    expect(first.messageListeners.size).toBe(0);
    expect(second.started).toBe(true);
  });

  it('correlates a successful response with its request and trace', async () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const response = coreRpcClient.request(
      { type: 'echo', payload: { value: 'hello' } },
      { requestId: 'request-echo', traceId: 'trace-echo' },
    );

    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      kind: 'request',
      requestId: 'request-echo',
      traceId: 'trace-echo',
    });
    fakeRpcPort.receive(successResponse('request-echo', 'trace-echo', 'hello'));

    await expect(response).resolves.toMatchObject({
      type: 'echo',
      payload: { value: 'hello' },
    });
  });

  it('returns structured Core errors', async () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const response = coreRpcClient.request(
      {
        type: 'sessions.query',
        payload: { limit: 10, sort: 'started_desc', filter: {} },
      },
      { requestId: 'request-error', traceId: 'trace-error' },
    );

    fakeRpcPort.receive({
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
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const response = coreRpcClient.request(
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
    expect(fakeRpcPort.sent.at(-1)).toEqual({
      kind: 'cancel',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: 'request-timeout',
      reason: 'timeout',
    });

    fakeRpcPort.receive(successResponse('request-timeout', 'trace-timeout', 'late'));
    expect(fakeRpcPort.closed).toBe(false);
  });

  it('sends cancel when AbortSignal aborts a request', async () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const abortController = new AbortController();
    const response = coreRpcClient.request(
      { type: 'echo', payload: { value: 'wait' } },
      {
        requestId: 'request-abort',
        abortSignal: abortController.signal,
        traceId: 'trace-abort',
      },
    );
    const rejection = expect(response).rejects.toMatchObject({
      code: 'cancelled',
    });

    abortController.abort();
    await rejection;
    expect(fakeRpcPort.sent.at(-1)).toMatchObject({
      kind: 'cancel',
      requestId: 'request-abort',
      reason: 'caller',
    });
  });

  it('rejects every pending request when the port closes', async () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const first = coreRpcClient.request(
      { type: 'echo', payload: { value: 'one' } },
      { requestId: 'request-1', traceId: 'trace-1' },
    );
    const second = coreRpcClient.request(
      { type: 'echo', payload: { value: 'two' } },
      { requestId: 'request-2', traceId: 'trace-2' },
    );
    const firstRejection = expect(first).rejects.toThrow('closed');
    const secondRejection = expect(second).rejects.toThrow('closed');

    fakeRpcPort.remoteClose();

    await firstRejection;
    await secondRejection;
  });

  it('rejects only the request when result type does not match', async () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const response = coreRpcClient.request(
      { type: 'echo', payload: { value: 'hello' } },
      { requestId: 'request-mismatch', traceId: 'trace-mismatch' },
    );
    const rejection = expect(response).rejects.toThrow('does not match');

    fakeRpcPort.receive({
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
    expect(fakeRpcPort.closed).toBe(false);
  });

  it('drops and acknowledges an invalid event batch without closing the connection', () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const onProtocolIssue = vi.fn();
    coreRpcClient.onProtocolIssue(onProtocolIssue);

    fakeRpcPort.receive({
      kind: 'event-batch',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 1,
      events: 'invalid',
    });

    expect(onProtocolIssue).toHaveBeenCalledOnce();
    expect(fakeRpcPort.sent.at(-1)).toEqual({
      kind: 'event-ack',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 1,
    });
    expect(fakeRpcPort.closed).toBe(false);
  });

  it('acknowledges a batch when the event consumer throws', () => {
    const { coreRpcClient, fakeRpcPort } = connectedClient();
    const onProtocolIssue = vi.fn();
    coreRpcClient.onProtocolIssue(onProtocolIssue);
    coreRpcClient.onCaptureEvents(() => {
      throw new Error('window was destroyed');
    });

    fakeRpcPort.receive({
      kind: 'event-batch',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 2,
      events: [],
    });

    expect(onProtocolIssue).toHaveBeenCalledWith(
      'Capture event consumer failed: window was destroyed',
    );
    expect(fakeRpcPort.sent.at(-1)).toEqual({
      kind: 'event-ack',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence: 2,
    });
    expect(fakeRpcPort.closed).toBe(false);
  });

  it('cleans up when attaching or posting fails', async () => {
    const coreRpcClient = new CoreRpcClient();
    const attachFailure = new FakeRpcPort();
    attachFailure.start = () => {
      throw new Error('start failed');
    };
    expect(() => coreRpcClient.attach(attachFailure)).toThrow('Unable to initialize');
    expect(attachFailure.closed).toBe(true);

    const fakeRpcPort = new FakeRpcPort();
    coreRpcClient.attach(fakeRpcPort);
    fakeRpcPort.postError = new Error('post failed');
    await expect(coreRpcClient.request({
      type: 'echo',
      payload: { value: 'hello' },
    })).rejects.toMatchObject({ code: 'disconnected' });
  });
});

function connectedClient(): { coreRpcClient: CoreRpcClient; fakeRpcPort: FakeRpcPort } {
  const coreRpcClient = new CoreRpcClient();
  const fakeRpcPort = new FakeRpcPort();
  coreRpcClient.attach(fakeRpcPort);
  return { coreRpcClient, fakeRpcPort };
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