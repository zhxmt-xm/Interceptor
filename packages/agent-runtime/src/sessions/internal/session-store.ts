import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

import { z } from 'zod';

import type { AgentSecureStore } from '../../interfaces';
import type {
  StoredAgentModelCall,
  StoredAgentSession,
  StoredAgentTranscriptItem,
  StoredAgentTurn,
} from '../interfaces';
import { AgentSessionStoreCorruptionError } from './errors';

const contextUsageSchema = z.object({
  contextWindowTokens: z.number().int().positive(),
  currentContextTokens: z.number().int().nonnegative().nullable(),
  remainingContextTokens: z.number().int().nonnegative().nullable(),
  maxOutputTokens: z.number().int().positive(),
  source: z.enum(['provider', 'estimated', 'unavailable']),
}).strict();

const sessionMetadataSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  title: z.string().min(1).max(80),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  sequence: z.number().int().nonnegative(),
  contextUsage: contextUsageSchema,
}).strict();

const transcriptItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user-message'),
    itemId: z.string().min(1),
    turnId: z.string().min(1),
    content: z.string(),
    createdAt: z.number().int(),
  }).strict(),
  z.object({
    kind: z.literal('assistant-message'),
    itemId: z.string().min(1),
    turnId: z.string().min(1),
    content: z.string(),
    reasoningContent: z.string(),
    partial: z.boolean(),
    createdAt: z.number().int(),
  }).strict(),
]);

const assistantChunkSchema = z.object({
  content: z.string(),
  reasoningContent: z.string(),
}).strict();

const turnSchema = z.object({
  turnId: z.string().min(1),
  userItemId: z.string().min(1),
  assistantItemId: z.string().min(1),
  status: z.enum(['running', 'completed', 'cancelled', 'failed']),
  retryOfTurnId: z.string().min(1).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  cacheHitInputTokens: z.number().int().nonnegative().optional(),
  cacheMissInputTokens: z.number().int().nonnegative().optional(),
}).strict();

const modelCallSchema = z.object({
  modelCallId: z.string().min(1),
  turnId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  usage: usageSchema,
  contextWindowTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  createdAt: z.number().int(),
}).strict();

interface EncryptedSessionRow {
  readonly session_id: string;
  readonly encrypted_metadata: Uint8Array;
}

type EncryptedRowType = 'item' | 'turn' | 'model-call' | 'assistant-chunk';

const encryptedRowEnvelopeSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  rowType: z.enum(['item', 'turn', 'model-call', 'assistant-chunk']),
  rowId: z.string().min(1),
  payload: z.unknown(),
}).strict();

interface EncryptedPayloadRow {
  readonly row_id: string;
  readonly encrypted_payload: Uint8Array;
}

interface EncryptedChunkRow {
  readonly chunk_order: number;
  readonly encrypted_payload: Uint8Array;
}

interface AssistantDeltaWrite {
  readonly sessionId: string;
  readonly assistantItemId: string;
  readonly textDelta: string;
  readonly reasoningDelta: string;
  readonly updatedAt: number;
  readonly sequence: number;
}

const SCHEMA = `
  CREATE TABLE agent_session (
    session_id TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL UNIQUE,
    encrypted_metadata BLOB NOT NULL
  ) STRICT;
  CREATE TABLE agent_item (
    item_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES agent_session(session_id) ON DELETE CASCADE,
    item_order INTEGER NOT NULL,
    encrypted_payload BLOB NOT NULL,
    UNIQUE(session_id, item_order)
  ) STRICT;
  CREATE TABLE agent_turn (
    turn_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES agent_session(session_id) ON DELETE CASCADE,
    turn_order INTEGER NOT NULL,
    encrypted_payload BLOB NOT NULL,
    UNIQUE(session_id, turn_order)
  ) STRICT;
  CREATE TABLE agent_item_chunk (
    chunk_id INTEGER PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES agent_item(item_id) ON DELETE CASCADE,
    chunk_order INTEGER NOT NULL,
    encrypted_payload BLOB NOT NULL,
    UNIQUE(item_id, chunk_order)
  ) STRICT;
  CREATE TABLE agent_model_call (
    model_call_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES agent_session(session_id) ON DELETE CASCADE,
    call_order INTEGER NOT NULL,
    encrypted_payload BLOB NOT NULL,
    UNIQUE(session_id, call_order)
  ) STRICT;
  CREATE TABLE agent_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    current_session_id TEXT REFERENCES agent_session(session_id) ON DELETE SET NULL
  ) STRICT;
`;

/** Owns normalized encrypted Session rows in one local SQLite database. */
export class AgentSessionStore {
  readonly #databasePath: string;
  readonly #secureStore: AgentSecureStore;
  readonly #sessionsById = new Map<string, StoredAgentSession>();
  #databaseSync: DatabaseSync | null = null;

  constructor(dataDirectory: string, secureStore: AgentSecureStore) {
    this.#databasePath = path.join(dataDirectory, 'agent.sqlite');
    this.#secureStore = secureStore;
  }

  /** Open a current schema and validate every encrypted row. */
  start(): void {
    if (!this.#secureStore.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable.');
    }
    mkdirSync(path.dirname(this.#databasePath), { recursive: true });
    const databaseSync = new DatabaseSync(this.#databasePath);
    try {
      databaseSync.exec('PRAGMA journal_mode = WAL');
      databaseSync.exec('PRAGMA foreign_keys = ON');
      databaseSync.exec('PRAGMA secure_delete = ON');
      databaseSync.exec('PRAGMA synchronous = NORMAL');
      const tables = databaseSync.prepare(
        "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'table'",
      ).get() as { value: number };
      if (tables.value === 0) {
        databaseSync.exec(SCHEMA);
      }
      const integrity = databaseSync.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      if (integrity.integrity_check !== 'ok') {
        throw new AgentSessionStoreCorruptionError(
          'Agent Session database failed its integrity check.',
        );
      }
      this.#databaseSync = databaseSync;
      this.#sessionsById.clear();
      for (const session of this.#readAll('ASC')) {
        this.#sessionsById.set(session.sessionId, session);
      }
    } catch (error) {
      databaseSync.close();
      this.#databaseSync = null;
      throw AgentSessionStore.#asCorruptionError(error) ?? error;
    }
  }

  /** Checkpoint pending writes and close the owned connection. */
  stop(): void {
    if (this.#databaseSync === null) return;
    this.#databaseSync.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.#databaseSync.close();
    this.#databaseSync = null;
    this.#sessionsById.clear();
  }

  /** Move a corrupt database and its sidecars aside before creating a fresh Store. */
  quarantineCorruptDatabase(timestamp: number): void {
    this.stop();
    let suffix = 0;
    let quarantineBase = `${this.#databasePath}.corrupt-${timestamp}`;
    while (existsSync(quarantineBase)
      || existsSync(`${quarantineBase}-wal`)
      || existsSync(`${quarantineBase}-shm`)) {
      suffix += 1;
      quarantineBase = `${this.#databasePath}.corrupt-${timestamp}-${suffix}`;
    }
    const moves = [
      [this.#databasePath, quarantineBase],
      [`${this.#databasePath}-wal`, `${quarantineBase}-wal`],
      [`${this.#databasePath}-shm`, `${quarantineBase}-shm`],
    ] as const;
    const completed: Array<readonly [string, string]> = [];
    try {
      for (const [source, destination] of moves) {
        if (existsSync(source)) {
          renameSync(source, destination);
          completed.push([source, destination]);
        }
      }
    } catch (error) {
      for (const [source, destination] of completed.reverse()) {
        if (existsSync(destination) && !existsSync(source)) {
          renameSync(destination, source);
        }
      }
      throw error;
    }
  }

  /** Read Sessions in newest-first or oldest-first order. */
  list(): StoredAgentSession[] {
    return [...this.#sessionsById.values()]
      .reverse()
      .map((session) => structuredClone(session));
  }

  /** Read one complete Session from the validated in-memory cache. */
  get(sessionId: string): StoredAgentSession | null {
    const session = this.#sessionsById.get(sessionId);
    return session === undefined ? null : structuredClone(session);
  }

  /** Insert one empty Session as the newest selector item and current selection. */
  create(session: StoredAgentSession): void {
    const databaseSync = this.#database();
    const nextOrder = (databaseSync.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM agent_session',
    ).get() as { value: number }).value;
    databaseSync.exec('BEGIN IMMEDIATE');
    try {
      databaseSync.prepare(
        'INSERT INTO agent_session(session_id, sort_order, encrypted_metadata) VALUES (?, ?, ?)',
      ).run(session.sessionId, nextOrder, this.#encryptMetadata(session));
      this.#writeChangedRows(session, null);
      this.#setCurrentWithinTransaction(session.sessionId);
      databaseSync.exec('COMMIT');
      this.#sessionsById.set(session.sessionId, structuredClone(session));
    } catch (error) {
      databaseSync.exec('ROLLBACK');
      throw error;
    }
  }

  /** Atomically update metadata and only rows whose encrypted payload changed. */
  replace(session: StoredAgentSession): void {
    this.replaceMany([session]);
  }

  /** Append one assistant delta without cloning or comparing accumulated content. */
  appendAssistantDelta(write: AssistantDeltaWrite): void {
    const session = this.#sessionsById.get(write.sessionId);
    const assistant = session?.items.find((item) => item.itemId === write.assistantItemId);
    if (session === undefined || assistant?.kind !== 'assistant-message') {
      throw new Error('Agent assistant Item does not exist.');
    }
    if (write.sequence !== session.sequence + 1) {
      throw new Error('Agent Session sequence is out of date.');
    }
    const databaseSync = this.#database();
    databaseSync.exec('BEGIN IMMEDIATE');
    try {
      const metadata = { ...session, updatedAt: write.updatedAt, sequence: write.sequence };
      const result = databaseSync.prepare(
        'UPDATE agent_session SET encrypted_metadata = ? WHERE session_id = ?',
      ).run(this.#encryptMetadata(metadata), write.sessionId);
      if (result.changes !== 1) {
        throw new Error('Agent Session does not exist.');
      }
      this.#appendAssistantChunk(
        write.sessionId,
        write.assistantItemId,
        assistantChunkSchema.parse({
          content: write.textDelta,
          reasoningContent: write.reasoningDelta,
        }),
      );
      databaseSync.exec('COMMIT');
      assistant.content += write.textDelta;
      assistant.reasoningContent += write.reasoningDelta;
      session.updatedAt = write.updatedAt;
      session.sequence = write.sequence;
    } catch (error) {
      databaseSync.exec('ROLLBACK');
      throw error;
    }
  }

  /** Atomically update multiple Sessions or leave every Session unchanged. */
  replaceMany(sessions: readonly StoredAgentSession[]): void {
    const replacements = sessions.map((session) => {
      const previous = this.#sessionsById.get(session.sessionId);
      if (previous === undefined) {
        throw new Error('Agent Session does not exist.');
      }
      return { session, previous };
    });
    const databaseSync = this.#database();
    databaseSync.exec('BEGIN IMMEDIATE');
    try {
      const update = databaseSync.prepare(
        'UPDATE agent_session SET encrypted_metadata = ? WHERE session_id = ?',
      );
      for (const { session, previous } of replacements) {
        const result = update.run(this.#encryptMetadata(session), session.sessionId);
        if (result.changes !== 1) {
          throw new Error('Agent Session does not exist.');
        }
        this.#writeChangedRows(session, previous);
      }
      databaseSync.exec('COMMIT');
      for (const { session } of replacements) {
        this.#sessionsById.set(session.sessionId, structuredClone(session));
      }
    } catch (error) {
      databaseSync.exec('ROLLBACK');
      throw error;
    }
  }

  /** Persist the explicitly selected Session. */
  select(sessionId: string): void {
    if (!this.#sessionsById.has(sessionId)) {
      throw new Error('Agent Session does not exist.');
    }
    this.#database().exec('BEGIN IMMEDIATE');
    try {
      this.#setCurrentWithinTransaction(sessionId);
      this.#database().exec('COMMIT');
    } catch (error) {
      this.#database().exec('ROLLBACK');
      throw error;
    }
  }

  /** Return the current Session selection if it still exists. */
  currentSessionId(): string | null {
    const row = this.#database().prepare(
      'SELECT current_session_id FROM agent_state WHERE singleton = 1',
    ).get() as { current_session_id: string | null } | undefined;
    return row?.current_session_id ?? null;
  }

  /** Delete one Session, choose a fallback and truncate historical WAL frames. */
  delete(sessionId: string): string | null {
    const databaseSync = this.#database();
    databaseSync.exec('BEGIN IMMEDIATE');
    let fallback: string | null;
    try {
      const currentSessionId = this.currentSessionId();
      const result = databaseSync.prepare(
        'DELETE FROM agent_session WHERE session_id = ?',
      ).run(sessionId);
      if (result.changes !== 1) {
        throw new Error('Agent Session does not exist.');
      }
      fallback = currentSessionId === sessionId
        ? (databaseSync.prepare(
            'SELECT session_id FROM agent_session ORDER BY sort_order DESC LIMIT 1',
          ).get() as { session_id: string } | undefined)?.session_id ?? null
        : currentSessionId;
      this.#setCurrentWithinTransaction(fallback);
      databaseSync.exec('COMMIT');
      this.#sessionsById.delete(sessionId);
    } catch (error) {
      databaseSync.exec('ROLLBACK');
      throw error;
    }
    databaseSync.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return fallback;
  }

  /** Read and decrypt every Session in a stable selector order. */
  #readAll(direction: 'ASC' | 'DESC'): StoredAgentSession[] {
    const rows = this.#database().prepare(`
      SELECT session_id, encrypted_metadata
      FROM agent_session
      ORDER BY sort_order ${direction}
    `).all() as unknown as EncryptedSessionRow[];
    return rows.map((row) => this.#readSession(row));
  }

  /** Reconstruct one Session from normalized encrypted rows. */
  #readSession(row: EncryptedSessionRow): StoredAgentSession {
    const metadata = sessionMetadataSchema.parse(this.#decrypt(row.encrypted_metadata));
    if (metadata.sessionId !== row.session_id) {
      throw new AgentSessionStoreCorruptionError(
        'Agent Session row identity does not match its encrypted metadata.',
      );
    }
    const readPayloads = <T>(
      table: string,
      idColumn: string,
      orderColumn: string,
      rowType: EncryptedRowType,
      schema: z.ZodType<T>,
    ): T[] =>
      (this.#database().prepare(`
        SELECT ${idColumn} AS row_id, encrypted_payload FROM ${table}
        WHERE session_id = ? ORDER BY ${orderColumn}
      `).all(row.session_id) as unknown as EncryptedPayloadRow[])
        .map((payloadRow) => this.#decryptRow(
          payloadRow.encrypted_payload,
          row.session_id,
          rowType,
          payloadRow.row_id,
          schema,
        ));
    const items = readPayloads(
      'agent_item',
      'item_id',
      'item_order',
      'item',
      transcriptItemSchema,
    );
    for (const item of items) {
      if (item.kind !== 'assistant-message') continue;
      const chunks = (this.#database().prepare(`
        SELECT chunk_order, encrypted_payload FROM agent_item_chunk
        WHERE item_id = ? ORDER BY chunk_order
      `).all(item.itemId) as unknown as EncryptedChunkRow[])
        .map((chunkRow) => this.#decryptRow(
          chunkRow.encrypted_payload,
          row.session_id,
          'assistant-chunk',
          `${item.itemId}:${chunkRow.chunk_order}`,
          assistantChunkSchema,
        ));
      item.content += chunks.map((chunk) => chunk.content).join('');
      item.reasoningContent += chunks.map((chunk) => chunk.reasoningContent).join('');
    }
    return {
      ...metadata,
      items,
      turns: readPayloads('agent_turn', 'turn_id', 'turn_order', 'turn', turnSchema),
      modelCalls: readPayloads(
        'agent_model_call',
        'model_call_id',
        'call_order',
        'model-call',
        modelCallSchema,
      ),
    };
  }

  /** Update only changed Item, Turn and Model Call payload rows. */
  #writeChangedRows(session: StoredAgentSession, previous: StoredAgentSession | null): void {
    this.#syncItems(session, previous);
    this.#syncRows(
      'agent_turn',
      'turn_id',
      'turn_order',
      session.sessionId,
      session.turns,
      previous?.turns ?? [],
      (turn) => turn.turnId,
      'turn',
      turnSchema,
    );
    this.#syncRows(
      'agent_model_call',
      'model_call_id',
      'call_order',
      session.sessionId,
      session.modelCalls,
      previous?.modelCalls ?? [],
      (modelCall) => modelCall.modelCallId,
      'model-call',
      modelCallSchema,
    );
  }

  /** Persist user Items directly and assistant growth as append-only encrypted chunks. */
  #syncItems(session: StoredAgentSession, previous: StoredAgentSession | null): void {
    const previousItems = previous?.items ?? [];
    const previousById = new Map(previousItems.map((item) => [item.itemId, item]));
    const nextIds = new Set(session.items.map((item) => item.itemId));
    const upsert = this.#database().prepare(`
      INSERT INTO agent_item(item_id, session_id, item_order, encrypted_payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        item_order = excluded.item_order,
        encrypted_payload = excluded.encrypted_payload
    `);
    session.items.forEach((item, index) => {
      const previousItem = previousById.get(item.itemId);
      if (item.kind === 'user-message') {
        if (previousItem === undefined
          || JSON.stringify(previousItem) !== JSON.stringify(item)) {
          upsert.run(
            item.itemId,
            session.sessionId,
            index,
            this.#encryptRow(
              session.sessionId,
              'item',
              item.itemId,
              transcriptItemSchema.parse(item),
            ),
          );
        }
        return;
      }

      const metadata = { ...item, content: '', reasoningContent: '' };
      const previousAssistant = previousItem?.kind === 'assistant-message'
        ? previousItem
        : null;
      const previousMetadata = previousAssistant === null
        ? null
        : { ...previousAssistant, content: '', reasoningContent: '' };
      if (previousMetadata === null
        || JSON.stringify(previousMetadata) !== JSON.stringify(metadata)) {
        upsert.run(
          item.itemId,
          session.sessionId,
          index,
          this.#encryptRow(
            session.sessionId,
            'item',
            item.itemId,
            transcriptItemSchema.parse(metadata),
          ),
        );
      }

      const appendOnly = previousAssistant === null
        || (item.content.startsWith(previousAssistant.content)
          && item.reasoningContent.startsWith(previousAssistant.reasoningContent));
      if (!appendOnly) {
        this.#database().prepare(
          'DELETE FROM agent_item_chunk WHERE item_id = ?',
        ).run(item.itemId);
      }
      const content = appendOnly && previousAssistant !== null
        ? item.content.slice(previousAssistant.content.length)
        : item.content;
      const reasoningContent = appendOnly && previousAssistant !== null
        ? item.reasoningContent.slice(previousAssistant.reasoningContent.length)
        : item.reasoningContent;
      if (content !== '' || reasoningContent !== '') {
        this.#appendAssistantChunk(
          session.sessionId,
          item.itemId,
          assistantChunkSchema.parse({ content, reasoningContent }),
        );
      }
    });
    const remove = this.#database().prepare('DELETE FROM agent_item WHERE item_id = ?');
    for (const previousItem of previousItems) {
      if (!nextIds.has(previousItem.itemId)) {
        remove.run(previousItem.itemId);
      }
    }
  }

  /** Diff and upsert one normalized encrypted child-row collection. */
  #syncRows<T>(
    table: string,
    idColumn: string,
    orderColumn: string,
    sessionId: string,
    nextRows: readonly T[],
    previousRows: readonly T[],
    id: (row: T) => string,
    rowType: EncryptedRowType,
    schema: z.ZodType<T>,
  ): void {
    const previousById = new Map(previousRows.map((row) => [id(row), row]));
    const nextIds = new Set(nextRows.map(id));
    const upsert = this.#database().prepare(`
      INSERT INTO ${table}(${idColumn}, session_id, ${orderColumn}, encrypted_payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(${idColumn}) DO UPDATE SET
        ${orderColumn} = excluded.${orderColumn},
        encrypted_payload = excluded.encrypted_payload
    `);
    nextRows.forEach((row, index) => {
      const previousRow = previousById.get(id(row));
      if (previousRow !== undefined && JSON.stringify(previousRow) === JSON.stringify(row)) {
        return;
      }
      const rowId = id(row);
      upsert.run(
        rowId,
        sessionId,
        index,
        this.#encryptRow(sessionId, rowType, rowId, schema.parse(row)),
      );
    });
    const remove = this.#database().prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`);
    for (const previousRow of previousRows) {
      if (!nextIds.has(id(previousRow))) {
        remove.run(id(previousRow));
      }
    }
  }

  /** Encrypt one Session metadata payload. */
  #encryptMetadata(session: StoredAgentSession): Buffer {
    return this.#encrypt(sessionMetadataSchema.parse({
      version: session.version,
      sessionId: session.sessionId,
      title: session.title,
      providerId: session.providerId,
      modelId: session.modelId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sequence: session.sequence,
      contextUsage: session.contextUsage,
    }));
  }

  /** Encrypt one validated payload before SQLite storage. */
  #encrypt(value: unknown): Buffer {
    return this.#secureStore.encryptString(JSON.stringify(value));
  }

  /** Encrypt a child payload together with its SQLite ownership identity. */
  #encryptRow(
    sessionId: string,
    rowType: EncryptedRowType,
    rowId: string,
    payload: unknown,
  ): Buffer {
    return this.#encrypt({ version: 1, sessionId, rowType, rowId, payload });
  }

  /** Decrypt and verify one child row before parsing its domain payload. */
  #decryptRow<T>(
    bytes: Uint8Array,
    sessionId: string,
    rowType: EncryptedRowType,
    rowId: string,
    schema: z.ZodType<T>,
  ): T {
    const envelope = encryptedRowEnvelopeSchema.parse(this.#decrypt(bytes));
    if (envelope.sessionId !== sessionId
      || envelope.rowType !== rowType
      || envelope.rowId !== rowId) {
      throw new AgentSessionStoreCorruptionError(
        'Agent Session encrypted row identity does not match SQLite.',
      );
    }
    return schema.parse(envelope.payload);
  }

  /** Append one identity-bound assistant chunk inside the caller transaction. */
  #appendAssistantChunk(
    sessionId: string,
    itemId: string,
    chunk: z.infer<typeof assistantChunkSchema>,
  ): void {
    const chunkOrder = (this.#database().prepare(`
      SELECT COALESCE(MAX(chunk_order) + 1, 0) AS value
      FROM agent_item_chunk WHERE item_id = ?
    `).get(itemId) as { value: number }).value;
    this.#database().prepare(`
      INSERT INTO agent_item_chunk(item_id, chunk_order, encrypted_payload)
      VALUES (?, ?, ?)
    `).run(
      itemId,
      chunkOrder,
      this.#encryptRow(
        sessionId,
        'assistant-chunk',
        `${itemId}:${chunkOrder}`,
        chunk,
      ),
    );
  }

  /** Decrypt one untrusted SQLite payload. */
  #decrypt(bytes: Uint8Array): unknown {
    return JSON.parse(this.#secureStore.decryptString(Buffer.from(bytes))) as unknown;
  }

  /** Upsert the current selection inside an existing transaction. */
  #setCurrentWithinTransaction(sessionId: string | null): void {
    this.#database().prepare(`
      INSERT INTO agent_state(singleton, current_session_id) VALUES (1, ?)
      ON CONFLICT(singleton) DO UPDATE SET current_session_id = excluded.current_session_id
    `).run(sessionId);
  }

  /** Require the Store lifecycle before executing a Session command. */
  #database(): DatabaseSync {
    if (this.#databaseSync === null) {
      throw new Error('Agent Session Store is not running.');
    }
    return this.#databaseSync;
  }

  /** Classify only deterministic SQLite/schema/JSON corruption as quarantine-safe. */
  static #asCorruptionError(error: unknown): AgentSessionStoreCorruptionError | null {
    if (error instanceof AgentSessionStoreCorruptionError) return error;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return new AgentSessionStoreCorruptionError(
        'Agent Session encrypted payload is invalid.',
        { cause: error },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/file is not a database|database disk image is malformed|malformed database schema|no such (?:table|column)/i.test(message)) {
      return new AgentSessionStoreCorruptionError(
        'Agent Session database is invalid.',
        { cause: error },
      );
    }
    return null;
  }
}
