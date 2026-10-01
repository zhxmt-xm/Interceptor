import { afterEach, describe, expect, it, vi } from 'vitest';

import { MacosSystemProxyService } from '../../entry';
import { SystemProxyError } from '../../../internal/errors';
import { MacosHelperServiceClient } from '../../../../helper/macos/helper-client';
import type { MacosSystemProxySnapshot, SystemProxyJournalRecord, SystemProxyJournalStore } from '../../../interfaces';

class FakeJournal implements SystemProxyJournalStore {
  /** Current persisted record shared across simulated process generations. */
  record: SystemProxyJournalRecord | null = null;

  /** Return the current persisted crash record. */
  read(): Promise<SystemProxyJournalRecord | null> {
    return Promise.resolve(this.record);
  }

  /** Persist original and intended values before the helper write. */
  save(original: unknown, owned: unknown, effectiveProxies: Record<string, unknown>): Promise<void> {
    this.record = {
      original,
      owned,
      effectiveProxies,
    };
    return Promise.resolve();
  }

  /** Remove the persisted record after restoration. */
  clear(): Promise<void> {
    this.record = null;
    return Promise.resolve();
  }
}

class FakeMacosHelperRunner extends MacosHelperServiceClient {
  /** Recorded helper invocations used to assert guarded zero-write behavior. */
  readonly calls: string[] = [];
  /** Effective system proxy configuration before Interceptor takes ownership. */
  effectiveProxySettings: Record<string, unknown> = {
    HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 7890,
    HTTPSEnable: 1, HTTPSProxy: '127.0.0.1', HTTPSPort: 7890,
  };
  /** Mutable helper-side SystemConfiguration snapshot. */
  snapshot: MacosSystemProxySnapshot = {
    services: [
      {
        id: 'service-ethernet',
        name: 'Ethernet',
        settings: {
          HTTPEnable: 0,
          HTTPSEnable: 0,
          SOCKSEnable: 1,
          SOCKSProxy: 'socks.corp.example',
          SOCKSPort: 1080,
          ExceptionsList: ['intranet.example'],
        },
      },
      {
        id: 'service-wifi',
        name: 'Wi-Fi',
        settings: {
          ProxyAutoConfigEnable: 1,
          ProxyAutoConfigURLString: 'https://corp.example/proxy.pac',
          ProxyAutoDiscoveryEnable: 1,
        },
      },
    ],
  };

  override async readSystemProxySnapshot(): Promise<MacosSystemProxySnapshot> {
    this.calls.push('read');
    return structuredClone(this.snapshot);
  }

  /** Read the actual effective proxy, independently of network-service order. */
  override async readEffectiveSystemProxySettings(): Promise<Record<string, unknown>> {
    this.calls.push('read-effective-proxies');
    return structuredClone(this.effectiveProxySettings);
  }

  override async replaceSystemProxySnapshot(expectedSnapshot: MacosSystemProxySnapshot, snapshot: MacosSystemProxySnapshot): Promise<MacosSystemProxySnapshot> {
    this.calls.push('replace');
    expect(expectedSnapshot).toEqual(this.snapshot);
    this.snapshot = structuredClone(snapshot);
    return structuredClone(this.snapshot);
  }
}

describe('MacosSystemProxyService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retains the effective system proxy as its upstream after taking ownership', async () => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    const macosSystemProxyService = createService(macosHelperServiceClient, new FakeJournal());

    await macosSystemProxyService.enable('127.0.0.1', 8888);
    macosHelperServiceClient.effectiveProxySettings = {
      HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 8888,
      HTTPSEnable: 1, HTTPSProxy: '127.0.0.1', HTTPSPort: 8888,
    };

    expect(macosSystemProxyService.detectedUpstream()).toEqual({
      httpProxyUrl: 'http://127.0.0.1:7890', httpsProxyUrl: 'http://127.0.0.1:7890',
      exceptions: [], excludeSimpleHostnames: false,
    });
    await macosSystemProxyService.restore();
    expect(macosSystemProxyService.detectedUpstream()).toBeNull();
  });

  it.each([
    {
      settings: { HTTPEnable: 1, HTTPProxy: 'http.proxy.example', HTTPPort: 8080,
        HTTPSEnable: 1, HTTPSProxy: 'secure.proxy.example', HTTPSPort: 8443 },
      expected: { httpProxyUrl: 'http://http.proxy.example:8080', httpsProxyUrl: 'http://secure.proxy.example:8443',
        exceptions: [], excludeSimpleHostnames: false },
    },
    {
      settings: { SOCKSEnable: 1, SOCKSProxy: '::1', SOCKSPort: 1080,
        HTTPEnable: 1, HTTPProxy: 'http.proxy.example', HTTPPort: 8080,
        ExceptionsList: ['*.local', '10.0.0.0/8'], ExcludeSimpleHostnames: 1 },
      expected: { httpProxyUrl: 'http://http.proxy.example:8080', httpsProxyUrl: 'socks5://[::1]:1080',
        exceptions: ['*.local', '10.0.0.0/8'], excludeSimpleHostnames: true },
    },
    {
      settings: { ProxyAutoConfigEnable: 1, ProxyAutoConfigURLString: 'https://proxy.example/rules.pac',
        HTTPEnable: 1, HTTPProxy: 'ignored.example', HTTPPort: 8080 },
      expected: { httpProxyUrl: 'pac+https://proxy.example/rules.pac', httpsProxyUrl: 'pac+https://proxy.example/rules.pac',
        exceptions: [], excludeSimpleHostnames: false },
    },
    {
      settings: { HTTPEnable: 1, HTTPProxy: 'proxy.example', HTTPPort: 8080 },
      expected: { httpProxyUrl: 'http://proxy.example:8080', httpsProxyUrl: null,
        exceptions: [], excludeSimpleHostnames: false },
    },
    { settings: {}, expected: null },
    { settings: { HTTPEnable: 1, HTTPProxy: 'localhost', HTTPPort: 8888,
      HTTPSEnable: 1, HTTPSProxy: '::1', HTTPSPort: 8888 }, expected: null },
  ])('preserves protocol and bypass choices from effective settings $settings', async ({ settings, expected }) => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    macosHelperServiceClient.effectiveProxySettings = settings;
    const macosSystemProxyService = createService(macosHelperServiceClient);

    await macosSystemProxyService.enable('127.0.0.1', 8888);

    expect(macosSystemProxyService.detectedUpstream()).toEqual(expected);
    expect(macosHelperServiceClient.calls.indexOf('read-effective-proxies'))
      .toBeLessThan(macosHelperServiceClient.calls.indexOf('replace'));
  });

  it.each([
    { protocol: 'HTTP', host: '127.1' },
    { protocol: 'HTTPS', host: '2130706433' },
    { protocol: 'SOCKS', host: '0x7f000001' },
    { protocol: 'HTTP', host: 'localhost.' },
    { protocol: 'HTTPS', host: '[0:0:0:0:0:0:0:1]' },
    { protocol: 'SOCKS', host: '[::ffff:127.0.0.1]' },
  ])('never chains back into the listener through $protocol host $host', async ({ protocol, host }) => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    macosHelperServiceClient.effectiveProxySettings = {
      [`${protocol}Enable`]: 1, [`${protocol}Proxy`]: host, [`${protocol}Port`]: 8888,
    };
    const macosSystemProxyService = createService(macosHelperServiceClient);

    await macosSystemProxyService.enable('127.0.0.1', 8888);

    expect(macosSystemProxyService.detectedUpstream()).toBeNull();
  });

  it('keeps a different local proxy port after normalizing its host', async () => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    macosHelperServiceClient.effectiveProxySettings = { SOCKSEnable: 1, SOCKSProxy: '127.1', SOCKSPort: 1080 };
    const macosSystemProxyService = createService(macosHelperServiceClient);

    await macosSystemProxyService.enable('127.0.0.1', 8888);

    expect(macosSystemProxyService.detectedUpstream()).toEqual({
      httpProxyUrl: 'socks5://127.0.0.1:1080', httpsProxyUrl: 'socks5://127.0.0.1:1080',
      exceptions: [], excludeSimpleHostnames: false,
    });
  });

  it('restores the original upstream from the crash journal without rereading the owned proxy as upstream', async () => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    const fakeJournal = new FakeJournal();
    const firstService = createService(macosHelperServiceClient, fakeJournal);
    await firstService.enable('127.0.0.1', 8888);
    const upstream = firstService.detectedUpstream();
    macosHelperServiceClient.effectiveProxySettings = { HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 8888 };
    const readCount = macosHelperServiceClient.calls.filter((call) => call === 'read-effective-proxies').length;
    const restartedService = createService(macosHelperServiceClient, fakeJournal);

    await restartedService.recoverAfterCrash();
    await restartedService.enable('127.0.0.1', 8888);

    expect(upstream).not.toBeNull();
    expect(restartedService.detectedUpstream()).toEqual(upstream);
    expect(macosHelperServiceClient.calls.filter((call) => call === 'read-effective-proxies')).toHaveLength(readCount);
  });

  it.each([
    { HTTPEnable: 1, HTTPProxy: 'proxy.example', HTTPPort: 0 },
    { HTTPEnable: 1, HTTPProxy: 'user:secret@proxy.example', HTTPPort: 8080 },
    { ProxyAutoConfigEnable: 1, ProxyAutoConfigURLString: 'file:///private/proxy.pac' },
    { ProxyAutoDiscoveryEnable: 1 },
  ])('rejects an unusable effective upstream before changing system settings', async (settings) => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    macosHelperServiceClient.effectiveProxySettings = settings;
    const fakeJournal = new FakeJournal();
    await expect(createService(macosHelperServiceClient, fakeJournal).enable('127.0.0.1', 8888))
      .rejects.toBeInstanceOf(SystemProxyError);
    expect(macosHelperServiceClient.calls).not.toContain('replace');
    expect(fakeJournal.record).toBeNull();
  });

  it('uses the persistent service and supplies the complete expected snapshot for every write', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const original = structuredClone(fakeMacosHelperRunner.snapshot);
    const read = vi.spyOn(MacosHelperServiceClient.prototype, 'readSystemProxySnapshot')
      .mockImplementation(async () => structuredClone(fakeMacosHelperRunner.snapshot));
    vi.spyOn(MacosHelperServiceClient.prototype, 'readEffectiveSystemProxySettings')
      .mockImplementation(async () => structuredClone(fakeMacosHelperRunner.effectiveProxySettings));
    const replace = vi.spyOn(MacosHelperServiceClient.prototype, 'replaceSystemProxySnapshot')
      .mockImplementation(async (_expected, snapshot) => {
        fakeMacosHelperRunner.snapshot = structuredClone(snapshot);
        return structuredClone(snapshot);
      });
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'darwin',
    });
    await macosSystemProxyService.enable('127.0.0.1', 8888);
    expect(read).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(original, fakeMacosHelperRunner.snapshot);
    const owned = structuredClone(fakeMacosHelperRunner.snapshot);
    await macosSystemProxyService.restore();
    expect(replace).toHaveBeenLastCalledWith(owned, original);
    expect(fakeMacosHelperRunner.calls).toEqual([]);
  });

  it('snapshots and configures every active network service', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'darwin',
      macosHelperServiceClient: fakeMacosHelperRunner,
    });

    const status = await macosSystemProxyService.enable('127.0.0.1', 8888);

    expect(status).toMatchObject({
      supported: true,
      enabled: true,
      owned: true,
      autoDetect: false,
      proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
      pacUrl: null,
    });
    expect(fakeMacosHelperRunner.snapshot.services).toHaveLength(2);
    for (const networkService of fakeMacosHelperRunner.snapshot.services) {
      expect(networkService.settings).toMatchObject({
        HTTPEnable: 1,
        HTTPProxy: '127.0.0.1',
        HTTPPort: 8888,
        HTTPSEnable: 1,
        HTTPSProxy: '127.0.0.1',
        HTTPSPort: 8888,
        SOCKSEnable: 0,
        ProxyAutoConfigEnable: 0,
        ProxyAutoDiscoveryEnable: 0,
      });
    }
  });

  it('restores the exact multi-service snapshot while settings remain owned', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const original = structuredClone(fakeMacosHelperRunner.snapshot);
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'darwin',
      macosHelperServiceClient: fakeMacosHelperRunner,
    });
    await macosSystemProxyService.enable('::1', 7777);

    const result = await macosSystemProxyService.restore();

    expect(result.restored).toBe(true);
    expect(fakeMacosHelperRunner.snapshot).toEqual(original);
    expect(result.status).toMatchObject({ owned: false, ownershipLost: false });
  });

  it('does not restore any service after one service is externally modified', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'darwin',
      macosHelperServiceClient: fakeMacosHelperRunner,
    });
    await macosSystemProxyService.enable('127.0.0.1', 8888);
    const [first, second] = fakeMacosHelperRunner.snapshot.services;
    if (!first || !second) {
      throw new Error('Expected two fake network services.');
    }
    fakeMacosHelperRunner.snapshot = {
      services: [
        {
          ...first,
          settings: { ...first.settings, HTTPPort: 9999 },
        },
        second,
      ],
    };
    const callCount = fakeMacosHelperRunner.calls.length;

    const result = await macosSystemProxyService.restore();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { owned: false, ownershipLost: true },
    });
    expect(fakeMacosHelperRunner.calls.slice(callCount)).toEqual(['read']);
  });

  it('rejects duplicate services, missing services and non-loopback listeners', async () => {
    const runner = new FakeMacosHelperRunner();
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'darwin',
      macosHelperServiceClient: runner,
    });
    await expect(macosSystemProxyService.enable('0.0.0.0', 8888)).rejects.toBeInstanceOf(
      SystemProxyError,
    );

    runner.snapshot = { services: [] };
    await expect(macosSystemProxyService.enable('127.0.0.1', 8888)).rejects.toThrow(
      'no active network services',
    );

    const duplicate = new FakeMacosHelperRunner();
    const [first] = duplicate.snapshot.services;
    if (!first) {
      throw new Error('Expected a fake network service.');
    }
    duplicate.snapshot = { services: [first, first] };
    await expect(new MacosSystemProxyService({
      platform: 'darwin',
      macosHelperServiceClient: duplicate,
    }).status()).rejects.toThrow('duplicate services');
  });

  it('reports unsupported platforms without invoking the helper', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const macosSystemProxyService = new MacosSystemProxyService({
      platform: 'win32',
      macosHelperServiceClient: fakeMacosHelperRunner,
    });

    expect(macosSystemProxyService.supported()).toBe(false);
    expect(await macosSystemProxyService.status()).toMatchObject({ supported: false });
    expect(await macosSystemProxyService.restore()).toMatchObject({ reason: 'not-owned' });
    expect(fakeMacosHelperRunner.calls).toEqual([]);
  });

  it('loads every service from a crash journal and restores only on shutdown', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const original = structuredClone(fakeMacosHelperRunner.snapshot);
    const fakeJournal = new FakeJournal();
    await createService(fakeMacosHelperRunner, fakeJournal).enable('127.0.0.1', 8888);
    const callCount = fakeMacosHelperRunner.calls.length;
    const restartedService = createService(fakeMacosHelperRunner, fakeJournal);

    const recovery = await restartedService.recoverAfterCrash();

    expect(recovery).toMatchObject({ restored: false, status: { owned: true } });
    expect(fakeMacosHelperRunner.calls.slice(callCount)).toEqual(['read']);
    expect(fakeJournal.record).not.toBeNull();

    const result = await restartedService.restore();
    expect(result.restored).toBe(true);
    expect(fakeMacosHelperRunner.snapshot).toEqual(original);
    expect(fakeJournal.record).toBeNull();
  });

  it('clears a journal when a crash happened before SystemConfiguration changed', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const original = structuredClone(fakeMacosHelperRunner.snapshot);
    const fakeJournal = new FakeJournal();
    await fakeJournal.save(original, {
      services: original.services.map((service) => ({
        ...service,
        settings: { ...service.settings, HTTPEnable: 1, HTTPPort: 8888 },
      })),
    }, fakeMacosHelperRunner.effectiveProxySettings);

    const result = await createService(
      fakeMacosHelperRunner,
      fakeJournal,
    ).recoverAfterCrash();

    expect(result).toMatchObject({ restored: false, reason: 'not-owned' });
    expect(fakeMacosHelperRunner.calls).toEqual(['read']);
    expect(fakeJournal.record).toBeNull();
  });

  it('does not use a crash journal after one service is externally changed', async () => {
    const fakeMacosHelperRunner = new FakeMacosHelperRunner();
    const fakeJournal = new FakeJournal();
    await createService(fakeMacosHelperRunner, fakeJournal).enable('127.0.0.1', 8888);
    const [first, second] = fakeMacosHelperRunner.snapshot.services;
    if (!first || !second) {
      throw new Error('Expected two fake network services.');
    }
    fakeMacosHelperRunner.snapshot = {
      services: [{ ...first, settings: { ...first.settings, HTTPSPort: 9999 } }, second],
    };
    const callCount = fakeMacosHelperRunner.calls.length;

    const result = await createService(
      fakeMacosHelperRunner,
      fakeJournal,
    ).recoverAfterCrash();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { ownershipLost: true },
    });
    expect(fakeMacosHelperRunner.calls.slice(callCount)).toEqual(['read']);
    expect(fakeJournal.record).toBeNull();
  });

  it.each([
    { change: 'added', operation: 'restore' },
    { change: 'removed', operation: 'restore' },
    { change: 'added', operation: 'recoverAfterCrash' },
    { change: 'removed', operation: 'recoverAfterCrash' },
  ] as const)('does not overwrite network services $change before $operation', async ({ change, operation }) => {
    const macosHelperServiceClient = new FakeMacosHelperRunner();
    const fakeJournal = new FakeJournal();
    const macosSystemProxyService = createService(macosHelperServiceClient, fakeJournal);
    await macosSystemProxyService.enable('127.0.0.1', 8888);
    const services = macosHelperServiceClient.snapshot.services;
    macosHelperServiceClient.snapshot = {
      services: change === 'added'
        ? [...services, { id: 'service-vpn', name: 'VPN', settings: { HTTPEnable: 0 } }]
        : services.slice(1),
    };
    const externalSnapshot = structuredClone(macosHelperServiceClient.snapshot);
    const callsBefore = macosHelperServiceClient.calls.length;
    const operatingMacosSystemProxyService = operation === 'recoverAfterCrash'
      ? createService(macosHelperServiceClient, fakeJournal) : macosSystemProxyService;

    const result = await operatingMacosSystemProxyService[operation]();

    expect(result).toMatchObject({
      restored: false, reason: 'externally-modified', status: { owned: false, ownershipLost: true },
    });
    expect(macosHelperServiceClient.snapshot).toEqual(externalSnapshot);
    expect(macosHelperServiceClient.calls.slice(callsBefore)).toEqual(['read']);
    expect(fakeJournal.record).toBeNull();
  });
});

/** Create one macOS service with optional shared crash journal. */
function createService(
  macosHelperServiceClient: MacosHelperServiceClient,
  journal?: SystemProxyJournalStore,
): MacosSystemProxyService {
  return new MacosSystemProxyService({
    platform: 'darwin',
    macosHelperServiceClient,
    journal,
  });
}