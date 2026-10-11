import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureExchangeDetail, CaptureExchangeSummary } from '../../../../../shared/desktop-api';
import type { IconButtonProps } from '../../../../components/IconButton/IconButton';
import type { CaptureState } from '../../interfaces';
import { RequestInspector } from '../../RequestInspector/RequestInspector';

const fixture = vi.hoisted((): {
  summary: CaptureExchangeSummary;
  detail: CaptureExchangeDetail | null;
  loading: boolean;
} => ({
  summary: {
    id: 'exchange-current', method: 'GET', secure: false, host: '127.0.0.1',
    path: '/e2e/url-copy?source=owned', protocol: 'http/1.1', state: 'completed',
    statusCode: 200, startedAt: 1_000, requestBytes: 0, responseBytes: 0,
  },
  detail: null,
  loading: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));
vi.mock('antd', () => ({
  Tooltip: ({ children, title }: { children: ReactNode; title: string }) => (
    createElement('span', { 'data-tooltip': title }, children)
  ),
}));
vi.mock('../../../../components', () => ({
  IconButton: (props: IconButtonProps) => createElement('button', { 'aria-label': props.label }),
  StatusBadge: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  cx: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  sizeLabel: () => '0 B',
  useClipboardCopy: () => vi.fn(),
}));
vi.mock('../../data/captureStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/captureStore')>();
  return {
    useCaptureStore: <T>(selector: (state: CaptureState) => T): T => selector({
      ...actual.useCaptureStore.getState(),
      rows: [fixture.summary],
      indexById: new Map([[fixture.summary.id, 0]]),
      selectedId: fixture.summary.id,
    }),
  };
});
vi.mock('../../data/useExchangeDetail', () => ({
  useExchangeDetail: () => ({ detail: fixture.detail, loading: fixture.loading, error: null }),
}));
vi.mock('../../RequestInspector/BodySection', () => ({ BodySection: () => null }));
vi.mock('../../RequestInspector/GrpcMessages', () => ({ GrpcMessages: () => null }));
vi.mock('../../RequestInspector/WebSocketMessages', () => ({ WebSocketMessages: () => null }));
vi.mock('../../RequestInspector/TlsPanel', () => ({ TlsPanel: () => null }));
vi.mock('../../RequestInspector/TlsTunnelPanel', () => ({ TlsTunnelPanel: () => null }));
vi.mock('../../BreakpointInspector/BreakpointInspector', () => ({ BreakpointInspector: () => null }));
vi.mock('../../RequestInspector/Section', () => ({
  Section: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));

function currentDetail(): CaptureExchangeDetail {
  return {
    summary: fixture.summary,
    url: 'http://127.0.0.1:43127/e2e/url-copy?source=owned',
    requestHeaders: [],
    responseHeaders: [],
    requestTrailers: [],
    responseTrailers: [],
  };
}

function renderInspector(): string {
  return renderToStaticMarkup(createElement(RequestInspector, {
    onOpenRule: () => undefined,
    onViewTlsPassthroughPattern: () => undefined,
  }));
}

function requestUrlRow(markup: string): string {
  const row = markup.match(/title="capture.requestUrl"[\s\S]*?<\/div>/)?.[0];
  expect(row).toBeDefined();
  return row!;
}

describe('Inspector URL copy readiness', () => {
  beforeEach(() => {
    fixture.detail = null;
    fixture.loading = true;
  });

  it('does not offer title or General URL copy before the detail URL is ready', () => {
    const markup = renderInspector();

    expect(markup).not.toContain('aria-label="capture.copyUrl"');
    expect(requestUrlRow(markup)).not.toContain('aria-label="common.copy"');
    expect(markup).toContain('127.0.0.1/e2e/url-copy');
  });

  it('offers both URL copies when the selected detail contains the complete URL', () => {
    fixture.detail = currentDetail();
    fixture.loading = false;
    const markup = renderInspector();

    expect(markup).toContain('aria-label="capture.copyUrl"');
    expect(requestUrlRow(markup)).toContain(fixture.detail.url);
    expect(requestUrlRow(markup)).toContain('aria-label="common.copy"');
  });

  it('does not reuse the previous selection URL while the next detail is loading', () => {
    fixture.detail = {
      ...currentDetail(),
      summary: { ...fixture.summary, id: 'exchange-previous', path: '/previous' },
      url: 'http://127.0.0.1:43127/previous',
    };
    const markup = renderInspector();

    expect(markup).not.toContain('aria-label="capture.copyUrl"');
    expect(requestUrlRow(markup)).not.toContain('aria-label="common.copy"');
  });

  it('keeps a ready URL available while refreshing the same selected exchange', () => {
    fixture.detail = currentDetail();

    expect(renderInspector()).toContain('aria-label="capture.copyUrl"');
  });
});
