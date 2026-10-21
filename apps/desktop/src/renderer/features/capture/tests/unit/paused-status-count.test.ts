import i18next from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LANGUAGE_IDS, type LanguageId } from '../../../../i18n/languages';
import { resources } from '../../../../i18n/resources';
import { CaptureStatusbar } from '../../CaptureStatusbar/CaptureStatusbar';

const breakpointState = vi.hoisted(() => ({
  breakpoints: [] as Array<{ ruleName: string }>,
}));

vi.mock('../../../breakpoints', () => ({
  useBreakpointsStore: <T>(selector: (state: typeof breakpointState) => T): T =>
    selector(breakpointState),
}));
vi.mock('../../../../components', () => ({
  cx: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));
vi.mock('../../UpstreamProxyButton/UpstreamProxyButton', () => ({
  UpstreamProxyButton: () => null,
}));

const PAUSED_MESSAGES = [
  ['en', '', ' requests paused'],
  ['zh-CN', '', ' 个已暂停项'],
  ['zh-TW', '', ' 個已暫停'],
  ['ja', '', ' 件一時停止中'],
  ['ko', '', '개 일시 중지'],
  ['de', '', ' angehalten'],
  ['fr', '', ' en pause'],
  ['es', '', ' en pausa'],
  ['it', '', ' in pausa'],
  ['pt-BR', '', ' pausados'],
  ['ru', 'приостановлено: ', ''],
  ['nl', '', ' gepauzeerd'],
  ['pl', 'Wstrzymane: ', ''],
  ['tr', '', ' duraklatıldı'],
  ['uk', 'Призупинено: ', ''],
] as const;

async function renderStatusbar(language: LanguageId = 'en') {
  const i18n = i18next.createInstance();
  await i18n.init({
    resources,
    lng: language,
    fallbackLng: false,
    initAsync: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  const markup = renderToStaticMarkup(createElement(
    I18nextProvider,
    { i18n },
    createElement(CaptureStatusbar, { onOpenUpstreamSettings: () => undefined }),
  ));
  return { i18n, markup };
}

describe('CaptureStatusbar paused count', () => {
  beforeEach(() => {
    breakpointState.breakpoints = [
      { ruleName: 'Checkout API' },
      { ruleName: 'Another API' },
    ];
  });

  it('covers every shipped language', () => {
    expect(PAUSED_MESSAGES.map(([language]) => language)).toEqual(LANGUAGE_IDS);
  });

  it.each(PAUSED_MESSAGES)(
    'preserves the original plain count and tooltip wording in %s',
    async (language, before, after) => {
      const { i18n, markup } = await renderStatusbar(language);

      expect(i18n.t('breakpoints.pausedCount', { count: 2 })).toBe(`${before}2${after}`);
      expect(markup).toContain(
        `data-parity="capture-status-breakpoints">${before}2${after}</span>`,
      );
    },
  );

  it.each([1, 12])('shows the current count of %i paused requests without extra emphasis', async (count) => {
    breakpointState.breakpoints = Array.from(
      { length: count },
      () => ({ ruleName: 'Checkout API' }),
    );

    const { markup } = await renderStatusbar();

    expect(markup).toContain(
      `data-parity="capture-status-breakpoints">${count} requests paused</span>`,
    );
  });

  it('still shows only the earliest paused rule', async () => {
    const { markup } = await renderStatusbar();

    expect(markup).toContain('Checkout API');
    expect(markup).not.toContain('Another API');
  });

  it('shows normal link status when no request is paused', async () => {
    breakpointState.breakpoints = [];

    const { markup } = await renderStatusbar();

    expect(markup).not.toContain('data-parity="capture-status-breakpoints"');
    expect(markup).toContain('data-parity="capture-status-endpoint"');
  });
});
