import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import { BlockList, isIP } from 'node:net';
import type { UpstreamRoute } from '../interfaces/public';
import { SystemProxyError } from './errors';

const loopbackAddresses = new BlockList();
loopbackAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackAddresses.addAddress('::1', 'ipv6');

export function assertUpstreamDoesNotLoop(upstream: UpstreamProxyConfig | null, listenerPort: number): void {
  if (!upstream) return;
  const urls = 'proxyUrl' in upstream ? [upstream.proxyUrl] : [upstream.httpProxyUrl, upstream.httpsProxyUrl];
  for (const value of urls) {
    if (!value) continue;
    const url = new URL(value.replace(/^pac\+/, ''));
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : url.protocol.startsWith('socks') ? 1080 : 80));
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    const family = isIP(host);
    if (port === listenerPort && (host === 'localhost'
      || (family !== 0 && loopbackAddresses.check(host, family === 6 ? 'ipv6' : 'ipv4')))) {
      throw new SystemProxyError('The upstream cannot point back to Interceptor.');
    }
  }
}

export function describeUpstreamRoute(upstream: UpstreamProxyConfig | null): UpstreamRoute {
  if (!upstream) return { kind: 'direct' };
  const single = 'proxyUrl' in upstream ? upstream.proxyUrl
    : upstream.httpProxyUrl === upstream.httpsProxyUrl ? upstream.httpProxyUrl : null;
  if (single) {
    if (single.startsWith('pac+')) {
      const url = new URL(single.slice(4));
      url.username = '';
      url.password = '';
      return { kind: 'pac', url: url.href };
    }
    const endpoint = authority(single);
    if (!endpoint) throw new SystemProxyError('The applied upstream address is invalid.');
    return { kind: 'proxy', authority: endpoint };
  }
  if ('proxyUrl' in upstream) throw new SystemProxyError('The applied upstream address is missing.');
  return { kind: 'per-protocol', http: authority(upstream.httpProxyUrl), https: authority(upstream.httpsProxyUrl) };
}

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