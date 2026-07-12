import path from 'node:path';

import {
  app,
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from 'electron';

import {
  type CoreCommand,
  type CoreResultForCommand,
  type MainToCoreMessage,
} from '@interceptor/core-protocol';

import type { CoreProcessStatus } from '../../shared/desktop-api';
import {
  CoreRpcClient,
  type CoreRequestOptions,
  type CoreRpcPort,
} from './core-rpc-client';

export interface CoreProcessHandle {
  readonly pid: number | undefined;
  onSpawn(listener: () => void): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
  onError(listener: (detail: string) => void): void;
  postMessage(message: unknown): void;
  kill(): boolean;
}

interface CoreRuntimeOptions {
  coreProcessHeartbeatTimeoutMs?: number;
  coreProcessRestartBaseDelayMs?: number;
  coreProcessRestartMaxDelayMs?: number;
  coreProcessShutdownTimeoutMs?: number;
  now?: () => number;
}

type CoreProcessStatusListener = (status: CoreProcessStatus) => void;

const DEFAULT_CORE_PROCESS_HEARTBEAT_TIMEOUT_MS = 4_000;
const DEFAULT_CORE_PROCESS_RESTART_BASE_DELAY_MS = 250;
const DEFAULT_CORE_PROCESS_RESTART_MAX_DELAY_MS = 5_000;
const DEFAULT_CORE_PROCESS_SHUTDOWN_TIMEOUT_MS = 1_500;

/**
 * Main 侧 CoreRuntime 总入口。
 *
 * CoreRuntime 是 Main 中长期存在的所有者；CoreProcess 是它当前管理的一代
 * Proxy Core UtilityProcess。CoreRuntime 负责 CoreProcess 启停、状态、
 * heartbeat/restart 和 RPC 连接，不代表 CoreProcess 本身，也不承载
 * CoreApplication 内部业务逻辑。
 */
export class CoreRuntime {
  private readonly coreRpcClient = new CoreRpcClient();
  private readonly coreProcessHeartbeatTimeoutMs: number;
  private readonly coreProcessRestartBaseDelayMs: number;
  private readonly coreProcessRestartMaxDelayMs: number;
  private readonly coreProcessShutdownTimeoutMs: number;
  private readonly now: () => number;
  private readonly coreProcessStatusListeners =
    new Set<CoreProcessStatusListener>();

  private coreProcess: CoreProcessHandle | null = null;
  private coreProcessHeartbeatTimeoutTimer:
    | ReturnType<typeof setTimeout>
    | null = null;
  private coreProcessRestartDelayTimer: ReturnType<typeof setTimeout> | null =
    null;
  private coreProcessShutdownTimeoutTimer:
    | ReturnType<typeof setTimeout>
    | null = null;
  private pendingCoreRuntimeStopResolver: (() => void) | null = null;
  private coreProcessShouldRun = false;
  private lastCoreProcessHeartbeatAtMs: number | null = null;
  private coreProcessStatus: CoreProcessStatus;

  /**
   * 初始化 CoreProcess 生命周期超时、重启退避和时间源，并建立 stopped 快照。
   * 调用方：生产环境由 DesktopApplication 创建；单元测试由 TestCoreRuntime 子类创建。
   */
  constructor(options: CoreRuntimeOptions = {}) {
    this.coreProcessHeartbeatTimeoutMs =
      options.coreProcessHeartbeatTimeoutMs ??
      DEFAULT_CORE_PROCESS_HEARTBEAT_TIMEOUT_MS;
    this.coreProcessRestartBaseDelayMs =
      options.coreProcessRestartBaseDelayMs ??
      DEFAULT_CORE_PROCESS_RESTART_BASE_DELAY_MS;
    this.coreProcessRestartMaxDelayMs =
      options.coreProcessRestartMaxDelayMs ??
      DEFAULT_CORE_PROCESS_RESTART_MAX_DELAY_MS;
    this.coreProcessShutdownTimeoutMs =
      options.coreProcessShutdownTimeoutMs ??
      DEFAULT_CORE_PROCESS_SHUTDOWN_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.coreProcessStatus = this.createCoreProcessStatus('stopped');
  }

  /**
   * 返回当前 CoreProcess 状态的副本，避免调用方修改 CoreRuntime 内部快照。
   * 调用方：DesktopApplication 状态查询 IPC 和 updateCoreProcessStatus 广播流程。
   */
  getCoreProcessStatus(): CoreProcessStatus {
    return { ...this.coreProcessStatus };
  }

  /**
   * 注册 CoreProcess 状态监听器并返回手动取消函数；CoreRuntime.stop 后统一清空。
   * 调用方：DesktopApplication.onReady 注册向 Renderer 广播状态的监听器。
   */
  onCoreProcessStatusChange(listener: CoreProcessStatusListener): () => void {
    this.coreProcessStatusListeners.add(listener);
    return () => this.coreProcessStatusListeners.delete(listener);
  }

  /**
   * 将 typed command 转交 CoreRuntime 内部的 CoreRpcClient，并保留结果类型映射。
   * 调用方：DesktopApplication 中面向 Renderer 的各个业务 IPC handler。
   */
  request<T extends CoreCommand>(
    command: T,
    options: CoreRequestOptions = {},
  ): Promise<CoreResultForCommand<T>> {
    return this.coreRpcClient.request(command, options);
  }

  /**
   * 将 CoreProcess 目标状态设为运行，取消残留重启计时并启动一代 CoreProcess。
   * 调用方：DesktopApplication.onReady；目标已是运行且 CoreProcess 存在时返回。
   */
  start(): void {
    if (this.coreProcessShouldRun && this.coreProcess) {
      return;
    }

    this.coreProcessShouldRun = true;
    this.clearCoreProcessRestartDelay();
    this.startCoreProcess();
  }

  /**
   * 将 CoreProcess 目标状态设为停止，优先请求优雅退出，超时后强杀并清空监听器。
   * 调用方：DesktopApplication.onBeforeQuit；完成后 Main 才继续退出应用。
   */
  async stop(): Promise<void> {
    this.coreProcessShouldRun = false;
    this.clearCoreProcessRestartDelay();
    this.clearCoreProcessHeartbeatTimeout();

    try {
      const coreProcess = this.coreProcess;
      if (!coreProcess) {
        this.coreRpcClient.close();
        this.updateCoreProcessStatus('stopped', { pid: null, detail: null });
        return;
      }

      this.updateCoreProcessStatus('stopping', {
        pid: coreProcess.pid ?? this.coreProcessStatus.pid,
        detail: 'Waiting for CoreProcess to stop',
      });

      await new Promise<void>((resolve) => {
        this.pendingCoreRuntimeStopResolver = resolve;

        try {
          coreProcess.postMessage({ type: 'shutdown' });
        } catch {
          this.forceStopCoreProcess(coreProcess);
          return;
        }

        this.coreProcessShutdownTimeoutTimer = setTimeout(
          () => this.forceStopCoreProcess(coreProcess),
          this.coreProcessShutdownTimeoutMs,
        );
      });
    } finally {
      this.coreProcessStatusListeners.clear();
    }
  }

  /**
   * 启动一代 CoreProcess（Proxy Core UtilityProcess）并绑定生命周期事件。
   * 调用方：start 的首次启动，以及 scheduleCoreProcessRestart 的退避回调。
   */
  private startCoreProcess(): void {
    if (!this.coreProcessShouldRun || this.coreProcess) {
      return;
    }

    this.updateCoreProcessStatus('starting', {
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: 'Starting CoreProcess',
    });

    let coreProcess: CoreProcessHandle;
    try {
      coreProcess = this.launchCoreProcess();
    } catch (error) {
      this.scheduleCoreProcessRestart(readCoreProcessStartError(error));
      return;
    }

    this.coreProcess = coreProcess;
    this.lastCoreProcessHeartbeatAtMs = this.now();
    this.bindCoreProcessEvents(coreProcess);
    this.armCoreProcessHeartbeatTimeout(coreProcess);
  }

  /**
   * fork CoreProcess、创建专用 MessageChannel，并返回 Main 侧 CoreProcessHandle。
   * 调用方：startCoreProcess；protected 仅允许测试子类替换真实 Electron 启动。
   */
  protected launchCoreProcess(): CoreProcessHandle {
    const launchedCoreProcess = utilityProcess.fork(
      this.resolveCoreProcessEntry(),
      [],
      {
        serviceName: 'Interceptor Proxy Core',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    this.forwardCoreProcessOutput(launchedCoreProcess);
    const { port1, port2 } = new MessageChannelMain();
    try {
      this.coreRpcClient.attach(this.createCoreRpcPort(port1));
      launchedCoreProcess.postMessage({ type: 'rpc-port' }, [port2]);
    } catch (error) {
      this.coreRpcClient.close();
      try {
        port2.close();
      } catch {
        // port2 可能已经完成所有权转移。
      }
      launchedCoreProcess.kill();
      throw error;
    }

    return {
      get pid() {
        return launchedCoreProcess.pid;
      },
      onSpawn: (listener) => launchedCoreProcess.on('spawn', listener),
      onMessage: (listener) => launchedCoreProcess.on('message', listener),
      onExit: (listener) => launchedCoreProcess.on('exit', listener),
      onError(listener) {
        launchedCoreProcess.on('error', (type, location) => {
          listener(`${type} at ${location}`);
        });
      },
      postMessage: (message) => launchedCoreProcess.postMessage(message),
      kill: () => launchedCoreProcess.kill(),
    };
  }

  // 将 Electron MessagePortMain 适配为不泄漏 Electron 类型的 CoreRpcPort。
  // 调用方：launchCoreProcess 创建 MessageChannel 后连接 CoreRuntime 内部 CoreRpcClient。
  private createCoreRpcPort(port: MessagePortMain): CoreRpcPort {
    return {
      onMessage(listener) {
        const handler = (event: Electron.MessageEvent) => listener(event.data);
        port.on('message', handler);
        return () => port.off('message', handler);
      },
      onClose(listener) {
        port.on('close', listener);
        return () => port.off('close', listener);
      },
      postMessage(message: MainToCoreMessage) {
        port.postMessage(message);
      },
      start: () => port.start(),
      close: () => port.close(),
    };
  }

  /**
   * 为当前 CoreProcess 绑定 Electron spawn、生命周期消息、错误和退出处理函数。
   * 调用方：startCoreProcess；旧 CoreProcess 延迟到达的事件由 identity 检查忽略。
   */
  private bindCoreProcessEvents(coreProcess: CoreProcessHandle): void {
    coreProcess.onSpawn(() => {
      if (this.coreProcess !== coreProcess) {
        return;
      }

      this.updateCoreProcessStatus('starting', {
        pid: coreProcess.pid ?? null,
        detail: 'CoreProcess started; waiting for heartbeat',
      });
    });

    coreProcess.onMessage((message) => {
      this.handleCoreProcessMessage(coreProcess, message);
    });
    coreProcess.onError((detail) => {
      if (this.coreProcess === coreProcess) {
        this.updateCoreProcessStatus('unresponsive', { detail });
      }
    });
    coreProcess.onExit((code) => this.handleCoreProcessExit(coreProcess, code));
  }

  /**
   * 处理当前 CoreProcess 通过 parentPort 发来的 ready/heartbeat，刷新状态和期限。
   * 调用方：bindCoreProcessEvents 的 onMessage；旧 CoreProcess 或停止期间消息会被忽略。
   */
  private handleCoreProcessMessage(
    coreProcess: CoreProcessHandle,
    message: unknown,
  ): void {
    if (this.coreProcess !== coreProcess) {
      return;
    }

    const coreProcessLifecycleMessage = readCoreProcessLifecycleMessage(message);
    if (
      !coreProcessLifecycleMessage ||
      coreProcessLifecycleMessage.type === 'stopped'
    ) {
      return;
    }
    if (!this.coreProcessShouldRun) {
      return;
    }

    this.lastCoreProcessHeartbeatAtMs = this.now();
    const timestamp =
      coreProcessLifecycleMessage.type === 'ready'
        ? coreProcessLifecycleMessage.startedAt
        : coreProcessLifecycleMessage.timestamp;

    // ready/heartbeat 只说明 CoreProcess Event Loop 可响应，不代表业务模块健康。
    this.updateCoreProcessStatus('running', {
      pid: coreProcessLifecycleMessage.pid,
      startedAt:
        coreProcessLifecycleMessage.type === 'ready'
          ? coreProcessLifecycleMessage.startedAt
          : this.coreProcessStatus.startedAt,
      lastHeartbeatAt: timestamp,
      detail: null,
    });
    this.armCoreProcessHeartbeatTimeout(coreProcess);
  }

  /**
   * 处理当前 CoreProcess 退出，关闭该代 RPC，并完成 CoreRuntime.stop 或安排重启。
   * 调用方：bindCoreProcessEvents 注册的 onExit 回调。
   */
  private handleCoreProcessExit(
    coreProcess: CoreProcessHandle,
    exitCode: number,
  ): void {
    if (this.coreProcess !== coreProcess) {
      return;
    }

    this.coreProcess = null;
    this.coreRpcClient.close();
    this.clearCoreProcessHeartbeatTimeout();
    this.clearCoreProcessShutdownTimeout();

    if (!this.coreProcessShouldRun) {
      this.updateCoreProcessStatus('stopped', {
        pid: null,
        startedAt: null,
        lastHeartbeatAt: null,
        detail: null,
      });
      this.resolvePendingCoreRuntimeStop();
      return;
    }

    this.scheduleCoreProcessRestart(
      `CoreProcess exited with code ${exitCode}`,
    );
  }

  /**
   * 为当前 CoreProcess 设置 heartbeat deadline；超时后标记 unresponsive 并 kill。
   * 调用方：startCoreProcess 建立期限，handleCoreProcessMessage 收到消息后续期。
   */
  private armCoreProcessHeartbeatTimeout(
    coreProcess: CoreProcessHandle,
  ): void {
    this.clearCoreProcessHeartbeatTimeout();
    this.coreProcessHeartbeatTimeoutTimer = setTimeout(() => {
      if (this.coreProcess !== coreProcess || !this.coreProcessShouldRun) {
        return;
      }

      const elapsed = this.now() - (this.lastCoreProcessHeartbeatAtMs ?? 0);
      if (elapsed < this.coreProcessHeartbeatTimeoutMs) {
        this.armCoreProcessHeartbeatTimeout(coreProcess);
        return;
      }

      this.updateCoreProcessStatus('unresponsive', {
        detail: `No heartbeat for ${elapsed} ms`,
      });
      coreProcess.kill();
    }, this.coreProcessHeartbeatTimeoutMs);
  }

  /**
   * 为 CoreProcess 计算指数退避，发布 restarting 状态并启动新一代 CoreProcess。
   * 调用方：startCoreProcess 启动失败时，以及 handleCoreProcessExit 处理意外退出时。
   */
  private scheduleCoreProcessRestart(detail: string): void {
    if (!this.coreProcessShouldRun) {
      return;
    }

    const restartCount = this.coreProcessStatus.restartCount + 1;
    const delay = Math.min(
      this.coreProcessRestartBaseDelayMs * 2 ** Math.max(0, restartCount - 1),
      this.coreProcessRestartMaxDelayMs,
    );

    this.updateCoreProcessStatus('restarting', {
      pid: null,
      restartCount,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: `${detail}; retrying in ${delay} ms`,
    });

    this.coreProcessRestartDelayTimer = setTimeout(() => {
      this.coreProcessRestartDelayTimer = null;
      this.startCoreProcess();
    }, delay);
  }

  /**
   * 在 shutdown 发送失败或等待超时后强杀 CoreProcess，并完成 CoreRuntime.stop。
   * 调用方：stop 的 postMessage 异常分支和 shutdown timeout 回调。
   */
  private forceStopCoreProcess(coreProcess: CoreProcessHandle): void {
    if (this.coreProcess !== coreProcess) {
      this.resolvePendingCoreRuntimeStop();
      return;
    }

    const killed = coreProcess.kill();
    this.coreProcess = null;
    this.coreRpcClient.close();
    this.clearCoreProcessShutdownTimeout();
    this.updateCoreProcessStatus('stopped', {
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: killed
        ? 'CoreProcess was force-stopped'
        : 'CoreProcess did not stop',
    });
    this.resolvePendingCoreRuntimeStop();
  }

  /**
   * 合并新的 CoreProcess 状态快照，然后按注册顺序通知 CoreRuntime 状态监听器。
   * 调用方：CoreProcess 启动、事件、heartbeat watchdog、restart 和 stop 路径。
   */
  private updateCoreProcessStatus(
    state: CoreProcessStatus['state'],
    changes: Partial<CoreProcessStatus> = {},
  ): void {
    this.coreProcessStatus = {
      ...this.coreProcessStatus,
      ...changes,
      state,
      updatedAt: new Date(this.now()).toISOString(),
    };

    const snapshot = this.getCoreProcessStatus();
    for (const listener of this.coreProcessStatusListeners) {
      listener(snapshot);
    }
  }

  /**
   * 建立字段完整的 CoreProcess 状态，确保 updateCoreProcessStatus 只覆盖变化字段。
   * 调用方：constructor 创建 CoreRuntime 的首个 stopped 快照。
   */
  private createCoreProcessStatus(
    state: CoreProcessStatus['state'],
  ): CoreProcessStatus {
    return {
      state,
      pid: null,
      restartCount: 0,
      startedAt: null,
      lastHeartbeatAt: null,
      updatedAt: new Date(this.now()).toISOString(),
      detail: null,
    };
  }

  /**
   * 根据开发态或 packaged 运行态解析 CoreProcess 入口的绝对路径。
   * 调用方：launchCoreProcess 在 utilityProcess.fork 前调用。
   */
  private resolveCoreProcessEntry(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'proxy-core', 'core-entry.cjs');
    }
    return path.resolve(
      app.getAppPath(),
      '../proxy-core/dist/proxy-core/core-entry.cjs',
    );
  }

  /**
   * 将 CoreProcess stdout/stderr 加前缀转发到 Desktop 终端。
   * 调用方：launchCoreProcess 在 UtilityProcess fork 成功后立即调用。
   */
  private forwardCoreProcessOutput(coreProcess: UtilityProcess): void {
    coreProcess.stdout?.on('data', (chunk: Buffer | string) => {
      process.stdout.write(`[proxy-core] ${chunk.toString()}`);
    });
    coreProcess.stderr?.on('data', (chunk: Buffer | string) => {
      process.stderr.write(`[proxy-core] ${chunk.toString()}`);
    });
  }

  /**
   * 取消当前 CoreProcess heartbeat deadline，允许消息或新 CoreProcess 重新计时。
   * 调用方：stop、handleCoreProcessExit 和 armCoreProcessHeartbeatTimeout。
   */
  private clearCoreProcessHeartbeatTimeout(): void {
    if (this.coreProcessHeartbeatTimeoutTimer) {
      clearTimeout(this.coreProcessHeartbeatTimeoutTimer);
      this.coreProcessHeartbeatTimeoutTimer = null;
    }
  }

  /**
   * 取消 CoreProcess 退避重启，防止 CoreRuntime.stop 后旧回调启动 CoreProcess。
   * 调用方：start 和 stop。
   */
  private clearCoreProcessRestartDelay(): void {
    if (this.coreProcessRestartDelayTimer) {
      clearTimeout(this.coreProcessRestartDelayTimer);
      this.coreProcessRestartDelayTimer = null;
    }
  }

  /**
   * 取消 CoreProcess 优雅关闭的强杀期限，避免 CoreProcess 退出后再次执行 kill。
   * 调用方：handleCoreProcessExit 和 forceStopCoreProcess。
   */
  private clearCoreProcessShutdownTimeout(): void {
    if (this.coreProcessShutdownTimeoutTimer) {
      clearTimeout(this.coreProcessShutdownTimeoutTimer);
      this.coreProcessShutdownTimeoutTimer = null;
    }
  }

  /**
   * 完成并清空当前 CoreRuntime.stop resolver，保证等待方只被唤醒一次。
   * 调用方：handleCoreProcessExit 的正常停止分支和 forceStopCoreProcess。
   */
  private resolvePendingCoreRuntimeStop(): void {
    const resolve = this.pendingCoreRuntimeStopResolver;
    this.pendingCoreRuntimeStopResolver = null;
    resolve?.();
  }
}

type CoreProcessLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string };

/** handleCoreProcessMessage 调用：把未知 parentPort 数据收窄为 CoreProcess 消息。 */
function readCoreProcessLifecycleMessage(
  value: unknown,
): CoreProcessLifecycleMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (
    value.type === 'ready' &&
    typeof value.pid === 'number' &&
    typeof value.startedAt === 'string'
  ) {
    return { type: 'ready', pid: value.pid, startedAt: value.startedAt };
  }

  if (
    (value.type === 'heartbeat' || value.type === 'stopped') &&
    typeof value.pid === 'number' &&
    typeof value.timestamp === 'string'
  ) {
    return {
      type: value.type,
      pid: value.pid,
      timestamp: value.timestamp,
    };
  }

  return null;
}

/** readCoreProcessLifecycleMessage 调用：排除 null 和非对象值后读取字段。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** startCoreProcess 调用：把未知启动异常转换成可展示的 CoreProcess 重启原因。 */
function readCoreProcessStartError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start CoreProcess';
}