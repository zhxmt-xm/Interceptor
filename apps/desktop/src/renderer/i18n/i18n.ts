import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { LANGUAGE_IDS, resolveLanguageId } from './languages';
import { resources } from './resources';

const initialLanguage = resolveLanguageId(
  window.localStorage.getItem('interceptor.language') ??
    window.localStorage.getItem('interceptor.lang'),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: LANGUAGE_IDS,
  load: 'currentOnly',
  initAsync: false,
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };