import * as dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseWpadDiscoveryInfo } from '../../../../helper/macos/utils';
import { discoverWpadPacUrl } from '../../discover-wpad';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

describe('macOS WPAD discovery inputs', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.mocked(dns.lookup).mockReset(); vi.useRealTimers(); });

  it('prefers the network-supplied DHCP PAC URL without a DNS query', async () => {
    const lookup = vi.spyOn(dns, 'lookup');
    await expect(discoverWpadPacUrl({
      searchDomains: ['office.example.test'], dhcpPacUrl: ' http://proxy.example.test/from-dhcp.pac ',
    })).resolves.toBe('http://proxy.example.test/from-dhcp.pac');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('uses the system lookup and the standard HTTP path without configuring a DNS server', async () => {
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '192.0.2.10', family: 4 });
    await expect(discoverWpadPacUrl({
      searchDomains: ['office.example.test'], dhcpPacUrl: null,
    })).resolves.toBe('http://wpad.office.example.test/wpad.dat');
    expect(lookup).toHaveBeenCalledExactlyOnceWith('wpad.office.example.test');
  });

  it('tries only configured domains after NXDOMAIN and never walks to a public parent domain', async () => {
    const lookup = vi.spyOn(dns, 'lookup')
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }))
      .mockResolvedValue({ address: '192.0.2.10', family: 4 });
    await expect(discoverWpadPacUrl({
      searchDomains: ['first.office.example.test', 'office.example.test'], dhcpPacUrl: null,
    })).resolves.toBe('http://wpad.office.example.test/wpad.dat');
    expect(lookup.mock.calls).toEqual([['wpad.first.office.example.test'], ['wpad.office.example.test']]);
  });

  it('reports no configuration instead of converting an empty network to DIRECT', async () => {
    await expect(discoverWpadPacUrl({ searchDomains: [], dhcpPacUrl: null }))
      .rejects.toThrow('No WPAD configuration');
  });

  it('preserves resolver failures instead of disguising them as a missing PAC', async () => {
    const error = Object.assign(new Error('resolver failed'), { code: 'EAI_AGAIN' });
    vi.spyOn(dns, 'lookup').mockRejectedValue(error);
    await expect(discoverWpadPacUrl({ searchDomains: ['office.example.test'], dhcpPacUrl: null }))
      .rejects.toBe(error);
  });

  it('bounds a stalled lookup without changing the saved route', async () => {
    vi.useFakeTimers();
    vi.spyOn(dns, 'lookup').mockImplementation(() => new Promise(() => undefined));
    const pending = discoverWpadPacUrl({ searchDomains: ['office.example.test'], dhcpPacUrl: null });
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
  });

  it.each(['https://office.example.test', 'office.example.test/path', '.example.test', 'office..test'])(
    'rejects an invalid network domain before sending DNS: %s', async domain => {
      const lookup = vi.spyOn(dns, 'lookup');
      await expect(discoverWpadPacUrl({ searchDomains: [domain], dhcpPacUrl: null }))
        .rejects.toThrow('invalid WPAD search domain');
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it.each([
    null, { searchDomains: [], dhcpPacUrl: null, extra: true },
    { searchDomains: [2], dhcpPacUrl: null }, { searchDomains: [''], dhcpPacUrl: null },
    { searchDomains: [], dhcpPacUrl: 123 },
  ])('rejects malformed native discovery replies: %j', value => {
    expect(() => parseWpadDiscoveryInfo(value)).toThrow();
  });
});
