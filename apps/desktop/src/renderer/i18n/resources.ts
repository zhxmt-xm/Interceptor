import type { LanguageId } from './languages';
import { agentMessages, type AgentMessageCatalog } from './agent-resources';
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
  en: { translation: { ...englishCatalog, ...githubAuthMessages.en, ...agentMessages.en } },
  'zh-CN': { translation: { ...zhCNCatalog, ...githubAuthMessages['zh-CN'], ...agentMessages['zh-CN'] } },
  'zh-TW': { translation: { ...zhTWCatalog, ...githubAuthMessages['zh-TW'], ...agentMessages['zh-TW'] } },
  ja: { translation: { ...jaCatalog, ...githubAuthMessages.ja, ...agentMessages.ja } },
  ko: { translation: { ...koCatalog, ...githubAuthMessages.ko, ...agentMessages.ko } },
  de: { translation: { ...deCatalog, ...githubAuthMessages.de, ...agentMessages.de } },
  fr: { translation: { ...frCatalog, ...githubAuthMessages.fr, ...agentMessages.fr } },
  es: { translation: { ...esCatalog, ...githubAuthMessages.es, ...agentMessages.es } },
  it: { translation: { ...itCatalog, ...githubAuthMessages.it, ...agentMessages.it } },
  'pt-BR': { translation: { ...ptBRCatalog, ...githubAuthMessages['pt-BR'], ...agentMessages['pt-BR'] } },
  ru: { translation: { ...ruCatalog, ...githubAuthMessages.ru, ...agentMessages.ru } },
  nl: { translation: { ...nlCatalog, ...githubAuthMessages.nl, ...agentMessages.nl } },
  pl: { translation: { ...plCatalog, ...githubAuthMessages.pl, ...agentMessages.pl } },
  tr: { translation: { ...trCatalog, ...githubAuthMessages.tr, ...agentMessages.tr } },
  uk: { translation: { ...ukCatalog, ...githubAuthMessages.uk, ...agentMessages.uk } },
} satisfies Record<
  LanguageId,
  { translation: MessageCatalog & GitHubAuthMessageCatalog & AgentMessageCatalog }
>;