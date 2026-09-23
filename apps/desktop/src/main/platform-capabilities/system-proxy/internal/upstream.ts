import type { UpstreamProxyConfig } from '@interceptor/core-protocol';

export function toUpstreamAuthority(upstream: UpstreamProxyConfig | null): string | null {
  if (!upstream) return null;
  if ('proxyUrl' in upstream) return authority(upstream.proxyUrl);
  if (upstream.httpProxyUrl === upstream.httpsProxyUrl) return authority(upstream.httpProxyUrl);
  return `http=${authority(upstream.httpProxyUrl) ?? 'direct'};https=${authority(upstream.httpsProxyUrl) ?? 'direct'}`;
}

export function upstreamProbeUrl(upstream: UpstreamProxyConfig | null): string | null {
  if (!upstream) return null;
  if ('proxyUrl' in upstream) return upstream.proxyUrl;
  const urls = [...new Set([upstream.httpProxyUrl, upstream.httpsProxyUrl].filter((url) => url !== null))];
  return urls.length === 1 ? urls[0]! : null;
}

function authority(proxyUrl: string | null): string | null {
  if (!proxyUrl) return null;
  try {
    const url = new URL(proxyUrl);
    return url.port.length > 0 ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return null;
  }
}