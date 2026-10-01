import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { WinInetProxySettings, WindowsSystemProxyJournalRecord, WindowsSystemProxyJournalStore } from '../interfaces';
import { SystemProxyJournalError } from '../internal/errors';

/** Resolve the one Windows user-level crash journal outside Electron profiles. */
export function resolveWindowsSystemProxyJournalPath(
  localAppDataDirectory: string,
): string {
  if (!path.win32.isAbsolute(localAppDataDirectory)) {
    throw new SystemProxyJournalError('Windows LOCALAPPDATA must be an absolute path.');
  }
  return path.win32.join(
    localAppDataDirectory,
    'Interceptor',
    'system-proxy',
    'journal.json',
  );
}

/** Persists the two snapshots required to recover one crashed App. */
export class WindowsSystemProxyJournal implements WindowsSystemProxyJournalStore {
  /** Current minimal schema version. */
  private static readonly JOURNAL_VERSION = 1;
  /** Absolute user-level journal path. */
  private readonly journalPath: string;

  /** Bind this store to one absolute journal path. */
  constructor(journalPath: string) {
    if (!path.win32.isAbsolute(journalPath)) {
      throw new SystemProxyJournalError('System proxy journal path must be absolute.');
    }
    this.journalPath = journalPath;
  }

  /** Read and validate one complete regular-file record. */
  async read(): Promise<WindowsSystemProxyJournalRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.journalPath);
    } catch (error) {
      if (WindowsSystemProxyJournal.isMissing(error)) {
        return null;
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new SystemProxyJournalError('System proxy journal is not a regular file.');
    }
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.journalPath, 'utf8'));
    } catch {
      throw new SystemProxyJournalError('System proxy journal contains invalid JSON.');
    }
    return WindowsSystemProxyJournal.parseRecord(value);
  }

  /** Save both snapshots before changing WinINet. */
  save(original: WinInetProxySettings, owned: WinInetProxySettings): Promise<void> {
    return this.write({
      version: WindowsSystemProxyJournal.JOURNAL_VERSION,
      original,
      owned,
    });
  }

  /** Remove a record after recovery or confirmed ownership loss. */
  clear(): Promise<void> {
    return rm(this.journalPath, { force: true });
  }

  /** Atomically replace the record after syncing its complete temporary file. */
  private async write(record: WindowsSystemProxyJournalRecord): Promise<void> {
    const directory = path.dirname(this.journalPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.journalPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    try {
      const file = await open(temporaryPath, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(record), 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.journalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  /** Validate the exact minimal record and both complete snapshots. */
  private static parseRecord(value: unknown): WindowsSystemProxyJournalRecord {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyJournalError('System proxy journal must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      record.version !== WindowsSystemProxyJournal.JOURNAL_VERSION
      || Object.keys(record).sort().join(',') !== 'original,owned,version'
    ) {
      throw new SystemProxyJournalError('System proxy journal version is invalid.');
    }
    return {
      version: WindowsSystemProxyJournal.JOURNAL_VERSION,
      original: WindowsSystemProxyJournal.parseSettings(record.original),
      owned: WindowsSystemProxyJournal.parseSettings(record.owned),
    };
  }

  /** Validate every WinINet value needed for exact restoration. */
  private static parseSettings(value: unknown): WinInetProxySettings {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyJournalError('System proxy journal settings are invalid.');
    }
    const settings = value as Record<string, unknown>;
    if (
      !Number.isInteger(settings.flags)
      || (settings.flags as number) < 0
      || typeof settings.proxyEnabled !== 'boolean'
      || typeof settings.autoDetect !== 'boolean'
    ) {
      throw new SystemProxyJournalError('System proxy journal settings are invalid.');
    }
    return {
      flags: settings.flags as number,
      proxyEnabled: settings.proxyEnabled,
      autoDetect: settings.autoDetect,
      proxyServer: WindowsSystemProxyJournal.parseNullableString(settings.proxyServer),
      bypassList: WindowsSystemProxyJournal.parseNullableString(settings.bypassList),
      pacUrl: WindowsSystemProxyJournal.parseNullableString(settings.pacUrl),
    };
  }

  /** Validate one nullable WinINet text field. */
  private static parseNullableString(value: unknown): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new SystemProxyJournalError('System proxy journal settings are invalid.');
    }
    return value;
  }

  /** Identify an expected missing-file read. */
  private static isMissing(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT';
  }
}