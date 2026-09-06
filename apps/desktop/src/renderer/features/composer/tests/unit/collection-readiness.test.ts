import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposerStore } from '../../data/composerStore';
import { useCollection } from '../../data/useCollection';

const fixture = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));

vi.mock('react', async (importOriginal) => {
  const react = {
    ...await importOriginal<typeof import('react')>(),
    useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useCallback: (callback: unknown) => callback,
    useDebugValue: () => undefined,
  };
  return { ...react, default: react };
});

vi.mock('../../data/composerStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../data/composerStore')>();
  const originalStore = original.useComposerStore;
  return {
    useComposerStore: Object.assign(
      (selector: (state: ReturnType<typeof originalStore.getState>) => unknown) => selector(originalStore.getState()),
      originalStore,
    ),
  };
});

beforeEach(() => {
  fixture.effects.length = 0;
  useComposerStore.setState(useComposerStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

describe('Collection启动就绪', () => {
  it('Core业务未就绪时不发起首次查询', () => {
    const getCollection = vi.fn().mockResolvedValue({ nodes: [], revision: 0 });
    const onCollectionChanged = vi.fn(() => vi.fn());
    vi.stubGlobal('window', { interceptor: { getCollection, onCollectionChanged } });

    useCollection(false);
    const cleanup = fixture.effects[0]!();

    expect(getCollection).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
  });

  it('启动完成后载入保存态并订阅后续变化', async () => {
    const getCollection = vi.fn().mockResolvedValue({ nodes: [], revision: 0 });
    const unsubscribe = vi.fn();
    const onCollectionChanged = vi.fn(() => unsubscribe);
    vi.stubGlobal('window', { interceptor: { getCollection, onCollectionChanged } });

    useCollection(true);
    const cleanup = fixture.effects[0]!();
    await vi.waitFor(() => expect(useComposerStore.getState().loaded).toBe(true));
    expect(getCollection).toHaveBeenCalledOnce();
    expect(onCollectionChanged).toHaveBeenCalledOnce();
    if (typeof cleanup === 'function') cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});