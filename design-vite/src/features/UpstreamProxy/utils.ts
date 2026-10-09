import type { UpstreamDesignConfig, UpstreamMode } from '../../state/types';

export const UPSTREAM_MODES: readonly { mode: UpstreamMode; label: string; description: string }[] = [
  { mode: 'system', label: 'Use system settings', description: 'Keep the route used before capture.' },
  { mode: 'direct', label: 'No upstream proxy', description: 'Capture traffic, then connect directly.' },
  { mode: 'manual', label: 'Manual proxy', description: 'Use a specific proxy server.' },
  { mode: 'pac', label: 'PAC URL', description: 'Let a configuration script choose the route.' },
  { mode: 'wpad', label: 'Auto-discover (WPAD)', description: 'Find the PAC configuration on this network.' },
];

export const UPSTREAM_MODE_LABELS: Readonly<Record<UpstreamMode, string>> = {
  system: 'System', direct: 'Direct', manual: 'Manual', pac: 'PAC', wpad: 'WPAD',
};

export function upstreamRouteLabel(config: UpstreamDesignConfig): string {
  switch (config.mode) {
    case 'system': return '127.0.0.1:7890';
    case 'direct': return 'Direct connection';
    case 'manual': return `${config.host.includes(':') ? `[${config.host}]` : config.host}:${config.port}`;
    case 'pac':
    case 'wpad': return 'Selected per request';
  }
}

export function normalizeUpstreamDraft(config: UpstreamDesignConfig): UpstreamDesignConfig {
  return { ...config, host: config.host.trim(), port: config.port.trim(), pacUrl: config.pacUrl.trim() };
}

export function upstreamDraftError(config: UpstreamDesignConfig): string {
  const draft = normalizeUpstreamDraft(config);
  if (draft.mode === 'manual') {
    if (!draft.host || /[\s/@?#\\]/.test(draft.host)) return 'Enter a host name or IP address without a URL scheme.';
    if (!/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65_535) {
      return 'Enter a port between 1 and 65535.';
    }
    if (['localhost', '127.0.0.1', '::1'].includes(draft.host.toLowerCase()) && Number(draft.port) === 8888) {
      return 'The upstream cannot point back to Interceptor on port 8888.';
    }
  }
  if (draft.mode === 'pac') {
    try {
      const url = new URL(draft.pacUrl);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return '';
    } catch {
      return 'Enter a complete HTTP or HTTPS PAC URL.';
    }
    return 'Use an HTTP or HTTPS PAC URL without embedded credentials.';
  }
  return '';
}

export function upstreamDraftChanged(draft: UpstreamDesignConfig, saved: UpstreamDesignConfig): boolean {
  if (draft.mode !== saved.mode) return true;
  if (draft.mode === 'manual') {
    return draft.protocol !== saved.protocol || draft.host !== saved.host || draft.port !== saved.port;
  }
  return draft.mode === 'pac' && draft.pacUrl !== saved.pacUrl;
}
