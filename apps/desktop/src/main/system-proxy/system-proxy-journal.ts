import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const JOURNAL_VERSION = 1;
const MAX_JOURNAL_BYTES = 1024 * 1024;

export type SystemProxyPlatform = 'win32' | 'darwin';
export type SystemProxyJournalPhase = 'preparing' | 'owned';

export interface SystemProxyJournalRecord {
  readonly version: typeof JOURNAL_VERSION;
  readonly platform: SystemProxyPlatform;
  readonly phase: SystemProxyJournalPhase;
  readonly original: unknown;
  readonly owned: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SystemProxyJournalStore {
  read(): Promise<SystemProxyJournalRecord | null>;
  begin(
    platform: SystemProxyPlatform,
    original: unknown,
    owned: unknown,
  ): Promise<void>;
  markOwned(platform: SystemProxyPlatform): Promise<void>;
  clear(): Promise<void>;
}

export class SystemProxyJournalError extends Error {
  /** Create one bounded ownership-journal failure. */
  constructor(message: string) {
    super(message);
    this.name = 'SystemProxyJournalError';
  }
}

/** Crash-safe ownership journal for guarded system-proxy restoration. */
export class SystemProxyJournal implements SystemProxyJournalStore {
  /** Absolute journal path under Electron userData. */
  private readonly journalPath: string;

  /** Bind the journal to one application-owned path. */
  constructor(journalPath: string) {
    this.journalPath = journalPath;
  }

  /** Read and validate one bounded regular-file journal. */
  async read(): Promise<SystemProxyJournalRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.journalPath);
    } catch (error) {
      if (SystemProxyJournal.isMissing(error)) {
        return null;
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new SystemProxyJournalError('System proxy journal is not a regular file.');
    }
    if (metadata.size > MAX_JOURNAL_BYTES) {
      throw new SystemProxyJournalError('System proxy journal exceeded the size limit.');
    }

    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.journalPath, 'utf8'));
    } catch {
      throw new SystemProxyJournalError('System proxy journal contains invalid JSON.');
    }
    return SystemProxyJournal.parseRecord(value);
  }

  /** Persist original and intended owned values before the native helper writes. */
  async begin(
    platform: SystemProxyPlatform,
    original: unknown,
    owned: unknown,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.write({
      version: JOURNAL_VERSION,
      platform,
      phase: 'preparing',
      original,
      owned,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  /** Mark a verified native write while retaining both guarded snapshots. */
  async markOwned(platform: SystemProxyPlatform): Promise<void> {
    const record = await this.read();
    if (!record || record.platform !== platform) {
      throw new SystemProxyJournalError('System proxy journal ownership does not match.');
    }
    await this.write({
      ...record,
      phase: 'owned',
      updatedAt: new Date().toISOString(),
    });
  }

  /** Remove a completed journal; a missing journal is already clear. */
  async clear(): Promise<void> {
    await rm(this.journalPath, { force: true });
  }

  /** Atomically replace the journal after syncing its complete temporary file. */
  private async write(record: SystemProxyJournalRecord): Promise<void> {
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_JOURNAL_BYTES) {
      throw new SystemProxyJournalError('System proxy journal exceeded the size limit.');
    }
    const directory = path.dirname(this.journalPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.journalPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(serialized, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, this.journalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  /** Validate the bounded platform-neutral journal envelope. */
  private static parseRecord(value: unknown): SystemProxyJournalRecord {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyJournalError('System proxy journal must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      record.version !== JOURNAL_VERSION ||
      (record.platform !== 'win32' && record.platform !== 'darwin') ||
      (record.phase !== 'preparing' && record.phase !== 'owned') ||
      typeof record.createdAt !== 'string' ||
      typeof record.updatedAt !== 'string' ||
      !('original' in record) ||
      !('owned' in record)
    ) {
      throw new SystemProxyJournalError('System proxy journal fields are invalid.');
    }
    return {
      version: JOURNAL_VERSION,
      platform: record.platform,
      phase: record.phase,
      original: record.original,
      owned: record.owned,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
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