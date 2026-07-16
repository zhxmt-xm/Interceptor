import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakpointQueue } from '../breakpoint-queue';

describe('BreakpointQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a suspended breakpoint as continued', async () => {
    const queue = new BreakpointQueue();
    const { id, outcome } = queue.suspend('request', 30_000, 'continue');
    expect(queue.size).toBe(1);
    expect(queue.resolve(id, 'continue')).toBe('continued');
    await expect(outcome).resolves.toEqual({ state: 'continued' });
    expect(queue.size).toBe(0);
  });

  it('resolves with an edit as edited', async () => {
    const queue = new BreakpointQueue();
    const { id, outcome } = queue.suspend('request', 30_000, 'continue');
    const edit = { headers: [{ name: 'x', value: '1' }] };
    expect(queue.resolve(id, 'continue', edit)).toBe('edited');
    await expect(outcome).resolves.toEqual({ state: 'edited', edit });
  });

  it('resolves as dropped', async () => {
    const queue = new BreakpointQueue();
    const { id, outcome } = queue.suspend('response', 30_000, 'drop');
    expect(queue.resolve(id, 'drop')).toBe('dropped');
    await expect(outcome).resolves.toEqual({ state: 'dropped' });
  });

  it('auto-resolves as timed_out after the timeout, carrying the policy', async () => {
    const queue = new BreakpointQueue();
    const { outcome } = queue.suspend('request', 1_000, 'drop');
    vi.advanceTimersByTime(1_000);
    await expect(outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'drop',
    });
    expect(queue.size).toBe(0);
  });

  it('closeAll resolves every pending breakpoint as timed_out', async () => {
    const queue = new BreakpointQueue();
    const a = queue.suspend('request', 30_000, 'continue');
    const b = queue.suspend('response', 30_000, 'drop');
    queue.closeAll();
    await expect(a.outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'continue',
    });
    await expect(b.outcome).resolves.toEqual({
      state: 'timed_out',
      timeoutPolicy: 'drop',
    });
    expect(queue.size).toBe(0);
  });

  it('returns null for an unknown or already-resolved breakpoint', () => {
    const queue = new BreakpointQueue();
    const { id } = queue.suspend('request', 30_000, 'continue');
    expect(queue.resolve('missing', 'continue')).toBeNull();
    expect(queue.resolve(id, 'continue')).toBe('continued');
    expect(queue.resolve(id, 'continue')).toBeNull();
  });

  it('lists pending breakpoints in insertion order', () => {
    const queue = new BreakpointQueue();
    queue.suspend('request', 30_000, 'continue');
    queue.suspend('response', 30_000, 'drop');
    expect(queue.list().map((entry) => entry.phase)).toEqual([
      'request',
      'response',
    ]);
  });

  it('does not fire the timeout after a manual resolve', async () => {
    const queue = new BreakpointQueue();
    const { id, outcome } = queue.suspend('request', 1_000, 'drop');
    expect(queue.resolve(id, 'continue')).toBe('continued');
    vi.advanceTimersByTime(2_000);
    await expect(outcome).resolves.toEqual({ state: 'continued' });
  });
});
