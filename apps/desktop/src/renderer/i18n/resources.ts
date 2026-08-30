import type { LanguageId } from './languages';
import { agentChatMessages, type AgentChatMessageCatalog } from './agent-chat-resources';
import {
  agentProviderMessages,
  type AgentProviderMessageCatalog,
} from './agent-provider-resources';
import { agentMessages, type AgentMessageCatalog } from './agent-resources';
import { agentToolMessages, type AgentToolMessageCatalog } from './agent-tool-resources';
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
  en: { translation: { ...englishCatalog, ...githubAuthMessages.en, ...agentMessages.en, ...agentProviderMessages.en, ...agentChatMessages.en, ...agentToolMessages.en } },
  'zh-CN': { translation: { ...zhCNCatalog, ...githubAuthMessages['zh-CN'], ...agentMessages['zh-CN'], ...agentProviderMessages['zh-CN'], ...agentChatMessages['zh-CN'], ...agentToolMessages['zh-CN'] } },
  'zh-TW': { translation: { ...zhTWCatalog, ...githubAuthMessages['zh-TW'], ...agentMessages['zh-TW'], ...agentProviderMessages['zh-TW'], ...agentChatMessages['zh-TW'], ...agentToolMessages['zh-TW'] } },
  ja: { translation: { ...jaCatalog, ...githubAuthMessages.ja, ...agentMessages.ja, ...agentProviderMessages.ja, ...agentChatMessages.ja, ...agentToolMessages.ja } },
  ko: { translation: { ...koCatalog, ...githubAuthMessages.ko, ...agentMessages.ko, ...agentProviderMessages.ko, ...agentChatMessages.ko, ...agentToolMessages.ko } },
  de: { translation: { ...deCatalog, ...githubAuthMessages.de, ...agentMessages.de, ...agentProviderMessages.de, ...agentChatMessages.de, ...agentToolMessages.de } },
  fr: { translation: { ...frCatalog, ...githubAuthMessages.fr, ...agentMessages.fr, ...agentProviderMessages.fr, ...agentChatMessages.fr, ...agentToolMessages.fr } },
  es: { translation: { ...esCatalog, ...githubAuthMessages.es, ...agentMessages.es, ...agentProviderMessages.es, ...agentChatMessages.es, ...agentToolMessages.es } },
  it: { translation: { ...itCatalog, ...githubAuthMessages.it, ...agentMessages.it, ...agentProviderMessages.it, ...agentChatMessages.it, ...agentToolMessages.it } },
  'pt-BR': { translation: { ...ptBRCatalog, ...githubAuthMessages['pt-BR'], ...agentMessages['pt-BR'], ...agentProviderMessages['pt-BR'], ...agentChatMessages['pt-BR'], ...agentToolMessages['pt-BR'] } },
  ru: { translation: { ...ruCatalog, ...githubAuthMessages.ru, ...agentMessages.ru, ...agentProviderMessages.ru, ...agentChatMessages.ru, ...agentToolMessages.ru } },
  nl: { translation: { ...nlCatalog, ...githubAuthMessages.nl, ...agentMessages.nl, ...agentProviderMessages.nl, ...agentChatMessages.nl, ...agentToolMessages.nl } },
  pl: { translation: { ...plCatalog, ...githubAuthMessages.pl, ...agentMessages.pl, ...agentProviderMessages.pl, ...agentChatMessages.pl, ...agentToolMessages.pl } },
  tr: { translation: { ...trCatalog, ...githubAuthMessages.tr, ...agentMessages.tr, ...agentProviderMessages.tr, ...agentChatMessages.tr, ...agentToolMessages.tr } },
  uk: { translation: { ...ukCatalog, ...githubAuthMessages.uk, ...agentMessages.uk, ...agentProviderMessages.uk, ...agentChatMessages.uk, ...agentToolMessages.uk } },
} satisfies Record<
  LanguageId,
  { translation: MessageCatalog & GitHubAuthMessageCatalog & AgentMessageCatalog & AgentProviderMessageCatalog & AgentChatMessageCatalog & AgentToolMessageCatalog }
>;