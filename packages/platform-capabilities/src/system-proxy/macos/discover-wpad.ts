import { lookup } from 'node:dns/promises';
import { parseUpstreamProxySettings } from '@interceptor/core-protocol';

import type { WpadDiscoveryInfo } from '../interfaces';
import { SystemProxyError, WpadNotFoundError } from '../internal/errors';

/** Use the primary network's supplied URL or explicit search domains, without altering OS settings. */
export async function discoverWpadPacUrl(info: WpadDiscoveryInfo): Promise<string> {
  if (info.dhcpPacUrl) {
    const parsed = parseUpstreamProxySettings({ mode: 'pac', url: info.dhcpPacUrl });
    if (parsed.mode !== 'pac') throw new SystemProxyError('The network PAC URL is invalid.');
    return parsed.url;
  }
  for (const domain of [...new Set(info.searchDomains)]) {
    if (!/^[\p{L}\p{N}_.-]+\.?$/u.test(domain) || domain.startsWith('.') || domain.includes('..')) {
      throw new SystemProxyError('The network supplied an invalid WPAD search domain.');
    }
    const url = new URL(`http://wpad.${domain.replace(/\.$/, '')}/wpad.dat`);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        lookup(url.hostname),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new SystemProxyError('WPAD DNS discovery timed out.')), 5_000);
        }),
      ]);
      return url.href;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error)
        || (error.code !== 'ENOTFOUND' && error.code !== 'ENODATA')) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new WpadNotFoundError();
}
