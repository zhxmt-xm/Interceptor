import type { LanguageId } from './languages';
import { englishCatalog, type MessageCatalog } from './english-catalog';
import { deCatalog } from './locales/de';
import { esCatalog } from './locales/es';
import { frCatalog } from './locales/fr';
import { itCatalog } from './locales/it';
import { jaCatalog } from './locales/ja';
import { koCatalog } from './locales/ko';
import { nlCatalog } from './locales/nl';
import { plCatalog } from './locales/pl';
import { ptBRCatalog } from './locales/pt-BR';
import { ruCatalog } from './locales/ru';
import { trCatalog } from './locales/tr';
import { ukCatalog } from './locales/uk';
import { zhCNCatalog } from './locales/zh-CN';
import { zhTWCatalog } from './locales/zh-TW';

export { englishCatalog, type MessageCatalog, type MessageKey } from './english-catalog';

export const resources = {
  en: { translation: englishCatalog },
  'zh-CN': { translation: zhCNCatalog },
  'zh-TW': { translation: zhTWCatalog },
  ja: { translation: jaCatalog },
  ko: { translation: koCatalog },
  de: { translation: deCatalog },
  fr: { translation: frCatalog },
  es: { translation: esCatalog },
  it: { translation: itCatalog },
  'pt-BR': { translation: ptBRCatalog },
  ru: { translation: ruCatalog },
  nl: { translation: nlCatalog },
  pl: { translation: plCatalog },
  tr: { translation: trCatalog },
  uk: { translation: ukCatalog },
} satisfies Record<LanguageId, { translation: MessageCatalog }>;