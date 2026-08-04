import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import esES from 'antd/locale/es_ES';
import frFR from 'antd/locale/fr_FR';
import itIT from 'antd/locale/it_IT';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import nlNL from 'antd/locale/nl_NL';
import plPL from 'antd/locale/pl_PL';
import ptBR from 'antd/locale/pt_BR';
import ruRU from 'antd/locale/ru_RU';
import trTR from 'antd/locale/tr_TR';
import ukUA from 'antd/locale/uk_UA';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';

import type { DesktopUiLanguage } from '../../shared/desktop-api';

const ENGLISH = {
  id: 'en',
  name: 'English',
  code: 'EN',
  antdLocale: enUS,
} as const;

export const LANGUAGES = [
  ENGLISH,
  { id: 'zh-CN', name: '简体中文', code: '简', antdLocale: zhCN },
  { id: 'zh-TW', name: '繁體中文', code: '繁', antdLocale: zhTW },
  { id: 'ja', name: '日本語', code: '日', antdLocale: jaJP },
  { id: 'ko', name: '한국어', code: '한', antdLocale: koKR },
  { id: 'de', name: 'Deutsch', code: 'DE', antdLocale: deDE },
  { id: 'fr', name: 'Français', code: 'FR', antdLocale: frFR },
  { id: 'es', name: 'Español', code: 'ES', antdLocale: esES },
  { id: 'it', name: 'Italiano', code: 'IT', antdLocale: itIT },
  { id: 'pt-BR', name: 'Português (Brasil)', code: 'PT', antdLocale: ptBR },
  { id: 'ru', name: 'Русский', code: 'RU', antdLocale: ruRU },
  { id: 'nl', name: 'Nederlands', code: 'NL', antdLocale: nlNL },
  { id: 'pl', name: 'Polski', code: 'PL', antdLocale: plPL },
  { id: 'tr', name: 'Türkçe', code: 'TR', antdLocale: trTR },
  { id: 'uk', name: 'Українська', code: 'UA', antdLocale: ukUA },
] as const;

export type LanguageId = DesktopUiLanguage & (typeof LANGUAGES)[number]['id'];
export type LanguageDefinition = (typeof LANGUAGES)[number];

export const LANGUAGE_IDS: LanguageId[] = LANGUAGES.map(({ id }) => id);

export function resolveLanguageId(value: string | null | undefined): LanguageId {
  if (!value) {
    return 'en';
  }
  const normalized = value.replace('_', '-').toLowerCase();
  if (normalized === 'zh') {
    return 'zh-CN';
  }
  return LANGUAGES.find(({ id }) => id.toLowerCase() === normalized)?.id ?? 'en';
}

// First run only: pick the closest shipped catalog for the OS UI languages, most preferred first.
export function matchSystemLanguage(locales: readonly string[]): LanguageId {
  for (const locale of locales) {
    const normalized = locale.replace('_', '-').toLowerCase();
    const exact = LANGUAGES.find(({ id }) => id.toLowerCase() === normalized);
    if (exact) {
      return exact.id;
    }
    const base = normalized.split('-')[0];
    if (base === 'zh') {
      // Script subtag decides simplified vs traditional; region is the fallback signal.
      return /hant|-tw|-hk|-mo/.test(normalized) ? 'zh-TW' : 'zh-CN';
    }
    if (base === 'pt') {
      return 'pt-BR';
    }
    const byBase = LANGUAGES.find(({ id }) => id.toLowerCase() === base);
    if (byBase) {
      return byBase.id;
    }
  }
  return 'en';
}

export function getLanguageDefinition(language: LanguageId): LanguageDefinition {
  return LANGUAGES.find(({ id }) => id === language) ?? ENGLISH;
}