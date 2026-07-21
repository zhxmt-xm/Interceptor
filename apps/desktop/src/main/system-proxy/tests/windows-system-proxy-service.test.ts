import { describe, expect, it } from 'vitest';

import { WindowsSystemProxyService } from '../windows-system-proxy-service';
import { SystemProxyError } from '../system-proxy-error';
import type {
  SystemProxyCommandResult,
  SystemProxyCommandRunner,
  SystemProxyJournalRecord,
  SystemProxyJournalStore,
  SystemProxyPlatform,
  WinInetProxySettings,
} from '../../interfaces';

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
    const runner = new FakeHelperRunner();
    const service = createService(runner);

    const status = await service.enable('127.0.0.1', 8888);

    expect(status).toMatchObject({
      supported: true,
      enabled: true,
      owned: true,
      autoDetect: false,
      proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
      bypassList: '<local>',
      pacUrl: null,
    });
    expect(runner.calls[1]?.args).toEqual([
      'set',
      '3',
      encode('http=127.0.0.1:8888;https=127.0.0.1:8888'),
      encode('<local>'),
      '-',
    ]);
  });

  it('restores the exact snapshot when current settings remain owned', async () => {
    const runner = new FakeHelperRunner();
    const original = { ...runner.settings };
    const service = createService(runner);
    await service.enable('127.0.0.1', 8888);

    const result = await service.restore();

    expect(result.restored).toBe(true);
    expect(runner.settings).toEqual(original);
    expect(result.status).toMatchObject({ owned: false, ownershipLost: false });
  });

  it('does not write when an external actor changes any owned value', async () => {
    const runner = new FakeHelperRunner();
    const service = createService(runner);
    await service.enable('127.0.0.1', 8888);
    runner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: 'http=127.0.0.1:9999;https=127.0.0.1:9999',
      bypassList: '<local>',
    });
    const callsBeforeRestore = runner.calls.length;

    const result = await service.restore();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { owned: false, ownershipLost: true },
    });
    expect(runner.calls.slice(callsBeforeRestore).map((call) => call.args[0]))
      .toEqual(['get']);
    expect(runner.settings.proxyServer).toContain(':9999');
  });

  it('rejects a second enable after ownership is externally modified', async () => {
    const runner = new FakeHelperRunner();
    const service = createService(runner);
    await service.enable('127.0.0.1', 8888);
    runner.settings = settings({ flags: 1 });

    await expect(service.enable('127.0.0.1', 8888)).rejects.toThrow(
      'ownership was lost',
    );
  });

  it('rejects non-loopback listeners and invalid helper output', async () => {
    const runner = new FakeHelperRunner();
    const service = createService(runner);
    await expect(service.enable('0.0.0.0', 8888)).rejects.toBeInstanceOf(
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
    const runner = new FakeHelperRunner();
    const service = new WindowsSystemProxyService({
      platform: 'darwin',
      helperPath: 'helper.exe',
      runner,
    });

    expect(service.supported()).toBe(false);
    expect(await service.status()).toMatchObject({ supported: false });
    expect(await service.restore()).toMatchObject({ reason: 'not-owned' });
    expect(runner.calls).toEqual([]);
  });

  it('restores from a journal after the owning process crashes', async () => {
    const runner = new FakeHelperRunner();
    const original = { ...runner.settings };
    const journal = new FakeJournal();
    await createService(runner, journal).enable('127.0.0.1', 8888);

    const result = await createService(runner, journal).repair();

    expect(result.restored).toBe(true);
    expect(runner.settings).toEqual(original);
    expect(journal.record).toBeNull();
  });

  it('does not use a crash journal after an external proxy change', async () => {
    const runner = new FakeHelperRunner();
    const journal = new FakeJournal();
    await createService(runner, journal).enable('127.0.0.1', 8888);
    runner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: 'http=127.0.0.1:9999;https=127.0.0.1:9999',
      bypassList: '<local>',
    });
    const callsBeforeRepair = runner.calls.length;

    const result = await createService(runner, journal).repair();

    expect(result).toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { ownershipLost: true },
    });
    expect(runner.calls.slice(callsBeforeRepair).map((call) => call.args[0]))
      .toEqual(['get']);
    expect(journal.record).not.toBeNull();
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