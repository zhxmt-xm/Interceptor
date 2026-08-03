import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { DESKTOP_UI_LANGUAGES } from '../../../shared/desktop-api';
import { englishCatalog } from '../english-catalog';
import { LANGUAGE_IDS, resolveLanguageId } from '../languages';
import { resources } from '../resources';

const VARIABLE_PATTERN = /\{\{[^{}]+\}\}/g;
const REPRESENTATIVE_TRANSLATION_KEYS = [
  'common.language',
  'sidebar.capture',
  'capture.emptyRequests',
  'rules.newRule',
  'firstRun.welcomeDescription',
  'settings.title',
] as const;

describe('i18n catalogs', () => {
  it('keeps Renderer and Main language contracts aligned', () => {
    expect(LANGUAGE_IDS).toEqual(DESKTOP_UI_LANGUAGES);
  });

  it('keeps every locale aligned with the English catalog', () => {
    const englishKeys = Object.keys(englishCatalog).sort();

    for (const language of LANGUAGE_IDS) {
      const catalog = resources[language].translation;
      const primaryKeys = Object.keys(catalog)
        .filter((key) => key in englishCatalog)
        .sort();

      expect(primaryKeys, language).toEqual(englishKeys);
      for (const key of englishKeys) {
        const englishVariables = englishCatalog[key as keyof typeof englishCatalog]
          .match(VARIABLE_PATTERN)
          ?.sort() ?? [];
        const localizedVariables = catalog[key as keyof typeof englishCatalog]
          .match(VARIABLE_PATTERN)
          ?.sort() ?? [];
        expect(localizedVariables, `${language}:${key}`).toEqual(englishVariables);
      }
    }
  });

  it('ships representative translated UI values for every non-English locale', () => {
    for (const language of LANGUAGE_IDS.filter((id) => id !== 'en')) {
      const catalog = resources[language].translation;
      for (const key of REPRESENTATIVE_TRANSLATION_KEYS) {
        expect(catalog[key], `${language}:${key}`).not.toBe(englishCatalog[key]);
      }
    }
  });

  it('defaults unknown languages to English and migrates legacy Chinese', () => {
    expect(resolveLanguageId(undefined)).toBe('en');
    expect(resolveLanguageId('en-US')).toBe('en');
    expect(resolveLanguageId('zh')).toBe('zh-CN');
    expect(resolveLanguageId('pt_BR')).toBe('pt-BR');
    expect(resolveLanguageId('xx-YY')).toBe('en');
  });

  it.each([
    [
      'ru',
      [
        'Показать ещё 1 значение',
        'Показать ещё 2 значения',
        'Показать ещё 5 значений',
      ],
    ],
    [
      'pl',
      [
        'Pokaż jeszcze 1 wartość',
        'Pokaż jeszcze 2 wartości',
        'Pokaż jeszcze 5 wartości',
      ],
    ],
    [
      'uk',
      [
        'Показати ще 1 значення',
        'Показати ще 2 значення',
        'Показати ще 5 значень',
      ],
    ],
  ] as const)('uses CLDR plural forms for %s', async (language, expected) => {
    const instance = i18next.createInstance();
    await instance.init({
      resources,
      lng: language,
      fallbackLng: 'en',
      supportedLngs: LANGUAGE_IDS,
      load: 'currentOnly',
      initAsync: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
    });

    expect([1, 2, 5].map((count) => instance.t('capture.showMore', { count }))).toEqual(expected);
  });
});