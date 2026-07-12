import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CoreSupervisor,
  type CoreProcessHandle,
} from '../core-supervisor';

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
  it('starts and stops the core gracefully', async () => {
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

    expect(supervisor.getProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4100,
      restartCount: 0,
    });

    const stopPromise = supervisor.stop();
    expect(child.messages.at(-1)).toEqual({ type: 'shutdown' });
    child.emit('exit', 0);

    await expect(stopPromise).resolves.toBeUndefined();
    expect(supervisor.getProcessStatus().state).toBe('stopped');
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

    expect(supervisor.getProcessStatus()).toMatchObject({
      state: 'restarting',
      restartCount: 1,
    });

    vi.advanceTimersByTime(249);
    expect(createProcess).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(createProcess).toHaveBeenCalledTimes(2);
    expect(supervisor.getProcessStatus().state).toBe('starting');
  });

  it('kills and restarts a process whose event loop stops heartbeating', () => {
    vi.useFakeTimers();
    const children = [new FakeCoreProcess(4105), new FakeCoreProcess(4106)];
    const createProcess = vi.fn(() => {
      const child = children[createProcess.mock.calls.length - 1];
      if (!child) {
        throw new Error('No fake process available');
      }
      return child;
    });
    const supervisor = new CoreSupervisor({
      createProcess,
      heartbeatTimeoutMs: 4_000,
      restartBaseDelayMs: 250,
      now: () => Date.now(),
    });

    supervisor.start();
    children[0]?.emit('message', {
      type: 'ready',
      pid: 4105,
      startedAt: '2026-07-12T00:00:00.000Z',
    });

    vi.advanceTimersByTime(4_000);
    expect(children[0]?.killed).toBe(true);
    expect(supervisor.getProcessStatus()).toMatchObject({
      state: 'unresponsive',
      detail: 'No heartbeat for 4000 ms',
    });

    children[0]?.emit('exit', 1);
    expect(supervisor.getProcessStatus().state).toBe('restarting');
    vi.advanceTimersByTime(250);
    expect(createProcess).toHaveBeenCalledTimes(2);
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
    expect(supervisor.getProcessStatus()).toMatchObject({
      state: 'stopped',
      detail: 'Proxy Core was force-stopped',
    });
  });

  it('ignores heartbeats that arrive during graceful shutdown', () => {
    vi.useFakeTimers();
    const child = new FakeCoreProcess(4104);
    const supervisor = new CoreSupervisor({
      createProcess: () => child,
    });

    supervisor.start();
    child.emit('spawn');
    child.emit('message', {
      type: 'ready',
      pid: child.pid,
      startedAt: '2026-07-11T00:00:00.000Z',
    });
    expect(supervisor.getProcessStatus().state).toBe('running');

    void supervisor.stop();
    expect(supervisor.getProcessStatus().state).toBe('stopping');

    child.emit('message', {
      type: 'heartbeat',
      pid: child.pid,
      timestamp: '2026-07-11T00:00:01.000Z',
    });
    expect(supervisor.getProcessStatus().state).toBe('stopping');

    child.emit('exit', 0);
    expect(supervisor.getProcessStatus().state).toBe('stopped');
  });
});