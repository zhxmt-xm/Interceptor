import type { DatabaseSync, StatementSync } from 'node:sqlite';

import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  CaptureExchangeSummary,
  CaptureHeader,
  RuleDefinition,
  RuleSet,
} from '@interceptor/core-protocol';

import type {
  BodyRefInput,
  CaptureSessionInput,
  CleanupResult,
  CleanupScope,
  ExchangeInput,
  HeaderInput,
  RuleHitCount,
  RuleHitInput,
  SessionQuery,
  SessionQueryPage,
  StorageStats,
  WebSocketFrameInput,
} from '../types';

/**
 * 无效分页游标错误；查询边界据此返回结构化错误而非静默重置。
 */
export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is malformed.');
    this.name = 'InvalidCursorError';
  }
}

/**
 * 规则集乐观并发冲突：expectedRevision 与当前持久化 revision 不一致。
 * core-application 据 error.name 映射为 CoreError conflict（跨 Worker 边界原型链会丢失）。
 */
export class RuleRevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Rule set revision conflict: expected ${expectedRevision}, found ${actualRevision}.`,
    );
    this.name = 'RuleRevisionConflictError';
  }
}

interface KeysetCursor {
  readonly startedAt: number;
  readonly seq: number;
}

interface SummaryRow {
  id: string;
  method: string;
  scheme: string | null;
  host: string | null;
  path: string | null;
  protocol: string;
  statusCode: number | null;
  responseMime: string | null;
  state: string;
  startedAt: number;
  completedAt: number | null;
  requestBytes: number;
  responseBytes: number;
  seq: number;
}

function toSummary(row: SummaryRow): CaptureExchangeSummary {
  return {
    id: row.id,
    method: row.method,
    secure: row.scheme === 'https',
    host: row.host ?? undefined,
    path: row.path ?? undefined,
    protocol: row.protocol,
    statusCode: row.statusCode ?? undefined,
    responseMime: row.responseMime ?? undefined,
    state: row.state,
    startedAt: row.startedAt,
    durationMs:
      row.completedAt !== null
        ? Math.max(0, row.completedAt - row.startedAt)
        : undefined,
    requestBytes: row.requestBytes,
    responseBytes: row.responseBytes,
  };
}

interface DetailRow extends SummaryRow {
  url: string;
  port: number | null;
  statusText: string | null;
  requestMime: string | null;
  errorCode: string | null;
  streamId: number | null;
  requestBodyId: string | null;
  responseBodyId: string | null;
}

interface HeaderRow {
  kind: string;
  name: string;
  value: string;
  isPseudo: number;
}

interface BodyRefRow {
  blobHash: string | null;
  mediaType: string | null;
  contentEncoding: string | null;
  encodedSize: number;
  decodedSize: number | null;
  truncated: number;
  decodeStatus: string;
}

function toHeader(row: HeaderRow): CaptureHeader {
  return row.isPseudo
    ? { name: row.name, value: row.value, isPseudo: true }
    : { name: row.name, value: row.value };
}

/**
 * Capture 数据库的同步访问层，运行在 Storage Worker 线程内独占一个连接。
 *
 * 所有写入通过 appendExchanges/updateExchange 串行进入单事务，seq 单调递增以支撑
 * keyset 分页；查询只返回有限元数据 id，不 hydrate 正文。CaptureStore 不做任何
 * 异步 I/O，也不感知 Worker 消息协议，因此可脱离 Worker 直接单元测试。
 */
export class CaptureStore {
  private readonly insertSessionStmt: StatementSync;
  private readonly insertExchangeStmt: StatementSync;
  private readonly insertBodyRefStmt: StatementSync;
  private readonly insertHeaderStmt: StatementSync;
  private readonly insertFtsStmt: StatementSync;
  private readonly deleteFtsByExchangeStmt: StatementSync;
  private readonly updateExchangeStmt: StatementSync;
  private readonly updateFtsResponseMimeStmt: StatementSync;
  private readonly insertRuleHitStmt: StatementSync;
  private readonly insertWebSocketFrameStmt: StatementSync;
  private nextSeq: number;

  /**
   * 预编译热路径语句并从现有数据恢复 seq 游标。
   * 调用方：Storage Worker 打开数据库后创建；单元测试直接注入内存库。
   */
  constructor(private readonly db: DatabaseSync) {
    this.insertSessionStmt = db.prepare(
      `INSERT OR IGNORE INTO capture_session
        (id, name, started_at, ended_at, capture_mode, app_version, rule_set_revision, created_at)
       VALUES (:id, :name, :startedAt, NULL, :captureMode, :appVersion, :ruleSetRevision, :createdAt)`,
    );
    this.insertExchangeStmt = db.prepare(
      `INSERT INTO exchange
        (id, session_id, connection_id, seq, stream_id, method, scheme, host, port, path, url,
         protocol, status_code, status_text, request_mime, response_mime, process_name,
         started_at, request_sent_at, response_started_at, completed_at,
         request_bytes, response_bytes, request_body_id, response_body_id, state, error_code)
       VALUES
        (:id, :sessionId, :connectionId, :seq, :streamId, :method, :scheme, :host, :port, :path, :url,
         :protocol, :statusCode, :statusText, :requestMime, :responseMime, :processName,
         :startedAt, :requestSentAt, :responseStartedAt, :completedAt,
         :requestBytes, :responseBytes, :requestBodyId, :responseBodyId, :state, :errorCode)`,
    );
    this.insertHeaderStmt = db.prepare(
      `INSERT INTO message_headers (exchange_id, kind, ordinal, name, value, is_pseudo)
       VALUES (:exchangeId, :kind, :ordinal, :name, :value, :isPseudo)`,
    );
    this.insertBodyRefStmt = db.prepare(
      `INSERT INTO body_ref
        (id, blob_hash, encoded_size, decoded_size, content_encoding, media_type,
         truncated, decode_status, created_at)
       VALUES
        (:id, :blobHash, :encodedSize, :decodedSize, :contentEncoding, :mediaType,
         :truncated, :decodeStatus, :createdAt)`,
    );
    this.insertFtsStmt = db.prepare(
      `INSERT INTO exchange_fts (exchange_id, url, host, method, response_mime)
       VALUES (:exchangeId, :url, :host, :method, :responseMime)`,
    );
    this.deleteFtsByExchangeStmt = db.prepare(
      'DELETE FROM exchange_fts WHERE exchange_id = :exchangeId',
    );
    this.updateExchangeStmt = db.prepare(
      `UPDATE exchange SET
         status_code = :statusCode,
         status_text = :statusText,
         response_mime = :responseMime,
         response_started_at = :responseStartedAt,
         completed_at = :completedAt,
         response_bytes = :responseBytes,
         response_body_id = :responseBodyId,
         state = :state,
         error_code = :errorCode
       WHERE id = :id`,
    );
    this.updateFtsResponseMimeStmt = db.prepare(
      `UPDATE exchange_fts SET response_mime = :responseMime
       WHERE exchange_id = :exchangeId`,
    );
    this.insertRuleHitStmt = db.prepare(
      `INSERT INTO rule_hit
        (exchange_id, rule_id, rule_revision, phase, action, summary, created_at)
       VALUES
        (:exchangeId, :ruleId, :ruleRevision, :phase, :action, :summary, :createdAt)`,
    );
    this.insertWebSocketFrameStmt = db.prepare(
      `INSERT INTO websocket_frame
        (exchange_id, seq, direction, opcode, payload_body_id, payload_size, timestamp)
       VALUES
        (:exchangeId, :seq, :direction, :opcode, :payloadBodyId, :payloadSize, :timestamp)`,
    );

    const row = db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM exchange')
      .get() as { maxSeq: number };
    this.nextSeq = row.maxSeq + 1;
  }

  /**
   * 幂等地登记一个 Capture 会话；重复 id 保持首个记录不变。
   * 调用方：M3 代理数据面在开始捕获时；追加 Exchange 前必须存在会话。
   */
  ensureSession(input: CaptureSessionInput): void {
    this.insertSessionStmt.run({
      id: input.id,
      name: input.name,
      startedAt: input.startedAt,
      captureMode: input.captureMode,
      appVersion: input.appVersion,
      ruleSetRevision: input.ruleSetRevision ?? null,
      createdAt: Date.now(),
    });
  }

  /**
   * 在单事务内串行追加一批 Exchange 及其 header，并分配单调 seq。
   * 调用方：Storage Worker 处理批量写请求；返回每条被分配的 seq 供 ack/排序。
   */
  appendExchanges(
    inputs: readonly ExchangeInput[],
  ): { id: string; seq: number }[] {
    return this.inTransaction(() => {
      const assigned: { id: string; seq: number }[] = [];
      for (const input of inputs) {
        const seq = this.nextSeq++;
        const requestBodyId = this.insertBodyRef(input.requestBody) ??
          input.requestBodyId ?? null;
        const responseBodyId = this.insertBodyRef(input.responseBody) ??
          input.responseBodyId ?? null;
        this.insertExchangeStmt.run(
          this.toExchangeBindings(input, seq, requestBodyId, responseBodyId),
        );
        this.insertFtsStmt.run({
          exchangeId: input.id,
          url: input.url,
          host: input.host ?? '',
          method: input.method,
          responseMime: input.responseMime ?? '',
        });
        if (input.headers) {
          this.insertHeaders(input.id, input.headers);
        }
        assigned.push({ id: input.id, seq });
      }
      return assigned;
    });
  }

  /**
   * 原子追加同一 WebSocket Exchange 的应用消息，seq 从已有最大值继续递增。
   * payload body_ref 与帧在同一事务插入，避免留下悬空引用。
   */
  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): void {
    if (frames.length === 0) {
      return;
    }
    this.inTransaction(() => {
      const row = this.db
        .prepare(
          'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM websocket_frame WHERE exchange_id = ?',
        )
        .get(exchangeId) as { maxSeq: number };
      let seq = row.maxSeq + 1;
      for (const frame of frames) {
        const payloadBodyId = this.insertBodyRef(frame.payload);
        this.insertWebSocketFrameStmt.run({
          exchangeId,
          seq: seq++,
          direction: frame.direction,
          opcode: frame.opcode,
          payloadBodyId: payloadBodyId ?? null,
          payloadSize: frame.payloadSize,
          timestamp: frame.timestamp,
        });
      }
    });
  }

  /**
   * 更新一条 Exchange 的响应侧可变字段，并同步 FTS 中的 response_mime。
   * 调用方：M3 数据面在响应到达/完成时；未知 id 的更新静默不生效。
   */
  updateExchangeResponse(patch: {
    id: string;
    statusCode?: number;
    statusText?: string;
    responseMime?: string;
    responseStartedAt?: number;
    completedAt?: number;
    responseBytes?: number;
    responseBodyId?: string;
    state: ExchangeInput['state'];
    errorCode?: string;
    headers?: readonly HeaderInput[];
  }): void {
    this.inTransaction(() => {
      this.updateExchangeStmt.run({
        id: patch.id,
        statusCode: patch.statusCode ?? null,
        statusText: patch.statusText ?? null,
        responseMime: patch.responseMime ?? null,
        responseStartedAt: patch.responseStartedAt ?? null,
        completedAt: patch.completedAt ?? null,
        responseBytes: patch.responseBytes ?? 0,
        responseBodyId: patch.responseBodyId ?? null,
        state: patch.state,
        errorCode: patch.errorCode ?? null,
      });
      this.updateFtsResponseMimeStmt.run({
        exchangeId: patch.id,
        responseMime: patch.responseMime ?? '',
      });
      if (patch.headers) {
        this.insertHeaders(patch.id, patch.headers);
      }
    });
  }

  /**
   * 按 time/host/method/status/mime/process 与全文搜索执行 keyset 分页查询。
   * 只返回有限的 Exchange id 列表和 opaque 游标，不加载 header 或正文。
   * 调用方：Storage Worker 处理查询请求，最终映射为 sessions.page 结果。
   */
  querySessions(query: SessionQuery): SessionQueryPage {
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    this.appendFilterConditions(query.filter, conditions, params);
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      const comparator = query.sort === 'started_asc' ? '>' : '<';
      conditions.push(
        `(e.started_at, e.seq) ${comparator} (:cursorStartedAt, :cursorSeq)`,
      );
      params.cursorStartedAt = cursor.startedAt;
      params.cursorSeq = cursor.seq;
    }

    const direction = query.sort === 'started_asc' ? 'ASC' : 'DESC';
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql =
      `SELECT e.id AS id, e.method AS method, e.scheme AS scheme, e.host AS host,
              e.path AS path, e.protocol AS protocol, e.status_code AS statusCode,
              e.response_mime AS responseMime, e.state AS state,
              e.started_at AS startedAt, e.completed_at AS completedAt,
              e.request_bytes AS requestBytes, e.response_bytes AS responseBytes,
              e.seq AS seq
       FROM exchange e
       ${where}
       ORDER BY e.started_at ${direction}, e.seq ${direction}
       LIMIT :limit`;

    const rows = this.db.prepare(sql).all({
      ...params,
      limit: query.limit + 1,
    }) as unknown as SummaryRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      items: page.map(toSummary),
      nextCursor:
        hasMore && last ? encodeCursor(last.startedAt, last.seq) : undefined,
      hasMore,
    };
  }

  /**
   * 按需读取单条 Exchange 的完整详情：摘要 + URL + 请求/响应头 + 正文引用元数据。
   * 不读取正文字节；正文由 body.read-range 按 blob hash 分块拉取。
   * 调用方：Storage Worker 处理 sessions.detail 请求（Inspector 选中行时）。
   */
  getExchangeDetail(id: string): CaptureExchangeDetail | null {
    const row = this.db
      .prepare(
        `SELECT e.id AS id, e.method AS method, e.scheme AS scheme, e.host AS host,
                e.path AS path, e.url AS url, e.port AS port, e.protocol AS protocol,
                e.status_code AS statusCode, e.status_text AS statusText,
                e.request_mime AS requestMime, e.response_mime AS responseMime,
                e.state AS state, e.error_code AS errorCode, e.stream_id AS streamId,
                e.started_at AS startedAt, e.completed_at AS completedAt,
                e.request_bytes AS requestBytes, e.response_bytes AS responseBytes,
                e.request_body_id AS requestBodyId, e.response_body_id AS responseBodyId,
                e.seq AS seq
         FROM exchange e
         WHERE e.id = :id`,
      )
      .get({ id }) as unknown as DetailRow | undefined;

    if (!row) {
      return null;
    }

    const headers = this.db
      .prepare(
        `SELECT kind, name, value, is_pseudo AS isPseudo
         FROM message_headers
         WHERE exchange_id = :id
         ORDER BY kind, ordinal`,
      )
      .all({ id }) as unknown as HeaderRow[];

    return {
      summary: toSummary(row),
      url: row.url,
      scheme: row.scheme ?? undefined,
      port: row.port ?? undefined,
      statusText: row.statusText ?? undefined,
      requestMime: row.requestMime ?? undefined,
      errorCode: row.errorCode ?? undefined,
      streamId: row.streamId ?? undefined,
      requestHeaders: headers.filter((h) => h.kind === 'request').map(toHeader),
      responseHeaders: headers.filter((h) => h.kind === 'response').map(toHeader),
      requestTrailers: headers
        .filter((h) => h.kind === 'request-trailer')
        .map(toHeader),
      responseTrailers: headers
        .filter((h) => h.kind === 'response-trailer')
        .map(toHeader),
      requestBody: this.readBodyRef(row.requestBodyId),
      responseBody: this.readBodyRef(row.responseBodyId),
    };
  }

  private readBodyRef(bodyId: string | null): CaptureBodyRef | undefined {
    if (!bodyId) {
      return undefined;
    }
    const row = this.db
      .prepare(
        `SELECT blob_hash AS blobHash, media_type AS mediaType,
                content_encoding AS contentEncoding,
                encoded_size AS encodedSize, decoded_size AS decodedSize,
                truncated AS truncated, decode_status AS decodeStatus
         FROM body_ref
         WHERE id = :id`,
      )
      .get({ id: bodyId }) as unknown as BodyRefRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      bodyHash: row.blobHash ?? undefined,
      mediaType: row.mediaType ?? undefined,
      contentEncoding: row.contentEncoding ?? undefined,
      encodedSize: row.encodedSize,
      decodedSize: row.decodedSize ?? undefined,
      truncated: row.truncated !== 0,
      decodeStatus: row.decodeStatus,
    };
  }

  /**
   * 汇总当前存储用量：会话/Exchange 计数、数据库字节数和已引用正文体量。
   * 调用方：Storage Worker 处理 status 请求；Blob 磁盘占用由 Service 层合并。
   */
  getStorageStats(): StorageStats {
    const count = (sql: string): number =>
      (this.db.prepare(sql).get() as { value: number }).value;
    const pageCount = (
      this.db.prepare('PRAGMA page_count').get() as { page_count: number }
    ).page_count;
    const pageSize = (
      this.db.prepare('PRAGMA page_size').get() as { page_size: number }
    ).page_size;

    return {
      sessionCount: count('SELECT COUNT(*) AS value FROM capture_session'),
      exchangeCount: count('SELECT COUNT(*) AS value FROM exchange'),
      databaseBytes: pageCount * pageSize,
      bodyRefCount: count('SELECT COUNT(*) AS value FROM body_ref'),
      referencedBodyBytes: count(
        `SELECT COALESCE(SUM(encoded_size), 0) AS value
         FROM body_ref WHERE blob_hash IS NOT NULL`,
      ),
    };
  }

  /**
   * 按范围删除捕获数据并回收孤立 body_ref，返回清理后仍被引用的 blob hash。
   * 调用方：Storage Worker 处理 cleanup 请求；Service 据返回集合 GC blob 文件。
   */
  cleanup(scope: CleanupScope): CleanupResult {
    const result = this.inTransaction<Omit<CleanupResult, 'referencedBlobHashes'>>(
      () => {
        if (scope.kind === 'all') {
          const removedSessions = this.scalar(
            'SELECT COUNT(*) AS value FROM capture_session',
          );
          const removedExchanges = this.scalar(
            'SELECT COUNT(*) AS value FROM exchange',
          );
          this.db.exec('DELETE FROM capture_session');
          this.db.exec('DELETE FROM exchange_fts');
          this.db.exec('DELETE FROM body_ref');
          return { removedSessions, removedExchanges };
        }

        const removedExchanges = this.scalar(
          'SELECT COUNT(*) AS value FROM exchange WHERE session_id = :sessionId',
          { sessionId: scope.sessionId },
        );
        this.db
          .prepare(
            `DELETE FROM exchange_fts
             WHERE exchange_id IN (SELECT id FROM exchange WHERE session_id = :sessionId)`,
          )
          .run({ sessionId: scope.sessionId });
        const removedSessions = this.db
          .prepare('DELETE FROM capture_session WHERE id = :sessionId')
          .run({ sessionId: scope.sessionId }).changes as number;
        this.deleteOrphanBodyRefs();
        return { removedSessions, removedExchanges };
      },
    );

    return { ...result, referencedBlobHashes: this.referencedBlobHashes() };
  }

  /**
   * 返回当前仍被 exchange/websocket_frame 引用的去重 blob hash 集合。
   * 调用方：cleanup 计算 GC 白名单，Service 启动时对账磁盘 blob。
   */
  referencedBlobHashes(): string[] {
    return (
      this.db
        .prepare(
          `SELECT DISTINCT blob_hash AS hash FROM body_ref WHERE blob_hash IS NOT NULL`,
        )
        .all() as { hash: string }[]
    ).map((row) => row.hash);
  }

  /**
   * 读取持久化的规则集；空库（尚未保存过）返回 revision 0 的空规则集。
   * 调用方：Storage Worker 处理 load-rule-set 请求（rules.get handler）。
   */
  loadRuleSet(): RuleSet {
    const row = this.db
      .prepare(
        'SELECT revision AS revision, rules_json AS rulesJson FROM rule_set WHERE id = 1',
      )
      .get() as { revision: number; rulesJson: string } | undefined;
    if (!row) {
      return { revision: 0, rules: [] };
    }
    return {
      revision: row.revision,
      rules: JSON.parse(row.rulesJson) as RuleDefinition[],
    };
  }

  /**
   * 乐观并发替换规则集：expectedRevision 必须等于当前 revision（空库视为 0），
   * 否则抛 RuleRevisionConflictError；成功则写入 revision+1 并返回新规则集。
   * 读-比较-写在单事务内完成，保证并发替换的原子性。
   * 调用方：Storage Worker 处理 save-rule-set 请求（rules.replace handler）。
   */
  saveRuleSet(
    expectedRevision: number,
    rules: readonly RuleDefinition[],
  ): RuleSet {
    return this.inTransaction(() => {
      const current = this.db
        .prepare('SELECT revision AS revision FROM rule_set WHERE id = 1')
        .get() as { revision: number } | undefined;
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new RuleRevisionConflictError(expectedRevision, currentRevision);
      }
      const nextRevision = currentRevision + 1;
      this.db
        .prepare(
          `INSERT INTO rule_set (id, revision, rules_json, updated_at)
           VALUES (1, :revision, :rulesJson, :updatedAt)
           ON CONFLICT(id) DO UPDATE SET
             revision = :revision, rules_json = :rulesJson, updated_at = :updatedAt`,
        )
        .run({
          revision: nextRevision,
          rulesJson: JSON.stringify(rules),
          updatedAt: Date.now(),
        });
      return { revision: nextRevision, rules: [...rules] };
    });
  }

  /**
   * 记录一批规则命中审计到 rule_hit 表（同事务）；空数组不写。
   * 调用方：Storage Worker 处理 append-rule-hits（proxy-service 关联 exchange 后）。
   */
  appendRuleHits(exchangeId: string, hits: readonly RuleHitInput[]): void {
    if (hits.length === 0) {
      return;
    }
    this.inTransaction(() => {
      for (const hit of hits) {
        this.insertRuleHitStmt.run({
          exchangeId,
          ruleId: hit.ruleId,
          ruleRevision: hit.ruleRevision,
          phase: hit.phase,
          action: hit.action,
          summary: hit.summary ?? null,
          createdAt: Date.now(),
        });
      }
    });
  }

  /**
   * 按 ruleId 聚合 rule_hit 表的累计命中次数；无命中的规则不在结果中（调用方按 0 处理）。
   * 调用方：rules.hits handler，供 Rules UI 的 hit counter 展示。
   */
  countRuleHits(): RuleHitCount[] {
    const rows = this.db
      .prepare(
        `SELECT rule_id AS ruleId, COUNT(*) AS count
         FROM rule_hit
         GROUP BY rule_id`,
      )
      .all() as { ruleId: string; count: number }[];
    return rows.map((row) => ({ ruleId: row.ruleId, count: row.count }));
  }

  /** 关闭底层数据库连接；调用方：Storage Worker 优雅退出。 */
  close(): void {
    this.db.close();
  }

  private insertHeaders(
    exchangeId: string,
    headers: readonly HeaderInput[],
  ): void {
    headers.forEach((header, ordinal) => {
      this.insertHeaderStmt.run({
        exchangeId,
        kind: header.kind,
        ordinal,
        name: header.name,
        value: header.value,
        isPseudo: header.isPseudo ? 1 : 0,
      });
    });
  }

  private toExchangeBindings(
    input: ExchangeInput,
    seq: number,
    requestBodyId: string | null,
    responseBodyId: string | null,
  ): Record<string, string | number | null> {
    return {
      id: input.id,
      sessionId: input.sessionId,
      connectionId: input.connectionId ?? null,
      seq,
      streamId: input.streamId ?? null,
      method: input.method,
      scheme: input.scheme ?? null,
      host: input.host ?? null,
      port: input.port ?? null,
      path: input.path ?? null,
      url: input.url,
      protocol: input.protocol,
      statusCode: input.statusCode ?? null,
      statusText: input.statusText ?? null,
      requestMime: input.requestMime ?? null,
      responseMime: input.responseMime ?? null,
      processName: input.processName ?? null,
      startedAt: input.startedAt,
      requestSentAt: input.requestSentAt ?? null,
      responseStartedAt: input.responseStartedAt ?? null,
      completedAt: input.completedAt ?? null,
      requestBytes: input.requestBytes ?? 0,
      responseBytes: input.responseBytes ?? 0,
      requestBodyId,
      responseBodyId,
      state: input.state,
      errorCode: input.errorCode ?? null,
    };
  }

  /**
   * 插入一条 body_ref 并返回其 id；未提供正文引用时返回 null。
   * 调用方：appendExchanges 在同事务内先于 exchange 插入，满足外键顺序。
   */
  private insertBodyRef(body: BodyRefInput | undefined): string | null {
    if (!body) {
      return null;
    }
    this.insertBodyRefStmt.run({
      id: body.id,
      blobHash: body.blobHash ?? null,
      encodedSize: body.encodedSize,
      decodedSize: body.decodedSize ?? null,
      contentEncoding: body.contentEncoding ?? null,
      mediaType: body.mediaType ?? null,
      truncated: body.truncated ? 1 : 0,
      decodeStatus: body.decodeStatus ?? 'ok',
      createdAt: Date.now(),
    });
    return body.id;
  }

  private appendFilterConditions(
    filter: SessionQuery['filter'],
    conditions: string[],
    params: Record<string, string | number>,
  ): void {
    if (filter.host) {
      conditions.push('e.host = :host');
      params.host = filter.host;
    }
    if (filter.method) {
      conditions.push('e.method = :method');
      params.method = filter.method.toUpperCase();
    }
    if (typeof filter.status === 'number') {
      conditions.push('e.status_code = :status');
      params.status = filter.status;
    }
    if (filter.mime) {
      conditions.push("e.response_mime LIKE :mime ESCAPE '\\'");
      params.mime = `${escapeLike(filter.mime)}%`;
    }
    if (filter.process) {
      conditions.push('e.process_name = :process');
      params.process = filter.process;
    }
    if (filter.search) {
      conditions.push(
        'e.id IN (SELECT exchange_id FROM exchange_fts WHERE exchange_fts MATCH :search)',
      );
      params.search = toMatchQuery(filter.search);
    }
  }

  private deleteOrphanBodyRefs(): void {
    this.db.exec(
      `DELETE FROM body_ref WHERE id NOT IN (
         SELECT request_body_id FROM exchange WHERE request_body_id IS NOT NULL
         UNION SELECT response_body_id FROM exchange WHERE response_body_id IS NOT NULL
         UNION SELECT payload_body_id FROM websocket_frame WHERE payload_body_id IS NOT NULL
       )`,
    );
  }

  private scalar(
    sql: string,
    params?: Record<string, string | number>,
  ): number {
    const stmt = this.db.prepare(sql);
    const row = (params ? stmt.get(params) : stmt.get()) as { value: number };
    return row.value;
  }

  private inTransaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // 事务可能已自动回滚；保留原始错误。
      }
      throw error;
    }
  }
}

function encodeCursor(startedAt: number, seq: number): string {
  return Buffer.from(`${startedAt}:${seq}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): KeysetCursor | null {
  if (cursor === undefined) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  const match = /^(\d+):(\d+)$/.exec(decoded);
  if (!match) {
    throw new InvalidCursorError();
  }
  const startedAt = Number(match[1]);
  const seq = Number(match[2]);
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(seq)) {
    throw new InvalidCursorError();
  }
  return { startedAt, seq };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * 把用户关键字转为安全的 FTS5 短语匹配，避免特殊字符触发语法错误或注入。
 */
function toMatchQuery(search: string): string {
  const escaped = search.replace(/"/g, '""');
  return `"${escaped}"`;
}
