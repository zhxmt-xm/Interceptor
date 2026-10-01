import { BlockList, isIP } from 'node:net';

import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import { SystemProxyError } from '../internal/errors';

const loopbackAddresses = new BlockList();
loopbackAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackAddresses.addAddress('::1', 'ipv6');

export function toMacosUpstreamProxyConfig(
  settings: Readonly<Record<string, unknown>>, listenerPort: number,
): UpstreamProxyConfig | null {
  const exceptions = settings.ExceptionsList ?? [];
  if (!Array.isArray(exceptions) || exceptions.some((entry) => typeof entry !== 'string')) {
    throw new SystemProxyError('macOS proxy exceptions are invalid.');
  }
  const excludeSimpleHostnames = enabled(settings, 'ExcludeSimpleHostnames');
  if (enabled(settings, 'ProxyAutoConfigEnable')) {
    const value = settings.ProxyAutoConfigURLString;
    if (typeof value !== 'string') throw new SystemProxyError('macOS PAC URL is missing.');
    let url: URL;
    try { url = new URL(value); }
    catch { throw new SystemProxyError('macOS PAC URL is invalid.'); }
    if (!['http:', 'https:'].includes(url.protocol) || isListener(url.hostname, Number(url.port || (url.protocol === 'https:' ? 443 : 80)), listenerPort)) {
      throw new SystemProxyError('macOS PAC URL is unsupported or points to Interceptor.');
    }
    return { httpProxyUrl: `pac+${url.href}`, httpsProxyUrl: `pac+${url.href}`, exceptions, excludeSimpleHostnames };
  }
  const socks = endpoint(settings, 'SOCKS', 'socks5:', listenerPort);
  const httpProxyUrl = endpoint(settings, 'HTTP', 'http:', listenerPort) ?? socks;
  const httpsProxyUrl = endpoint(settings, 'HTTPS', 'http:', listenerPort) ?? socks;
  if (!httpProxyUrl && !httpsProxyUrl) {
    if (enabled(settings, 'ProxyAutoDiscoveryEnable')) {
      throw new SystemProxyError('macOS automatic proxy discovery requires an explicit PAC URL before takeover.');
    }
    return null;
  }
  return { httpProxyUrl, httpsProxyUrl, exceptions, excludeSimpleHostnames };
}

function enabled(settings: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = settings[key];
  if (value === undefined || value === 0) return false;
  if (value === 1) return true;
  throw new SystemProxyError('macOS proxy enable flag is invalid.');
}

function endpoint(
  settings: Readonly<Record<string, unknown>>, name: string, scheme: string, listenerPort: number,
): string | null {
  if (!enabled(settings, `${name}Enable`)) return null;
  const host = settings[`${name}Proxy`];
  const port = settings[`${name}Port`];
  if (typeof host !== 'string' || !host.trim() || typeof port !== 'number'
    || !Number.isInteger(port) || port < 1 || port > 65_535 || /[\s/@?#\\]/.test(host)) {
    throw new SystemProxyError('macOS enabled proxy has an invalid host or port.');
  }
  const hostname = host.replace(/^\[|\]$/g, '');
  if (hostname.includes(':') && isIP(hostname) !== 6) {
    throw new SystemProxyError('macOS proxy host is invalid.');
  }
  let address: URL;
  try { address = new URL(`http://${isIP(hostname) === 6 ? `[${hostname}]` : hostname}:${port}`); }
  catch { throw new SystemProxyError('macOS proxy address is invalid.'); }
  if (isListener(address.hostname, port, listenerPort)) return null;
  return new URL(`${scheme}//${address.hostname}:${port}`).href.replace(/\/$/, '');
}

function isListener(hostname: string, port: number, listenerPort: number): boolean {
  if (port !== listenerPort) return false;
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const family = isIP(host);
  return host === 'localhost' || (family !== 0 && loopbackAddresses.check(host, family === 6 ? 'ipv6' : 'ipv4'));
}