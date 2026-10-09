import { parseUpstreamProxySettings } from '@interceptor/core-protocol';
import type { UpstreamProxySettings, UpstreamRoute, UpstreamSettingsSnapshot } from '../../../../shared/desktop-api';
import type { UpstreamMessageKey } from '../../../i18n/upstream-resources';
import type { UpstreamEditorDraft } from '../data/upstreamSettingsStore';

export function settingsFromDraft(draft: UpstreamEditorDraft): UpstreamProxySettings {
  switch (draft.mode) {
    case 'manual':
      return parseUpstreamProxySettings({
        mode: 'manual', protocol: draft.protocol, host: draft.host,
        port: /^\d+$/.test(draft.port.trim()) ? Number(draft.port) : Number.NaN,
      });
    case 'pac': return parseUpstreamProxySettings({ mode: 'pac', url: draft.url });
    default: return { mode: draft.mode };
  }
}

export function draftFromSettings(settings: UpstreamProxySettings, previous: UpstreamEditorDraft): UpstreamEditorDraft {
  if (settings.mode === 'manual') {
    return { ...previous, mode: settings.mode, protocol: settings.protocol, host: settings.host, port: String(settings.port) };
  }
  if (settings.mode === 'pac') return { ...previous, mode: settings.mode, url: settings.url };
  return { ...previous, mode: settings.mode };
}

export function upstreamDraftChanged(draft: UpstreamEditorDraft, settings: UpstreamProxySettings): boolean {
  if (draft.mode !== settings.mode) return true;
  if (settings.mode === 'manual') {
    return draft.protocol !== settings.protocol || draft.host !== settings.host || draft.port !== String(settings.port);
  }
  return settings.mode === 'pac' && draft.url !== settings.url;
}

export function describeUpstreamFailure(error: unknown): NonNullable<UpstreamSettingsSnapshot['error']> {
  return { kind: 'connection', message: error instanceof Error ? error.message : String(error) };
}

export function upstreamModeLabel(mode: UpstreamProxySettings['mode'], translate: (key: UpstreamMessageKey) => string): string {
  if (mode === 'pac') return 'PAC';
  if (mode === 'wpad') return 'WPAD';
  const keys = { system: 'upstream.shortSystem', direct: 'upstream.shortDirect', manual: 'upstream.shortManual' } as const;
  return translate(keys[mode]);
}

export function upstreamRouteLabel(route: UpstreamRoute, translate: (key: UpstreamMessageKey) => string): string {
  switch (route.kind) {
    case 'proxy': return route.authority;
    case 'direct': return translate('upstream.directRoute');
    case 'pac': return translate('upstream.perRequest');
    case 'per-protocol': return translate('upstream.perProtocol');
    case 'unavailable': return translate('upstream.unavailable');
  }
}

export function upstreamRouteTitle(route: UpstreamRoute): string | undefined {
  if (route.kind === 'pac') return route.url;
  if (route.kind === 'per-protocol') return `HTTP: ${route.http ?? 'DIRECT'}; HTTPS: ${route.https ?? 'DIRECT'}`;
  if (route.kind === 'proxy') return route.authority;
  return undefined;
}

export function upstreamDraftValidation(draft: UpstreamEditorDraft): UpstreamMessageKey | null {
  if (draft.mode === 'manual') {
    if (!draft.host.trim() || /[\s/@?#\\]/.test(draft.host.trim())) return 'upstream.invalidHost';
    if (!/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65_535) return 'upstream.invalidPort';
    if (Number(draft.port) === 8888 && ['localhost', '127.0.0.1', '::1'].includes(draft.host.trim().toLowerCase())) return 'upstream.invalidLoop';
  }
  if (draft.mode === 'pac') {
    try {
      const url = new URL(draft.url);
      if (!['http:', 'https:'].includes(url.protocol)) return 'upstream.invalidPac';
      if (url.username || url.password || url.hash) return 'upstream.invalidPacCredentials';
    } catch { return 'upstream.invalidPac'; }
  }
  try { settingsFromDraft(draft); }
  catch { return draft.mode === 'manual' ? 'upstream.invalidHost' : 'upstream.invalidPac'; }
  return null;
}
