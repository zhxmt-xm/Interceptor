import {
  CORE_PROTOCOL_VERSION,
  parseMainToCoreMessage,
  type CoreCommand,
  type CoreError,
  type CoreRequest,
  type CoreResult,
  type CoreToMainMessage,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from './core-diagnostics';

export interface CoreCommandExecutor {
  execute(command: CoreCommand, signal: AbortSignal): Promise<CoreResult>;
}

export class CoreCommandError extends Error {
  constructor(readonly detail: CoreError) {
    super(detail.message);
    this.name = 'CoreCommandError';
  }
}

export interface RpcMessageEvent {
  data: unknown;
}

export interface RpcMessagePort {
  on(event: 'message', listener: (event: RpcMessageEvent) => void): void;
  on(event: 'close', listener: () => void): void;
  off(event: 'message', listener: (event: RpcMessageEvent) => void): void;
  off(event: 'close', listener: () => void): void;
  postMessage(message: CoreToMainMessage): void;
  start(): void;
  close(): void;
}

interface CoreRpcServerOptions {
  now?: () => number;
  onFatalError?: (reason: string) => void;
}

interface ActiveRequest {
  connection: RpcConnection;
  controller: AbortController;
}

/**
 * Core 侧 RPC 服务器。
 *
 * 这里只处理连接、消息校验、取消和响应；command 的业务行为统一交给
 * CoreApplication。未来增加存储或代理能力时，不需要改动这套传输状态机。
 */
export class CoreRpcServer {
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly now: () => number;
  private readonly onFatalError: (reason: string) => void;
  private connection: RpcConnection | null = null;

  constructor(
    private readonly executor: CoreCommandExecutor,
    private readonly diagnostics: CoreDiagnostics,
    options: CoreRpcServerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.onFatalError = options.onFatalError ?? (() => undefined);
  }

  attach(port: RpcMessagePort): void {
    this.close('replaced');

    let connection: RpcConnection;
    connection = new RpcConnection(
      port,
      (message) => this.handleMessage(connection, message),
      () => this.fail(connection, 'remote-close'),
    );
    this.connection = connection;
    connection.start();
  }

  close(reason = 'closed'): void {
    const connection = this.connection;
    this.connection = null;

    // 替换/关闭连接时取消该连接上的所有请求。旧异步任务即使稍后结束，
    // 也无法向新连接发送响应。
    for (const [requestId, request] of this.activeRequests) {
      if (request.connection === connection) {
        request.controller.abort(reason);
        this.activeRequests.delete(requestId);
      }
    }
    connection?.close();
  }

  private handleMessage(connection: RpcConnection, rawMessage: unknown): void {
    if (this.connection !== connection) {
      return;
    }

    const parsed = parseMainToCoreMessage(rawMessage);
    if (!parsed.ok) {
      this.diagnostics.warn('rpc.invalid-message', {
        outcome: 'failed',
        errorCode: 'invalid-message',
      });
      this.fail(connection, 'invalid-message');
      return;
    }

    if (parsed.value.kind === 'cancel') {
      this.cancelRequest(
        connection,
        parsed.value.requestId,
        parsed.value.reason,
      );
      return;
    }

    void this.executeRequest(connection, parsed.value);
  }

  private async executeRequest(
    connection: RpcConnection,
    request: CoreRequest,
  ): Promise<void> {
    if (this.activeRequests.has(request.requestId)) {
      await this.respondToDuplicate(connection, request);
      return;
    }

    const activeRequest: ActiveRequest = {
      connection,
      controller: new AbortController(),
    };
    this.activeRequests.set(request.requestId, activeRequest);
    const startedAt = this.now();

    // 每个 command 自动记录相同的生命周期；Application 只补充业务 action。
    await this.diagnostics.runWithCommand(
      request.requestId,
      request.traceId,
      request.command.type,
      async () => {
        this.diagnostics.info('command.received');
        this.diagnostics.info('command.validated');
        this.diagnostics.info('handler.started');
        try {
          const result = await this.executor.execute(
            request.command,
            activeRequest.controller.signal,
          );
          if (activeRequest.controller.signal.aborted) {
            throw cancelledError();
          }
          if (!this.sendSuccess(connection, request, result)) {
            throw disconnectedError();
          }

          this.diagnostics.info('response.sent', {
            attributes: { resultType: result.type },
          });
          this.diagnostics.info('command.completed', {
            durationMs: this.now() - startedAt,
            outcome: 'success',
          });
        } catch (error) {
          const detail = readCoreError(error, activeRequest.controller.signal);
          const delivered = this.sendError(connection, request, detail);
          if (delivered) {
            this.diagnostics.info('response.sent', {
              attributes: { errorCode: detail.code },
            });
          }
          this.diagnostics.error('command.completed', {
            durationMs: this.now() - startedAt,
            outcome: toOutcome(delivered ? detail.code : 'disconnected'),
            errorCode: delivered ? detail.code : 'disconnected',
          });
        } finally {
          if (this.activeRequests.get(request.requestId) === activeRequest) {
            this.activeRequests.delete(request.requestId);
          }
        }
      },
    );
  }

  private cancelRequest(
    connection: RpcConnection,
    requestId: string,
    reason: string | undefined,
  ): void {
    const request = this.activeRequests.get(requestId);
    if (request?.connection === connection) {
      request.controller.abort(reason ?? 'caller');
    }
  }

  private async respondToDuplicate(
    connection: RpcConnection,
    request: CoreRequest,
  ): Promise<void> {
    const detail: CoreError = {
      code: 'conflict',
      message: 'A request with this ID is already active.',
      retryable: false,
    };

    await this.diagnostics.runWithCommand(
      request.requestId,
      request.traceId,
      request.command.type,
      async () => {
        this.diagnostics.info('command.received');
        this.diagnostics.info('command.validated');
        const delivered = this.sendError(connection, request, detail);
        if (delivered) {
          this.diagnostics.info('response.sent', {
            attributes: { errorCode: detail.code },
          });
        }
        this.diagnostics.error('command.completed', {
          durationMs: 0,
          outcome: 'failed',
          errorCode: delivered ? detail.code : 'disconnected',
        });
      },
    );
  }

  private sendSuccess(
    connection: RpcConnection,
    request: CoreRequest,
    result: CoreResult,
  ): boolean {
    return this.send(connection, {
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: request.requestId,
      traceId: request.traceId,
      ok: true,
      result,
    });
  }

  private sendError(
    connection: RpcConnection,
    request: CoreRequest,
    error: CoreError,
  ): boolean {
    return this.send(connection, {
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: request.requestId,
      traceId: request.traceId,
      ok: false,
      error,
    });
  }

  private send(connection: RpcConnection, message: CoreToMainMessage): boolean {
    if (this.connection !== connection || !connection.send(message)) {
      if (this.connection === connection) {
        this.fail(connection, 'send-failed');
      }
      return false;
    }
    return true;
  }

  private fail(connection: RpcConnection, reason: string): void {
    if (this.connection !== connection) {
      return;
    }
    this.close(reason);
    try {
      this.onFatalError(reason);
    } catch {
      // 故障回调不能阻止 Core 进入 Supervisor 的重启流程。
    }
  }
}

/** 封装一个 MessagePort 及其 listener 生命周期。 */
class RpcConnection {
  private readonly closeListener = (): void => this.onClose();
  private readonly messageListener = (event: RpcMessageEvent): void => {
    this.onMessage(event.data);
  };
  private closed = false;

  constructor(
    private readonly port: RpcMessagePort,
    private readonly onMessage: (message: unknown) => void,
    private readonly onClose: () => void,
  ) {}

  start(): void {
    this.port.on('message', this.messageListener);
    this.port.on('close', this.closeListener);
    this.port.start();
  }

  send(message: CoreToMainMessage): boolean {
    if (this.closed) {
      return false;
    }
    try {
      this.port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.port.off('message', this.messageListener);
    this.port.off('close', this.closeListener);
    try {
      this.port.close();
    } catch {
      // listener 已清理，剩余请求由 Server 负责取消。
    }
  }
}

function cancelledError(): CoreCommandError {
  return new CoreCommandError({
    code: 'cancelled',
    message: 'The command was cancelled.',
    retryable: false,
  });
}

function disconnectedError(): CoreCommandError {
  return new CoreCommandError({
    code: 'disconnected',
    message: 'The Core RPC connection is closed.',
    retryable: true,
  });
}

function readCoreError(error: unknown, signal: AbortSignal): CoreError {
  if (signal.aborted) {
    return cancelledError().detail;
  }
  if (error instanceof CoreCommandError) {
    return error.detail;
  }
  return {
    code: 'internal',
    message: 'The Core command failed.',
    retryable: false,
  };
}

function toOutcome(code: CoreError['code']) {
  if (code === 'cancelled') {
    return 'cancelled' as const;
  }
  if (code === 'timeout') {
    return 'timed_out' as const;
  }
  return 'failed' as const;
}