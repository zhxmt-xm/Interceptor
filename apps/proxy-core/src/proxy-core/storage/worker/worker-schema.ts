import type { Migration } from '../../migration-runner';

/**
 * Capture 数据库当前 schema 版本。新增迁移时必须同步更新。
 */
export const CAPTURE_SCHEMA_VERSION = 2;

/**
 * Capture 数据库只向前迁移集，对应产品设计第十二章 12.1 的核心实体。
 *
 * v1 建立 capture_session / connection / exchange / message_headers /
 * body_ref / websocket_frame / rule_hit / error_event 八张表，覆盖
 * time / host / method / status / mime / process 查询维度的索引，以及
 * 用于关键字搜索的 FTS5 虚拟表。时间戳统一使用 epoch 毫秒（INTEGER）。
 * v2（M7）新增单行 rule_set 表持久化版本化规则集（revision + rules_json）。
 */
export const CAPTURE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    label: 'core-capture-entities',
    statements: [
      `CREATE TABLE capture_session (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        capture_mode TEXT NOT NULL,
        app_version TEXT NOT NULL,
        rule_set_revision INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE connection (
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
      )`,
      `CREATE TABLE body_ref (
        id TEXT PRIMARY KEY,
        blob_hash TEXT,
        encoded_size INTEGER NOT NULL DEFAULT 0,
        decoded_size INTEGER,
        content_encoding TEXT,
        media_type TEXT,
        truncated INTEGER NOT NULL DEFAULT 0,
        decode_status TEXT NOT NULL DEFAULT 'ok',
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE exchange (
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
        process_name TEXT,
        started_at INTEGER NOT NULL,
        request_sent_at INTEGER,
        response_started_at INTEGER,
        completed_at INTEGER,
        request_bytes INTEGER NOT NULL DEFAULT 0,
        response_bytes INTEGER NOT NULL DEFAULT 0,
        request_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
        response_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
        state TEXT NOT NULL,
        error_code TEXT
      )`,
      `CREATE TABLE message_headers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        is_pseudo INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE websocket_frame (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        direction TEXT NOT NULL,
        opcode INTEGER NOT NULL,
        payload_body_id TEXT REFERENCES body_ref(id) ON DELETE SET NULL,
        payload_size INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
      )`,
      `CREATE TABLE rule_hit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id TEXT NOT NULL REFERENCES exchange(id) ON DELETE CASCADE,
        rule_id TEXT NOT NULL,
        rule_revision INTEGER NOT NULL,
        phase TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE error_event (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT REFERENCES capture_session(id) ON DELETE CASCADE,
        exchange_id TEXT REFERENCES exchange(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        protocol_detail TEXT,
        recoverable INTEGER NOT NULL DEFAULT 1,
        timestamp INTEGER NOT NULL
      )`,
      // time / host / method / status / mime / process 查询维度索引。
      'CREATE INDEX idx_exchange_session_seq ON exchange(session_id, seq)',
      'CREATE INDEX idx_exchange_started ON exchange(started_at)',
      'CREATE INDEX idx_exchange_host ON exchange(host)',
      'CREATE INDEX idx_exchange_method ON exchange(method)',
      'CREATE INDEX idx_exchange_status ON exchange(status_code)',
      'CREATE INDEX idx_exchange_response_mime ON exchange(response_mime)',
      'CREATE INDEX idx_exchange_process ON exchange(process_name)',
      'CREATE INDEX idx_connection_session_seq ON connection(session_id, seq)',
      'CREATE INDEX idx_headers_exchange ON message_headers(exchange_id, kind, ordinal)',
      'CREATE INDEX idx_ws_frame_exchange_seq ON websocket_frame(exchange_id, seq)',
      'CREATE INDEX idx_rule_hit_exchange ON rule_hit(exchange_id)',
      'CREATE INDEX idx_error_event_exchange ON error_event(exchange_id)',
      'CREATE INDEX idx_error_event_session ON error_event(session_id)',
      // 关键字搜索：独立 FTS5 表由 Storage Worker 与 exchange 同步维护。
      `CREATE VIRTUAL TABLE exchange_fts USING fts5(
        exchange_id UNINDEXED,
        url,
        host,
        method,
        response_mime
      )`,
    ],
  },
  {
    version: 2,
    label: 'rule-set',
    statements: [
      // 单行表（CHECK id = 1）持久化最新规则集：revision 单调递增用于乐观并发，
      // rules_json 是 RuleDefinition[] 的可序列化快照（无 callback / 运行时对象）。
      `CREATE TABLE rule_set (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        rules_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
];
