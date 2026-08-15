import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BREAKPOINT_QUEUE_LIMIT } from '../../internal/constants';
import { BreakpointQueue } from '../../internal/breakpoint-queue';

describe('BreakpointQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a suspended breakpoint as continued', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend('request', 30_000, 'continue')!;
    expect(breakpointQueue.size).toBe(1);
    expect(breakpointQueue.resolve(id, 'continue')).toBe('continued');
    await expect(outcome).resolves.toEqual({ state: 'continued' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('resolves with an edit as edited', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend('request', 30_000, 'continue')!;
    const edit = { headers: [{ name: 'x', value: '1' }] };
    expect(breakpointQueue.resolve(id, 'continue', edit)).toBe('edited');
    await expect(outcome).resolves.toEqual({ state: 'edited', edit });
  });

  it('resolves as dropped', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend('response', 30_000, 'drop')!;
    expect(breakpointQueue.resolve(id, 'drop')).toBe('dropped');
    await expect(outcome).resolves.toEqual({ state: 'dropped' });
  });

  it('auto-resolves as timed_out after the timeout, carrying the policy', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { outcome } = breakpointQueue.suspend('request', 1_000, 'drop')!;
    vi.advanceTimersByTime(1_000);
    await expect(outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'drop',
    });
    expect(breakpointQueue.size).toBe(0);
  });

  it('closeAll resolves every pending breakpoint as timed_out', async () => {
    const breakpointQueue = new BreakpointQueue();
    const a = breakpointQueue.suspend('request', 30_000, 'continue')!;
    const b = breakpointQueue.suspend('response', 30_000, 'drop')!;
    breakpointQueue.closeAll();
    await expect(a.outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'continue',
    });
    await expect(b.outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'drop',
    });
    expect(breakpointQueue.size).toBe(0);
  });

  it('aborts only breakpoints attached to the disconnected request', async () => {
    const breakpointQueue = new BreakpointQueue();
    const aborted = breakpointQueue.suspend(
      'request',
      30_000,
      'continue',
      undefined,
      'request-a',
    )!;
    const untouched = breakpointQueue.suspend(
      'response',
      30_000,
      'continue',
      undefined,
      'request-b',
    )!;

    expect(breakpointQueue.abortRequest('request-a')).toBe(1);
    await expect(aborted.outcome).resolves.toEqual({ state: 'aborted' });
    expect(breakpointQueue.list().map((entry) => entry.id)).toEqual([untouched.id]);

    breakpointQueue.resolve(untouched.id, 'continue');
    await expect(untouched.outcome).resolves.toEqual({ state: 'continued' });
  });

  it('returns null for an unknown or already-resolved breakpoint', () => {
    const breakpointQueue = new BreakpointQueue();
    const { id } = breakpointQueue.suspend('request', 30_000, 'continue')!;
    expect(breakpointQueue.resolve('missing', 'continue')).toBeNull();
    expect(breakpointQueue.resolve(id, 'continue')).toBe('continued');
    expect(breakpointQueue.resolve(id, 'continue')).toBeNull();
  });

  it('refuses to suspend past the queue limit and counts the auto-continued hits', () => {
    const breakpointQueue = new BreakpointQueue();
    for (let index = 0; index < BREAKPOINT_QUEUE_LIMIT; index += 1) {
      expect(breakpointQueue.suspend('request', 30_000, 'continue')).not.toBeNull();
    }
    expect(breakpointQueue.suspend('request', 30_000, 'continue')).toBeNull();
    expect(breakpointQueue.suspend('response', 30_000, 'continue')).toBeNull();
    expect(breakpointQueue.size).toBe(BREAKPOINT_QUEUE_LIMIT);
    expect(breakpointQueue.autoContinued).toBe(2);

    const [first] = breakpointQueue.list();
    breakpointQueue.resolve(first!.id, 'continue');
    expect(breakpointQueue.suspend('request', 30_000, 'continue')).not.toBeNull();
    expect(breakpointQueue.autoContinued).toBe(2);
  });

  it('lists pending breakpoints in insertion order', () => {
    const breakpointQueue = new BreakpointQueue();
    breakpointQueue.suspend('request', 30_000, 'continue');
    breakpointQueue.suspend('response', 30_000, 'drop');
    expect(breakpointQueue.list().map((entry) => entry.phase)).toEqual([
      'request',
      'response',
    ]);
  });

  it('preserves websocket message metadata and editable body snapshots', () => {
    const breakpointQueue = new BreakpointQueue();
    breakpointQueue.suspend('websocket', 30_000, 'continue', {
      ruleName: 'WebSocket message',
      url: 'ws://example.test/socket',
      direction: 'client-to-server',
      opcode: 1,
      bodyFormat: 'text',
      headers: [],
      bodyAvailable: true,
      body: 'hello',
    });
    expect(breakpointQueue.list()[0]).toMatchObject({
      phase: 'websocket',
      snapshot: {
        direction: 'client-to-server',
        opcode: 1,
        bodyFormat: 'text',
        body: 'hello',
      },
    });
  });

  it('does not fire the timeout after a manual resolve', async () => {
    const breakpointQueue = new BreakpointQueue();
    const { id, outcome } = breakpointQueue.suspend('request', 1_000, 'drop')!;
    expect(breakpointQueue.resolve(id, 'continue')).toBe('continued');
    vi.advanceTimersByTime(2_000);
    await expect(outcome).resolves.toEqual({ state: 'continued' });
  });
});
