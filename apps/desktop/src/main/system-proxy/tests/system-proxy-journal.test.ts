import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SystemProxyJournal } from '../system-proxy-journal';
import { SystemProxyJournalError } from '../system-proxy-journal-error';

describe('SystemProxyJournal', () => {
  /** Temporary directories removed by the operating system after the test run. */
  const directories: string[] = [];

  afterEach(() => {
    directories.length = 0;
  });

  it('persists preparing snapshots and atomically advances ownership', async () => {
    const systemProxyJournal = await createJournal(directories);
    await systemProxyJournal.begin('win32', { flags: 1 }, { flags: 3 });

    expect(await systemProxyJournal.read()).toMatchObject({
      version: 1,
      platform: 'win32',
      phase: 'preparing',
      original: { flags: 1 },
      owned: { flags: 3 },
    });

    await systemProxyJournal.markOwned('win32');
    expect(await systemProxyJournal.read()).toMatchObject({ phase: 'owned' });
    await systemProxyJournal.clear();
    expect(await systemProxyJournal.read()).toBeNull();
  });

  it('rejects malformed JSON and accepts data beyond the former size limit', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
    directories.push(directory);
    const journalPath = path.join(directory, 'ownership.json');
    const systemProxyJournal = new SystemProxyJournal(journalPath);

    await writeFile(journalPath, '{bad', 'utf8');
    await expect(systemProxyJournal.read()).rejects.toBeInstanceOf(SystemProxyJournalError);

    const completeValue = 'x'.repeat(1024 * 1024 + 1);
    await systemProxyJournal.begin('win32', { completeValue }, { flags: 3 });
    expect(await systemProxyJournal.read()).toMatchObject({
      original: { completeValue },
    });
  });

  it('writes a complete JSON record without leaving temporary content', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
    directories.push(directory);
    const journalPath = path.join(directory, 'ownership.json');
    const journal = new SystemProxyJournal(journalPath);
    await journal.begin('darwin', { services: [] }, { services: [] });

    expect(JSON.parse(await readFile(journalPath, 'utf8'))).toMatchObject({
      platform: 'darwin',
      phase: 'preparing',
    });
  });
});

/** Create one journal in a fresh temporary directory. */
async function createJournal(directories: string[]): Promise<SystemProxyJournal> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
  directories.push(directory);
  return new SystemProxyJournal(path.join(directory, 'ownership.json'));
}