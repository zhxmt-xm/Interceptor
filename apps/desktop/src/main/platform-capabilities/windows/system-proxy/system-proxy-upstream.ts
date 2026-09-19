import type { UpstreamProxyConfig } from '@interceptor/core-protocol';

import type { WinInetProxySettings } from '../../interfaces';

/** WinINet PROXY_TYPE 位标志：显式代理。 */
const PROXY_TYPE_PROXY = 2;
/** WinINet PROXY_TYPE 位标志：PAC 脚本。 */
const PROXY_TYPE_AUTO_PROXY_URL = 4;

/**
 * 把用户原有的 WinINet 代理设置转成 Interceptor 的上游代理配置。
 *
 * 接管系统代理后所有流量都进 Interceptor，若仍直连源站，必须经公司 PAC、VPN 或认证
 * 代理才能出网的环境会在接管期间完全断网。因此接管前读到的配置要原样接到上游。
 * PAC 交给 Mockttp 的 `pac+` 前缀（内部走 pac-proxy-agent）求值，这里不自己解析脚本。
 *
 * selfAuthority 是 Interceptor 自己的监听地址：崩溃残留会让系统代理仍指向我们，
 * 此时把它当上游会形成自环，直接视为没有上游。
 */
export function toUpstreamProxyConfig(
  settings: WinInetProxySettings,
  selfAuthority: string,
): UpstreamProxyConfig | null {
  const noProxy = toNoProxyList(settings.bypassList);
  const pacUrl = settings.pacUrl?.trim() ?? '';
  if ((settings.flags & PROXY_TYPE_AUTO_PROXY_URL) !== 0 && pacUrl.length > 0) {
    return withNoProxy(`pac+${pacUrl}`, noProxy);
  }
  if ((settings.flags & PROXY_TYPE_PROXY) !== 0) {
    const proxyUrl = toProxyUrl(settings.proxyServer, selfAuthority);
    if (proxyUrl !== null) {
      return withNoProxy(proxyUrl, noProxy);
    }
  }
  return null;
}

/**
 * WinINet 的 ProxyServer 既可能是裸 `host:port`，也可能是 `scheme=host:port` 的分号列表。
 * 优先取 https 条目：Interceptor 解密后重新发起的绝大多数是 https 请求。
 */
function toProxyUrl(
  proxyServer: string | null,
  selfAuthority: string,
): string | null {
  const raw = proxyServer?.trim() ?? '';
  if (raw.length === 0) {
    return null;
  }
  const byScheme = new Map<string, string>();
  let bare = '';
  for (const part of raw.split(';')) {
    const item = part.trim();
    if (item.length === 0) {
      continue;
    }
    const separator = item.indexOf('=');
    if (separator < 0) {
      bare = bare.length > 0 ? bare : item;
      continue;
    }
    byScheme.set(
      item.slice(0, separator).trim().toLowerCase(),
      item.slice(separator + 1).trim(),
    );
  }
  const authority = byScheme.get('https') ?? byScheme.get('http') ?? bare;
  if (authority.length > 0) {
    return isSelf(authority, selfAuthority) ? null : toAbsoluteUrl(authority, 'http');
  }
  const socks = byScheme.get('socks') ?? '';
  if (socks.length > 0) {
    return isSelf(socks, selfAuthority) ? null : toAbsoluteUrl(socks, 'socks5');
  }
  return null;
}

/** WinINet 只写 host:port，而 proxy-agent 需要带 scheme 的绝对 URL。 */
function toAbsoluteUrl(authority: string, scheme: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(authority)
    ? authority
    : `${scheme}://${authority}`;
}

/** 上游是否就是 Interceptor 自己（崩溃残留会让系统代理仍指向我们）。 */
function isSelf(authority: string, selfAuthority: string): boolean {
  const value = authority.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').trim();
  return value.toLowerCase() === selfAuthority.toLowerCase();
}

/**
 * WinINet 的 bypass 列表转 curl 风格 no_proxy。
 * `<local>` 是 Windows 专有写法（所有不含点的主机名），Mockttp 不认，按回环地址近似展开。
 */
function toNoProxyList(bypassList: string | null): string[] {
  const entries: string[] = [];
  for (const part of (bypassList ?? '').split(/[;\s]+/)) {
    const item = part.trim();
    if (item.length === 0) {
      continue;
    }
    if (item.toLowerCase() === '<local>') {
      entries.push('localhost', '127.0.0.1');
      continue;
    }
    // Mockttp 按 `:` 切端口，裸 IPv6（`::1`、`[::1]`）会退化成空主机名并匹配所有请求，
    // 让整个上游代理被静默跳过，因此这类条目一律丢弃。
    if (item.split(':')[0]?.replace(/^\[/, '').length === 0) {
      continue;
    }
    entries.push(item.replace(/^\*?\./, ''));
  }
  return [...new Set(entries)];
}

function withNoProxy(proxyUrl: string, noProxy: string[]): UpstreamProxyConfig {
  return noProxy.length > 0 ? { proxyUrl, noProxy } : { proxyUrl };
}

/**
 * 上游代理的展示形式：只保留 host:port。
 * 上游 URL 可能带 user:pass 认证信息，不能原样交给 Renderer 展示。
 */
export function toUpstreamAuthority(
  upstream: UpstreamProxyConfig | null,
): string | null {
  if (!upstream) {
    return null;
  }
  try {
    const url = new URL(upstream.proxyUrl);
    return url.port.length > 0 ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return null;
  }
}
