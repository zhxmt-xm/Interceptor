import { describe, expect, it } from 'vitest';

import {
  MacosSystemProxyService,
  type MacosSystemProxySnapshot,
} from '../macos-system-proxy-service';
import {
  SystemProxyError,
  type SystemProxyCommandResult,
  type SystemProxyCommandRunner,
} from '../system-proxy-service';
import type {
  SystemProxyJournalRecord,
  SystemProxyJournalStore,
  SystemProxyPlatform,
} from '../system-proxy-journal';

class FakeJournal implements SystemProxyJournalStore {
  /** Current persisted record shared across simulated process generations. */
  record: SystemProxyJournalRecord | null = null;

  /** Return the current persisted ownership record. */
  read(): Promise<SystemProxyJournalRecord | null> {
    return Promise.resolve(this.record);
  }

  /** Persist original and intended values before the helper write. */
  begin(platform: SystemProxyPlatform, original: unknown, owned: unknown): Promise<void> {
    const timestamp = new Date().toISOString();
    this.record = {
      version: 1,
      platform,
      phase: 'preparing',
      original,
      owned,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return Promise.resolve();
  }

  /** Advance the current record to verified ownership. */
  markOwned(platform: SystemProxyPlatform): Promise<void> {
    if (!this.record || this.record.platform !== platform) {
      throw new Error('missing journal');
    }
    this.record = { ...this.record, phase: 'owned' };
    return Promise.resolve();
  }

  /** Remove the persisted record after restoration. */
  clear(): Promise<void> {
    this.record = null;
    return Promise.resolve();
  }
}

class FakeMacosHelperRunner implements SystemProxyCommandRunner {
  /** Recorded helper invocations used to assert guarded zero-write behavior. */
  readonly calls: { command: string; args: readonly string[] }[] = [];
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

  /** Emulate get and base64-encoded atomic set helper commands. */
  run(command: string, args: readonly string[]): Promise<SystemProxyCommandResult> {
    this.calls.push({ command, args: [...args] });
    if (args[0] === 'get') {
      return Promise.resolve(this.ok(this.snapshot));
    }
    if (args[0] === 'set' && args[1]) {
      this.snapshot = JSON.parse(
        Buffer.from(args[1], 'base64').toString('utf8'),
      ) as MacosSystemProxySnapshot;
      return Promise.resolve(this.ok(this.snapshot));
    }
    return Promise.resolve({ code: 2, stdout: '', stderr: 'bad command' });
  }

  /** Return a successful helper result for one snapshot. */
  private ok(snapshot: MacosSystemProxySnapshot): SystemProxyCommandResult {
    return { code: 0, stdout: JSON.stringify(snapshot), stderr: '' };
  }
}

describe('MacosSystemProxyService', () => {
  it('snapshots and configures every active network service', async () => {
    const runner = new FakeMacosHelperRunner();
    const service = new MacosSystemProxyService({
      platform: 'darwin',
      helperPath: 'macos-proxy-helper',
      runner,
    });

    const status = await service.enable('127.0.0.1', 8888);

    expect(status).toMatchObject({
      supported: true,
      enabled: true,
      owned: true,
      autoDetect: false,
      proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
      pacUrl: null,
    });
    expect(runner.snapshot.services).toHaveLength(2);
    for (const networkService of runner.snapshot.services) {
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
    const runner = new FakeMacosHelperRunner();
    const original = structuredClone(runner.snapshot);
    const service = new MacosSystemProxyService({
      platform: 'darwin',
      helperPath: 'macos-proxy-helper',
      runner,
    });
    await service.enable('::1', 7777);

    const result = await service.restore();

    expect(result.restored).toBe(true);
    expect(runner.snapshot).toEqual(original);
    expect(result.status).toMatchObject({ owned: false, ownershipLost: false });
  });

  it('does not restore any service after one service is externally modified', async () => {
    const runner = new FakeMacosHelperRunner();
    const service = new MacosSystemProxyService({
      platform: 'darwin',
      helperPath: 'macos-proxy-helper',
      runner,
    });
    await service.enable('127.0.0.1', 8888);
    const [first, second] = runner.snapshot.services;
    if (!first || !second) {
      throw new Error('Expected two fake network services.');
    }
    runner.snapshot = {
      services: [
        {
          ...first,
          settings: { ...first.settings, HTTPPort: 9999 },
        },
        second,
      ],
    };
    const callCount = runner.calls.length;

    const result = await service.restore();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { owned: false, ownershipLost: true },
    });
    expect(runner.calls.slice(callCount).map((call) => call.args[0]))
      .toEqual(['get']);
  });

  it('rejects duplicate services, missing services and non-loopback listeners', async () => {
    const runner = new FakeMacosHelperRunner();
    const service = new MacosSystemProxyService({
      platform: 'darwin',
      helperPath: 'macos-proxy-helper',
      runner,
    });
    await expect(service.enable('0.0.0.0', 8888)).rejects.toBeInstanceOf(
      SystemProxyError,
    );

    runner.snapshot = { services: [] };
    await expect(service.enable('127.0.0.1', 8888)).rejects.toThrow(
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
      helperPath: 'macos-proxy-helper',
      runner: duplicate,
    }).status()).rejects.toThrow('duplicate services');
  });

  it('reports unsupported platforms without invoking the helper', async () => {
    const runner = new FakeMacosHelperRunner();
    const service = new MacosSystemProxyService({
      platform: 'win32',
      helperPath: 'macos-proxy-helper',
      runner,
    });

    expect(service.supported()).toBe(false);
    expect(await service.status()).toMatchObject({ supported: false });
    expect(await service.restore()).toMatchObject({ reason: 'not-owned' });
    expect(runner.calls).toEqual([]);
  });

  it('restores every service from a journal after the owner crashes', async () => {
    const runner = new FakeMacosHelperRunner();
    const original = structuredClone(runner.snapshot);
    const journal = new FakeJournal();
    await createService(runner, journal).enable('127.0.0.1', 8888);

    const result = await createService(runner, journal).repair();

    expect(result.restored).toBe(true);
    expect(runner.snapshot).toEqual(original);
    expect(journal.record).toBeNull();
  });

  it('does not use a crash journal after one service is externally changed', async () => {
    const runner = new FakeMacosHelperRunner();
    const journal = new FakeJournal();
    await createService(runner, journal).enable('127.0.0.1', 8888);
    const [first, second] = runner.snapshot.services;
    if (!first || !second) {
      throw new Error('Expected two fake network services.');
    }
    runner.snapshot = {
      services: [{ ...first, settings: { ...first.settings, HTTPSPort: 9999 } }, second],
    };
    const callCount = runner.calls.length;

    const result = await createService(runner, journal).repair();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { ownershipLost: true },
    });
    expect(runner.calls.slice(callCount).map((call) => call.args[0]))
      .toEqual(['get']);
    expect(journal.record).not.toBeNull();
  });
});

/** Create one macOS service with optional shared crash journal. */
function createService(
  runner: SystemProxyCommandRunner,
  journal?: SystemProxyJournalStore,
): MacosSystemProxyService {
  return new MacosSystemProxyService({
    platform: 'darwin',
    helperPath: 'macos-proxy-helper',
    runner,
    journal,
  });
}