import { describe, expect, it } from 'vitest';

import { WindowsSystemProxyService } from '../../windows-system-proxy-service';
import { SystemProxyError } from '../../system-proxy-error';
import type {
  SystemProxyCommandResult,
  SystemProxyCommandRunner,
  SystemProxyJournalRecord,
  SystemProxyJournalStore,
  SystemProxyPlatform,
  WinInetProxySettings,
} from '../../../interfaces';

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

class FakeHelperRunner implements SystemProxyCommandRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];
  settings: WinInetProxySettings = settings({
    flags: 13,
    autoDetect: true,
    pacUrl: 'https://corp.example/proxy.pac',
  });

  run(command: string, args: readonly string[]): Promise<SystemProxyCommandResult> {
    this.calls.push({ command, args: [...args] });
    if (args[0] === 'get') {
      return Promise.resolve(ok(this.settings));
    }
    if (args[0] === 'set') {
      const flags = Number(args[1]);
      this.settings = settings({
        flags,
        proxyEnabled: (flags & 2) !== 0,
        autoDetect: (flags & 8) !== 0,
        proxyServer: decode(args[2]),
        bypassList: decode(args[3]),
        pacUrl: decode(args[4]),
      });
      return Promise.resolve(ok(this.settings));
    }
    return Promise.resolve({ code: 2, stdout: '', stderr: 'bad command' });
  }
}

describe('WindowsSystemProxyService', () => {
  it('snapshots all values, writes loopback HTTP/HTTPS proxy, and reports ownership', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const windowsSystemProxyService = createService(fakeHelperRunner);

    const status = await windowsSystemProxyService.enable('127.0.0.1', 8888);

    expect(status).toMatchObject({
      supported: true,
      enabled: true,
      owned: true,
      autoDetect: false,
      proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
      bypassList: 'localhost;127.*;[::1];<local>',
      pacUrl: null,
    });
    expect(fakeHelperRunner.calls[1]?.args).toEqual([
      'set',
      '3',
      encode('http=127.0.0.1:8888;https=127.0.0.1:8888'),
      encode('localhost;127.*;[::1];<local>'),
      '-',
    ]);
  });

  // 丢掉用户原有的 bypass 会把内网与回环流量也推给代理，在开发机上等同于断网。
  it('keeps the existing bypass entries when taking over', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    fakeHelperRunner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: '127.0.0.1:7890',
      bypassList: 'localhost;127.*;10.*;192.168.*;<local>',
    });
    const windowsSystemProxyService = createService(fakeHelperRunner);

    const status = await windowsSystemProxyService.enable('127.0.0.1', 8888);

    expect(status.bypassList).toBe(
      'localhost;127.*;10.*;192.168.*;<local>;[::1]',
    );
  });

  it('restores the exact snapshot when current settings remain owned', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const original = { ...fakeHelperRunner.settings };
    const windowsSystemProxyService = createService(fakeHelperRunner);
    await windowsSystemProxyService.enable('127.0.0.1', 8888);

    const result = await windowsSystemProxyService.restore();

    expect(result.restored).toBe(true);
    expect(fakeHelperRunner.settings).toEqual(original);
    expect(result.status).toMatchObject({ owned: false, ownershipLost: false });
  });

  it('does not write when an external actor changes any owned value', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const windowsSystemProxyService = createService(fakeHelperRunner);
    await windowsSystemProxyService.enable('127.0.0.1', 8888);
    fakeHelperRunner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: 'http=127.0.0.1:9999;https=127.0.0.1:9999',
      bypassList: 'localhost;127.*;[::1];<local>',
    });
    const callsBeforeRestore = fakeHelperRunner.calls.length;

    const result = await windowsSystemProxyService.restore();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { owned: false, ownershipLost: true },
    });
    expect(fakeHelperRunner.calls.slice(callsBeforeRestore).map((call) => call.args[0]))
      .toEqual(['get']);
    expect(fakeHelperRunner.settings.proxyServer).toContain(':9999');
  });

  it('rejects a second enable after ownership is externally modified', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const windowsSystemProxyService = createService(fakeHelperRunner);
    await windowsSystemProxyService.enable('127.0.0.1', 8888);
    fakeHelperRunner.settings = settings({ flags: 1 });

    await expect(windowsSystemProxyService.enable('127.0.0.1', 8888)).rejects.toThrow(
      'ownership was lost',
    );
  });

  it('rejects non-loopback listeners and invalid helper output', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const windowsSystemProxyService = createService(fakeHelperRunner);
    await expect(windowsSystemProxyService.enable('0.0.0.0', 8888)).rejects.toBeInstanceOf(
      SystemProxyError,
    );

    const invalidRunner: SystemProxyCommandRunner = {
      run: async () => ({ code: 0, stdout: '{"flags":"bad"}', stderr: '' }),
    };
    await expect(createService(invalidRunner).status()).rejects.toBeInstanceOf(
      SystemProxyError,
    );
  });

  it('reports unsupported platforms without invoking the helper', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const windowsSystemProxyService = new WindowsSystemProxyService({
      platform: 'darwin',
      helperPath: 'helper.exe',
      runner: fakeHelperRunner,
    });

    expect(windowsSystemProxyService.supported()).toBe(false);
    expect(await windowsSystemProxyService.status()).toMatchObject({ supported: false });
    expect(await windowsSystemProxyService.restore()).toMatchObject({ reason: 'not-owned' });
    expect(fakeHelperRunner.calls).toEqual([]);
  });

  it('restores from a journal after the owning process crashes', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const original = { ...fakeHelperRunner.settings };
    const fakeJournal = new FakeJournal();
    await createService(fakeHelperRunner, fakeJournal).enable('127.0.0.1', 8888);

    const result = await createService(fakeHelperRunner, fakeJournal).restore();

    expect(result.restored).toBe(true);
    expect(fakeHelperRunner.settings).toEqual(original);
    expect(fakeJournal.record).toBeNull();
  });

  it('does not use a crash journal after an external proxy change', async () => {
    const fakeHelperRunner = new FakeHelperRunner();
    const fakeJournal = new FakeJournal();
    await createService(fakeHelperRunner, fakeJournal).enable('127.0.0.1', 8888);
    fakeHelperRunner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: 'http=127.0.0.1:9999;https=127.0.0.1:9999',
      bypassList: 'localhost;127.*;[::1];<local>',
    });
    const callsBeforeRestore = fakeHelperRunner.calls.length;

    const result = await createService(fakeHelperRunner, fakeJournal).restore();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { ownershipLost: true },
    });
    expect(fakeHelperRunner.calls.slice(callsBeforeRestore).map((call) => call.args[0]))
      .toEqual(['get']);
    expect(fakeJournal.record).not.toBeNull();
  });
});

function createService(
  runner: SystemProxyCommandRunner,
  journal?: SystemProxyJournalStore,
): WindowsSystemProxyService {
  return new WindowsSystemProxyService({
    platform: 'win32',
    helperPath: 'helper.exe',
    runner,
    journal,
  });
}

function settings(
  overrides: Partial<WinInetProxySettings> = {},
): WinInetProxySettings {
  const flags = overrides.flags ?? 1;
  return {
    flags,
    proxyEnabled: overrides.proxyEnabled ?? (flags & 2) !== 0,
    autoDetect: overrides.autoDetect ?? (flags & 8) !== 0,
    proxyServer: overrides.proxyServer ?? null,
    bypassList: overrides.bypassList ?? null,
    pacUrl: overrides.pacUrl ?? null,
  };
}

function ok(value: WinInetProxySettings): SystemProxyCommandResult {
  return { code: 0, stdout: JSON.stringify(value), stderr: '' };
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function decode(value: string | undefined): string | null {
  if (value === undefined || value === '-') {
    return null;
  }
  return Buffer.from(value, 'base64').toString('utf8');
}