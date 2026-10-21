import i18next from 'i18next';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuleDefinition, RuleNode } from '../../../../../shared/desktop-api';
import { LANGUAGE_IDS, type LanguageId } from '../../../../i18n/languages';
import { resources } from '../../../../i18n/resources';
import { BreakpointManager } from '../../BreakpointManager/BreakpointManager';

const fixture = vi.hoisted(() => ({
  nodes: [] as RuleNode[],
  enabled: true,
  breakpoints: [] as Array<{ id: string }>,
}));

vi.mock('../../../rules/data/rulesStore', () => ({
  useRulesStore: <T>(selector: (state: typeof fixture) => T): T => selector(fixture),
}));
vi.mock('../../../breakpoints', () => ({
  useBreakpointsStore: <T>(selector: (state: typeof fixture) => T): T => selector(fixture),
}));
vi.mock('../../../../components', () => ({
  Button: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  IconButton: () => null,
  Switch: () => null,
  cx: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

const MANAGER_MESSAGES = [
  ['en', '', ' enabled · ', ' paused'],
  ['zh-CN', '已启用 ', ' 条 · 已暂停 ', ' 个'],
  ['zh-TW', '已啟用 ', ' 條 · 已暫停 ', ' 個'],
  ['ja', '有効 ', ' 件 · 一時停止 ', ' 件'],
  ['ko', '사용 ', '개 · 일시 중지 ', '개'],
  ['de', '', ' aktiv · ', ' angehalten'],
  ['fr', '', ' actifs · ', ' en pause'],
  ['es', '', ' activos · ', ' en pausa'],
  ['it', '', ' attivi · ', ' in pausa'],
  ['pt-BR', '', ' ativos · ', ' pausados'],
  ['ru', 'включено: ', ' · приостановлено: ', ''],
  ['nl', '', ' ingeschakeld · ', ' gepauzeerd'],
  ['pl', 'Włączone: ', ' · Wstrzymane: ', ''],
  ['tr', '', ' etkin · ', ' duraklatıldı'],
  ['uk', 'увімкнено: ', ' · призупинено: ', ''],
] as const;

function breakpointRule(id: string): RuleDefinition {
  return {
    kind: 'rule',
    id,
    name: id,
    enabled: true,
    priority: 10,
    matchers: [{ type: 'method', value: 'GET' }],
    actions: [{ type: 'breakpoint', phase: 'request' }],
  };
}

async function renderManager(language: LanguageId = 'en'): Promise<string> {
  const i18n = i18next.createInstance();
  await i18n.init({
    resources,
    lng: language,
    fallbackLng: false,
    initAsync: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(createElement(
    I18nextProvider,
    { i18n },
    createElement(BreakpointManager, {
      onOpenRule: () => undefined,
      onOpenAdvanced: () => undefined,
      onClose: () => undefined,
    }),
  ));
}

describe('BreakpointManager counts', () => {
  beforeEach(() => {
    fixture.nodes = [breakpointRule('Checkout API'), breakpointRule('Orders API')];
    fixture.enabled = true;
    fixture.breakpoints = [];
  });

  it('covers every shipped language', () => {
    expect(MANAGER_MESSAGES.map(([language]) => language)).toEqual(LANGUAGE_IDS);
  });

  it.each(MANAGER_MESSAGES)(
    'preserves the original plain enabled and paused wording in %s',
    async (language, before, between, after) => {
      const markup = await renderManager(language);

      expect(markup).toContain(
        `<span>${before}2${between}0${after}</span>`,
      );
    },
  );

  it.each([
    [0, 0],
    [1, 3],
    [12, 4],
  ])('shows %i enabled and %i paused independently', async (enabled, paused) => {
    fixture.nodes = Array.from({ length: enabled }, (_, index) => breakpointRule(`Rule ${index}`));
    fixture.breakpoints = Array.from({ length: paused }, (_, index) => ({ id: `paused-${index}` }));

    const markup = await renderManager();

    expect(markup).toContain(
      `<span>${enabled} enabled · ${paused} paused</span>`,
    );
  });

  it('counts enabled breakpoint rules across folders, not disabled or ordinary rules', async () => {
    fixture.nodes = [
      breakpointRule('Checkout API'),
      { ...breakpointRule('Disabled breakpoint'), enabled: false },
      { ...breakpointRule('Ordinary rule'), actions: [{ type: 'delay', phase: 'request', ms: 50 }] },
      { kind: 'folder', id: 'group', name: 'Group', children: [breakpointRule('Nested breakpoint')] },
    ];

    const markup = await renderManager();

    expect(markup).toContain(
      '<span>2 enabled · 0 paused</span>',
    );
    expect(markup).toContain('Disabled breakpoint');
    expect(markup).toContain('Nested breakpoint');
    expect(markup).not.toContain('Ordinary rule');
  });
});
