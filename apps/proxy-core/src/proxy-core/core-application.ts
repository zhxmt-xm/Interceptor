import process from 'node:process';

import type {
  CoreCommand,
  CoreError,
  CoreResult,
} from '@interceptor/core-protocol';

import { CoreDiagnostics } from './core-diagnostics';
import {
  CoreCommandError,
  CoreRpcServer,
  type RpcMessagePort,
} from './core-rpc-server';

export interface ParentMessageEvent {
  data: unknown;
  ports?: unknown[];
}

export interface CoreParentPort {
  on(event: 'message', listener: (event: ParentMessageEvent) => void): void;
  postMessage(message: CoreLifecycleMessage): void;
}

export type CoreLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string };

const HEARTBEAT_INTERVAL_MS = 1_000;

/**
 * Proxy Core UtilityProcess 内唯一的应用根对象。
 *
 * CoreApplication 直接拥有 parentPort 生命周期、CoreRpcServer、
 * CoreDiagnostics，以及 M2/M3 后续加入的 Storage/Proxy Service。Main 侧的
 * CoreRuntime 只管理进程代际和连接，不进入这里承载业务逻辑。
 */
export class CoreApplication {
  private readonly diagnostics = new CoreDiagnostics();
  private readonly rpcServer: CoreRpcServer;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private stopping = false;
  private exiting = false;

  private readonly handleSignal = (): void => this.stop();

  /**
   * 使用 UtilityProcess parentPort 建立生命周期边界，并组装 RPC 与 Diagnostics。
   * 调用方：entry.cts 在确认 process.parentPort 存在后创建一次。
   */
  constructor(private readonly parentPort: CoreParentPort) {
    this.rpcServer = new CoreRpcServer({
      executeCommand: (command, signal) =>
        this.executeCommand(command, signal),
      diagnostics: this.diagnostics,
      onFatalError: () => this.requestExit(1),
    });
  }

  /**
   * 注册 parentPort/SIGINT/SIGTERM 监听，发布 ready 和首个 heartbeat，随后启动心跳。
   * 调用方：entry.cts；重复调用会直接返回，不会重复注册 listener 或 timer。
   */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const startedAt = this.timestamp();
    this.parentPort.on('message', (event) => this.handleParentMessage(event));
    process.once('SIGINT', this.handleSignal);
    process.once('SIGTERM', this.handleSignal);

    this.parentPort.postMessage({
      type: 'ready',
      pid: process.pid,
      startedAt,
    });
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  /**
   * 关闭当前 RPC 连接和 heartbeat，向 Main 确认 stopped，再请求正常退出进程。
   * 调用方：Main 发来的 shutdown 消息或 SIGINT/SIGTERM；重复调用保持幂等。
   */
  stop(): void {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
    this.clearHeartbeat();
    this.rpcServer.close('shutdown');
    this.parentPort.postMessage({
      type: 'stopped',
      pid: process.pid,
      timestamp: this.timestamp(),
    });
    this.requestExit(0);
  }

  /**
   * 执行已经通过协议校验的 Core command，并返回与 command 对应的 typed result。
   * 调用方：CoreRpcServer 的 executeCommand handler；单元测试可直接验证业务路由。
   * 传输校验、correlation、cancel response 和 trace 生命周期不在这里处理。
   */
  async executeCommand(
    command: CoreCommand,
    signal: AbortSignal,
  ): Promise<CoreResult> {
    if (signal.aborted) {
      throw commandError({
        code: 'cancelled',
        message: 'The command was cancelled.',
        retryable: false,
      });
    }

    switch (command.type) {
      case 'echo':
        return this.diagnostics.action('echo.copy', () => ({
          type: 'echo',
          payload: {
            value: command.payload.value,
            handledAt: this.timestamp(),
          },
        }));
      case 'diagnostics.recent':
        return {
          type: 'diagnostics.records',
          payload: this.diagnostics.recent(
            command.payload.limit,
            command.payload.traceId,
          ),
        };
      default:
        throw commandError({
          code: 'unsupported-command',
          message: `${command.type} is not implemented yet.`,
          retryable: false,
        });
    }
  }

  /**
   * 处理 UtilityProcess parentPort 的控制消息：注入 RPC port 或执行优雅 shutdown。
   * 调用方：start 注册的 parentPort message listener；其他消息保持忽略。
   */
  private handleParentMessage(event: ParentMessageEvent): void {
    const rpcPort = readRpcPort(event);
    if (rpcPort) {
      this.rpcServer.attach(rpcPort);
      return;
    }
    if (isRecord(event.data) && event.data.type === 'shutdown') {
      this.stop();
    }
  }

  /**
   * 发布一次只代表 Event Loop 可调度的 heartbeat，不表达 Storage/Proxy 业务健康。
   * 调用方：start 的首次发送和 HEARTBEAT_INTERVAL_MS 定时器。
   */
  private sendHeartbeat(): void {
    this.parentPort.postMessage({
      type: 'heartbeat',
      pid: process.pid,
      timestamp: this.timestamp(),
    });
  }

  /**
   * 取消并清空 heartbeat timer，允许 stop 与 fatal exit 共享同一清理路径。
   * 调用方：stop 和 requestExit；timer 尚未创建或已经清理时无操作。
   */
  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 移除进程 signal listener 并在当前事件循环末尾退出，防止重入安排多个 exit。
   * 调用方：stop 使用 code 0；CoreRpcServer fatal callback 使用 code 1。
   */
  private requestExit(code: number): void {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    this.clearHeartbeat();
    process.off('SIGINT', this.handleSignal);
    process.off('SIGTERM', this.handleSignal);
    setImmediate(() => process.exit(code));
  }

  /**
   * 生成协议和诊断使用的 UTC ISO 时间戳。
   * 调用方：start、stop、sendHeartbeat 和 echo command handler。
   */
  private timestamp(): string {
    return new Date().toISOString();
  }
}

function commandError(detail: CoreError): CoreCommandError {
  return new CoreCommandError(detail);
}

function readRpcPort(event: ParentMessageEvent): RpcMessagePort | null {
  if (
    !isRecord(event.data) ||
    event.data.type !== 'rpc-port' ||
    !Array.isArray(event.ports) ||
    event.ports.length !== 1
  ) {
    return null;
  }
  const port = event.ports[0];
  return isRpcMessagePort(port) ? port : null;
}

function isRpcMessagePort(value: unknown): value is RpcMessagePort {
  return isRecord(value) &&
    typeof value.on === 'function' &&
    typeof value.off === 'function' &&
    typeof value.postMessage === 'function' &&
    typeof value.start === 'function' &&
    typeof value.close === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}