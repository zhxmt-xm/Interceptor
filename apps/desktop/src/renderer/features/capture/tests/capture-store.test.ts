import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CaptureExchangeEvent,
  CaptureExchangeSummary,
} from '../../../../shared/desktop-api';
import { useCaptureStore } from '../data/captureStore';
import type { CaptureFilter } from '../interfaces';
import {
  distinctMethodOptions,
  distinctRuleOptions,
  distinctStatusOptions,
  suggestedBodyFileName,
  visibleCaptureRows,
} from '../utils';

/** 构造只含列表所需字段的实时捕获事件。 */
function captureEvent(id: string, startedAt: number): CaptureExchangeEvent {
  return {
    kind: 'exchange-added',
    summary: {
      id,
      method: 'GET',
      secure: false,
      host: 'example.test',
      path: `/${id}`,
      protocol: 'http/1.1',
      statusCode: 200,
      state: 'completed',
      startedAt,
      durationMs: 10,
      requestBytes: 0,
      responseBytes: 12,
    },
  };
}

describe('captureStore clear timeline', () => {
  beforeEach(() => {
    useCaptureStore.setState({
      rows: [],
      indexById: new Map(),
      selectedId: null,
      listScrollTop: 0,
      inspectorTab: 'headers',
      inspectorWidth: 500,
      clearedBefore: 0,
      syncRevision: 0,
      loading: false,
      capturing: false,
      error: null,
      transferAction: null,
      proxyReadinessIssue: null,
    });
  });

  it('rejects late events from before a persisted clear and accepts new traffic', () => {
    const store = useCaptureStore.getState();
    store.applyEvents([captureEvent('before-clear', 90)]);
    store.select('before-clear');

    store.clearView(100);
    useCaptureStore.getState().applyEvents([
      captureEvent('late-old-event', 99),
      captureEvent('after-clear', 101),
    ]);

    const state = useCaptureStore.getState();
    expect(state.rows.map((row) => row.id)).toEqual(['after-clear']);
    expect(state.selectedId).toBeNull();
    expect(state.clearedBefore).toBe(100);
  });

  it('keeps workspace position and inspector state while Capture is unmounted', () => {
    const store = useCaptureStore.getState();
    store.select('request-42');
    store.setListScrollTop(1_248);
    store.setInspectorTab('cookies');
    store.setInspectorWidth(620);

    const state = useCaptureStore.getState();
    expect(state).toMatchObject({
      selectedId: 'request-42',
      listScrollTop: 1_248,
      inspectorTab: 'cookies',
      inspectorWidth: 620,
    });
  });

  it('keeps every summary while filtering the visible view', () => {
    const store = useCaptureStore.getState();
    store.setSearch('only-visible');
    store.applyEvents([
      captureEvent('only-visible', 100),
      captureEvent('hidden-by-filter', 101),
    ]);

    expect(useCaptureStore.getState().rows.map((row) => row.id)).toEqual([
      'only-visible',
      'hidden-by-filter',
    ]);
  });

  it('does not let an obsolete full sync refill rows after Clear', () => {
    const store = useCaptureStore.getState();
    const revision = store.beginLoad();
    store.clearView(200);
    useCaptureStore.getState().replaceAllRows(
      [captureEvent('stale-page', 100).summary],
      revision,
    );

    expect(useCaptureStore.getState().rows).toEqual([]);
    expect(useCaptureStore.getState().loading).toBe(false);
  });

  it('tracks one explicit file transfer action at a time', () => {
    useCaptureStore.getState().setTransferAction('har-export');
    expect(useCaptureStore.getState().transferAction).toBe('har-export');

    useCaptureStore.getState().setTransferAction('archive-import');
    expect(useCaptureStore.getState().transferAction).toBe('archive-import');

    useCaptureStore.getState().setTransferAction(null);
    expect(useCaptureStore.getState().transferAction).toBeNull();
  });

  it('tracks and dismisses one proxy readiness issue', () => {
    useCaptureStore.getState().setCapturing(true);
    useCaptureStore.getState().setProxyReadinessIssue({
      kind: 'system-proxy',
      ownershipLost: true,
      message: 'ownership changed',
    });
    expect(useCaptureStore.getState().proxyReadinessIssue).toMatchObject({
      kind: 'system-proxy',
      ownershipLost: true,
    });
    expect(useCaptureStore.getState().capturing).toBe(false);

    useCaptureStore.getState().setProxyReadinessIssue(null);
    expect(useCaptureStore.getState().proxyReadinessIssue).toBeNull();
  });
});

describe('captureStore structured filters', () => {
  const baseFilter: CaptureFilter = {
    segment: 'all',
    search: '',
    method: [],
    status: [],
    ruleIds: [],
  };

  beforeEach(() => {
    useCaptureStore.setState({ filter: baseFilter, rows: [], selectedId: null });
  });

  function summary(
    id: string,
    overrides: Partial<CaptureExchangeSummary>,
  ): CaptureExchangeSummary {
    return {
      id,
      method: 'GET',
      secure: false,
      host: 'example.test',
      path: `/${id}`,
      protocol: 'http/1.1',
      statusCode: 200,
      state: 'completed',
      startedAt: 100,
      durationMs: 10,
      requestBytes: 0,
      responseBytes: 12,
      ...overrides,
    };
  }

  const rows: CaptureExchangeSummary[] = [
    summary('a', { method: 'GET', statusCode: 200, ruleIds: ['rule-a'] }),
    summary('b', { method: 'POST', statusCode: 404, ruleIds: ['rule-b'] }),
    summary('c', { method: 'POST', statusCode: 200, ruleIds: ['rule-a', 'rule-b'] }),
    summary('pending', { method: 'GET', statusCode: undefined, state: 'pending' }),
  ];

  it('filters by a single selected method (case-insensitive)', () => {
    expect(visibleCaptureRows(rows, { ...baseFilter, method: ['post'] }).map((row) => row.id))
      .toEqual(['b', 'c']);
  });

  it('filters by multiple selected status codes', () => {
    expect(visibleCaptureRows(rows, { ...baseFilter, status: [200, 404] }).map((row) => row.id))
      .toEqual(['a', 'b', 'c']);
  });

  it('matches any selected rule id while composing with other filters', () => {
    expect(visibleCaptureRows(rows, {
      ...baseFilter,
      method: ['POST'],
      ruleIds: ['rule-a', 'missing'],
    }).map((row) => row.id)).toEqual(['c']);
    expect(visibleCaptureRows(rows, {
      ...baseFilter,
      ruleIds: ['rule-a', 'rule-b'],
    }).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('lists distinct method options from current rows by count then name', () => {
    expect(distinctMethodOptions(rows)).toEqual([
      { value: 'GET', count: 2 },
      { value: 'POST', count: 2 },
    ]);
  });

  it('lists distinct status options ascending and ignores pending rows', () => {
    expect(distinctStatusOptions(rows)).toEqual([
      { value: 200, count: 2 },
      { value: 404, count: 1 },
    ]);
  });

  it('counts each rule once per exchange and sorts by request count', () => {
    expect(distinctRuleOptions([
      ...rows,
      summary('duplicate', { ruleIds: ['rule-a', 'rule-a'] }),
    ])).toEqual([
      { value: 'rule-a', count: 3 },
      { value: 'rule-b', count: 2 },
    ]);
  });

  it('returns no Rule options until at least one captured exchange has a rule hit', () => {
    expect(distinctRuleOptions(rows.filter((row) => !row.ruleIds))).toEqual([]);
  });

  it('derives safe body filename suggestions from URL and media MIME', () => {
    expect(suggestedBodyFileName(
      'https://www.byd.com/material/video/video-1.mp4?range=1',
      'video/mp4',
      'response-body',
    )).toBe('video-1.mp4');
    expect(suggestedBodyFileName('not a url', 'audio/mpeg', 'response-body'))
      .toBe('response-body.mp3');
  });

  it('sets and clears structured filters, and isolates one rule from Rules', () => {
    useCaptureStore.getState().setStructuredFilter({
      method: ['POST'],
      status: [404],
      ruleIds: ['rule-b'],
    });
    expect(useCaptureStore.getState().filter).toMatchObject({
      method: ['POST'],
      status: [404],
      ruleIds: ['rule-b'],
    });

    useCaptureStore.setState({ rows });
    useCaptureStore.getState().filterByRule('rule-a');
    expect(useCaptureStore.getState().filter).toEqual({
      ...baseFilter,
      ruleIds: ['rule-a'],
    });
    expect(useCaptureStore.getState().selectedId).toBe('c');

    useCaptureStore.getState().setStructuredFilter({ method: [], status: [], ruleIds: [] });
    expect(useCaptureStore.getState().filter).toMatchObject({
      method: [],
      status: [],
      ruleIds: [],
    });
  });
});