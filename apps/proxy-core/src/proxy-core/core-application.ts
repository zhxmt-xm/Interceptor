import process from 'node:process';

import { collectRuleDiagnostics } from '@interceptor/core-protocol';
import type {
  CoreCommand,
  CoreError,
  CoreResult,
} from '@interceptor/core-protocol';

import {
  EVENT_DRAIN_BATCH,
  EVENT_FLUSH_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  MAX_INFLIGHT_EVENT_BATCHES,
  dataDir,
} from './constants';
import { CoreDiagnostics } from './core-diagnostics';
import {
  CoreCommandError,
  CoreRpcServer,
  type CoreRpcHost,
  type RpcMessagePort,
} from './core-rpc-server';
import { DiagnosticsWorkerHost, type DiagnosticsPage } from './diagnostics/entry';
import { CaptureEventQueue } from './proxy/capture-event-queue';
import { decodeBody } from './proxy/content-decoder';
import { ProxyService } from './proxy/proxy-service';
import { BreakpointQueue } from './rules/breakpoint-queue';
import { RuleEngine } from './rules/rule-engine';
import { StorageService } from './storage/entry';
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
  storageService?: StorageService;
  /** 诊断日志汇；缺省时日志只进内存 Ring Buffer，diagnostics.query 返回空页。 */
  diagnosticsWorkerHost?: DiagnosticsWorkerHost;
  /** 显式代理服务；缺省时 proxy.start/stop 返回 internal，proxy.status 返回未监听。 */
  proxyService?: ProxyService;
  /** 捕获事件有界合并队列；ProxyService 写入，CoreApplication 按背压窗口 push 给 Main。 */
  captureEventQueue?: CaptureEventQueue;
  /** 断点状态机；rule-engine 挂起、breakpoint.resolve handler 解挂，退出时确定性关闭。 */
  breakpointQueue?: BreakpointQueue;
  /** 规则引擎；proxy-service beforeRequest/beforeResponse 调用，rules.replace 后热切换。 */
  ruleEngine?: RuleEngine;
}

export type CoreLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string }
  | { type: 'fatal'; message: string };

/**
 * Proxy Core UtilityProcess 内唯一的应用根对象。
 *
 * CoreApplication 直接拥有 parentPort 生命周期、CoreRpcServer、
 * CoreDiagnostics，以及 M2/M3 后续加入的 Storage/Proxy Service。Main 侧的
 * CoreRuntime 只管理进程代际和连接，不进入这里承载业务逻辑。
 */
export class CoreApplication implements CoreRpcHost {
  readonly diagnostics: CoreDiagnostics;
  private readonly rpcServer: CoreRpcServer;
  private readonly storageService: StorageService | null;
  private readonly diagnosticsWorkerHost: DiagnosticsWorkerHost | null;
  private readonly proxyService: ProxyService | null;
  private readonly captureEventQueue: CaptureEventQueue | null;
  private readonly breakpointQueue: BreakpointQueue | null;
  private readonly ruleEngine: RuleEngine | null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventFlushTimer: ReturnType<typeof setInterval> | null = null;
  private inFlightEventBatches = 0;
  private started = false;
  private stopping = false;
  private exiting = false;

  private readonly handleSignal = (): void => this.stop();

  /**
   * 组合根：按运行期配置装配存储/诊断/代理服务并启动应用；组合或启动失败作为 fatal
   * 生命周期消息上报 Main 并置非零退出码。调用方：entry.cts 确认 parentPort 后调用一次。
   */
  static bootstrap(parentPort: CoreParentPort): void {
    try {
      const storageService = dataDir ? new StorageService() : undefined;
      const diagnosticsWorkerHost = dataDir
        ? new DiagnosticsWorkerHost()
        : undefined;
      const captureEventQueue = storageService
        ? new CaptureEventQueue()
        : undefined;
      const breakpointQueue = new BreakpointQueue();
      const ruleEngine = new RuleEngine(breakpointQueue);
      const proxyService =
        storageService && captureEventQueue
          ? new ProxyService(storageService, captureEventQueue, ruleEngine)
          : undefined;
      new CoreApplication(parentPort, {
        storageService,
        diagnosticsWorkerHost,
        proxyService,
        captureEventQueue,
        breakpointQueue,
        ruleEngine,
      }).start();
    } catch (error) {
      reportFatalStartup(parentPort, error);
    }
  }

  /**
   * 使用 UtilityProcess parentPort 建立生命周期边界，并组装 RPC 与 Diagnostics。
   * 调用方：bootstrap（生产）与单元测试（注入替身服务）。
   */
  constructor(
    private readonly parentPort: CoreParentPort,
    options: CoreApplicationOptions = {},
  ) {
    this.storageService = options.storageService ?? null;
    this.diagnosticsWorkerHost = options.diagnosticsWorkerHost ?? null;
    this.proxyService = options.proxyService ?? null;
    this.captureEventQueue = options.captureEventQueue ?? null;
    this.breakpointQueue = options.breakpointQueue ?? null;
    this.ruleEngine = options.ruleEngine ?? null;
    this.diagnostics = new CoreDiagnostics(
      this.diagnosticsWorkerHost ?? undefined,
    );
    this.proxyService?.attachDiagnostics(this.diagnostics);
    this.storageService?.attachDiagnostics(this.diagnostics);
    this.rpcServer = new CoreRpcServer(this);
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
    if (this.captureEventQueue) {
      this.eventFlushTimer = setInterval(
        () => this.flushCaptureEvents(),
        EVENT_FLUSH_INTERVAL_MS,
      );
    }
    this.initializeDiagnostics();
    this.initializeStorage();
    this.diagnostics.info('core.started');
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
    this.diagnostics.info('core.stopping');
    this.clearHeartbeat();
    this.rpcServer.close('shutdown');
    void this.storageService?.dispose();
    void this.diagnosticsWorkerHost?.close();
    void this.proxyService?.stop();
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
            // 延迟解码：仅当 Renderer 请求 decode 时按 content-encoding 解压，
            // 一次性返回解码全量（解压需完整流，不再按 length 分块）。
            if (command.payload.decode) {
              const decoded = await decodeBody(
                new Uint8Array(data),
                command.payload.encoding,
              );
              return {
                type: 'body.range',
                payload: {
                  bodyId: command.payload.bodyId,
                  offset: command.payload.offset,
                  data: decoded.data,
                  end: true,
                  decodeStatus: decoded.status,
                },
              };
            }
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
      case 'rules.validate': {
        // 纯语义校验（无 I/O）：wire 校验已在 RPC 边界完成，此处只返回诊断。
        const diagnostics = collectRuleDiagnostics(command.payload.rules);
        return {
          type: 'rules.validation',
          payload: { valid: diagnostics.length === 0, diagnostics },
        };
      }
      case 'rules.get':
        return this.withStorage(async (storage) => {
          const ruleSet = await this.diagnostics.action('rules.get', () =>
            storage.loadRuleSet(),
          );
          return { type: 'rules.ruleset', payload: { ruleSet } };
        });
      case 'rules.hits':
        return this.withStorage(async (storage) => {
          const counts = await this.diagnostics.action('rules.hits', () =>
            storage.countRuleHits(),
          );
          return { type: 'rules.hits', payload: { counts } };
        });
      case 'rules.replace':
        return this.withStorage(async (storage) => {
          const diagnostics = collectRuleDiagnostics(command.payload.rules);
          if (diagnostics.length > 0) {
            throw commandError({
              code: 'invalid-message',
              message: 'The rule set failed semantic validation.',
              retryable: false,
            });
          }
          try {
            const ruleSet = await this.diagnostics.action('rules.replace', () =>
              storage.saveRuleSet(
                command.payload.expectedRevision,
                command.payload.rules,
              ),
            );
            this.ruleEngine?.setRuleSet(ruleSet);
            return {
              type: 'rules.revision',
              payload: { revision: ruleSet.revision },
            };
          } catch (error) {
            throw mapRuleError(error);
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
          await this.storageService?.initialize();
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
          payload: this.proxyService
            ? this.proxyService.status()
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
      case 'breakpoint.resolve':
        return this.withBreakpoints((queue) => {
          const state = queue.resolve(
            command.payload.breakpointId,
            command.payload.action,
            command.payload.edit,
          );
          if (state === null) {
            throw commandError({
              code: 'conflict',
              message:
                'The breakpoint was not found or has already been resolved.',
              retryable: false,
            });
          }
          return {
            type: 'breakpoint.resolution',
            payload: { breakpointId: command.payload.breakpointId, state },
          };
        });
      default:
        throw commandError({
          code: 'unsupported-command',
          message: 'The command is not implemented.',
          retryable: false,
        });
    }
  }

  /**
   * 触发存储门面异步初始化并把失败降级为诊断日志，不影响 Event Loop 存活。
   * 调用方：start；存储不可用只使相关 command 失败，不使 CoreProcess 退出。
   */
  private initializeStorage(): void {
    if (!this.storageService) {
      return;
    }
    const storage = this.storageService;
    void storage
      .initialize()
      .then(async () => {
        this.diagnostics.info('storage.ready');
        // 存储就绪后把持久化规则集热加载进引擎，使重启后规则立即生效。
        if (this.ruleEngine) {
          const ruleSet = await storage.loadRuleSet();
          this.ruleEngine.setRuleSet(ruleSet);
          this.diagnostics.info('rules.loaded', {
            attributes: {
              revision: ruleSet.revision,
              rules: ruleSet.rules.length,
            },
          });
        }
      })
      .catch((error: unknown) => {
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
    if (!this.diagnosticsWorkerHost) {
      return;
    }
    void this.diagnosticsWorkerHost
      .start()
      .then(() => {
        this.diagnostics.info('diagnostics.ready');
      })
      .catch((error: unknown) => {
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
    if (!this.diagnosticsWorkerHost) {
      return { records: [], hasMore: false, droppedCount: 0 };
    }
    return this.diagnosticsWorkerHost.query(payload);
  }

  /**
   * 确保存储就绪后执行操作；存储缺失时抛出 internal 错误。
   * 调用方：sessions.query / storage.status / storage.cleanup handler。
   */
  private async withStorage<T>(
    operation: (storage: StorageService) => Promise<T>,
  ): Promise<T> {
    if (!this.storageService) {
      throw commandError({
        code: 'internal',
        message: 'Storage is not available.',
        retryable: false,
      });
    }
    await this.storageService.initialize();
    return operation(this.storageService);
  }

  /**
   * 在代理服务可用时执行操作；缺省时抛出 internal 错误。
   * 调用方：proxy.start / proxy.stop handler。
   */
  private async withProxy<T>(
    operation: (proxy: ProxyService) => Promise<T>,
  ): Promise<T> {
    if (!this.proxyService) {
      throw commandError({
        code: 'internal',
        message: 'Proxy is not available.',
        retryable: false,
      });
    }
    return operation(this.proxyService);
  }

  /**
   * 在断点队列可用时执行操作；缺失时抛出 internal 错误。
   * 调用方：breakpoint.resolve handler。
   */
  private withBreakpoints<T>(operation: (queue: BreakpointQueue) => T): T {
    if (!this.breakpointQueue) {
      throw commandError({
        code: 'internal',
        message: 'Breakpoints are not available.',
        retryable: false,
      });
    }
    return operation(this.breakpointQueue);
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
   * 调用方：start 安排的 flush 定时器和 handleEventAck 腾出窗口后。取走前先确认有连接，
   * 避免把事件从队列取走却无法发送而丢失。
   */
  private flushCaptureEvents(): void {
    const queue = this.captureEventQueue;
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
   * 订阅端确认收到一批事件后腾出背压窗口并尝试继续 flush（CoreRpcHost）。
   * 调用方：CoreRpcServer 收到 event-ack 时。
   */
  handleEventAck(_batchSequence: number): void {
    this.inFlightEventBatches = Math.max(0, this.inFlightEventBatches - 1);
    this.flushCaptureEvents();
  }

  /**
   * RPC 连接失效是当前 CoreProcess 的 fatal 故障：请求以非零码退出，交由 Main 重启（CoreRpcHost）。
   * 调用方：CoreRpcServer 连接失效时。
   */
  handleRpcFatalError(_reason: string): void {
    this.requestExit(1);
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
   * 调用方：stop 使用 code 0；handleRpcFatalError 使用 code 1。
   */
  private requestExit(code: number): void {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    this.clearHeartbeat();
    this.clearEventFlush();
    this.breakpointQueue?.closeAll();
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
 * 组合根启动失败时上报 Main（fatal 生命周期消息，含错误摘要）并置非零退出码。
 * 上报本身失败时兜底写 stderr。不强制立即退出，让事件循环自然排空以尽量 flush 该消息。
 */
function reportFatalStartup(parentPort: CoreParentPort, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  try {
    parentPort.postMessage({ type: 'fatal', message });
  } catch {
    process.stderr.write(`Proxy Core failed to start: ${message}\n`);
  }
  process.exitCode = 1;
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

/**
 * 把规则持久化异常映射为结构化 CoreError：revision 冲突为 conflict（可重取后重试），
 * 其余归为 internal。通过 name 判定，因错误可能跨 Storage Worker 边界重建丢失原型链。
 */
function mapRuleError(error: unknown): CoreCommandError {
  if (error instanceof CoreCommandError) {
    return error;
  }
  const name = error instanceof Error ? error.name : '';
  if (name === 'RuleRevisionConflictError') {
    return new CoreCommandError({
      code: 'conflict',
      message:
        error instanceof Error
          ? error.message
          : 'The rule set revision is out of date.',
      retryable: true,
    });
  }
  return new CoreCommandError({
    code: 'internal',
    message: 'Failed to persist the rule set.',
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