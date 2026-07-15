import { randomUUID } from 'node:crypto';

import {
  CORE_PROTOCOL_VERSION,
  parseCoreToMainMessage,
  type CaptureExchangeEvent,
  type CoreCommand,
  type CoreError,
  type CoreEventBatch,
  type CoreResult,
  type CoreResultForCommand,
  type MainToCoreMessage,
} from '@interceptor/core-protocol';

export interface CoreRpcPort {
  onMessage(listener: (message: unknown) => void): () => void;
  onClose(listener: () => void): () => void;
  postMessage(message: MainToCoreMessage): void;
  start(): void;
  close(): void;
}

export interface CoreRequestOptions {
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  traceId?: string;
}

interface CoreRpcClientOptions {
  createId?: () => string;
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

const RESULT_TYPE_BY_COMMAND: Record<CoreCommand['type'], CoreResult['type']> = {
  'body.read-range': 'body.range',
  'breakpoint.resolve': 'breakpoint.resolution',
  'diagnostics.recent': 'diagnostics.records',
  'diagnostics.query': 'diagnostics.page',
  'echo': 'echo',
  'rules.get': 'rules.ruleset',
  'rules.replace': 'rules.revision',
  'rules.validate': 'rules.validation',
  'sessions.query': 'sessions.page',
  'sessions.detail': 'sessions.detail',
  'storage.status': 'storage.status',
  'storage.cleanup': 'storage.status',
  'proxy.start': 'proxy.status',
  'proxy.stop': 'proxy.status',
  'proxy.status': 'proxy.status',
  'tls.configure': 'tls.configured',
};

export class CoreRpcError extends Error {
  readonly code: CoreError['code'];
  readonly retryable: boolean;

  constructor(error: CoreError) {
    super(error.message);
    this.name = 'CoreRpcError';
    this.code = error.code;
    this.retryable = error.retryable;
  }
}

/** Main 侧唯一的 Core 业务入口：把 typed command 映射成 Promise。 */
export class CoreRpcClient {
  private readonly createId: () => string;
  private readonly pending = new Map<string, PendingRpcRequest>();
  private readonly requestTimeoutMs: number;
  private port: CoreRpcPort | null = null;
  private removeMessageListener: (() => void) | null = null;
  private removeCloseListener: (() => void) | null = null;
  private captureEventListener:
    | ((events: CaptureExchangeEvent[]) => void)
    | null = null;

  constructor(options: CoreRpcClientOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  attach(port: CoreRpcPort): void {
    // Core 每次重启都会替换 MessagePort。先拒绝旧连接上的 Promise，避免旧响应
    // 混入新进程；MessagePort 会暂存 listener 注册前到达的消息。
    this.disconnect('Core RPC connection was replaced.');
    this.port = port;

    try {
      this.removeMessageListener = port.onMessage((message) => {
        if (this.port === port) {
          this.handleResponse(message);
        }
      });
      this.removeCloseListener = port.onClose(() => {
        if (this.port === port) {
          this.disconnect('Core RPC connection closed.');
        }
      });
      port.start();
    } catch {
      this.disconnect('Unable to initialize the Core RPC connection.');
      throw new Error('Unable to initialize the Core RPC connection.');
    }
  }

  /**
   * 注册捕获事件订阅（跨 Core 重启持续）；每收到一批 event-batch 回调一次并自动 ack。
   * 调用方：CoreRuntime 向 Main 转发实时捕获事件。
   */
  onCaptureEvents(listener: (events: CaptureExchangeEvent[]) => void): void {
    this.captureEventListener = listener;
  }

  request<T extends CoreCommand>(
    command: T,
    options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    const port = this.port;
    if (!port) {
      return Promise.reject(rpcError(
        'disconnected',
        'Core RPC connection is unavailable.',
      ));
    }
    if (options.signal?.aborted) {
      return Promise.reject(rpcError(
        'cancelled',
        'The Core request was cancelled.',
      ));
    }

    const requestId = options.requestId ?? `request-${this.createId()}`;
    const traceId = options.traceId ?? `trace-${this.createId()}`;
    if (this.pending.has(requestId)) {
      return Promise.reject(rpcError(
        'conflict',
        'The request ID is already active.',
      ));
    }

    // PendingRpcRequest 自己拥有 Promise、timer 和 AbortSignal listener；
    // CoreRpcClient 只负责 requestId correlation 与底层消息收发。
    const pending = new PendingRpcRequest(command.type, traceId);
    this.pending.set(requestId, pending);
    pending.start(
      options.timeoutMs ?? this.requestTimeoutMs,
      options.signal,
      (reason) => this.cancel(requestId, reason),
    );

    try {
      port.postMessage({
        kind: 'request',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId,
        traceId,
        command,
      });
    } catch {
      this.finishWithError(
        requestId,
        rpcError('disconnected', 'Unable to send the Core request.'),
      );
    }

    return pending.promise as Promise<CoreResultForCommand<T>>;
  }

  close(): void {
    this.disconnect('Core RPC client closed.');
  }

  private handleResponse(message: unknown): void {
    const parsed = parseCoreToMainMessage(message);
    if (!parsed.ok) {
      this.disconnect(`Invalid Core response: ${parsed.error}`);
      return;
    }

    if (parsed.value.kind === 'event-batch') {
      this.handleEventBatch(parsed.value);
      return;
    }

    const response = parsed.value;
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return; // timeout/cancel 后到达的 late response 可以安全忽略。
    }

    // requestId、traceId、result type 都匹配才能完成 Promise；否则说明
    // 两端协议状态已经失去同步，继续复用这条连接是不安全的。
    if (
      response.traceId !== pending.traceId ||
      (response.ok &&
        response.result.type !== RESULT_TYPE_BY_COMMAND[pending.commandType])
    ) {
      this.disconnect('Core response does not match its request.');
      return;
    }

    this.pending.delete(response.requestId);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new CoreRpcError(response.error));
    }
  }

  /**
   * 处理一批捕获事件：回调订阅者并向 Core 发送 ack 以推进背压窗口。
   * 调用方：handleResponse 收到 event-batch 时。ack 发送失败不影响本地事件分发。
   */
  private handleEventBatch(batch: CoreEventBatch): void {
    this.captureEventListener?.(batch.events);
    try {
      this.port?.postMessage({
        kind: 'event-ack',
        protocolVersion: CORE_PROTOCOL_VERSION,
        batchSequence: batch.batchSequence,
      });
    } catch {
      // ack 发送失败最终由 Core 端窗口停滞体现；不影响已分发的事件。
    }
  }

  private cancel(
    requestId: string,
    reason: 'caller' | 'timeout',
  ): void {
    if (!this.pending.has(requestId)) {
      return;
    }
    try {
      this.port?.postMessage({
        kind: 'cancel',
        protocolVersion: CORE_PROTOCOL_VERSION,
        requestId,
        reason,
      });
    } catch {
      // 无论通知 Core 是否成功，本地 Promise 都必须完成清理。
    }
    this.finishWithError(
      requestId,
      rpcError(
        reason === 'timeout' ? 'timeout' : 'cancelled',
        reason === 'timeout'
          ? 'The Core request timed out.'
          : 'The Core request was cancelled.',
      ),
    );
  }

  private finishWithError(requestId: string, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private disconnect(message: string): void {
    const port = this.port;
    this.port = null;
    this.removeMessageListener?.();
    this.removeMessageListener = null;
    this.removeCloseListener?.();
    this.removeCloseListener = null;
    try {
      port?.close();
    } catch {
      // 即使底层 close 失败，也必须拒绝所有 pending Promise。
    }

    for (const [requestId, pending] of this.pending) {
      this.pending.delete(requestId);
      pending.reject(rpcError('disconnected', message));
    }
  }
}

/** 一个 RPC Promise 的全部本地资源，完成后统一释放。 */
class PendingRpcRequest {
  readonly promise: Promise<CoreResult>;
  private resolvePromise!: (result: CoreResult) => void;
  private rejectPromise!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private removeAbortListener: (() => void) | null = null;
  private settled = false;

  constructor(
    readonly commandType: CoreCommand['type'],
    readonly traceId: string,
  ) {
    this.promise = new Promise<CoreResult>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  start(
    timeoutMs: number,
    signal: AbortSignal | undefined,
    cancel: (reason: 'caller' | 'timeout') => void,
  ): void {
    this.timer = setTimeout(() => cancel('timeout'), timeoutMs);
    if (signal) {
      const listener = (): void => cancel('caller');
      signal.addEventListener('abort', listener, { once: true });
      this.removeAbortListener = () => signal.removeEventListener('abort', listener);
      if (signal.aborted) {
        cancel('caller');
      }
    }
  }

  resolve(result: CoreResult): void {
    if (!this.settled) {
      this.settled = true;
      this.cleanup();
      this.resolvePromise(result);
    }
  }

  reject(error: Error): void {
    if (!this.settled) {
      this.settled = true;
      this.cleanup();
      this.rejectPromise(error);
    }
  }

  private cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.removeAbortListener?.();
    this.removeAbortListener = null;
  }
}

function rpcError(code: CoreError['code'], message: string): CoreRpcError {
  return new CoreRpcError({ code, message, retryable: false });
}