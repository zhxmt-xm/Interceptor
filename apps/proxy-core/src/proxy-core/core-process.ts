import process from 'node:process';

import { CoreApplication } from './core-application';
import type { RpcMessagePort } from './core-rpc-server';

export interface ParentMessageEvent {
  data: unknown;
  ports?: unknown[];
}

export interface CoreParentPort {
  on(event: 'message', listener: (event: ParentMessageEvent) => void): void;
  postMessage(message: CoreLifecycleMessage): void;
}

type CoreLifecycleMessage =
  | { type: 'ready'; pid: number; startedAt: string }
  | { type: 'heartbeat'; pid: number; timestamp: string }
  | { type: 'stopped'; pid: number; timestamp: string };

const HEARTBEAT_INTERVAL_MS = 1_000;

/**
 * Proxy Core 进程的生命周期对象。
 *
 * parentPort 只传递 ready/heartbeat/shutdown 和一次性的 RPC port；真正的
 * command 由 CoreRpcServer 处理。heartbeat 的唯一目的，是让 Main 能发现
 * “进程仍存在但事件循环已经卡死”的情况并自动重启。
 */
export class CoreProcess {
  private readonly application: CoreApplication;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(
    private readonly parentPort: CoreParentPort,
    private readonly pid = process.pid,
    private readonly now: () => number = Date.now,
  ) {
    this.application = new CoreApplication({
      now,
      onFatalError: () => setImmediate(() => process.exit(1)),
    });
  }

  start(): void {
    const startedAt = this.timestamp();
    this.parentPort.on('message', (event) => this.handleParentMessage(event));
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());

    this.parentPort.postMessage({ type: 'ready', pid: this.pid, startedAt });
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.application.close('shutdown');
    this.parentPort.postMessage({
      type: 'stopped',
      pid: this.pid,
      timestamp: this.timestamp(),
    });
    setImmediate(() => process.exit(0));
  }

  private handleParentMessage(event: ParentMessageEvent): void {
    const rpcPort = readRpcPort(event);
    if (rpcPort) {
      this.application.attach(rpcPort);
      return;
    }
    if (isRecord(event.data) && event.data.type === 'shutdown') {
      this.stop();
    }
  }

  private sendHeartbeat(): void {
    this.parentPort.postMessage({
      type: 'heartbeat',
      pid: this.pid,
      timestamp: this.timestamp(),
    });
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
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