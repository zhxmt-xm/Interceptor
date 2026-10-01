import { describe, expect, it } from 'vitest';

import { WindowsSystemProxyService } from '../../entry';
import type { SystemProxyCommandResult, SystemProxyCommandRunner, WinInetProxySettings, WindowsSystemProxyJournalRecord, WindowsSystemProxyJournalStore } from '../../../interfaces';

const ORIGINAL_SETTINGS: WinInetProxySettings = settings({
  flags: 3,
  proxyEnabled: true,
  proxyServer: '127.0.0.1:7890',
  bypassList: 'localhost;<local>',
});

class FakeCrashJournal implements WindowsSystemProxyJournalStore {
  /** Current minimal crash record shared by sequential App generations. */
  record: WindowsSystemProxyJournalRecord | null = null;

  /** Return the complete current crash record. */
  read(): Promise<WindowsSystemProxyJournalRecord | null> {
    return Promise.resolve(this.record);
  }

  /** Persist the exact snapshots before WinINet is changed. */
  save(original: WinInetProxySettings, owned: WinInetProxySettings): Promise<void> {
    this.record = { version: 1, original, owned };
    return Promise.resolve();
  }

  /** Remove a record that no longer requires recovery. */
  clear(): Promise<void> {
    this.record = null;
    return Promise.resolve();
  }
}

class FakeWinInetRunner implements SystemProxyCommandRunner {
  /** Complete mutable WinINet state shared by sequential App generations. */
  settings = { ...ORIGINAL_SETTINGS };
  /** Every helper command used to prove zero-write recovery branches. */
  readonly calls: string[][] = [];
  /** Whether the next native set command must fail before changing settings. */
  failNextSet = false;

  /** Emulate only the product get/set helper contract. */
  run(_command: string, args: readonly string[]): Promise<SystemProxyCommandResult> {
    this.calls.push([...args]);
    if (args[0] === 'get') {
      return Promise.resolve(ok(this.settings));
    }
    if (args[0] === 'set') {
      if (this.failNextSet) {
        this.failNextSet = false;
        return Promise.resolve({ code: 1, stdout: '', stderr: 'set failed' });
      }
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
    return Promise.resolve({ code: 2, stdout: '', stderr: 'unexpected command' });
  }
}

describe('WindowsSystemProxyService crash recovery', () => {
  it('loads one crash journal without rewriting WinINet and later restores original', async () => {
    const fixture = createFixture();
    const firstApp = fixture.createService();
    await firstApp.enable('127.0.0.1', 8888);
    const firstRecord = structuredClone(fixture.journal.record);
    const setCountAfterTakeover = fixture.setCount();
    const secondApp = fixture.createService();

    await expect(secondApp.recoverAfterCrash()).resolves.toMatchObject({
      restored: false,
      status: { owned: true },
    });

    expect(fixture.setCount()).toBe(setCountAfterTakeover);
    expect(fixture.journal.record).toEqual(firstRecord);
    await expect(secondApp.restore()).resolves.toMatchObject({ restored: true });
    expect(fixture.winInetRunner.settings).toEqual(ORIGINAL_SETTINGS);
    expect(fixture.journal.record).toBeNull();
  });

  it('does not overwrite an external proxy change and clears the stale journal', async () => {
    const fixture = createFixture();
    await fixture.createService().enable('127.0.0.1', 8888);
    fixture.winInetRunner.settings = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: '127.0.0.1:9999',
      bypassList: 'localhost;<local>',
    });
    const setCount = fixture.setCount();

    await expect(fixture.createService().recoverAfterCrash()).resolves.toMatchObject({
      restored: false,
      reason: 'externally-modified',
      status: { ownershipLost: true },
    });

    expect(fixture.setCount()).toBe(setCount);
    expect(fixture.journal.record).toBeNull();
  });

  it('keeps the journal when restoring original WinINet settings fails', async () => {
    const fixture = createFixture();
    const service = fixture.createService();
    await service.enable('127.0.0.1', 8888);
    fixture.winInetRunner.failNextSet = true;

    await expect(service.restore()).rejects.toThrow('set failed');

    expect(fixture.journal.record).not.toBeNull();
  });

  it('clears a journal when a crash happened before WinINet was changed', async () => {
    const fixture = createFixture();
    const owned = settings({
      flags: 3,
      proxyEnabled: true,
      proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
      bypassList: 'localhost;127.*;[::1];<local>',
    });
    await fixture.journal.save(ORIGINAL_SETTINGS, owned);

    await expect(fixture.createService().recoverAfterCrash()).resolves.toMatchObject({
      restored: false,
      reason: 'not-owned',
    });

    expect(fixture.winInetRunner.settings).toEqual(ORIGINAL_SETTINGS);
    expect(fixture.setCount()).toBe(0);
    expect(fixture.journal.record).toBeNull();
  });
});

/** Create shared WinINet and journal state for sequential App generations. */
function createFixture(): {
  readonly journal: FakeCrashJournal;
  readonly winInetRunner: FakeWinInetRunner;
  readonly createService: () => WindowsSystemProxyService;
  readonly setCount: () => number;
} {
  const journal = new FakeCrashJournal();
  const winInetRunner = new FakeWinInetRunner();
  return {
    journal,
    winInetRunner,
    createService: () => new WindowsSystemProxyService({
      platform: 'win32',
      helperPath: 'helper.exe',
      runner: winInetRunner,
      journal,
    }),
    setCount: () => winInetRunner.calls.filter((args) => args[0] === 'set').length,
  };
}

/** Create one complete fake WinINet snapshot. */
function settings(overrides: Partial<WinInetProxySettings> = {}): WinInetProxySettings {
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

/** Return one successful helper result. */
function ok(value: WinInetProxySettings): SystemProxyCommandResult {
  return { code: 0, stdout: JSON.stringify(value), stderr: '' };
}

/** Decode one nullable helper argument. */
function decode(value: string | undefined): string | null {
  if (value === undefined || value === '-') {
    return null;
  }
  return Buffer.from(value, 'base64').toString('utf8');
}