import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  SystemProxyJournalRecord,
  SystemProxyJournalStore,
} from '../../interfaces';
import { SystemProxyJournalError } from '../system-proxy-journal-error';

/** Crash-safe journal for guarded system-proxy restoration. */
export class MacosSystemProxyJournal implements SystemProxyJournalStore {
  /** Journal schema version. */
  private static readonly JOURNAL_VERSION = 1;
  /** Absolute journal path under Electron userData. */
  private readonly journalPath: string;

  /** Bind the journal to one application-owned path. */
  constructor(journalPath: string) {
    this.journalPath = journalPath;
  }

  /** Read and validate one complete regular-file journal. */
  async read(): Promise<SystemProxyJournalRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.journalPath);
    } catch (error) {
      if (MacosSystemProxyJournal.isMissing(error)) {
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
    return MacosSystemProxyJournal.parseRecord(value);
  }

  /** Persist original and intended owned values before the native helper writes. */
  async save(original: unknown, owned: unknown): Promise<void> {
    await this.write({
      version: MacosSystemProxyJournal.JOURNAL_VERSION,
      original,
      owned,
    });
  }

  /** Remove a completed journal; a missing journal is already clear. */
  async clear(): Promise<void> {
    await rm(this.journalPath, { force: true });
  }

  /** Atomically replace the journal after syncing its complete temporary file. */
  private async write(record: SystemProxyJournalRecord): Promise<void> {
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

  /** Validate the exact minimal journal envelope. */
  private static parseRecord(value: unknown): SystemProxyJournalRecord {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyJournalError('System proxy journal must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      record.version !== MacosSystemProxyJournal.JOURNAL_VERSION ||
      Object.keys(record).sort().join(',') !== 'original,owned,version' ||
      !('original' in record) ||
      !('owned' in record)
    ) {
      throw new SystemProxyJournalError('System proxy journal fields are invalid.');
    }
    return {
      version: MacosSystemProxyJournal.JOURNAL_VERSION,
      original: record.original,
      owned: record.owned,
    };
  }

  /** Identify an expected missing-file read. */
  private static isMissing(error: unknown): boolean {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT';
  }
}