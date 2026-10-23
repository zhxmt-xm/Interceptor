import {
  GUIDEBOOK_MESSAGE_SOURCE,
  type GuidebookLocationMessage,
  type GuidebookOpenSearchMessage,
  type GuidebookSyncMessage,
  guidebookLocale,
  guidebookUrl,
  isGuidebookUrl,
} from '../../../shared/guidebook';
import type { DesktopUiTheme } from '../../../shared/ui-preferences';
import type { LanguageId } from '../../i18n/languages';

export { guidebookUrl };

export function createGuidebookSyncMessage(
  theme: DesktopUiTheme,
  language: LanguageId,
): GuidebookSyncMessage {
  return {
    source: GUIDEBOOK_MESSAGE_SOURCE,
    type: 'sync-preferences',
    theme,
    locale: guidebookLocale(language),
  };
}

export function createGuidebookOpenSearchMessage(): GuidebookOpenSearchMessage {
  return {
    source: GUIDEBOOK_MESSAGE_SOURCE,
    type: 'open-search',
  };
}

export function readGuidebookLocationMessage(value: unknown): string | null {
  if (
    typeof value !== 'object'
    || value === null
    || !('source' in value)
    || !('type' in value)
    || !('url' in value)
  ) {
    return null;
  }
  const message = value as Partial<GuidebookLocationMessage>;
  return (
    message.source === 'interceptor-guidebook'
    && message.type === 'location-changed'
    && typeof message.url === 'string'
    && isGuidebookUrl(message.url)
  )
    ? message.url
    : null;
}
