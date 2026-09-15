import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], cleanups: [] as Array<() => void> }));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = hooks.states.length;
    hooks.states.push(initial);
    return [initial, (value: unknown) => {
      hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value;
    }];
  },
}));

import { useGrpcMessages } from '../../RequestInspector/useGrpcMessages';

beforeEach(() => {
  hooks.states = [];
  hooks.cleanups = [];
  vi.useFakeTimers();
});

afterEach(() => {
  for (const cleanup of hooks.cleanups) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('gRPC message loading', () => {
  it('continues at the live cursor and stops polling when the body completes', async () => {
    const first = { index: 0, envelopeOffset: 0, payloadOffset: 5, payloadLength: 5, compressed: false, truncated: false };
    const second = { ...first, index: 1, envelopeOffset: 10, payloadOffset: 15 };
    const queryGrpcMessages = vi.fn()
      .mockResolvedValueOnce({ recognized: true, side: 'response', bodyAvailable: true, bodyComplete: false,
        bodySize: 10, items: [first], nextCursor: 'next-live', hasMore: false })
      .mockResolvedValue({ recognized: true, side: 'response', bodyAvailable: true, bodyComplete: true,
        bodyHash: 'hash', bodySize: 20, items: [second], hasMore: false });
    vi.stubGlobal('window', { interceptor: { queryGrpcMessages } });

    useGrpcMessages('exchange-1', 'response');
    await vi.advanceTimersByTimeAsync(400);
    expect(queryGrpcMessages).toHaveBeenCalledTimes(2);
    expect(queryGrpcMessages.mock.calls[1]?.[0]).toMatchObject({ exchangeId: 'exchange-1', side: 'response', cursor: 'next-live' });
    expect(hooks.states[1]).toEqual([first, second]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queryGrpcMessages).toHaveBeenCalledTimes(2);
  });

  it('ignores a pagination response after the current side is disposed', async () => {
    let finishPage!: (value: unknown) => void;
    const queryGrpcMessages = vi.fn()
      .mockResolvedValueOnce({ recognized: true, side: 'request', bodyAvailable: true, bodyComplete: true,
        bodySize: 20, items: [{ index: 0 }], nextCursor: 'next', hasMore: true })
      .mockReturnValueOnce(new Promise((resolve) => { finishPage = resolve; }));
    vi.stubGlobal('window', { interceptor: { queryGrpcMessages } });

    const state = useGrpcMessages('exchange-1', 'request');
    await vi.advanceTimersByTimeAsync(0);
    state.loadMore();
    hooks.cleanups[0]!();
    finishPage({ recognized: true, side: 'request', bodyAvailable: true, bodyComplete: true,
      bodySize: 20, items: [{ index: 1 }], hasMore: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(hooks.states[1]).toEqual([{ index: 0 }]);
  });
});