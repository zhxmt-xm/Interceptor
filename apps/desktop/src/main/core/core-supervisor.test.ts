import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CoreSupervisor,
  type CoreProcessHandle,
} from './core-supervisor';

class FakeCoreProcess extends EventEmitter implements CoreProcessHandle {
  readonly messages: unknown[] = [];
  killed = false;

  constructor(readonly pid: number) {
    super();
  }

  onSpawn(listener: () => void): void {
    this.on('spawn', listener);
  }

  onMessage(listener: (message: unknown) => void): void {
    this.on('message', listener);
  }

  onExit(listener: (code: number) => void): void {
    this.on('exit', listener);
  }

  onError(listener: (detail: string) => void): void {
    this.on('core-error', listener);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CoreSupervisor', () => {
  it('starts, checks health, and stops the core gracefully', async () => {
    vi.useFakeTimers();
    const child = new FakeCoreProcess(4100);
    const supervisor = new CoreSupervisor({
      createProcess: () => child,
      now: () => Date.now(),
    });

    supervisor.start();
    child.emit('spawn');
    child.emit('message', {
      type: 'ready',
      pid: child.pid,
      startedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(supervisor.getStatus()).toMatchObject({
      state: 'healthy',
      pid: 4100,
      restartCount: 0,
    });

    const healthPromise = supervisor.checkHealth();
    const healthRequest = child.messages.at(-1);
    expect(healthRequest).toMatchObject({ type: 'health-check' });

    child.emit('message', {
      type: 'health',
      correlationId: readCorrelationId(healthRequest),
      pid: child.pid,
      timestamp: '2026-07-11T00:00:01.000Z',
    });
    await expect(healthPromise).resolves.toBe(true);

    const stopPromise = supervisor.stop();
    expect(child.messages.at(-1)).toEqual({ type: 'shutdown' });
    child.emit('exit', 0);

    await expect(stopPromise).resolves.toBeUndefined();
    expect(supervisor.getStatus().state).toBe('stopped');
    expect(child.killed).toBe(false);
  });

  it('restarts the core with backoff after an unexpected exit', () => {
    vi.useFakeTimers();
    const children = [new FakeCoreProcess(4101), new FakeCoreProcess(4102)];
    const createProcess = vi.fn(() => {
      const child = children[createProcess.mock.calls.length - 1];
      if (!child) {
        throw new Error('No fake process available');
      }
      return child;
    });
    const supervisor = new CoreSupervisor({
      createProcess,
      restartBaseDelayMs: 250,
    });

    supervisor.start();
    children[0]?.emit('exit', 2);

    expect(supervisor.getStatus()).toMatchObject({
      state: 'restarting',
      restartCount: 1,
    });

    vi.advanceTimersByTime(249);
    expect(createProcess).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(createProcess).toHaveBeenCalledTimes(2);
    expect(supervisor.getStatus().state).toBe('starting');
  });

  it('force-stops a core that misses the graceful shutdown deadline', async () => {
    vi.useFakeTimers();
    const child = new FakeCoreProcess(4103);
    const supervisor = new CoreSupervisor({
      createProcess: () => child,
      shutdownTimeoutMs: 100,
    });

    supervisor.start();
    const stopPromise = supervisor.stop();
    await vi.advanceTimersByTimeAsync(100);

    await expect(stopPromise).resolves.toBeUndefined();
    expect(child.killed).toBe(true);
    expect(supervisor.getStatus()).toMatchObject({
      state: 'stopped',
      detail: 'Proxy Core was force-stopped',
    });
  });
});

function readCorrelationId(message: unknown): string {
  if (
    typeof message === 'object' &&
    message !== null &&
    'correlationId' in message &&
    typeof message.correlationId === 'string'
  ) {
    return message.correlationId;
  }

  throw new Error('Health request is missing a correlation ID');
}