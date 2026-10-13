import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { constants, DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SnapshotStore } from '../../worker/snapshot-store';

const directories: string[] = [];
const databases = new Set<DatabaseSync>();

afterEach(async () => {
  vi.restoreAllMocks();
  for (const databaseSync of databases) {
    if (databaseSync.isOpen) databaseSync.close();
  }
  databases.clear();
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function snapshotPath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-snapshot-init-'));
  directories.push(directory);
  return path.join(directory, 'capture.sqlite');
}

function observeOperations(
  authorize: (databaseSync: DatabaseSync, action: number, name: string | null) => number,
): void {
  const execute = DatabaseSync.prototype.exec;
  vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (this: DatabaseSync, sql) {
    if (!databases.has(this)) {
      databases.add(this);
      this.setAuthorizer((action, name) => authorize(this, action, name));
    }
    execute.call(this, sql);
  });
}

describe('SnapshotStore initialization', () => {
  it('creates every schema object in one transaction instead of per-statement commits', async () => {
    const schemaTransactions: boolean[] = [];
    const transactions: (string | null)[] = [];
    observeOperations((databaseSync, action, name) => {
      if (action === constants.SQLITE_CREATE_TABLE || action === constants.SQLITE_CREATE_INDEX ||
          action === constants.SQLITE_CREATE_VTABLE) {
        schemaTransactions.push(databaseSync.isTransaction);
      }
      if (action === constants.SQLITE_TRANSACTION) transactions.push(name);
      return constants.SQLITE_OK;
    });

    const filePath = await snapshotPath();
    const snapshotStore = new SnapshotStore(filePath, 'export');
    snapshotStore.close();

    expect(schemaTransactions.length).toBeGreaterThan(1);
    expect(schemaTransactions.every(Boolean)).toBe(true);
    expect(transactions).toEqual(['BEGIN', 'COMMIT']);
    const importedSnapshotStore = new SnapshotStore(filePath, 'import');
    expect(importedSnapshotStore.readBatch(undefined, 100)).toMatchObject({
      exchanges: [],
      total: 0,
      hasMore: false,
    });
    importedSnapshotStore.close();
  });

  it('rolls back partial schema and closes the database when initialization fails', async () => {
    observeOperations((_databaseSync, action, name) =>
      action === constants.SQLITE_CREATE_TABLE && name === 'websocket_frame'
        ? constants.SQLITE_DENY
        : constants.SQLITE_OK,
    );
    const filePath = await snapshotPath();

    expect(() => new SnapshotStore(filePath, 'export')).toThrow(/not authorized/i);
    expect([...databases].every((databaseSync) => !databaseSync.isOpen)).toBe(true);

    const databaseSync = new DatabaseSync(filePath);
    databases.add(databaseSync);
    expect(databaseSync.prepare('SELECT name FROM sqlite_schema').all()).toEqual([]);
    databaseSync.close();
  });
});
