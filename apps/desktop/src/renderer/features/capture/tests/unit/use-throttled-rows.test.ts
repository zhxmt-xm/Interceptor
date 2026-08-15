import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureExchangeSummary } from '../../../../../shared/desktop-api';

const hookState = vi.hoisted(() => ({
  rows: [] as CaptureExchangeSummary[],
  snapshot: [] as CaptureExchangeSummary[],
  setSnapshot: vi.fn(),
  lastAppliedAt: 0,
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => effect(),
  useRef: () => ({ current: hookState.lastAppliedAt }),
  useState: () => [hookState.snapshot, hookState.setSnapshot],
}));

vi.mock('../../data/captureStore', () => ({
  useCaptureStore: (
    select: (state: { rows: CaptureExchangeSummary[] }) => CaptureExchangeSummary[],
  ) => select({ rows: hookState.rows }),
}));

import { useThrottledRows } from '../../CaptureFilterPanel/useThrottledRows';

describe('useThrottledRows', () => {
  beforeEach(() => {
    hookState.rows = [];
    hookState.snapshot = [{ id: 'stale' } as CaptureExchangeSummary];
    hookState.lastAppliedAt = 900;
    hookState.setSnapshot.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.stubGlobal('window', {
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears the facet snapshot immediately when Capture rows are cleared', () => {
    useThrottledRows(600);

    expect(hookState.setSnapshot).toHaveBeenCalledWith([]);
  });

  it('keeps throttling non-empty realtime row updates', () => {
    hookState.rows = [{ id: 'next' } as CaptureExchangeSummary];

    useThrottledRows(600);

    expect(hookState.setSnapshot).not.toHaveBeenCalled();
    expect(window.setTimeout).toHaveBeenCalledOnce();
  });
});