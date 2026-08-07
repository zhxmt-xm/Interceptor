import type { LanguageId } from './languages';
import { englishCatalog, type MessageCatalog } from './english-catalog';
import {
  githubAuthMessages,
  type GitHubAuthMessageCatalog,
} from './github-auth-resources';
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
  en: { translation: { ...englishCatalog, ...githubAuthMessages.en } },
  'zh-CN': { translation: { ...zhCNCatalog, ...githubAuthMessages['zh-CN'] } },
  'zh-TW': { translation: { ...zhTWCatalog, ...githubAuthMessages['zh-TW'] } },
  ja: { translation: { ...jaCatalog, ...githubAuthMessages.ja } },
  ko: { translation: { ...koCatalog, ...githubAuthMessages.ko } },
  de: { translation: { ...deCatalog, ...githubAuthMessages.de } },
  fr: { translation: { ...frCatalog, ...githubAuthMessages.fr } },
  es: { translation: { ...esCatalog, ...githubAuthMessages.es } },
  it: { translation: { ...itCatalog, ...githubAuthMessages.it } },
  'pt-BR': { translation: { ...ptBRCatalog, ...githubAuthMessages['pt-BR'] } },
  ru: { translation: { ...ruCatalog, ...githubAuthMessages.ru } },
  nl: { translation: { ...nlCatalog, ...githubAuthMessages.nl } },
  pl: { translation: { ...plCatalog, ...githubAuthMessages.pl } },
  tr: { translation: { ...trCatalog, ...githubAuthMessages.tr } },
  uk: { translation: { ...ukCatalog, ...githubAuthMessages.uk } },
} satisfies Record<
  LanguageId,
  { translation: MessageCatalog & GitHubAuthMessageCatalog }
>;