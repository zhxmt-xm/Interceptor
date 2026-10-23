import type { DesktopUiLanguage } from './desktop-api';
import type { DesktopUiTheme } from './ui-preferences';

export const GUIDEBOOK_ORIGIN = 'https://www.interceptor.cn';
export const GUIDEBOOK_MESSAGE_SOURCE = 'interceptor-desktop-guidebook';

export type GuidebookLocale = 'zh-CN' | 'en';

export interface GuidebookSyncMessage {
  source: typeof GUIDEBOOK_MESSAGE_SOURCE;
  type: 'sync-preferences';
  theme: DesktopUiTheme;
  locale: GuidebookLocale;
}

export interface GuidebookOpenSearchMessage {
  source: typeof GUIDEBOOK_MESSAGE_SOURCE;
  type: 'open-search';
}

export interface GuidebookLocationMessage {
  source: 'interceptor-guidebook';
  type: 'location-changed';
  url: string;
}

export function guidebookLocale(language: DesktopUiLanguage): GuidebookLocale {
  return language === 'zh-CN' ? 'zh-CN' : 'en';
}

export function guidebookUrl(language: DesktopUiLanguage, embedded = true): string {
  const pathname = guidebookLocale(language) === 'zh-CN' ? '/guide' : '/en/guide';
  const url = new URL(pathname, GUIDEBOOK_ORIGIN);
  if (embedded) url.searchParams.set('embed', 'desktop');
  return url.href;
}

export function isGuidebookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === GUIDEBOOK_ORIGIN
      && /^\/(?:en\/)?guide(?:\/|$)/.test(url.pathname)
      && url.searchParams.get('embed') === 'desktop'
    );
  } catch {
    return false;
  }
}
