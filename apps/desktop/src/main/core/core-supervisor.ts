import type { CoreProcessStatus } from '../../shared/desktop-api';

export interface CoreProcessHandle {
  readonly pid: number | undefined;
  onSpawn(listener: () => void): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
  onError(listener: (detail: string) => void): void;
  postMessage(message: unknown): void;
  kill(): boolean;
}

interface CoreSupervisorOptions {
  createProcess: () => CoreProcessHandle;
  heartbeatTimeoutMs?: number;
  restartBaseDelayMs?: number;
  restartMaxDelayMs?: number;
  shutdownTimeoutMs?: number;
  now?: () => number;
}

type StatusListener = (status: CoreProcessStatus) => void;

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 4_000;
const DEFAULT_RESTART_BASE_DELAY_MS = 250;
const DEFAULT_RESTART_MAX_DELAY_MS = 5_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_500;

/**
 * 只管理 Core 子进程生命周期：启动、heartbeat 卡死检测、退出重启和停止。
 * 业务 command 不经过这里，而是由 CoreRpcClient 走独立 MessagePort。
 */
export class CoreSupervisor {
  private readonly createProcess: () => CoreProcessHandle;
  private readonly heartbeatTimeoutMs: number;
  private readonly restartBaseDelayMs: number;
  private readonly restartMaxDelayMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly now: () => number;
  private readonly listeners = new Set<StatusListener>();

  private child: CoreProcessHandle | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResolver: (() => void) | null = null;
  private desiredRunning = false;
  private lastHeartbeatAtMs: number | null = null;
  private status: CoreProcessStatus;

  constructor(options: CoreSupervisorOptions) {
    this.createProcess = options.createProcess;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.restartBaseDelayMs =
      options.restartBaseDelayMs ?? DEFAULT_RESTART_BASE_DELAY_MS;
    this.restartMaxDelayMs =
      options.restartMaxDelayMs ?? DEFAULT_RESTART_MAX_DELAY_MS;
    this.shutdownTimeoutMs =
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.status = this.createStatus('stopped');
  }

  getProcessStatus(): CoreProcessStatus {
    return { ...this.status };
  }

  onProcessStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.desiredRunning && this.child) {
      return;
    }

    this.desiredRunning = true;
    this.clearRestartTimer();
    this.spawn();
  }

  async stop(): Promise<void> {
    this.desiredRunning = false;
    this.clearRestartTimer();
    this.clearHeartbeatTimer();

    const child = this.child;
    if (!child) {
      this.updateStatus('stopped', { pid: null, detail: null });
      return;
    }

    this.updateStatus('stopping', {
      pid: child.pid ?? this.status.pid,
      detail: 'Waiting for Proxy Core to stop',
    });

    return new Promise<void>((resolve) => {
      this.stopResolver = resolve;

      try {
        child.postMessage({ type: 'shutdown' });
      } catch {
        this.forceStop(child);
        return;
      }

      this.shutdownTimer = setTimeout(
        () => this.forceStop(child),
        this.shutdownTimeoutMs,
      );
    });
  }

  private spawn(): void {
    if (!this.desiredRunning || this.child) {
      return;
    }

    this.updateStatus('starting', {
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: 'Starting Proxy Core',
    });

    let child: CoreProcessHandle;
    try {
      child = this.createProcess();
    } catch (error) {
      this.scheduleRestart(readError(error));
      return;
    }

    this.child = child;
    this.lastHeartbeatAtMs = this.now();
    this.bindChild(child);
    this.armHeartbeatTimer(child);
  }

  private bindChild(child: CoreProcessHandle): void {
    child.onSpawn(() => {
      if (this.child !== child) {
        return;
      }

      this.updateStatus('starting', {
        pid: child.pid ?? null,
        detail: 'Proxy Core started; waiting for heartbeat',
      });
    });

    child.onMessage((message) => this.handleMessage(child, message));
    child.onError((detail) => {
      if (this.child === child) {
        this.updateStatus('unresponsive', { detail });
      }
    });
    child.onExit((code) => this.handleExit(child, code));
  }

  private handleMessage(child: CoreProcessHandle, message: unknown): void {
    if (this.child !== child) {
      return;
    }

    const coreMessage = readCoreMessage(message);
    if (!coreMessage) {
      return;
    }

    if (coreMessage.type === 'stopped') {
      return;
    }

    if (!this.desiredRunning) {
      return;
    }

    this.lastHeartbeatAtMs = this.now();
    const timestamp =
      coreMessage.type === 'ready'
        ? coreMessage.startedAt
        : coreMessage.timestamp;

    // 收到 ready/heartbeat 只说明子进程事件循环仍能响应，因此状态叫 running，
    // 不在这里推断代理监听、数据库或其他业务模块是否健康。
    this.updateStatus('running', {
      pid: coreMessage.pid,
      startedAt:
        coreMessage.type === 'ready'
          ? coreMessage.startedAt
          : this.status.startedAt,
      lastHeartbeatAt: timestamp,
      detail: null,
    });
    this.armHeartbeatTimer(child);
  }

  private handleExit(child: CoreProcessHandle, code: number): void {
    if (this.child !== child) {
      return;
    }

    this.child = null;
    this.clearHeartbeatTimer();
    this.clearShutdownTimer();

    if (!this.desiredRunning) {
      this.updateStatus('stopped', {
        pid: null,
        startedAt: null,
        lastHeartbeatAt: null,
        detail: null,
      });
      this.resolveStop();
      return;
    }

    this.scheduleRestart(`Proxy Core exited with code ${code}`);
  }

  private armHeartbeatTimer(child: CoreProcessHandle): void {
    // heartbeat 只回答“Core 事件循环是否仍在运行”。进程卡死但未退出时，
    // Main 会在超时后杀掉它，再走现有的退避重启流程。
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      if (this.child !== child || !this.desiredRunning) {
        return;
      }

      const elapsed = this.now() - (this.lastHeartbeatAtMs ?? 0);
      if (elapsed < this.heartbeatTimeoutMs) {
        this.armHeartbeatTimer(child);
        return;
      }

      this.updateStatus('unresponsive', {
        detail: `No heartbeat for ${elapsed} ms`,
      });
      child.kill();
    }, this.heartbeatTimeoutMs);
  }

  private scheduleRestart(detail: string): void {
    if (!this.desiredRunning) {
      return;
    }

    const restartCount = this.status.restartCount + 1;
    const delay = Math.min(
      this.restartBaseDelayMs * 2 ** Math.max(0, restartCount - 1),
      this.restartMaxDelayMs,
    );

    this.updateStatus('restarting', {
      pid: null,
      restartCount,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: `${detail}; retrying in ${delay} ms`,
    });

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawn();
    }, delay);
  }

  private forceStop(child: CoreProcessHandle): void {
    if (this.child !== child) {
      this.resolveStop();
      return;
    }

    const killed = child.kill();
    this.child = null;
    this.clearShutdownTimer();
    this.updateStatus('stopped', {
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      detail: killed ? 'Proxy Core was force-stopped' : 'Proxy Core did not stop',
    });
    this.resolveStop();
  }

  private updateStatus(
    state: CoreProcessStatus['state'],
    changes: Partial<CoreProcessStatus> = {},
  ): void {
    this.status = {
      ...this.status,
      ...changes,
      state,
      updatedAt: new Date(this.now()).toISOString(),
    };

    const snapshot = this.getProcessStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private createStatus(
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

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private clearShutdownTimer(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
  }

  private resolveStop(): void {
    const resolve = this.stopResolver;
    this.stopResolver = null;
    resolve?.();
  }
}

type CoreMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string };

function readCoreMessage(value: unknown): CoreMessage | null {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to start Proxy Core';
}