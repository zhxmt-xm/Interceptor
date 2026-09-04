import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveWindowsSystemProxyJournalPath,
  WindowsSystemProxyJournal,
} from '../../journal';
import { SystemProxyJournalError } from '../../../system-proxy-journal-error';
import type { WinInetProxySettings } from '../../../../interfaces';

const ORIGINAL: WinInetProxySettings = {
  flags: 3,
  proxyEnabled: true,
  autoDetect: false,
  proxyServer: '127.0.0.1:7890',
  bypassList: 'localhost;<local>',
  pacUrl: null,
};

const OWNED: WinInetProxySettings = {
  flags: 3,
  proxyEnabled: true,
  autoDetect: false,
  proxyServer: 'http=127.0.0.1:8888;https=127.0.0.1:8888',
  bypassList: 'localhost;127.*;[::1];<local>',
  pacUrl: null,
};

describe('WindowsSystemProxyJournal', () => {
  /** Temporary roots removed after each filesystem integration test. */
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.map((directory) =>
      rm(directory, { recursive: true, force: true })));
    directories.length = 0;
  });

  it('resolves one user-level path independently of Electron userData', () => {
    expect(resolveWindowsSystemProxyJournalPath(
      String.raw`C:\Users\developer\AppData\Local`,
    )).toBe(path.join(
      String.raw`C:\Users\developer\AppData\Local`,
      'Interceptor',
      'system-proxy',
      'journal.json',
    ));
  });

  it('persists only version, original and owned', async () => {
    const { journal } = await createJournal(directories);

    await journal.save(ORIGINAL, OWNED);

    expect(await journal.read()).toEqual({
      version: 1,
      original: ORIGINAL,
      owned: OWNED,
    });
    await journal.clear();
    expect(await journal.read()).toBeNull();
  });

  it('always exposes a complete record during concurrent atomic replacements', async () => {
    const { directory, journal } = await createJournal(directories);

    await Promise.all([
      journal.save(ORIGINAL, OWNED),
      journal.save(ORIGINAL, OWNED),
    ]);

    expect(await journal.read()).toEqual({
      version: 1,
      original: ORIGINAL,
      owned: OWNED,
    });
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects malformed and owner-based records', async () => {
    const { journalPath, journal } = await createJournal(directories);
    await writeFile(journalPath, '{bad', 'utf8');
    await expect(journal.read()).rejects.toBeInstanceOf(SystemProxyJournalError);

    await writeFile(journalPath, JSON.stringify({
      version: 1,
      owner: { processId: 101 },
      original: ORIGINAL,
      owned: OWNED,
    }), 'utf8');
    await expect(journal.read()).rejects.toBeInstanceOf(SystemProxyJournalError);
  });
});

/** Create one real journal under a disposable filesystem root. */
async function createJournal(directories: string[]): Promise<{
  readonly directory: string;
  readonly journalPath: string;
  readonly journal: WindowsSystemProxyJournal;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-journal-'));
  directories.push(directory);
  const journalPath = path.join(directory, 'journal.json');
  return {
    directory,
    journalPath,
    journal: new WindowsSystemProxyJournal(journalPath),
  };
}