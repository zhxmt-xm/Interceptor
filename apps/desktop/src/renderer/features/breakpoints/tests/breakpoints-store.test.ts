import { describe, expect, it } from 'vitest';

import type { BreakpointsSnapshot } from '../../../../shared/desktop-api';
import { useBreakpointsStore } from '../data/breakpointsStore';

function snapshot(): BreakpointsSnapshot {
  return {
    breakpoints: [
      {
        id: 'bp-1',
        phase: 'request',
        createdAt: 0,
        ruleName: 'Pause on request',
        method: 'POST',
        url: 'https://api.test/upload',
        headers: [],
        bodyAvailable: false,
      },
    ],
    enabled: true,
    autoContinued: 0,
  };
}

describe('breakpoints store', () => {
  it('drops the previous generation snapshot when Core goes away', () => {
    // Core 一走，那一代的队列和 listener 都没了；继续显示 paused 是骗人。
    const store = useBreakpointsStore.getState();
    store.applySnapshot(snapshot());
    expect(useBreakpointsStore.getState().breakpoints).toHaveLength(1);
    expect(useBreakpointsStore.getState().draft).not.toBeNull();

    useBreakpointsStore.getState().clear();

    expect(useBreakpointsStore.getState()).toMatchObject({
      breakpoints: [],
      selectedId: null,
      draft: null,
      resolving: false,
    });
  });
});
