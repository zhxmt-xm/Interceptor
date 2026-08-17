import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CaptureExchangeEvent,
  CaptureExchangeSummary,
} from '../../../../../shared/desktop-api';
import { useCaptureStore } from '../../data/captureStore';
import {
  EMPTY_FILTER,
  FAILED_FACET_VALUE,
  PENDING_FACET_VALUE,
} from '../../constants';
import type { CaptureFilter } from '../../interfaces';
import {
  allFacetOptions,
  hasActiveFilter,
  suggestedBodyFileName,
  visibleCaptureRows,
} from '../../utils';

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

describe('captureStore facet filters', () => {
  const baseFilter: CaptureFilter = EMPTY_FILTER;

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

  it('filters by a single selected method', () => {
    expect(visibleCaptureRows(rows, { ...baseFilter, methods: ['POST'] }).map((row) => row.id))
      .toEqual(['b', 'c']);
  });

  it('filters by multiple selected status codes', () => {
    expect(visibleCaptureRows(rows, { ...baseFilter, statuses: ['200', '404'] })
      .map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('matches any selected rule id while composing with other facets', () => {
    expect(visibleCaptureRows(rows, {
      ...baseFilter,
      methods: ['POST'],
      ruleIds: ['rule-a', 'missing'],
    }).map((row) => row.id)).toEqual(['c']);
    expect(visibleCaptureRows(rows, {
      ...baseFilter,
      ruleIds: ['rule-a', 'rule-b'],
    }).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('separates protocol versions that share the list Proto label', () => {
    const versioned = [
      summary('one-one', { protocol: 'http/1.1' }),
      summary('one-zero', { protocol: 'http/1.0' }),
    ];
    expect(allFacetOptions(versioned).protocol).toEqual([
      { value: 'HTTP/1.1', count: 1 },
      { value: 'HTTP/1.0', count: 1 },
    ]);
  });

  it('lists methods in first-seen order and status ascending with a failed bucket', () => {
    const options = allFacetOptions([
      ...rows,
      summary('failed', { statusCode: undefined, state: 'failed' }),
    ]);
    expect(options.method).toEqual([
      { value: 'GET', count: 3 },
      { value: 'POST', count: 2 },
    ]);
    expect(options.status).toEqual([
      { value: '200', count: 2 },
      { value: '404', count: 1 },
      { value: FAILED_FACET_VALUE, count: 1 },
      { value: PENDING_FACET_VALUE, count: 1 },
    ]);
  });

  it('always exposes filterable loading buckets at the end of their facets', () => {
    const emptyOptions = allFacetOptions([]);
    expect(emptyOptions.application).toEqual([
      { value: PENDING_FACET_VALUE, count: 0 },
    ]);
    expect(emptyOptions.status).toEqual([
      { value: PENDING_FACET_VALUE, count: 0 },
    ]);
    expect(emptyOptions.type).toEqual([
      { value: PENDING_FACET_VALUE, count: 0 },
    ]);

    const loading = summary('loading', {
      appPending: true,
      statusCode: undefined,
      state: 'pending',
      responseMime: undefined,
    });
    const options = allFacetOptions([loading]);
    expect(options.application.at(-1)).toEqual({ value: PENDING_FACET_VALUE, count: 1 });
    expect(options.status.at(-1)).toEqual({ value: PENDING_FACET_VALUE, count: 1 });
    expect(options.type.at(-1)).toEqual({ value: PENDING_FACET_VALUE, count: 1 });
    expect(visibleCaptureRows([loading], {
      ...baseFilter,
      apps: [PENDING_FACET_VALUE],
      statuses: [PENDING_FACET_VALUE],
      types: [PENDING_FACET_VALUE],
    })).toEqual([loading]);
  });

  it('keeps every dynamic facet in first-seen order when later values have higher counts', () => {
    const options = allFacetOptions([
      summary('first', {
        appId: 'first-app',
        appName: 'First app',
        method: 'GET',
        host: 'first.test',
        responseMime: 'text/plain',
        ruleIds: ['first-rule'],
      }),
      summary('second', {
        appId: 'second-app',
        appName: 'Second app',
        method: 'POST',
        host: 'second.test',
        responseMime: 'application/json',
        ruleIds: ['second-rule'],
      }),
      summary('third', {
        appId: 'second-app',
        appName: 'Second app',
        method: 'POST',
        host: 'second.test',
        responseMime: 'application/json',
        ruleIds: ['second-rule'],
      }),
    ]);

    expect(options.application.map(({ value }) => value)).toEqual([
      'first-app',
      'second-app',
      PENDING_FACET_VALUE,
    ]);
    expect(options.method).toEqual([
      { value: 'GET', count: 1 },
      { value: 'POST', count: 2 },
    ]);
    expect(options.host.map(({ value }) => value)).toEqual(['first.test', 'second.test']);
    expect(options.type.map(({ value }) => value)).toEqual([
      'plain',
      'json',
      PENDING_FACET_VALUE,
    ]);
    expect(options.rule.map(({ value }) => value)).toEqual(['first-rule', 'second-rule']);
  });

  it('counts each rule once per exchange while preserving first-seen order', () => {
    expect(allFacetOptions([
      ...rows,
      summary('duplicate', { ruleIds: ['rule-a', 'rule-a'] }),
    ]).rule).toEqual([
      { value: 'rule-a', count: 3 },
      { value: 'rule-b', count: 2 },
    ]);
  });

  it('returns no Rule options until at least one captured exchange has a rule hit', () => {
    expect(allFacetOptions(rows.filter((row) => !row.ruleIds)).rule).toEqual([]);
  });

  it('counts application resolution in Pending instead of Unknown', () => {
    const resolving = summary('resolving', { appPending: true });
    expect(allFacetOptions([resolving]).application).toEqual([
      { value: PENDING_FACET_VALUE, count: 1 },
    ]);
    expect(allFacetOptions([summary('resolved', { appId: 'chrome', appName: 'Chrome' })]).application)
      .toEqual([
        { value: 'chrome', count: 1 },
        { value: PENDING_FACET_VALUE, count: 0 },
      ]);
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

  it('toggles facet values within a group and clears one group at a time', () => {
    const store = useCaptureStore.getState();
    store.toggleFacetValue('method', 'POST');
    store.toggleFacetValue('method', 'GET');
    store.toggleFacetValue('status', '404');
    expect(useCaptureStore.getState().filter).toMatchObject({
      methods: ['POST', 'GET'],
      statuses: ['404'],
    });

    store.toggleFacetValue('method', 'POST');
    expect(useCaptureStore.getState().filter.methods).toEqual(['GET']);

    store.clearFacet('method');
    expect(useCaptureStore.getState().filter).toMatchObject({
      methods: [],
      statuses: ['404'],
    });
  });

  it('keeps search independent from facets when reporting and clearing', () => {
    expect(hasActiveFilter(EMPTY_FILTER)).toBe(false);
    expect(hasActiveFilter({ ...EMPTY_FILTER, search: 'user' })).toBe(false);
    expect(hasActiveFilter({ ...EMPTY_FILTER, hosts: ['example.test'] })).toBe(true);

    useCaptureStore.getState().setSearch('user');
    useCaptureStore.getState().toggleFacetValue('type', 'json');
    useCaptureStore.getState().clearAllFilters();
    expect(useCaptureStore.getState().filter).toEqual({ ...EMPTY_FILTER, search: 'user' });
  });

  it('isolates one rule from Rules and expands that group', () => {
    useCaptureStore.setState({ rows });
    useCaptureStore.getState().filterByRule('rule-a');
    expect(useCaptureStore.getState().filter).toEqual({
      ...baseFilter,
      ruleIds: ['rule-a'],
    });
    expect(useCaptureStore.getState().selectedId).toBe('c');
    expect(useCaptureStore.getState().expandedFacets).toContain('rule');
  });
});