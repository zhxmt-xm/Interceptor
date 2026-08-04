import {
  CORE_PROTOCOL_VERSION,
  parseMainToCoreMessage,
  type CaptureExchangeEvent,
  type ClientAppIdentity,
  type CoreCommand,
  type CoreError,
  type CoreRequest,
  type CoreResult,
  type CoreToMainMessage,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from './core-diagnostics';

/**
 * 诊断查询命令自身不写生命周期 trace：Renderer 会周期轮询 diagnostics.recent，
 * 若记录会用查询日志刷屏并把真正有用的命令挤出有界内存 ring buffer。
 */
const SILENT_COMMANDS: ReadonlySet<CoreCommand['type']> = new Set([
  'diagnostics.recent',
  'diagnostics.ingest',
  'diagnostics.query',
]);

export type CoreCommandHandler = (
  command: CoreCommand,
  abortSignal: AbortSignal,
) => Promise<CoreResult>;

/**
 * 业务 handler 主动返回给 RPC 边界的结构化错误。
 * 调用方：CoreApplication command 路由及后续业务 Service；CoreRpcServer 将 detail
 * 原样映射为失败 response，其他未知异常统一收敛为 internal。
 */
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

/**
 * CoreRpcServer 回调的宿主（CoreApplication 实现）：注入宿主而非闭包，避免在装配处构造
 * executeCommand/fatal/ack 闭包函数。
 */
export interface CoreRpcHost {
  readonly coreDiagnostics: CoreDiagnostics;
  executeCommand(command: CoreCommand, abortSignal: AbortSignal): Promise<CoreResult>;
  handleRpcFatalError(reason: string): void;
  handleEventAck(batchSequence: number): void;
}

interface ActiveRequest {
  rpcConnection: RpcConnection;
  abortController: AbortController;
}

/**
 * Proxy Core 内的 MessagePort RPC 状态机。
 *
 * 只拥有当前连接、活动请求、信封关联、取消和 response 投递；command 业务行为
 * 委托给 CoreApplication 注入的 executeCommand。数据/请求错误只影响单条消息；
 * 只有真实 remote close 属于传输故障并让 Core 退出恢复；单次 postMessage 失败只影响
 * 当前 response/event，连接保留给后续消息。
 */
export class CoreRpcServer {
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly coreDiagnostics: CoreDiagnostics;
  private rpcConnection: RpcConnection | null = null;
  private eventBatchSequence = 0;

  /**
   * 绑定 RPC host（CoreApplication）：command 执行、诊断、fatal 与 event-ack 都回调其方法。
   * 调用方：CoreApplication 构造时创建一个 Server。
   */
  constructor(private readonly host: CoreRpcHost) {
    this.coreDiagnostics = host.coreDiagnostics;
  }

  /**
   * 将新 MessagePort 设为唯一当前连接，并开始接收 request/cancel。
   * 调用方：CoreApplication 收到 Main 转交的 rpc-port；测试也用于验证 replacement。
   * 新连接会先正常关闭旧连接并取消旧请求，但 replacement 本身不触发 fatal。
   */
  attach(rpcMessagePort: RpcMessagePort): void {
    this.close('replaced');

    let rpcConnection: RpcConnection;
    rpcConnection = new RpcConnection(
      rpcMessagePort,
      (message) => this.handleMessage(rpcConnection, message),
      () => this.fail(rpcConnection, 'remote-close'),
    );
    this.rpcConnection = rpcConnection;
    rpcConnection.start();
    this.coreDiagnostics.info('rpc.connected');
  }

  /**
   * 关闭当前连接，并 abort 只属于该连接的全部活动请求。
   * 调用方：attach 的连接替换、CoreApplication.stop，以及 fail 的故障清理。
   * 已经从旧连接捕获的异步任务稍后结束时也无法向新连接发送 response。
   */
  close(reason = 'closed'): void {
    const rpcConnection = this.rpcConnection;
    this.rpcConnection = null;

    // 替换/关闭连接时取消该连接上的所有请求。旧异步任务即使稍后结束，
    // 也无法向新连接发送响应。
    for (const [requestId, request] of this.activeRequests) {
      if (request.rpcConnection === rpcConnection) {
        request.abortController.abort(reason);
        this.activeRequests.delete(requestId);
      }
    }
    rpcConnection?.close();
  }

  /**
  * 解析当前连接收到的信封，并分派 cancel 或异步 request 执行。
  * 调用方：RpcConnection message listener；旧连接延迟到达的 callback 会被忽略。
  * 非法信封只丢弃或对可关联 request 返回错误，不关闭连接。
   */
  private handleMessage(rpcConnection: RpcConnection, rawMessage: unknown): void {
    if (this.rpcConnection !== rpcConnection) {
      return;
    }

    const parsed = parseMainToCoreMessage(rawMessage);
    if (!parsed.ok) {
      this.coreDiagnostics.warn('rpc.invalid-message', {
        outcome: 'failed',
        errorCode: 'invalid-message',
      });
      this.respondToInvalidRequest(rpcConnection, rawMessage, parsed.error);
      return;
    }

    if (parsed.value.kind === 'cancel') {
      this.cancelRequest(
        rpcConnection,
        parsed.value.requestId,
        parsed.value.reason,
      );
      return;
    }

    if (parsed.value.kind === 'event-ack') {
      this.host.handleEventAck(parsed.value.batchSequence);
      return;
    }

    void this.executeRequest(rpcConnection, parsed.value);
  }

  /**
   * 对具有合法关联信封但 payload 不可用的 request 返回结构化错误；无法关联的消息只丢弃。
   * send 失败仍属于真实传输故障，并由 send 进入 fatal recovery。
   */
  private respondToInvalidRequest(
    rpcConnection: RpcConnection,
    rawMessage: unknown,
    detail: string,
  ): void {
    if (
      !CoreRpcServer.isRecord(rawMessage)
      || rawMessage.kind !== 'request'
      || rawMessage.protocolVersion !== CORE_PROTOCOL_VERSION
      || !CoreRpcServer.isCorrelationId(rawMessage.requestId)
      || !CoreRpcServer.isCorrelationId(rawMessage.traceId)
    ) {
      return;
    }
    this.send(rpcConnection, {
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: rawMessage.requestId,
      traceId: rawMessage.traceId,
      ok: false,
      error: {
        code: 'invalid-message',
        message: detail,
        retryable: false,
      },
    });
  }

  /**
   * 为 request 建立 AbortController 和诊断上下文，调用业务 handler 并发送 typed response。
   * 调用方：handleMessage 处理合法 request；同 ID 活动请求转交 respondToDuplicate。
   * finally 只清理由本次调用登记的实例，避免误删 replacement connection 的同 ID 请求。
   */
  private async executeRequest(
    rpcConnection: RpcConnection,
    request: CoreRequest,
  ): Promise<void> {
    if (this.activeRequests.has(request.requestId)) {
      await this.respondToDuplicate(rpcConnection, request);
      return;
    }

    const activeRequest: ActiveRequest = {
      rpcConnection,
      abortController: new AbortController(),
    };
    this.activeRequests.set(request.requestId, activeRequest);
    const startedAt = Date.now();
    const silent = SILENT_COMMANDS.has(request.command.type);

    // 每个 command 自动记录相同的生命周期；Application 只补充业务 action。
    await this.coreDiagnostics.runWithCommand(
      request.requestId,
      request.traceId,
      request.command.type,
      async () => {
        try {
          const result = await this.host.executeCommand(
            request.command,
            activeRequest.abortController.signal,
          );
          if (activeRequest.abortController.signal.aborted) {
            throw cancelledError();
          }
          if (!this.sendSuccess(rpcConnection, request, result)) {
            throw disconnectedError();
          }

          if (!silent) {
            this.coreDiagnostics.info('command.completed', {
              durationMs: Date.now() - startedAt,
              outcome: 'success',
              attributes: { resultType: result.type },
            });
          }
        } catch (error) {
          const detail = readCoreError(error, activeRequest.abortController.signal);
          const delivered = this.sendError(rpcConnection, request, detail);
          if (!silent) {
            this.coreDiagnostics.error('command.completed', {
              durationMs: Date.now() - startedAt,
              outcome: toOutcome(delivered ? detail.code : 'disconnected'),
              errorCode: delivered ? detail.code : 'disconnected',
            });
          }
        } finally {
          if (this.activeRequests.get(request.requestId) === activeRequest) {
            this.activeRequests.delete(request.requestId);
          }
        }
      },
    );
  }

  /**
   * 取消当前连接上匹配 requestId 的活动 handler。
   * 调用方：handleMessage 处理合法 cancel；未知、已完成或旧连接 requestId 保持忽略。
   */
  private cancelRequest(
    rpcConnection: RpcConnection,
    requestId: string,
    reason: string | undefined,
  ): void {
    const request = this.activeRequests.get(requestId);
    if (request?.rpcConnection === rpcConnection) {
      request.abortController.abort(reason ?? 'caller');
    }
  }

  /**
   * 在原请求诊断上下文外单独记录并回复 duplicate requestId conflict。
   * 调用方：executeRequest 发现 activeRequests 已包含同 ID 时。
   */
  private async respondToDuplicate(
    rpcConnection: RpcConnection,
    request: CoreRequest,
  ): Promise<void> {
    const detail: CoreError = {
      code: 'conflict',
      message: 'A request with this ID is already active.',
      retryable: false,
    };

    await this.coreDiagnostics.runWithCommand(
      request.requestId,
      request.traceId,
      request.command.type,
      async () => {
        const delivered = this.sendError(rpcConnection, request, detail);
        this.coreDiagnostics.error('command.completed', {
          durationMs: 0,
          outcome: 'failed',
          errorCode: delivered ? detail.code : 'disconnected',
        });
      },
    );
  }

  /**
   * 构造协议成功 response 并通过当前连接发送。
   * 调用方：executeRequest 在 handler 成功且未被取消后。
   */
  private sendSuccess(
    rpcConnection: RpcConnection,
    request: CoreRequest,
    result: CoreResult,
  ): boolean {
    return this.send(rpcConnection, {
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: request.requestId,
      traceId: request.traceId,
      ok: true,
      result,
    });
  }

  /**
   * 构造结构化失败 response 并通过当前连接发送。
   * 调用方：executeRequest 的失败路径和 respondToDuplicate。
   */
  private sendError(
    rpcConnection: RpcConnection,
    request: CoreRequest,
    error: CoreError,
  ): boolean {
    return this.send(rpcConnection, {
      kind: 'response',
      protocolVersion: CORE_PROTOCOL_VERSION,
      requestId: request.requestId,
      traceId: request.traceId,
      ok: false,
      error,
    });
  }

  /**
   * 当前是否存在可用订阅连接。调用方：CoreApplication 在 drain 前判断，避免取走无法发送的事件。
   */
  get hasActiveConnection(): boolean {
    return this.rpcConnection !== null;
  }

  /**
   * 向当前订阅连接推送一批捕获事件；无连接、空批或发送失败返回 null。
   * 调用方：CoreApplication 的事件 flush；返回的 batchSequence 供背压窗口与 ack 对账。
   */
  sendEventBatch(
    events: readonly CaptureExchangeEvent[],
    clientApps: readonly ClientAppIdentity[] = [],
  ): number | null {
    const rpcConnection = this.rpcConnection;
    if (!rpcConnection || events.length === 0) {
      return null;
    }
    const batchSequence = ++this.eventBatchSequence;
    const delivered = this.send(rpcConnection, {
      kind: 'event-batch',
      protocolVersion: CORE_PROTOCOL_VERSION,
      batchSequence,
      events: [...events],
      ...(clientApps.length > 0 ? { clientApps: [...clientApps] } : {}),
    });
    return delivered ? batchSequence : null;
  }

  /**
  * 将 response 限定到创建它的连接代际；单次发送异常只返回 false。
   * 调用方：sendSuccess 和 sendError；返回值表示消息是否确实交给当前 port。
   */
  private send(rpcConnection: RpcConnection, message: CoreToMainMessage): boolean {
    if (this.rpcConnection !== rpcConnection) {
      return false;
    }
    const delivered = rpcConnection.send(message);
    if (!delivered) {
      this.coreDiagnostics.warn('rpc.message-send-failed', {
        errorCode: 'send-failed',
      });
    }
    return delivered;
  }

  /**
   * 对当前连接执行一次故障清理并通知应用退出；旧连接故障 callback 保持忽略。
  * 调用方：remote close。单消息 send failure 不进入此路径。
   */
  private fail(rpcConnection: RpcConnection, reason: string): void {
    if (this.rpcConnection !== rpcConnection) {
      return;
    }
    this.coreDiagnostics.warn('rpc.connection-failed', { errorCode: reason });
    this.close(reason);
    try {
      this.host.handleRpcFatalError(reason);
    } catch {
      // 故障回调不能阻止 Core 退出并进入 Main CoreRuntime 的重启流程。
    }
  }

  /** 将未知 structured-clone 数据收窄为可读取信封字段的对象。 */
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /** 校验只用于 request/response 关联的稳定 ID，不检查业务 payload。 */
  private static isCorrelationId(value: unknown): value is string {
    return typeof value === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  }
}

/**
 * 单个 RPC MessagePort 的 listener 与发送生命周期封装。
 *
 * 由 CoreRpcServer.attach 创建并独占；Server 通过对象 identity 区分连接代际，
 * RpcConnection 只负责 port 原语，不解析协议或管理 request。
 */
class RpcConnection {
  private readonly closeListener = (): void => this.onClose();
  private readonly messageListener = (event: RpcMessageEvent): void => {
    this.onMessage(event.data);
  };
  private closed = false;

  /**
   * 保存 port 与 Server 回调，不在构造期间注册 listener。
   * 调用方：CoreRpcServer.attach，随后显式调用 start 完成连接发布。
   */
  constructor(
    private readonly rpcMessagePort: RpcMessagePort,
    private readonly onMessage: (message: unknown) => void,
    private readonly onClose: () => void,
  ) {}

  /**
   * 注册 message/close listener 并启动 port。
   * 调用方：CoreRpcServer.attach；每个 RpcConnection 只调用一次。
   */
  start(): void {
    this.rpcMessagePort.on('message', this.messageListener);
    this.rpcMessagePort.on('close', this.closeListener);
    this.rpcMessagePort.start();
  }

  /**
   * 向 peer 发送一个已构造的协议 response；关闭或 postMessage 抛错时返回 false。
   * 调用方：CoreRpcServer.send，异常由 Server 统一升级为连接故障。
   */
  send(message: CoreToMainMessage): boolean {
    if (this.closed) {
      return false;
    }
    try {
      this.rpcMessagePort.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 幂等移除 listener 并关闭 port，确保 replacement/shutdown 不残留回调。
   * 调用方：CoreRpcServer.close；port.close 异常在 listener 已清理后被隔离。
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rpcMessagePort.off('message', this.messageListener);
    this.rpcMessagePort.off('close', this.closeListener);
    try {
      this.rpcMessagePort.close();
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

function readCoreError(error: unknown, abortSignal: AbortSignal): CoreError {
  if (abortSignal.aborted) {
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