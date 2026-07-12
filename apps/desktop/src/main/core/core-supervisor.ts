import type { CoreStatus } from '../../shared/desktop-api';

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
  healthCheckTimeoutMs?: number;
  restartBaseDelayMs?: number;
  restartMaxDelayMs?: number;
  shutdownTimeoutMs?: number;
  now?: () => number;
}

interface PendingHealthCheck {
  resolve: (healthy: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

type StatusListener = (status: CoreStatus) => void;

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 4_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1_500;
const DEFAULT_RESTART_BASE_DELAY_MS = 250;
const DEFAULT_RESTART_MAX_DELAY_MS = 5_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_500;

export class CoreSupervisor {
  private readonly createProcess: () => CoreProcessHandle;
  private readonly heartbeatTimeoutMs: number;
  private readonly healthCheckTimeoutMs: number;
  private readonly restartBaseDelayMs: number;
  private readonly restartMaxDelayMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly now: () => number;
  private readonly listeners = new Set<StatusListener>();
  private readonly pendingHealthChecks = new Map<string, PendingHealthCheck>();

  private child: CoreProcessHandle | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private stopResolver: (() => void) | null = null;
  private desiredRunning = false;
  private healthCheckSequence = 0;
  private lastHeartbeatAtMs: number | null = null;
  private status: CoreStatus;

  constructor(options: CoreSupervisorOptions) {
    this.createProcess = options.createProcess;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.healthCheckTimeoutMs =
      options.healthCheckTimeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
    this.restartBaseDelayMs =
      options.restartBaseDelayMs ?? DEFAULT_RESTART_BASE_DELAY_MS;
    this.restartMaxDelayMs =
      options.restartMaxDelayMs ?? DEFAULT_RESTART_MAX_DELAY_MS;
    this.shutdownTimeoutMs =
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.status = this.createStatus('stopped');
  }

  getStatus(): CoreStatus {
    return { ...this.status };
  }

  onStatusChange(listener: StatusListener): () => void {
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
    this.resolvePendingHealthChecks(false);

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

  checkHealth(): Promise<boolean> {
    const child = this.child;
    if (!child || this.status.state === 'stopping') {
      return Promise.resolve(false);
    }

    const correlationId = `health-${this.now()}-${++this.healthCheckSequence}`;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingHealthChecks.delete(correlationId);
        resolve(false);
      }, this.healthCheckTimeoutMs);

      this.pendingHealthChecks.set(correlationId, { resolve, timer });

      try {
        child.postMessage({ type: 'health-check', correlationId });
      } catch {
        clearTimeout(timer);
        this.pendingHealthChecks.delete(correlationId);
        resolve(false);
      }
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
        this.updateStatus('unhealthy', { detail });
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

    if (coreMessage.type === 'health') {
      const pending = this.pendingHealthChecks.get(coreMessage.correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingHealthChecks.delete(coreMessage.correlationId);
        pending.resolve(true);
      }
    }

    if (!this.desiredRunning) {
      return;
    }

    this.lastHeartbeatAtMs = this.now();
    const timestamp =
      coreMessage.type === 'ready'
        ? coreMessage.startedAt
        : coreMessage.timestamp;

    this.updateStatus('healthy', {
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
    this.resolvePendingHealthChecks(false);

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

      this.updateStatus('unhealthy', {
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
    state: CoreStatus['state'],
    changes: Partial<CoreStatus> = {},
  ): void {
    this.status = {
      ...this.status,
      ...changes,
      state,
      updatedAt: new Date(this.now()).toISOString(),
    };

    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private createStatus(state: CoreStatus['state']): CoreStatus {
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

  private resolvePendingHealthChecks(healthy: boolean): void {
    for (const pending of this.pendingHealthChecks.values()) {
      clearTimeout(pending.timer);
      pending.resolve(healthy);
    }
    this.pendingHealthChecks.clear();
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
  | {
      type: 'health';
      correlationId: string;
      pid: number;
      timestamp: string;
    }
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

  if (
    value.type === 'health' &&
    typeof value.correlationId === 'string' &&
    typeof value.pid === 'number' &&
    typeof value.timestamp === 'string'
  ) {
    return {
      type: 'health',
      correlationId: value.correlationId,
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