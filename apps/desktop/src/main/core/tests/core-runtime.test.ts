import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CoreRuntime,
  type CoreProcessHandle,
} from '../core-runtime';

type TestCoreRuntimeOptions = NonNullable<
  ConstructorParameters<typeof CoreRuntime>[0]
>;

class FakeCoreProcessHandle extends EventEmitter implements CoreProcessHandle {
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

class TestCoreRuntime extends CoreRuntime {
  constructor(
    private readonly launchCoreProcessForTest: () => CoreProcessHandle,
    options: TestCoreRuntimeOptions = {},
  ) {
    super(options);
  }

  protected override launchCoreProcess(): CoreProcessHandle {
    return this.launchCoreProcessForTest();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CoreRuntime', () => {
  it('starts and stops CoreProcess gracefully', async () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4100);
    const coreRuntime = new TestCoreRuntime(() => coreProcess, {
      now: () => Date.now(),
    });

    coreRuntime.start();
    coreProcess.emit('spawn');
    coreProcess.emit('message', {
      type: 'ready',
      pid: coreProcess.pid,
      startedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4100,
      restartCount: 0,
    });

    const stopPromise = coreRuntime.stop();
    expect(coreProcess.messages.at(-1)).toEqual({ type: 'shutdown' });
    coreProcess.emit('exit', 0);

    await expect(stopPromise).resolves.toBeUndefined();
    expect(coreRuntime.getCoreProcessStatus().state).toBe('stopped');
    expect(coreProcess.killed).toBe(false);
  });

  it('restarts CoreProcess with backoff after an unexpected exit', () => {
    vi.useFakeTimers();
    const coreProcesses = [
      new FakeCoreProcessHandle(4101),
      new FakeCoreProcessHandle(4102),
    ];
    const launchCoreProcess = vi.fn(() => {
      const coreProcess = coreProcesses[launchCoreProcess.mock.calls.length - 1];
      if (!coreProcess) {
        throw new Error('No fake CoreProcess available');
      }
      return coreProcess;
    });
    const coreRuntime = new TestCoreRuntime(launchCoreProcess, {
      coreProcessRestartBaseDelayMs: 250,
    });

    coreRuntime.start();
    coreProcesses[0]?.emit('exit', 2);

    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'restarting',
      restartCount: 1,
    });

    vi.advanceTimersByTime(249);
    expect(launchCoreProcess).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(launchCoreProcess).toHaveBeenCalledTimes(2);
    expect(coreRuntime.getCoreProcessStatus().state).toBe('starting');
  });

  it('kills and restarts CoreProcess when heartbeat stops', () => {
    vi.useFakeTimers();
    const coreProcesses = [
      new FakeCoreProcessHandle(4105),
      new FakeCoreProcessHandle(4106),
    ];
    const launchCoreProcess = vi.fn(() => {
      const coreProcess = coreProcesses[launchCoreProcess.mock.calls.length - 1];
      if (!coreProcess) {
        throw new Error('No fake CoreProcess available');
      }
      return coreProcess;
    });
    const coreRuntime = new TestCoreRuntime(launchCoreProcess, {
      coreProcessHeartbeatTimeoutMs: 4_000,
      coreProcessRestartBaseDelayMs: 250,
      now: () => Date.now(),
    });

    coreRuntime.start();
    coreProcesses[0]?.emit('message', {
      type: 'ready',
      pid: 4105,
      startedAt: '2026-07-12T00:00:00.000Z',
    });

    vi.advanceTimersByTime(4_000);
    expect(coreProcesses[0]?.killed).toBe(true);
    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'unresponsive',
      detail: 'No heartbeat for 4000 ms',
    });

    coreProcesses[0]?.emit('exit', 1);
  expect(coreRuntime.getCoreProcessStatus().state).toBe('restarting');
    vi.advanceTimersByTime(250);
    expect(launchCoreProcess).toHaveBeenCalledTimes(2);
  });

  it('force-stops CoreProcess after the shutdown deadline', async () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4103);
    const coreRuntime = new TestCoreRuntime(() => coreProcess, {
      coreProcessShutdownTimeoutMs: 100,
    });

    coreRuntime.start();
    const stopPromise = coreRuntime.stop();
    await vi.advanceTimersByTimeAsync(100);

    await expect(stopPromise).resolves.toBeUndefined();
    expect(coreProcess.killed).toBe(true);
    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'stopped',
      detail: 'CoreProcess was force-stopped',
    });
  });

  it('ignores CoreProcess heartbeats during graceful shutdown', () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4104);
    const coreRuntime = new TestCoreRuntime(() => coreProcess);

    coreRuntime.start();
    coreProcess.emit('spawn');
    coreProcess.emit('message', {
      type: 'ready',
      pid: coreProcess.pid,
      startedAt: '2026-07-11T00:00:00.000Z',
    });
    expect(coreRuntime.getCoreProcessStatus().state).toBe('running');

    void coreRuntime.stop();
    expect(coreRuntime.getCoreProcessStatus().state).toBe('stopping');

    coreProcess.emit('message', {
      type: 'heartbeat',
      pid: coreProcess.pid,
      timestamp: '2026-07-11T00:00:01.000Z',
    });
    expect(coreRuntime.getCoreProcessStatus().state).toBe('stopping');

    coreProcess.emit('exit', 0);
    expect(coreRuntime.getCoreProcessStatus().state).toBe('stopped');
  });

  it('stops notifying a removed CoreProcess status listener', () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4107);
    const coreRuntime = new TestCoreRuntime(() => coreProcess);
    const listener = vi.fn();
    const removeListener = coreRuntime.onCoreProcessStatusChange(listener);

    coreRuntime.start();
    expect(listener).toHaveBeenCalledTimes(1);

    removeListener();
    coreProcess.emit('message', {
      type: 'ready',
      pid: coreProcess.pid,
      startedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears CoreProcess status listeners after CoreRuntime stops', async () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4108);
    const coreRuntime = new TestCoreRuntime(() => coreProcess);
    const listener = vi.fn();
    coreRuntime.onCoreProcessStatusChange(listener);

    coreRuntime.start();
    const stopPromise = coreRuntime.stop();
    coreProcess.emit('exit', 0);
    await stopPromise;
    const callsAfterStop = listener.mock.calls.length;

    coreRuntime.start();

    expect(listener).toHaveBeenCalledTimes(callsAfterStop);
  });
});