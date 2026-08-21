import { DatabaseSync } from 'node:sqlite';

import type {
  BodyRefInput,
  BodyRuleEffectInput,
  CaptureSnapshotBatch,
  CaptureSnapshotExchange,
  ExchangeInput,
  HeaderInput,
  WebSocketFrameInput,
} from '../../capture/interfaces';
import type { ArchiveSnapshotPage } from '../interfaces';

/** 一次性 Archive Worker 内的当前 SQLite 编解码 Store。 */
export class SnapshotStore {
  /** 新 Archive 快照直接创建的完整 SQLite schema。 */
  private static readonly SCHEMA = `
    CREATE TABLE capture_session (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      capture_mode TEXT NOT NULL,
      app_version TEXT NOT NULL,
      rule_set_revision INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE connection (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      client_host TEXT,
      client_port INTEGER,
      destination_host TEXT,
      destination_port INTEGER,
      process_name TEXT,
      process_id INTEGER,
      tls_version TEXT,
      tls_cipher TEXT,
      alpn TEXT,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE TABLE body_ref (
      id TEXT PRIMARY KEY,
      blob_hash TEXT,
      encoded_size INTEGER NOT NULL DEFAULT 0,
      decoded_size INTEGER,
      content_encoding TEXT,
      media_type TEXT,
      truncated INTEGER NOT NULL DEFAULT 0,
      decode_status TEXT NOT NULL DEFAULT 'ok',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE exchange (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
      connection_id TEXT REFERENCES connection(id) ON DELETE SET NULL,
      seq INTEGER NOT NULL UNIQUE,
      stream_id INTEGER,
      method TEXT NOT NULL,
      scheme TEXT,
      host TEXT,
      port INTEGER,
      path TEXT,
      url TEXT NOT NULL,
      protocol TEXT NOT NULL,
      status_code INTEGER,
      status_text TEXT,
      request_mime TEXT,
      response_mime TEXT,
      app_id TEXT,
      app_name TEXT,
      started_at INTEGER NOT NULL,
      request_sent_at INTEGER,
      response_started_at INTEGER,
      completed_at INTEGER,
      request_bytes INTEGER NOT NULL DEFAULT 0,
      response_bytes INTEGER NOT NULL DEFAULT 0,
      request_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
      response_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
      request_body_effect_rule_id TEXT,
      request_body_effect TEXT CHECK (request_body_effect IN ('replace')),
      request_body_effect_source TEXT CHECK (request_body_effect_source IN ('text', 'file')),
      request_body_original_state TEXT CHECK (request_body_original_state IN ('available', 'empty', 'unavailable')),
      request_original_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
      response_body_effect_rule_id TEXT,
      response_body_effect TEXT CHECK (response_body_effect IN ('replace')),
      response_body_effect_source TEXT CHECK (response_body_effect_source IN ('text', 'file')),
      response_body_original_state TEXT CHECK (response_body_original_state IN ('available', 'empty', 'unavailable')),
      response_original_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
      state TEXT NOT NULL,
      error_code TEXT,
      rule_ids TEXT
    );
    CREATE TABLE message_headers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      is_pseudo INTEGER NOT NULL DEFAULT 0,
      rule_effect TEXT CHECK (rule_effect IN ('set', 'append', 'replace', 'remove')),
      rule_id TEXT
    );
    CREATE TABLE websocket_frame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      direction TEXT NOT NULL,
      opcode INTEGER NOT NULL,
      payload_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
      payload_size INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE rule_hit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      rule_revision INTEGER NOT NULL,
      phase TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE error_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES capture_session(id) ON DELETE CASCADE,
      exchange_id TEXT REFERENCES exchange(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      protocol_detail TEXT,
      recoverable INTEGER NOT NULL DEFAULT 1,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX idx_exchange_session_seq ON exchange(session_id, seq);
    CREATE INDEX idx_exchange_started ON exchange(started_at);
    CREATE INDEX idx_exchange_host ON exchange(host);
    CREATE INDEX idx_exchange_method ON exchange(method);
    CREATE INDEX idx_exchange_status ON exchange(status_code);
    CREATE INDEX idx_exchange_response_mime ON exchange(response_mime);
    CREATE INDEX idx_exchange_process ON exchange(app_name);
    CREATE INDEX idx_connection_session_seq ON connection(session_id, seq);
    CREATE INDEX idx_headers_exchange ON message_headers(exchange_id, kind, ordinal);
    CREATE INDEX idx_ws_frame_exchange_seq ON websocket_frame(exchange_id, seq);
    CREATE INDEX idx_rule_hit_exchange ON rule_hit(exchange_id);
    CREATE INDEX idx_error_event_exchange ON error_event(exchange_id);
    CREATE INDEX idx_error_event_session ON error_event(session_id);
    CREATE VIRTUAL TABLE exchange_fts USING fts5(
      exchange_id UNINDEXED,
      url,
      host,
      method,
      response_mime
    );
  `;
  /** 独占的 archive snapshot SQLite 连接。 */
  private readonly databaseSync: DatabaseSync;
  /** 导出写入时分配的全局 Exchange sequence。 */
  private nextSeq = 1;
  /** 导入快照中的 Exchange 总数；每个 page 复用，避免重复 COUNT 扫描。 */
  private readonly totalExchanges: number;

  /** 按模式创建新快照或只读打开已提取快照。 */
  constructor(location: string, mode: 'export' | 'import') {
    this.databaseSync = new DatabaseSync(location, {
      readOnly: mode === 'import',
    });
    this.databaseSync.exec('PRAGMA foreign_keys = ON');
    if (mode === 'export') {
      this.databaseSync.exec('PRAGMA journal_mode = DELETE');
      this.databaseSync.exec('PRAGMA synchronous = NORMAL');
      this.databaseSync.exec(SnapshotStore.SCHEMA);
      this.totalExchanges = 0;
    } else {
      const integrity = this.databaseSync.prepare('PRAGMA integrity_check').all() as {
        integrity_check?: string;
      }[];
      if (integrity[0]?.integrity_check !== 'ok') {
        throw new Error('Archive database failed its integrity check.');
      }
      this.totalExchanges = (
        this.databaseSync.prepare('SELECT COUNT(*) AS count FROM exchange').get() as {
          count: number;
        }
      ).count;
    }
  }

  /** 在单事务中追加一个有界 Capture 时间切面批次。 */
  appendBatch(batch: CaptureSnapshotBatch): void {
    this.databaseSync.exec('BEGIN IMMEDIATE');
    try {
      for (const session of batch.sessions) {
        this.databaseSync
          .prepare(
            `INSERT OR IGNORE INTO capture_session
              (id, name, started_at, ended_at, capture_mode, app_version,
               rule_set_revision, created_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            session.id,
            session.name,
            session.startedAt,
            session.captureMode,
            session.appVersion,
            session.ruleSetRevision ?? null,
            Date.now(),
          );
      }
      for (const snapshot of batch.exchanges) {
        this.insertExchange(snapshot.exchange);
        this.insertFrames(snapshot.exchange.id, snapshot.frames);
      }
      this.databaseSync.exec('COMMIT');
    } catch (error) {
      this.databaseSync.exec('ROLLBACK');
      throw error;
    }
  }

  /** 按 startedAt/seq 游标读取一个有界完整 Exchange 批次。 */
  readBatch(cursor: string | undefined, limit: number): ArchiveSnapshotPage {
    const decoded = this.decodeCursor(cursor);
    const rows = this.databaseSync
      .prepare(
        `SELECT id, seq, started_at AS startedAt
         FROM exchange
         WHERE (:startedAt IS NULL OR (started_at, seq) > (:startedAt, :seq))
         ORDER BY started_at ASC, seq ASC
         LIMIT :limit`,
      )
      .all({
        startedAt: decoded?.startedAt ?? null,
        seq: decoded?.seq ?? null,
        limit: limit + 1,
      }) as { id: string; seq: number; startedAt: number }[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const exchanges = pageRows.map((row) => this.readExchange(row.id));
    const last = pageRows.at(-1);
    return {
      exchanges,
      total: this.totalExchanges,
      nextCursor:
        hasMore && last
          ? this.encodeCursor(last.startedAt, last.seq)
          : undefined,
      hasMore,
    };
  }

  /** 关闭一次性 archive SQLite 连接。 */
  close(): void {
    this.databaseSync.close();
  }

  /** 插入 Exchange、body refs、headers 与 FTS 兼容记录。 */
  private insertExchange(exchange: ExchangeInput): void {
    this.insertBody(exchange.requestBody);
    this.insertBody(exchange.responseBody);
    this.insertBody(exchange.requestBodyEffect?.originalBody);
    this.insertBody(exchange.responseBodyEffect?.originalBody);
    const seq = this.nextSeq++;
    this.databaseSync
      .prepare(
        `INSERT INTO exchange
          (id, session_id, connection_id, seq, stream_id, method, scheme, host,
           port, path, url, protocol, status_code, status_text, request_mime,
           response_mime, app_id, app_name, started_at, request_sent_at,
           response_started_at, completed_at, request_bytes, response_bytes,
           request_body_id, response_body_id,
           request_body_effect_rule_id, request_body_effect,
           request_body_effect_source, request_body_original_state,
           request_original_body_id, response_body_effect_rule_id,
           response_body_effect, response_body_effect_source,
           response_body_original_state, response_original_body_id,
           state, error_code, rule_ids)
         VALUES
          (:id, :sessionId, :connectionId, :seq, :streamId, :method, :scheme,
           :host, :port, :path, :url, :protocol, :statusCode, :statusText,
           :requestMime, :responseMime, :appId, :appName, :startedAt, :requestSentAt,
           :responseStartedAt, :completedAt, :requestBytes, :responseBytes,
           :requestBodyId, :responseBodyId,
           :requestBodyEffectRuleId, :requestBodyEffect,
           :requestBodyEffectSource, :requestBodyOriginalState,
           :requestOriginalBodyId, :responseBodyEffectRuleId,
           :responseBodyEffect, :responseBodyEffectSource,
           :responseBodyOriginalState, :responseOriginalBodyId,
           :state, :errorCode, :ruleIds)`,
      )
      .run({
        id: exchange.id,
        sessionId: exchange.sessionId,
        connectionId: null,
        seq,
        streamId: exchange.streamId ?? null,
        method: exchange.method,
        scheme: exchange.scheme ?? null,
        host: exchange.host ?? null,
        port: exchange.port ?? null,
        path: exchange.path ?? null,
        url: exchange.url,
        protocol: exchange.protocol,
        statusCode: exchange.statusCode ?? null,
        statusText: exchange.statusText ?? null,
        requestMime: exchange.requestMime ?? null,
        responseMime: exchange.responseMime ?? null,
        appId: exchange.appId ?? null,
        appName: exchange.appName ?? null,
        startedAt: exchange.startedAt,
        requestSentAt: exchange.requestSentAt ?? null,
        responseStartedAt: exchange.responseStartedAt ?? null,
        completedAt: exchange.completedAt ?? null,
        requestBytes: exchange.requestBytes ?? 0,
        responseBytes: exchange.responseBytes ?? 0,
        requestBodyId: exchange.requestBody?.id ?? exchange.requestBodyId ?? null,
        responseBodyId:
          exchange.responseBody?.id ?? exchange.responseBodyId ?? null,
        requestBodyEffectRuleId: exchange.requestBodyEffect?.ruleId ?? null,
        requestBodyEffect: exchange.requestBodyEffect?.effect ?? null,
        requestBodyEffectSource: exchange.requestBodyEffect?.source ?? null,
        requestBodyOriginalState: exchange.requestBodyEffect?.originalState ?? null,
        requestOriginalBodyId: exchange.requestBodyEffect?.originalBody?.id ?? null,
        responseBodyEffectRuleId: exchange.responseBodyEffect?.ruleId ?? null,
        responseBodyEffect: exchange.responseBodyEffect?.effect ?? null,
        responseBodyEffectSource: exchange.responseBodyEffect?.source ?? null,
        responseBodyOriginalState: exchange.responseBodyEffect?.originalState ?? null,
        responseOriginalBodyId: exchange.responseBodyEffect?.originalBody?.id ?? null,
        state: exchange.state,
        errorCode: exchange.errorCode ?? null,
        ruleIds: exchange.ruleIds?.length ? JSON.stringify(exchange.ruleIds) : null,
      });
    this.databaseSync
      .prepare(
        `INSERT INTO exchange_fts (exchange_id, url, host, method, response_mime)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        exchange.id,
        exchange.url,
        exchange.host ?? '',
        exchange.method,
        exchange.responseMime ?? '',
      );
    for (const [ordinal, header] of (exchange.headers ?? []).entries()) {
      this.insertHeader(exchange.id, header, ordinal);
    }
  }

  /** 插入一批 WebSocket frames 及 payload body ref。 */
  private insertFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): void {
    let seq = 1;
    for (const frame of frames) {
      this.insertBody(frame.payload);
      this.databaseSync
        .prepare(
          `INSERT INTO websocket_frame
            (exchange_id, seq, direction, opcode, payload_body_id, payload_size, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          exchangeId,
          seq++,
          frame.direction,
          frame.opcode,
          frame.payload?.id ?? null,
          frame.payloadSize,
          frame.timestamp,
        );
    }
  }

  /** 插入单条 body metadata，重复 id 保持首条。 */
  private insertBody(body: BodyRefInput | undefined): void {
    if (!body) {
      return;
    }
    this.databaseSync
      .prepare(
        `INSERT OR IGNORE INTO body_ref
          (id, blob_hash, encoded_size, decoded_size, content_encoding,
           media_type, truncated, decode_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.id,
        body.blobHash ?? null,
        body.encodedSize,
        body.decodedSize ?? null,
        body.contentEncoding ?? null,
        body.mediaType ?? null,
        body.truncated ? 1 : 0,
        body.decodeStatus ?? 'ok',
        Date.now(),
      );
  }

  /** 插入单条有序 header。 */
  private insertHeader(
    exchangeId: string,
    header: HeaderInput,
    ordinal: number,
  ): void {
    this.databaseSync
      .prepare(
        `INSERT INTO message_headers
          (exchange_id, kind, ordinal, name, value, is_pseudo, rule_effect, rule_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        exchangeId,
        header.kind,
        ordinal,
        header.name,
        header.value,
        header.isPseudo ? 1 : 0,
        header.ruleEffect ?? null,
        header.ruleId ?? null,
      );
  }

  /** 从快照读取完整 Exchange 与 WebSocket frame metadata。 */
  private readExchange(id: string): CaptureSnapshotExchange {
    const row = this.databaseSync
      .prepare(
        `SELECT id, session_id AS sessionId, stream_id AS streamId,
                method, scheme, host, port, path, url, protocol,
                status_code AS statusCode, status_text AS statusText,
                request_mime AS requestMime, response_mime AS responseMime,
                app_id AS appId, app_name AS appName, started_at AS startedAt,
                request_sent_at AS requestSentAt,
                response_started_at AS responseStartedAt,
                completed_at AS completedAt, request_bytes AS requestBytes,
                response_bytes AS responseBytes, request_body_id AS requestBodyId,
                response_body_id AS responseBodyId,
                request_body_effect_rule_id AS requestBodyEffectRuleId,
                request_body_effect AS requestBodyEffect,
                request_body_effect_source AS requestBodyEffectSource,
                request_body_original_state AS requestBodyOriginalState,
                request_original_body_id AS requestOriginalBodyId,
                response_body_effect_rule_id AS responseBodyEffectRuleId,
                response_body_effect AS responseBodyEffect,
                response_body_effect_source AS responseBodyEffectSource,
                response_body_original_state AS responseBodyOriginalState,
                response_original_body_id AS responseOriginalBodyId,
                state, error_code AS errorCode,
                rule_ids AS ruleIds
         FROM exchange WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Archive exchange '${id}' disappeared during import.`);
    }
    const headers = this.databaseSync
      .prepare(
        `SELECT kind, name, value, is_pseudo AS isPseudo,
            rule_effect AS ruleEffect, rule_id AS ruleId
         FROM message_headers WHERE exchange_id = ? ORDER BY id ASC`,
      )
      .all(id) as {
        kind: HeaderInput['kind'];
        name: string;
        value: string;
        isPseudo: number;
        ruleEffect: HeaderInput['ruleEffect'] | null;
        ruleId: string | null;
      }[];
    const requestBody = this.readBody(row.requestBodyId as string | null);
    const responseBody = this.readBody(row.responseBodyId as string | null);
    const requestBodyEffect = this.readBodyEffect(
      row.requestBodyEffectRuleId,
      row.requestBodyEffect,
      row.requestBodyEffectSource,
      row.requestBodyOriginalState,
      row.requestOriginalBodyId,
    );
    const responseBodyEffect = this.readBodyEffect(
      row.responseBodyEffectRuleId,
      row.responseBodyEffect,
      row.responseBodyEffectSource,
      row.responseBodyOriginalState,
      row.responseOriginalBodyId,
    );
    const exchange: ExchangeInput = {
      id: row.id as string,
      sessionId: row.sessionId as string,
      streamId: (row.streamId as number | null) ?? undefined,
      method: row.method as string,
      scheme: (row.scheme as string | null) ?? undefined,
      host: (row.host as string | null) ?? undefined,
      port: (row.port as number | null) ?? undefined,
      path: (row.path as string | null) ?? undefined,
      url: row.url as string,
      protocol: row.protocol as string,
      statusCode: (row.statusCode as number | null) ?? undefined,
      statusText: (row.statusText as string | null) ?? undefined,
      requestMime: (row.requestMime as string | null) ?? undefined,
      responseMime: (row.responseMime as string | null) ?? undefined,
      appId: (row.appId as string | null) ?? undefined,
      appName: (row.appName as string | null) ?? undefined,
      startedAt: row.startedAt as number,
      requestSentAt: (row.requestSentAt as number | null) ?? undefined,
      responseStartedAt: (row.responseStartedAt as number | null) ?? undefined,
      completedAt: (row.completedAt as number | null) ?? undefined,
      requestBytes: row.requestBytes as number,
      responseBytes: row.responseBytes as number,
      requestBody,
      responseBody,
      requestBodyEffect,
      responseBodyEffect,
      state: row.state as ExchangeInput['state'],
      errorCode: (row.errorCode as string | null) ?? undefined,
      ruleIds: this.readRuleIds(row.ruleIds),
      headers: headers.map((header) => ({
        kind: header.kind,
        name: header.name,
        value: header.value,
        ...(header.isPseudo !== 0 ? { isPseudo: true } : {}),
        ...(header.ruleEffect ? { ruleEffect: header.ruleEffect } : {}),
        ...(header.ruleId ? { ruleId: header.ruleId } : {}),
      })),
    };
    return {
      exchange,
      frames: this.readFrames(id),
    };
  }

  /** 解析 Archive 中结构化保存的规则 id 数组。 */
  private readRuleIds(value: unknown): string[] | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(String(value));
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error('Archive exchange rule_ids must be a string array.');
    }
    return parsed.length > 0 ? parsed : undefined;
  }

  /** 读取并校验一侧Body effect三态与Original引用。 */
  private readBodyEffect(
    ruleIdValue: unknown,
    effectValue: unknown,
    sourceValue: unknown,
    originalStateValue: unknown,
    originalBodyIdValue: unknown,
  ): BodyRuleEffectInput | undefined {
    if (ruleIdValue === null || ruleIdValue === undefined) {
      return undefined;
    }
    if (
      typeof ruleIdValue !== 'string'
      || effectValue !== 'replace'
      || (sourceValue !== 'text' && sourceValue !== 'file')
      || !['available', 'empty', 'unavailable'].includes(String(originalStateValue))
    ) {
      throw new Error('Archive body Rule effect is malformed.');
    }
    const originalState = originalStateValue as BodyRuleEffectInput['originalState'];
    const originalBody = this.readBody((originalBodyIdValue as string | null) ?? null);
    if ((originalState === 'available') !== Boolean(originalBody)) {
      throw new Error('Archive body Rule effect has an inconsistent Original reference.');
    }
    return {
      ruleId: ruleIdValue,
      effect: 'replace',
      source: sourceValue,
      originalState,
      ...(originalBody ? { originalBody } : {}),
    };
  }

  /** 读取单条 body metadata。 */
  private readBody(id: string | null): BodyRefInput | undefined {
    if (!id) {
      return undefined;
    }
    const row = this.databaseSync
      .prepare(
        `SELECT id, blob_hash AS blobHash, encoded_size AS encodedSize,
                decoded_size AS decodedSize, content_encoding AS contentEncoding,
                media_type AS mediaType, truncated, decode_status AS decodeStatus
         FROM body_ref WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          blobHash: string | null;
          encodedSize: number;
          decodedSize: number | null;
          contentEncoding: string | null;
          mediaType: string | null;
          truncated: number;
          decodeStatus: BodyRefInput['decodeStatus'];
        }
      | undefined;
    return row
      ? {
          id: row.id,
          blobHash: row.blobHash ?? undefined,
          encodedSize: row.encodedSize,
          decodedSize: row.decodedSize ?? undefined,
          contentEncoding: row.contentEncoding ?? undefined,
          mediaType: row.mediaType ?? undefined,
          truncated: row.truncated !== 0,
          decodeStatus: row.decodeStatus,
        }
      : undefined;
  }

  /** 读取 Exchange 的全部 WebSocket frames。 */
  private readFrames(exchangeId: string): WebSocketFrameInput[] {
    const rows = this.databaseSync
      .prepare(
        `SELECT direction, opcode, payload_body_id AS payloadBodyId,
                payload_size AS payloadSize, timestamp
         FROM websocket_frame WHERE exchange_id = ? ORDER BY seq ASC`,
      )
      .all(exchangeId) as {
        direction: WebSocketFrameInput['direction'];
        opcode: WebSocketFrameInput['opcode'];
        payloadBodyId: string | null;
        payloadSize: number;
        timestamp: number;
      }[];
    return rows.map((row) => ({
      direction: row.direction,
      opcode: row.opcode,
      payloadSize: row.payloadSize,
      timestamp: row.timestamp,
      payload: this.readBody(row.payloadBodyId),
    }));
  }

  /** 编码 archive snapshot keyset cursor。 */
  private encodeCursor(startedAt: number, seq: number): string {
    return Buffer.from(`${startedAt}:${seq}`, 'utf8').toString('base64url');
  }

  /** 解码 archive snapshot keyset cursor。 */
  private decodeCursor(
    cursor: string | undefined,
  ): { startedAt: number; seq: number } | null {
    if (!cursor) {
      return null;
    }
    const match = /^(\d+):(\d+)$/.exec(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (!match) {
      throw new Error('Archive snapshot cursor is invalid.');
    }
    const startedAt = Number(match[1]);
    const seq = Number(match[2]);
    if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(seq)) {
      throw new Error('Archive snapshot cursor is invalid.');
    }
    return { startedAt, seq };
  }
}
