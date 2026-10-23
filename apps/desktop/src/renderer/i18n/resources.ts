import type { LanguageId } from './languages';
import {
  agentExecutionMessages,
  type AgentExecutionMessageCatalog,
} from './agent-execution-resources';
import { agentChatMessages, type AgentChatMessageCatalog } from './agent-chat-resources';
import {
  agentProviderMessages,
  type AgentProviderMessageCatalog,
} from './agent-provider-resources';
import { agentMessages, type AgentMessageCatalog } from './agent-resources';
import { agentToolMessages, type AgentToolMessageCatalog } from './agent-tool-resources';
import { englishCatalog, type MessageCatalog } from './english-catalog';
import { guidebookMessages, type GuidebookMessageCatalog } from './guidebook-resources';
import { mcpMessages, type McpMessageCatalog } from './mcp-resources';
import { upstreamMessages, type UpstreamMessageCatalog } from './upstream-resources';
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
  en: { translation: { ...englishCatalog, ...guidebookMessages.en, ...agentMessages.en, ...agentProviderMessages.en, ...agentChatMessages.en, ...agentToolMessages.en, ...agentExecutionMessages.en, ...mcpMessages.en, ...upstreamMessages.en } },
  'zh-CN': { translation: { ...zhCNCatalog, ...guidebookMessages['zh-CN'], ...agentMessages['zh-CN'], ...agentProviderMessages['zh-CN'], ...agentChatMessages['zh-CN'], ...agentToolMessages['zh-CN'], ...agentExecutionMessages['zh-CN'], ...mcpMessages['zh-CN'], ...upstreamMessages['zh-CN'] } },
  'zh-TW': { translation: { ...zhTWCatalog, ...guidebookMessages['zh-TW'], ...agentMessages['zh-TW'], ...agentProviderMessages['zh-TW'], ...agentChatMessages['zh-TW'], ...agentToolMessages['zh-TW'], ...agentExecutionMessages['zh-TW'], ...mcpMessages['zh-TW'], ...upstreamMessages['zh-TW'] } },
  ja: { translation: { ...jaCatalog, ...guidebookMessages.ja, ...agentMessages.ja, ...agentProviderMessages.ja, ...agentChatMessages.ja, ...agentToolMessages.ja, ...agentExecutionMessages.ja, ...mcpMessages.ja, ...upstreamMessages.ja } },
  ko: { translation: { ...koCatalog, ...guidebookMessages.ko, ...agentMessages.ko, ...agentProviderMessages.ko, ...agentChatMessages.ko, ...agentToolMessages.ko, ...agentExecutionMessages.ko, ...mcpMessages.ko, ...upstreamMessages.ko } },
  de: { translation: { ...deCatalog, ...guidebookMessages.de, ...agentMessages.de, ...agentProviderMessages.de, ...agentChatMessages.de, ...agentToolMessages.de, ...agentExecutionMessages.de, ...mcpMessages.de, ...upstreamMessages.de } },
  fr: { translation: { ...frCatalog, ...guidebookMessages.fr, ...agentMessages.fr, ...agentProviderMessages.fr, ...agentChatMessages.fr, ...agentToolMessages.fr, ...agentExecutionMessages.fr, ...mcpMessages.fr, ...upstreamMessages.fr } },
  es: { translation: { ...esCatalog, ...guidebookMessages.es, ...agentMessages.es, ...agentProviderMessages.es, ...agentChatMessages.es, ...agentToolMessages.es, ...agentExecutionMessages.es, ...mcpMessages.es, ...upstreamMessages.es } },
  it: { translation: { ...itCatalog, ...guidebookMessages.it, ...agentMessages.it, ...agentProviderMessages.it, ...agentChatMessages.it, ...agentToolMessages.it, ...agentExecutionMessages.it, ...mcpMessages.it, ...upstreamMessages.it } },
  'pt-BR': { translation: { ...ptBRCatalog, ...guidebookMessages['pt-BR'], ...agentMessages['pt-BR'], ...agentProviderMessages['pt-BR'], ...agentChatMessages['pt-BR'], ...agentToolMessages['pt-BR'], ...agentExecutionMessages['pt-BR'], ...mcpMessages['pt-BR'], ...upstreamMessages['pt-BR'] } },
  ru: { translation: { ...ruCatalog, ...guidebookMessages.ru, ...agentMessages.ru, ...agentProviderMessages.ru, ...agentChatMessages.ru, ...agentToolMessages.ru, ...agentExecutionMessages.ru, ...mcpMessages.ru, ...upstreamMessages.ru } },
  nl: { translation: { ...nlCatalog, ...guidebookMessages.nl, ...agentMessages.nl, ...agentProviderMessages.nl, ...agentChatMessages.nl, ...agentToolMessages.nl, ...agentExecutionMessages.nl, ...mcpMessages.nl, ...upstreamMessages.nl } },
  pl: { translation: { ...plCatalog, ...guidebookMessages.pl, ...agentMessages.pl, ...agentProviderMessages.pl, ...agentChatMessages.pl, ...agentToolMessages.pl, ...agentExecutionMessages.pl, ...mcpMessages.pl, ...upstreamMessages.pl } },
  tr: { translation: { ...trCatalog, ...guidebookMessages.tr, ...agentMessages.tr, ...agentProviderMessages.tr, ...agentChatMessages.tr, ...agentToolMessages.tr, ...agentExecutionMessages.tr, ...mcpMessages.tr, ...upstreamMessages.tr } },
  uk: { translation: { ...ukCatalog, ...guidebookMessages.uk, ...agentMessages.uk, ...agentProviderMessages.uk, ...agentChatMessages.uk, ...agentToolMessages.uk, ...agentExecutionMessages.uk, ...mcpMessages.uk, ...upstreamMessages.uk } },
} satisfies Record<
  LanguageId,
  { translation: MessageCatalog & GuidebookMessageCatalog & AgentMessageCatalog & AgentProviderMessageCatalog & AgentChatMessageCatalog & AgentToolMessageCatalog & AgentExecutionMessageCatalog & McpMessageCatalog & UpstreamMessageCatalog }
>;