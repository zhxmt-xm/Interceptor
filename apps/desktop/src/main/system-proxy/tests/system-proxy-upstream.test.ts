import { describe, expect, it } from 'vitest';

import { toUpstreamProxyConfig } from '../system-proxy-upstream';
import type { WinInetProxySettings } from '../../interfaces';

const SELF = '127.0.0.1:8888';

function settings(
  overrides: Partial<WinInetProxySettings> = {},
): WinInetProxySettings {
  return {
    flags: 1,
    proxyEnabled: false,
    autoDetect: false,
    proxyServer: null,
    bypassList: null,
    pacUrl: null,
    ...overrides,
  };
}

describe('toUpstreamProxyConfig', () => {
  it('reports no upstream for a direct connection', () => {
    expect(toUpstreamProxyConfig(settings(), SELF)).toBeNull();
  });

  it('reads a bare host:port proxy', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'corp-proxy:8080' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://corp-proxy:8080' });
  });

  it('prefers the https entry of a per-scheme proxy list', () => {
    const result = toUpstreamProxyConfig(
      settings({
        flags: 3,
        proxyEnabled: true,
        proxyServer: 'http=plain:80;https=secure:443',
      }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://secure:443' });
  });

  it('falls back to the http entry when https is absent', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'http=plain:80' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://plain:80' });
  });

  it('uses socks only when no http/https entry exists', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'socks=sox:1080' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'socks5://sox:1080' });
  });

  it('prefers a PAC script over an explicit proxy', () => {
    const result = toUpstreamProxyConfig(
      settings({
        flags: 7,
        proxyEnabled: true,
        proxyServer: 'corp-proxy:8080',
        pacUrl: 'http://corp/proxy.pac',
      }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'pac+http://corp/proxy.pac' });
  });

  it('ignores a PAC url when the PAC flag is not set', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'p:1', pacUrl: 'http://stale.pac' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://p:1' });
  });

  it('keeps an explicit scheme untouched', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'https://secure:443' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'https://secure:443' });
  });

  // 崩溃残留会让系统代理仍指向我们；把自己当上游会形成无限自环。
  it('refuses to use its own listener as the upstream', () => {
    expect(
      toUpstreamProxyConfig(
        settings({ flags: 3, proxyEnabled: true, proxyServer: SELF }),
        SELF,
      ),
    ).toBeNull();
    expect(
      toUpstreamProxyConfig(
        settings({ flags: 3, proxyEnabled: true, proxyServer: `http://${SELF}` }),
        SELF,
      ),
    ).toBeNull();
  });

  it('translates the bypass list into curl-style no_proxy values', () => {
    const result = toUpstreamProxyConfig(
      settings({
        flags: 3,
        proxyEnabled: true,
        proxyServer: 'corp:8080',
        bypassList: '*.internal.com;10.0.0.1;<local>',
      }),
      SELF,
    );
    expect(result).toEqual({
      proxyUrl: 'http://corp:8080',
      noProxy: ['internal.com', '10.0.0.1', 'localhost', '127.0.0.1', '::1'],
    });
  });

  it('omits no_proxy when the bypass list is empty', () => {
    const result = toUpstreamProxyConfig(
      settings({ flags: 3, proxyEnabled: true, proxyServer: 'corp:8080', bypassList: '  ' }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://corp:8080' });
  });

  it('deduplicates repeated bypass entries', () => {
    const result = toUpstreamProxyConfig(
      settings({
        flags: 3,
        proxyEnabled: true,
        proxyServer: 'corp:8080',
        bypassList: 'a.com;*.a.com;a.com',
      }),
      SELF,
    );
    expect(result).toEqual({ proxyUrl: 'http://corp:8080', noProxy: ['a.com'] });
  });

  // WPAD 自动检测没有可传给 proxy-agent 的 URL，只能按直连处理。
  it('reports no upstream for auto-detect only configurations', () => {
    expect(
      toUpstreamProxyConfig(settings({ flags: 9, autoDetect: true }), SELF),
    ).toBeNull();
  });

  it('reports no upstream when the proxy flag is set but the value is blank', () => {
    expect(
      toUpstreamProxyConfig(
        settings({ flags: 3, proxyEnabled: true, proxyServer: '   ' }),
        SELF,
      ),
    ).toBeNull();
  });
});
