import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MacosSystemProxyJournal, resolveMacosSystemProxyJournalPath } from '../../journal';
import { SystemProxyJournalError } from '../../../internal/errors';

describe('SystemProxyJournal', () => {
  /** Temporary directories removed after each filesystem integration test. */
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.map((directory) =>
      rm(directory, { recursive: true, force: true })));
    directories.length = 0;
  });

  it('persists the pre-takeover effective proxy separately from original and owned services', async () => {
    const systemProxyJournal = await createJournal(directories);
    const effectiveProxies = { HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 7890 };
    await systemProxyJournal.save({ services: [] }, { services: [] }, effectiveProxies);

    expect(await systemProxyJournal.read()).toEqual({
      original: { services: [] }, owned: { services: [] }, effectiveProxies,
    });
  });

  it('persists only original, owned and effective proxies without a schema version', async () => {
    const systemProxyJournal = await createJournal(directories);
    await systemProxyJournal.save({ flags: 1 }, { flags: 3 }, {});

    expect(await systemProxyJournal.read()).toEqual({
      original: { flags: 1 },
      owned: { flags: 3 },
      effectiveProxies: {},
    });

    await systemProxyJournal.clear();
    expect(await systemProxyJournal.read()).toBeNull();
  });

  it.runIf(process.platform === 'darwin')('reopens the user-level journal after the default application profile is deleted', async () => {
    const homeDirectory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-journal-home-'));
    directories.push(homeDirectory);
    const profileDirectory = path.join(homeDirectory, 'Library', 'Application Support', 'Interceptor');
    await mkdir(profileDirectory, { recursive: true });
    const journalPath = resolveMacosSystemProxyJournalPath(homeDirectory);
    const macosSystemProxyJournal = new MacosSystemProxyJournal(journalPath);
    const record = {
      original: { services: [{ id: 'wifi', name: 'Wi-Fi', settings: { HTTPEnable: 0 } }] },
      owned: { services: [{ id: 'wifi', name: 'Wi-Fi', settings: { HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 8888 } }] },
      effectiveProxies: { HTTPEnable: 1, HTTPProxy: '127.0.0.1', HTTPPort: 7890 },
    };
    await macosSystemProxyJournal.save(record.original, record.owned, record.effectiveProxies);
    const bytesBefore = await readFile(journalPath);
    const metadataBefore = await stat(journalPath);

    await rm(profileDirectory, { recursive: true });
    await expect(stat(profileDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    const restartedJournal = new MacosSystemProxyJournal(resolveMacosSystemProxyJournalPath(homeDirectory));

    expect(await restartedJournal.read()).toEqual(record);
    expect(await readFile(journalPath)).toEqual(bytesBefore);
    expect((await stat(journalPath)).mtimeMs).toBe(metadataBefore.mtimeMs);
    expect((await stat(journalPath)).mode & 0o777).toBe(0o600);
    await restartedJournal.clear();
    expect(await macosSystemProxyJournal.read()).toBeNull();
  });

  it('rejects malformed JSON and accepts data beyond the former size limit', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
    directories.push(directory);
    const journalPath = path.join(directory, 'journal.json');
    const systemProxyJournal = new MacosSystemProxyJournal(journalPath);

    await writeFile(journalPath, '{bad', 'utf8');
    await expect(systemProxyJournal.read()).rejects.toBeInstanceOf(SystemProxyJournalError);

    const completeValue = 'x'.repeat(1024 * 1024 + 1);
    await systemProxyJournal.save({ completeValue }, { flags: 3 }, {});
    expect(await systemProxyJournal.read()).toMatchObject({
      original: { completeValue },
    });
  });

  it('writes a complete JSON record without leaving temporary content', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
    directories.push(directory);
    const journalPath = path.join(directory, 'journal.json');
    const journal = new MacosSystemProxyJournal(journalPath);
    await journal.save({ services: [] }, { services: [] }, {});

    expect(JSON.parse(await readFile(journalPath, 'utf8'))).toEqual({
      original: { services: [] },
      owned: { services: [] },
      effectiveProxies: {},
    });
  });
});

/** Create one journal in a fresh temporary directory. */
async function createJournal(directories: string[]): Promise<MacosSystemProxyJournal> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-proxy-'));
  directories.push(directory);
  return new MacosSystemProxyJournal(path.join(directory, 'journal.json'));
}