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
import type { DiagnosticsLog } from './diagnostics/diagnostics-worker-host';
import type { DiagnosticsPage } from './diagnostics/diagnostics-store';
import type { CaptureEventQueue } from './proxy/capture-event-queue';
import type { ProxyService } from './proxy/proxy-service';
import type { StorageService } from './storage/storage-service';
import type { CleanupScope } from './storage/types';

export interface ParentMessageEvent {
  data: unknown;
  ports?: unknown[];
}

export interface CoreParentPort {
  on(event: 'message', listener: (event: ParentMessageEvent) => void): void;
  postMessage(message: CoreLifecycleMessage): void;
}

export interface CoreApplicationOptions {
  /** Core 拥有的存储门面；缺省时存储相关 command 返回 internal 错误。 */
  storage?: StorageService;
  /** 诊断日志汇；缺省时日志只进内存 Ring Buffer，diagnostics.query 返回空页。 */
  diagnosticsLog?: DiagnosticsLog;
  /** 显式代理服务；缺省时 proxy.start/stop 返回 internal，proxy.status 返回未监听。 */
  proxy?: ProxyService;
  /** 捕获事件有界合并队列；ProxyService 写入，CoreApplication 按背压窗口 push 给 Main。 */
  captureEvents?: CaptureEventQueue;
}

export type CoreLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string };

const HEARTBEAT_INTERVAL_MS = 1_000;
const EVENT_FLUSH_INTERVAL_MS = 50;
const MAX_INFLIGHT_EVENT_BATCHES = 8;
const EVENT_DRAIN_BATCH = 200;

/**
 * Proxy Core UtilityProcess 内唯一的应用根对象。
 *
 * CoreApplication 直接拥有 parentPort 生命周期、CoreRpcServer、
 * CoreDiagnostics，以及 M2/M3 后续加入的 Storage/Proxy Service。Main 侧的
 * CoreRuntime 只管理进程代际和连接，不进入这里承载业务逻辑。
 */
export class CoreApplication {
  private readonly diagnostics: CoreDiagnostics;
  private readonly rpcServer: CoreRpcServer;
  private readonly storage: StorageService | null;
  private readonly diagnosticsLog: DiagnosticsLog | null;
  private readonly proxy: ProxyService | null;
  private readonly captureEvents: CaptureEventQueue | null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventFlushTimer: ReturnType<typeof setInterval> | null = null;
  private inFlightEventBatches = 0;
  private started = false;
  private stopping = false;
  private exiting = false;

  private readonly handleSignal = (): void => this.stop();

  /**
   * 使用 UtilityProcess parentPort 建立生命周期边界，并组装 RPC 与 Diagnostics。
   * 调用方：entry.cts 在确认 process.parentPort 存在后创建一次。
   */
  constructor(
    private readonly parentPort: CoreParentPort,
    options: CoreApplicationOptions = {},
  ) {
    this.storage = options.storage ?? null;
    this.diagnosticsLog = options.diagnosticsLog ?? null;
    this.proxy = options.proxy ?? null;
    this.captureEvents = options.captureEvents ?? null;
    this.diagnostics = new CoreDiagnostics(
      this.diagnosticsLog
        ? { sink: (records) => this.diagnosticsLog?.sink(records) }
        : {},
    );
    this.rpcServer = new CoreRpcServer({
      executeCommand: (command, signal) =>
        this.executeCommand(command, signal),
      diagnostics: this.diagnostics,
      onFatalError: () => this.requestExit(1),
      onEventAck: () => this.onEventAck(),
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
    if (this.captureEvents) {
      this.eventFlushTimer = setInterval(
        () => this.flushCaptureEvents(),
        EVENT_FLUSH_INTERVAL_MS,
      );
    }
    this.initializeDiagnostics();
    this.initializeStorage();
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
    void this.storage?.dispose();
    void this.diagnosticsLog?.close();
    void this.proxy?.stop();
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
      case 'diagnostics.query':
        return {
          type: 'diagnostics.page',
          payload: await this.queryDiagnostics(command.payload),
        };
      case 'sessions.query':
        return this.withStorage(async (storage) => {
          try {
            const page = await this.diagnostics.action(
              'storage.query-sessions',
              () => storage.querySessions(command.payload),
            );
            return { type: 'sessions.page', payload: page };
          } catch (error) {
            throw mapStorageError(error);
          }
        });
      case 'sessions.detail':
        return this.withStorage(async (storage) => {
          try {
            const detail = await this.diagnostics.action(
              'storage.exchange-detail',
              () => storage.getExchangeDetail(command.payload.exchangeId),
            );
            return { type: 'sessions.detail', payload: { detail } };
          } catch (error) {
            throw mapStorageError(error);
          }
        });
      case 'body.read-range':
        return this.withStorage(async (storage) => {
          try {
            const data = await this.diagnostics.action('storage.body-range', () =>
              storage.readBodyRange(
                command.payload.bodyId,
                command.payload.offset,
                command.payload.length,
              ),
            );
            return {
              type: 'body.range',
              payload: {
                bodyId: command.payload.bodyId,
                offset: command.payload.offset,
                data: new Uint8Array(data),
                end: data.length < command.payload.length,
              },
            };
          } catch (error) {
            throw mapStorageError(error);
          }
        });
      case 'storage.status':
        return this.withStorage(async (storage) => ({
          type: 'storage.status',
          payload: await this.diagnostics.action('storage.status', () =>
            storage.status(),
          ),
        }));
      case 'storage.cleanup':
        return this.withStorage(async (storage) => ({
          type: 'storage.status',
          payload: await this.diagnostics.action('storage.cleanup', () =>
            storage.cleanup(toCleanupScope(command.payload)),
          ),
        }));
      case 'proxy.start':
        return this.withProxy(async (proxy) => {
          await this.storage?.initialize();
          await this.diagnostics.action('proxy.start', () =>
            proxy.start({ port: command.payload.port }),
          );
          return { type: 'proxy.status', payload: proxy.status() };
        });
      case 'proxy.stop':
        return this.withProxy(async (proxy) => {
          await this.diagnostics.action('proxy.stop', () => proxy.stop());
          return { type: 'proxy.status', payload: proxy.status() };
        });
      case 'proxy.status':
        return {
          type: 'proxy.status',
          payload: this.proxy
            ? this.proxy.status()
            : {
                listening: false,
                host: null,
                port: null,
                sessionId: null,
                capturedExchanges: 0,
              },
        };
      case 'tls.configure':
        return this.withProxy(async (proxy) => {
          await this.diagnostics.action('tls.configure', () =>
            proxy.configureTls(command.payload),
          );
          return {
            type: 'tls.configured',
            payload: { mitmEnabled: command.payload.ca !== null },
          };
        });
      default:
        throw commandError({
          code: 'unsupported-command',
          message: `${command.type} is not implemented yet.`,
          retryable: false,
        });
    }
  }

  /**
   * 触发存储门面异步初始化并把失败降级为诊断日志，不影响 Event Loop 存活。
   * 调用方：start；存储不可用只使相关 command 失败，不使 CoreProcess 退出。
   */
  private initializeStorage(): void {
    if (!this.storage) {
      return;
    }
    void this.storage.initialize().catch((error: unknown) => {
      this.diagnostics.error('storage.init.failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
    });
  }

  /**
   * 触发 Diagnostics Worker 异步启动；启动失败不影响 Event Loop，仅使日志退回内存。
   * 调用方：start。
   */
  private initializeDiagnostics(): void {
    if (!this.diagnosticsLog) {
      return;
    }
    void this.diagnosticsLog.start().catch((error: unknown) => {
      this.diagnostics.error('diagnostics.init.failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
    });
  }

  /**
   * 查询已持久化的诊断记录；无 Diagnostics Worker 时返回空页而非报错。
   * 调用方：diagnostics.query command handler。
   */
  private async queryDiagnostics(payload: {
    cursor?: string;
    limit: number;
    level?: 'debug' | 'info' | 'warn' | 'error';
    traceId?: string;
  }): Promise<DiagnosticsPage> {
    if (!this.diagnosticsLog) {
      return { records: [], hasMore: false, droppedCount: 0 };
    }
    return this.diagnosticsLog.query(payload);
  }

  /**
   * 确保存储就绪后执行操作；存储缺失时抛出 internal 错误。
   * 调用方：sessions.query / storage.status / storage.cleanup handler。
   */
  private async withStorage<T>(
    operation: (storage: StorageService) => Promise<T>,
  ): Promise<T> {
    if (!this.storage) {
      throw commandError({
        code: 'internal',
        message: 'Storage is not available.',
        retryable: false,
      });
    }
    await this.storage.initialize();
    return operation(this.storage);
  }

  /**
   * 在代理服务可用时执行操作；缺省时抛出 internal 错误。
   * 调用方：proxy.start / proxy.stop handler。
   */
  private async withProxy<T>(
    operation: (proxy: ProxyService) => Promise<T>,
  ): Promise<T> {
    if (!this.proxy) {
      throw commandError({
        code: 'internal',
        message: 'Proxy is not available.',
        retryable: false,
      });
    }
    return operation(this.proxy);
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
   * 按背压窗口把队列中的捕获事件分批 push 给 Main；无连接或窗口已满时本轮跳过。
   * 调用方：start 安排的 flush 定时器和 onEventAck 腾出窗口后。取走前先确认有连接，
   * 避免把事件从队列取走却无法发送而丢失。
   */
  private flushCaptureEvents(): void {
    const queue = this.captureEvents;
    if (!queue || !this.rpcServer.hasActiveConnection) {
      return;
    }
    while (this.inFlightEventBatches < MAX_INFLIGHT_EVENT_BATCHES) {
      const batch = queue.drain(EVENT_DRAIN_BATCH);
      if (batch.length === 0) {
        return;
      }
      const events = batch.map((event) => ({
        kind: event.kind,
        summary: event.summary,
      }));
      const batchSequence = this.rpcServer.sendEventBatch(events);
      if (batchSequence === null) {
        return;
      }
      this.inFlightEventBatches += 1;
    }
  }

  /**
   * 订阅端确认收到一批事件后腾出背压窗口并尝试继续 flush。
   * 调用方：CoreRpcServer 收到 event-ack 时。
   */
  private onEventAck(): void {
    this.inFlightEventBatches = Math.max(0, this.inFlightEventBatches - 1);
    this.flushCaptureEvents();
  }

  /**
   * 取消并清空捕获事件 flush timer。
   * 调用方：requestExit 的统一清理路径。
   */
  private clearEventFlush(): void {
    if (this.eventFlushTimer) {
      clearInterval(this.eventFlushTimer);
      this.eventFlushTimer = null;
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
    this.clearEventFlush();
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

/**
 * 把 storage.cleanup 命令载荷映射为存储层的内部 CleanupScope。
 */
function toCleanupScope(payload: {
  scope: 'all' | 'session';
  sessionId?: string;
}): CleanupScope {
  return payload.scope === 'session' && payload.sessionId
    ? { kind: 'session', sessionId: payload.sessionId }
    : { kind: 'all' };
}

/**
 * 把存储层异常映射为结构化 CoreError：无效游标属于协议输入错误，其余归为 internal。
 * 通过 name 判定，因为错误可能跨 Storage Worker 边界重建、丢失原型链。
 */
function mapStorageError(error: unknown): CoreCommandError {
  if (error instanceof CoreCommandError) {
    return error;
  }
  const name = error instanceof Error ? error.name : '';
  if (name === 'InvalidCursorError') {
    return new CoreCommandError({
      code: 'invalid-message',
      message: 'The pagination cursor is malformed.',
      retryable: false,
    });
  }
  return new CoreCommandError({
    code: 'internal',
    message: 'The storage command failed.',
    retryable: false,
  });
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