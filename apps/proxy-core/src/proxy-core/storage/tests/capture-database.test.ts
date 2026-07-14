import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  IN_MEMORY_LOCATION,
  openCaptureDatabase,
} from '../capture-database';
import { CAPTURE_SCHEMA_VERSION } from '../capture-schema';
import {
  applyMigrations,
  MigrationError,
  readUserVersion,
} from '../migration-runner';

const CORE_TABLES = [
  'capture_session',
  'connection',
  'body_ref',
  'exchange',
  'message_headers',
  'websocket_frame',
  'rule_hit',
  'error_event',
];

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => (row as { name: string }).name);
}

describe('capture database fixture', () => {
  it('builds every core entity table and FTS index at the current version', () => {
    const { db, migration } = openCaptureDatabase(IN_MEMORY_LOCATION);
    try {
      expect(migration.fromVersion).toBe(0);
      expect(migration.toVersion).toBe(CAPTURE_SCHEMA_VERSION);
      expect(migration.applied).toEqual([1]);
      expect(readUserVersion(db)).toBe(CAPTURE_SCHEMA_VERSION);

      const names = tableNames(db);
      for (const table of CORE_TABLES) {
        expect(names).toContain(table);
      }
      expect(names).toContain('exchange_fts');
    } finally {
      db.close();
    }
  });

  it('is idempotent when reopened against an already-migrated database', () => {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    try {
      const second = applyMigrations(db, [
        {
          version: 1,
          label: 'core-capture-entities',
          statements: ['SELECT 1'],
        },
      ]);
      expect(second.fromVersion).toBe(1);
      expect(second.toVersion).toBe(1);
      expect(second.applied).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('enforces foreign keys so orphan exchanges are rejected', () => {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    try {
      const insertOrphan = () =>
        db
          .prepare(
            `INSERT INTO exchange (id, session_id, seq, method, url, protocol, started_at, state)
             VALUES ('x1', 'missing-session', 1, 'GET', 'http://a/', 'http/1.1', 0, 'pending')`,
          )
          .run();
      expect(insertOrphan).toThrow();
    } finally {
      db.close();
    }
  });

  it('supports full-text search over the exchange_fts index', () => {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    try {
      db.prepare(
        `INSERT INTO exchange_fts (exchange_id, url, host, method, response_mime)
         VALUES ('x1', 'https://api.example.com/users', 'api.example.com', 'GET', 'application/json')`,
      ).run();
      const matches = db
        .prepare("SELECT exchange_id FROM exchange_fts WHERE exchange_fts MATCH 'users'")
        .all()
        .map((row) => (row as { exchange_id: string }).exchange_id);
      expect(matches).toEqual(['x1']);
    } finally {
      db.close();
    }
  });

  it('rejects a non-contiguous migration set before touching the database', () => {
    const { db } = openCaptureDatabase(IN_MEMORY_LOCATION);
    try {
      const apply = () =>
        applyMigrations(db, [
          { version: 2, label: 'gap', statements: ['SELECT 1'] },
        ]);
      expect(apply).toThrow(MigrationError);
    } finally {
      db.close();
    }
  });
});
