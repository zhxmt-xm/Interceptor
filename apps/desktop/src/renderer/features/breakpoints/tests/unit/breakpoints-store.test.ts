import { describe, expect, it } from 'vitest';

import type { BreakpointsSnapshot } from '../../../../../shared/desktop-api';
import { useBreakpointsStore } from '../../data/breakpointsStore';

function snapshot(): BreakpointsSnapshot {
  return {
    breakpoints: [
      {
        id: 'bp-1',
        phase: 'request',
        queueKey: 'http',
        createdAt: 0,
        ruleName: 'Pause on request',
        method: 'POST',
        url: 'https://api.test/upload',
        headers: [
          {
            name: 'Content-Length',
            value: '12',
            ruleEffect: 'set',
            ruleId: 'rewrite-content-length',
          },
          { name: 'X-Original', value: 'yes' },
        ],
        bodyAvailable: false,
      },
    ],
    enabled: true,
  };
}

describe('breakpoints store', () => {
  it('preserves Rule markers without treating them as breakpoint edits', () => {
    const store = useBreakpointsStore.getState();
    store.clear();
    store.applySnapshot(snapshot());

    const draft = useBreakpointsStore.getState().draft!;
    expect(draft.headers[0]).toMatchObject({
      name: 'Content-Length',
      value: '12',
      ruleEffect: 'set',
      ruleId: 'rewrite-content-length',
    });
    expect(draft.editedHeaderNames).toEqual([]);
  });

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

  it('records normalized names for header updates, removals and additions', () => {
    const store = useBreakpointsStore.getState();
    store.clear();
    store.applySnapshot(snapshot());
    const initialDraft = useBreakpointsStore.getState().draft!;
    const contentLength = initialDraft.headers[0]!;
    const original = initialDraft.headers[1]!;

    store.updateHeader(contentLength.id, { value: '999' });
    store.removeHeader(original.id);
    store.addHeader();
    const added = useBreakpointsStore.getState().draft!.headers.at(-1)!;
    store.updateHeader(added.id, { name: 'Content-Encoding' });

    expect(useBreakpointsStore.getState().draft).toMatchObject({
      editedHeaderNames: [
        'content-length',
        'x-original',
        'content-encoding',
      ],
    });
  });

  it('preserves one independent draft per pending breakpoint and prunes resolved drafts', () => {
    const store = useBreakpointsStore.getState();
    store.clear();
    const firstSnapshot = snapshot();
    firstSnapshot.breakpoints.push({
      ...firstSnapshot.breakpoints[0]!,
      id: 'bp-2',
      createdAt: 1,
      url: 'https://api.test/second',
    });
    store.applySnapshot(firstSnapshot);

    store.select('bp-1');
    store.setReplacement('text');
    store.setBody('draft-a');
    store.select('bp-2');
    store.setReplacement('text');
    store.setBody('draft-b');

    store.select('bp-1');
    expect(useBreakpointsStore.getState().draft).toMatchObject({
      breakpointId: 'bp-1',
      replacement: 'text',
      body: 'draft-a',
    });
    store.select('bp-2');
    expect(useBreakpointsStore.getState().draft).toMatchObject({
      breakpointId: 'bp-2',
      replacement: 'text',
      body: 'draft-b',
    });

    store.applySnapshot({
      ...firstSnapshot,
      breakpoints: firstSnapshot.breakpoints.filter((breakpoint) => breakpoint.id === 'bp-2'),
    });
    expect(useBreakpointsStore.getState()).toMatchObject({
      selectedId: 'bp-2',
      draft: {
        breakpointId: 'bp-2',
        replacement: 'text',
        body: 'draft-b',
      },
    });
  });
});
