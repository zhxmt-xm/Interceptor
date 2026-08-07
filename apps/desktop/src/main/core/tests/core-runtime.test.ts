import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../core-runtime';
import type { CoreProcessHandle } from '../../interfaces';

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

  it('gracefully restarts CoreProcess without dropping long-lived listeners', async () => {
    vi.useFakeTimers();
    const coreProcesses = [
      new FakeCoreProcessHandle(4120),
      new FakeCoreProcessHandle(4121),
    ];
    const launchCoreProcess = vi.fn(() => {
      const coreProcess = coreProcesses[launchCoreProcess.mock.calls.length - 1];
      if (!coreProcess) {
        throw new Error('No fake CoreProcess available');
      }
      return coreProcess;
    });
    const coreRuntime = new TestCoreRuntime(launchCoreProcess);
    const statuses: string[] = [];
    const ready = vi.fn();
    coreRuntime.onCoreProcessStatusChange((status) => statuses.push(status.state));
    coreRuntime.onCoreProcessReady(ready);

    coreRuntime.start();
    coreProcesses[0]?.emit('message', {
      type: 'ready',
      pid: 4120,
      startedAt: '2026-08-07T00:00:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(0);

    const restartPromise = coreRuntime.restart();
    expect(coreProcesses[0]?.messages.at(-1)).toEqual({ type: 'shutdown' });
    coreProcesses[0]?.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(launchCoreProcess).toHaveBeenCalledTimes(2);

    coreProcesses[1]?.emit('message', {
      type: 'ready',
      pid: 4121,
      startedAt: '2026-08-07T00:00:01.000Z',
    });
    await vi.advanceTimersByTimeAsync(0);

    await expect(restartPromise).resolves.toBeUndefined();
    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4121,
    });
    expect(ready).toHaveBeenCalledTimes(2);
    expect(statuses).toContain('stopped');
    expect(coreProcesses[0]?.killed).toBe(false);
  });

  it('rejects an explicit restart when the new CoreProcess initialization fails', async () => {
    vi.useFakeTimers();
    const coreProcesses = [
      new FakeCoreProcessHandle(4130),
      new FakeCoreProcessHandle(4131),
    ];
    const launchCoreProcess = vi.fn(() => {
      const coreProcess = coreProcesses[launchCoreProcess.mock.calls.length - 1];
      if (!coreProcess) throw new Error('No fake CoreProcess available');
      return coreProcess;
    });
    const coreRuntime = new TestCoreRuntime(launchCoreProcess);
    let generation = 0;
    coreRuntime.onCoreProcessReady(async () => {
      generation += 1;
      if (generation === 2) throw new Error('TLS configuration failed');
    });

    coreRuntime.start();
    coreProcesses[0]?.emit('message', {
      type: 'ready',
      pid: 4130,
      startedAt: '2026-08-07T00:00:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(0);

    const restartPromise = coreRuntime.restart();
    const restartExpectation = expect(restartPromise).rejects.toThrow(
      'Core initialization failed: TLS configuration failed',
    );
    coreProcesses[0]?.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(0);
    coreProcesses[1]?.emit('message', {
      type: 'ready',
      pid: 4131,
      startedAt: '2026-08-07T00:00:01.000Z',
    });
    await vi.advanceTimersByTimeAsync(0);

    await restartExpectation;
  });

  it('waits for ready initialization before publishing running', async () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4110);
    const coreRuntime = new TestCoreRuntime(() => coreProcess, {
      now: () => Date.now(),
    });
    let finishInitialization: (() => void) | undefined;
    const initialization = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    coreRuntime.onCoreProcessReady(() => initialization);

    coreRuntime.start();
    coreProcess.emit('spawn');
    coreProcess.emit('message', {
      type: 'ready',
      pid: coreProcess.pid,
      startedAt: '2026-07-23T00:00:00.000Z',
    });
    coreProcess.emit('message', {
      type: 'heartbeat',
      pid: coreProcess.pid,
      timestamp: '2026-07-23T00:00:01.000Z',
    });

    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'starting',
      pid: 4110,
    });

    finishInitialization?.();
    await initialization;
    await vi.advanceTimersByTimeAsync(0);

    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4110,
      startedAt: '2026-07-23T00:00:00.000Z',
      lastHeartbeatAt: '2026-07-23T00:00:01.000Z',
    });
  });

  it('keeps the same CoreProcess running when ready initialization fails', async () => {
    vi.useFakeTimers();
    const coreProcess = new FakeCoreProcessHandle(4111);
    const coreRuntime = new TestCoreRuntime(() => coreProcess, {
      now: () => Date.now(),
    });
    coreRuntime.onCoreProcessReady(async () => {
      throw new Error('TLS configuration failed');
    });

    coreRuntime.start();
    coreProcess.emit('spawn');
    coreProcess.emit('message', {
      type: 'ready',
      pid: coreProcess.pid,
      startedAt: '2026-07-23T00:00:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4111,
      restartCount: 0,
      detail: 'Core initialization failed: TLS configuration failed',
    });
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

  it('does not kill or restart a ready CoreProcess when heartbeats pause', () => {
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
      coreProcessStartupTimeoutMs: 4_000,
      coreProcessRestartBaseDelayMs: 250,
      now: () => Date.now(),
    });

    coreRuntime.start();
    coreProcesses[0]?.emit('message', {
      type: 'ready',
      pid: 4105,
      startedAt: '2026-07-12T00:00:00.000Z',
    });

    vi.advanceTimersByTime(60_000);
    expect(coreProcesses[0]?.killed).toBe(false);
    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'running',
      pid: 4105,
      restartCount: 0,
    });
    expect(launchCoreProcess).toHaveBeenCalledTimes(1);
  });

  it('waits for the startup grace period before killing a CoreProcess that never signals ready', () => {
    vi.useFakeTimers();
    const coreProcesses = [
      new FakeCoreProcessHandle(4108),
      new FakeCoreProcessHandle(4109),
    ];
    const launchCoreProcess = vi.fn(() => {
      const coreProcess = coreProcesses[launchCoreProcess.mock.calls.length - 1];
      if (!coreProcess) {
        throw new Error('No fake CoreProcess available');
      }
      return coreProcess;
    });
    const coreRuntime = new TestCoreRuntime(launchCoreProcess, {
      coreProcessStartupTimeoutMs: 10_000,
      coreProcessRestartBaseDelayMs: 250,
      now: () => Date.now(),
    });

    coreRuntime.start();
    coreProcesses[0]?.emit('spawn');

    // 启动宽限期内不能把仍在加载的 Core 误杀。
    vi.advanceTimersByTime(4_000);
    expect(coreProcesses[0]?.killed).toBe(false);
    expect(coreRuntime.getCoreProcessStatus().state).toBe('starting');

    // 只有越过启动宽限期后才判定 unresponsive 并 kill。
    vi.advanceTimersByTime(6_000);
    expect(coreProcesses[0]?.killed).toBe(true);
    expect(coreRuntime.getCoreProcessStatus()).toMatchObject({
      state: 'unresponsive',
      detail: 'No ready signal for 10000 ms',
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