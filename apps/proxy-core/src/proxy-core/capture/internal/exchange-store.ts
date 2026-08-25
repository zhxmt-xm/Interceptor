import type {
  CaptureBodyRef,
  CaptureBodyRuleEffect,
  CaptureExchangeDetail,
  CaptureExchangeSummary,
  CaptureHeader,
} from '@interceptor/core-protocol';

import type {
  BodyRefInput,
  BodyRuleEffectInput,
  CaptureSessionInput,
  CaptureSnapshotBatch,
  CaptureSnapshotExchange,
  CleanupResult,
  CleanupScope,
  ExchangeInput,
  ExchangePatch,
  HeaderInput,
  RuleHitCount,
  RuleHitInput,
  SessionQuery,
  SessionQueryPage,
  StorageStats,
  TemporaryExchangeRecord,
  TemporaryWebSocketFrameRecord,
  WebSocketFrameInput,
  WebSocketFramePage,
  WebSocketFrameQuery,
} from '../interfaces';
import * as StorageUtils from '../utils';

/** 当前 Recording 的 Core 内存数据层；不创建数据库或常驻 Worker。 */
export class ExchangeStore {
  /** Session id 到元数据。 */
  private readonly sessions = new Map<string, CaptureSessionInput>();
  /** Exchange id 到唯一可变记录。 */
  private readonly exchanges = new Map<string, TemporaryExchangeRecord>();
  /** body id 到只含 metadata/hash 的正文引用。 */
  private readonly bodyRefs = new Map<string, BodyRefInput>();
  /** Exchange id 到有序 WebSocket frame。 */
  private readonly webSocketFrames = new Map<
    string,
    TemporaryWebSocketFrameRecord[]
  >();
  /** Exchange id 到在该 Exchange 上执行过 action 的规则集合。 */
  private readonly ruleHitsByExchange = new Map<string, Set<string>>();
  /** 下一个全局 Exchange sequence。 */
  private nextSeq = 1;
  /** 按 startedAt/seq 升序的惰性索引缓存。 */
  private orderedIndex: TemporaryExchangeRecord[] = [];
  /** 新增 Exchange 后标记排序索引需要重建。 */
  private orderedIndexDirty = false;

  /** 幂等登记一个临时 Capture Session。 */
  ensureSession(session: CaptureSessionInput): void {
    if (!this.sessions.has(session.id)) {
      this.sessions.set(session.id, { ...session });
    }
  }

  /** 批量追加 Exchange、header 与 body metadata，并分配稳定 sequence。 */
  appendExchanges(
    inputs: readonly ExchangeInput[],
  ): { id: string; seq: number }[] {
    const assigned: { id: string; seq: number }[] = [];
    for (const input of inputs) {
      if (!this.sessions.has(input.sessionId)) {
        throw new Error(`Capture session '${input.sessionId}' does not exist.`);
      }
      if (this.exchanges.has(input.id)) {
        throw new Error(`Exchange '${input.id}' already exists.`);
      }
      this.storeBodyRef(input.requestBody);
      this.storeBodyRef(input.responseBody);
      this.storeBodyEffect(input.requestBodyEffect);
      this.storeBodyEffect(input.responseBodyEffect);
      const seq = this.nextSeq++;
      this.exchanges.set(input.id, {
        seq,
        exchange: this.copyExchange(input),
      });
      assigned.push({ id: input.id, seq });
    }
    if (inputs.length > 0) {
      this.orderedIndexDirty = true;
    }
    return assigned;
  }

  /** 增量更新 Exchange；未提供的字段保持原值，headers 追加、ruleIds 去重合并。 */
  updateExchange(patch: ExchangePatch): void {
    const record = this.exchanges.get(patch.id);
    if (!record) {
      return;
    }
    this.storeBodyRef(patch.requestBody);
    this.storeBodyRef(patch.responseBody);
    this.storeBodyEffect(patch.requestBodyEffect);
    this.storeBodyEffect(patch.responseBodyEffect);
    const exchange: ExchangeInput = {
      ...record.exchange,
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.requestMime !== undefined
        ? { requestMime: patch.requestMime }
        : {}),
      ...(patch.requestSentAt !== undefined
        ? { requestSentAt: patch.requestSentAt }
        : {}),
      ...(patch.requestBytes !== undefined
        ? { requestBytes: patch.requestBytes }
        : {}),
      ...(patch.requestBodyId !== undefined
        ? { requestBodyId: patch.requestBodyId }
        : {}),
      ...(patch.requestBody !== undefined ? { requestBody: patch.requestBody } : {}),
      ...(patch.requestBodyEffect !== undefined
        ? { requestBodyEffect: patch.requestBodyEffect }
        : {}),
      ...(patch.appId !== undefined ? { appId: patch.appId } : {}),
      ...(patch.appName !== undefined ? { appName: patch.appName } : {}),
      ...(patch.statusCode !== undefined ? { statusCode: patch.statusCode } : {}),
      ...(patch.statusText !== undefined ? { statusText: patch.statusText } : {}),
      ...(patch.responseMime !== undefined
        ? { responseMime: patch.responseMime }
        : {}),
      ...(patch.responseStartedAt !== undefined
        ? { responseStartedAt: patch.responseStartedAt }
        : {}),
      ...(patch.responseBytes !== undefined
        ? { responseBytes: patch.responseBytes }
        : {}),
      ...(patch.responseBodyId !== undefined
        ? { responseBodyId: patch.responseBodyId }
        : {}),
      ...(patch.responseBody !== undefined ? { responseBody: patch.responseBody } : {}),
      ...(patch.responseBodyEffect !== undefined
        ? { responseBodyEffect: patch.responseBodyEffect }
        : {}),
      ...(patch.completedAt !== undefined
        ? { completedAt: patch.completedAt }
        : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      headers: patch.headers
        ? [
            ...(record.exchange.headers ?? []),
            ...patch.headers.map((header) => ({ ...header })),
          ]
        : record.exchange.headers,
      ruleIds: patch.ruleIds
        ? [...new Set([...(record.exchange.ruleIds ?? []), ...patch.ruleIds])]
        : record.exchange.ruleIds,
    };
    this.exchanges.set(patch.id, { seq: record.seq, exchange });
    this.orderedIndexDirty = true;
  }

  /** 用稳定时间/sequence cursor 分页查询轻量摘要。 */
  querySessions(query: SessionQuery): SessionQueryPage {
    const ordered = this.getOrderedIndex();
    const cursor = StorageUtils.decodeStorageCursor(query.cursor);
    let index = cursor
      ? this.findCursorBoundary(ordered, cursor.startedAt, cursor.seq, query.sort)
      : query.sort === 'started_asc'
        ? 0
        : ordered.length - 1;
    const step = query.sort === 'started_asc' ? 1 : -1;
    const items: CaptureExchangeSummary[] = [];
    let hasMore = false;

    while (index >= 0 && index < ordered.length) {
      const record = ordered[index];
      index += step;
      if (!record || !this.matches(record.exchange, query)) {
        continue;
      }
      if (items.length === query.limit) {
        hasMore = true;
        break;
      }
      items.push(this.toSummary(record.exchange));
    }

    const last = items.at(-1);
    const lastRecord = last ? this.exchanges.get(last.id) : undefined;
    return {
      items,
      nextCursor:
        hasMore && lastRecord
          ? StorageUtils.encodeStorageCursor(
              lastRecord.exchange.startedAt,
              lastRecord.seq,
            )
          : undefined,
      hasMore,
    };
  }

  /** 返回单条完整 detail，但不读取 body 字节。 */
  getExchangeDetail(id: string): CaptureExchangeDetail | null {
    const record = this.exchanges.get(id);
    if (!record) {
      return null;
    }
    const exchange = record.exchange;
    const headers = exchange.headers ?? [];
    return {
      summary: this.toSummary(exchange),
      url: exchange.url,
      scheme: exchange.scheme,
      port: exchange.port,
      responseStartedAt: exchange.responseStartedAt,
      completedAt: exchange.completedAt,
      statusText: exchange.statusText,
      requestMime: exchange.requestMime,
      errorCode: exchange.errorCode,
      streamId: exchange.streamId,
      requestHeaders: this.headersFor(headers, 'request'),
      responseHeaders: this.headersFor(headers, 'response'),
      requestTrailers: this.headersFor(headers, 'request-trailer'),
      responseTrailers: this.headersFor(headers, 'response-trailer'),
      requestBody: this.readBodyRef(
        exchange.requestBody?.id ?? exchange.requestBodyId,
      ),
      responseBody: this.readBodyRef(
        exchange.responseBody?.id ?? exchange.responseBodyId,
      ),
      requestBodyEffect: this.readBodyEffect(exchange.requestBodyEffect),
      responseBodyEffect: this.readBodyEffect(exchange.responseBodyEffect),
    };
  }

  /** 追加 WebSocket frames，并给每个 Exchange 分配单调 frame sequence。 */
  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): number[] {
    if (!this.exchanges.has(exchangeId)) {
      throw new Error(`Exchange '${exchangeId}' does not exist.`);
    }
    const target = [...(this.webSocketFrames.get(exchangeId) ?? [])];
    let nextSeq = (target.at(-1)?.seq ?? 0) + 1;
    const sequences: number[] = [];
    for (const frame of frames) {
      this.storeBodyRef(frame.payload);
      const seq = nextSeq++;
      target.push({
        ...frame,
        payload: frame.payload ? { ...frame.payload } : undefined,
        seq,
      });
      sequences.push(seq);
    }
    this.webSocketFrames.set(exchangeId, target);
    return sequences;
  }

  /** 按 frame sequence 升序分页，不加载 payload 字节。 */
  queryWebSocketFrames(query: WebSocketFrameQuery): WebSocketFramePage {
    const cursor = StorageUtils.decodeWebSocketCursor(query.cursor);
    const frames = this.webSocketFrames.get(query.exchangeId) ?? [];
    const items = [];
    let hasMore = false;
    let lastSeq: number | undefined;

    for (const frame of frames) {
      if (
        frame.seq <= cursor
        || frame.opcode === 8
        || (query.direction && frame.direction !== query.direction)
      ) {
        continue;
      }
      if (items.length === query.limit) {
        hasMore = true;
        break;
      }
      lastSeq = frame.seq;
      items.push({
        seq: frame.seq,
        direction: frame.direction,
        opcode: frame.opcode,
        timestamp: frame.timestamp,
        payloadSize: frame.payloadSize,
        ...(frame.payload
          ? { payload: this.toCaptureBodyRef(frame.payload) }
          : {}),
      });
    }

    return {
      items,
      nextCursor:
        lastSeq !== undefined
          ? StorageUtils.encodeWebSocketCursor(lastSeq)
          : query.cursor,
      hasMore,
    };
  }

  /**
   * 登记当前 Recording 的 RuleHit 审计。
   * 同一 Exchange 上同一条规则只记一次，因为命中数的语义是“拦到多少个请求”，
   * 而不是“执行了多少个 action”（一条规则可以有多个 action）。
   */
  appendRuleHits(
    exchangeId: string,
    hits: readonly RuleHitInput[],
  ): void {
    const record = this.exchanges.get(exchangeId);
    if (!record) {
      throw new Error(`Exchange '${exchangeId}' does not exist.`);
    }
    const matchedRules = this.ruleHitsByExchange.get(exchangeId) ?? new Set<string>();
    const ruleIds = new Set(record.exchange.ruleIds ?? []);
    for (const hit of hits) {
      matchedRules.add(hit.ruleId);
      ruleIds.add(hit.ruleId);
    }
    this.ruleHitsByExchange.set(exchangeId, matchedRules);
    this.exchanges.set(exchangeId, {
      seq: record.seq,
      exchange: { ...record.exchange, ruleIds: [...ruleIds] },
    });
    this.orderedIndexDirty = true;
  }

  /** 返回当前 Recording 里每条规则命中的请求数。 */
  countRuleHits(): RuleHitCount[] {
    const totals = new Map<string, number>();
    for (const matchedRules of this.ruleHitsByExchange.values()) {
      for (const ruleId of matchedRules) {
        totals.set(ruleId, (totals.get(ruleId) ?? 0) + 1);
      }
    }
    return Array.from(totals, ([ruleId, count]) => ({ ruleId, count }));
  }

  /** 返回当前 Store 的临时统计；不再存在 Capture database bytes。 */
  getStorageStats(): StorageStats {
    return {
      sessionCount: this.sessions.size,
      exchangeCount: this.exchanges.size,
      databaseBytes: 0,
      bodyRefCount: this.bodyRefs.size,
      referencedBodyBytes: Array.from(this.bodyRefs.values()).reduce(
        (total, body) => total + (body.blobHash ? body.encodedSize : 0),
        0,
      ),
    };
  }

  /** 按 Recording 生命周期删除临时数据，并返回仍引用的 body hash。 */
  cleanup(scope: CleanupScope): CleanupResult {
    const removedSessions = this.countRemovedSessions(scope);
    let removedExchanges = 0;
    for (const [id, record] of this.exchanges) {
      if (this.shouldRemoveExchange(record.exchange, scope)) {
        this.exchanges.delete(id);
        this.webSocketFrames.delete(id);
        this.ruleHitsByExchange.delete(id);
        removedExchanges += 1;
      }
    }

    if (scope.kind === 'all') {
      this.sessions.clear();
    } else if (scope.kind === 'all-except-session') {
      for (const id of this.sessions.keys()) {
        if (id !== scope.sessionId) {
          this.sessions.delete(id);
        }
      }
    } else {
      this.sessions.delete(scope.sessionId);
    }

    this.rebuildBodyRefs();
    this.orderedIndexDirty = true;
    return {
      removedSessions,
      removedExchanges,
      referencedBlobHashes: this.referencedBlobHashes(),
    };
  }

  /** 返回 Capture 仍引用的去重 body hash。 */
  referencedBlobHashes(): string[] {
    return Array.from(
      new Set(
        Array.from(this.bodyRefs.values())
          .map((body) => body.blobHash)
          .filter((hash): hash is string => Boolean(hash)),
      ),
    );
  }

  /**
   * 捕获 copy-on-write 引用时间切面，并按固定数量深复制给一次性 Archive Worker。
   * 活动 Recording 后续更新会替换 record/frame array，不会污染已捕获引用。
   */
  createSnapshotSource(batchSize: number): {
    bodyHashes: readonly string[];
    batches: AsyncIterable<CaptureSnapshotBatch>;
  } {
    const sessions = Array.from(
      this.sessions.values(),
      (session) => ({ ...session }),
    );
    const records = [...this.getOrderedIndex()];
    const frames = new Map(this.webSocketFrames);
    const bodyHashes = this.bodyHashesForSnapshot(records, frames);
    return {
      bodyHashes,
      batches: this.snapshotBatches(batchSize, sessions, records, frames),
    };
  }

  /** 按固定数量深复制已捕获的 copy-on-write 引用。 */
  private async *snapshotBatches(
    batchSize: number,
    sessions: readonly CaptureSessionInput[],
    records: readonly TemporaryExchangeRecord[],
    frames: ReadonlyMap<string, readonly TemporaryWebSocketFrameRecord[]>,
  ): AsyncIterable<CaptureSnapshotBatch> {
    for (let offset = 0; offset < records.length || offset === 0; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      yield {
        sessions: offset === 0 ? sessions : [],
        exchanges: batch.map((record) => ({
          exchange: this.copyExchange(record.exchange),
          frames: (frames.get(record.exchange.id) ?? []).map((frame) => ({
            direction: frame.direction,
            opcode: frame.opcode,
            payloadSize: frame.payloadSize,
            timestamp: frame.timestamp,
            payload: frame.payload ? { ...frame.payload } : undefined,
          })),
        })),
      };
      if (records.length === 0) {
        break;
      }
    }
  }

  /** 从同一记录/frame 时间切面枚举去重 Body hash。 */
  private bodyHashesForSnapshot(
    records: readonly TemporaryExchangeRecord[],
    frames: ReadonlyMap<string, readonly TemporaryWebSocketFrameRecord[]>,
  ): string[] {
    const hashes = new Set<string>();
    for (const record of records) {
      const requestHash = record.exchange.requestBody?.blobHash;
      const responseHash = record.exchange.responseBody?.blobHash;
      const requestOriginalHash = record.exchange.requestBodyEffect?.originalBody?.blobHash;
      const responseOriginalHash = record.exchange.responseBodyEffect?.originalBody?.blobHash;
      if (requestHash) hashes.add(requestHash);
      if (responseHash) hashes.add(responseHash);
      if (requestOriginalHash) hashes.add(requestOriginalHash);
      if (responseOriginalHash) hashes.add(responseOriginalHash);
      for (const frame of frames.get(record.exchange.id) ?? []) {
        if (frame.payload?.blobHash) hashes.add(frame.payload.blobHash);
      }
    }
    return [...hashes];
  }

  /** 释放 Store 中全部临时对象。 */
  clear(): void {
    this.sessions.clear();
    this.exchanges.clear();
    this.bodyRefs.clear();
    this.webSocketFrames.clear();
    this.ruleHitsByExchange.clear();
    this.orderedIndex = [];
    this.orderedIndexDirty = false;
    this.nextSeq = 1;
  }

  /** 将正文 metadata 复制进唯一 body id 索引。 */
  private storeBodyRef(body: BodyRefInput | undefined): void {
    if (body) {
      this.bodyRefs.set(body.id, { ...body });
    }
  }

  /** 将effect携带的Original正文登记到统一body索引。 */
  private storeBodyEffect(effect: BodyRuleEffectInput | undefined): void {
    this.storeBodyRef(effect?.originalBody);
  }

  /** 读取正文 metadata 并映射到公开 DTO。 */
  private readBodyRef(id: string | undefined): CaptureBodyRef | undefined {
    const body = id ? this.bodyRefs.get(id) : undefined;
    return body ? this.toCaptureBodyRef(body) : undefined;
  }

  /** 映射内部 BodyRefInput 到公开 CaptureBodyRef。 */
  private toCaptureBodyRef(body: BodyRefInput): CaptureBodyRef {
    return {
      bodyHash: body.blobHash,
      mediaType: body.mediaType,
      contentEncoding: body.contentEncoding,
      encodedSize: body.encodedSize,
      decodedSize: body.decodedSize,
      truncated: body.truncated ?? false,
      decodeStatus: body.decodeStatus ?? 'ok',
    };
  }

  /** 映射内部Body effect，并通过统一索引解析Original引用。 */
  private readBodyEffect(effect: BodyRuleEffectInput | undefined): CaptureBodyRuleEffect | undefined {
    if (!effect) {
      return undefined;
    }
    const originalBody = this.readBodyRef(effect.originalBody?.id);
    return {
      ruleId: effect.ruleId,
      effect: effect.effect,
      source: effect.source,
      originalState: effect.originalState,
      ...(originalBody ? { originalBody } : {}),
    };
  }

  /** 按 header kind 复制公开 header 列表。 */
  private headersFor(
    headers: readonly HeaderInput[],
    kind: HeaderInput['kind'],
  ): CaptureHeader[] {
    return headers
      .filter((header) => header.kind === kind)
      .map((header) => ({
        name: header.name,
        value: header.value,
        ...(header.isPseudo ? { isPseudo: true } : {}),
        ...(header.ruleEffect ? { ruleEffect: header.ruleEffect } : {}),
        ...(header.ruleId ? { ruleId: header.ruleId } : {}),
      }));
  }

  /** 映射完整 Exchange 到列表摘要。 */
  private toSummary(exchange: ExchangeInput): CaptureExchangeSummary {
    return {
      id: exchange.id,
      method: exchange.method,
      secure: exchange.scheme === 'https' || exchange.scheme === 'wss',
      host: exchange.host,
      path: exchange.path,
      protocol: exchange.protocol,
      statusCode: exchange.statusCode,
      responseMime: exchange.responseMime,
      state: exchange.state,
      startedAt: exchange.startedAt,
      durationMs:
        exchange.completedAt !== undefined
          ? Math.max(0, exchange.completedAt - exchange.startedAt)
          : undefined,
      requestBytes: exchange.requestBytes ?? 0,
      responseBytes: exchange.responseBytes ?? 0,
      ...(exchange.appId !== undefined ? { appId: exchange.appId } : {}),
      ...(exchange.appName !== undefined ? { appName: exchange.appName } : {}),
      ...(exchange.ruleIds?.length ? { ruleIds: [...exchange.ruleIds] } : {}),
    };
  }

  /** 返回按 startedAt/seq 升序的稳定惰性索引。 */
  private getOrderedIndex(): readonly TemporaryExchangeRecord[] {
    if (this.orderedIndexDirty) {
      this.orderedIndex = Array.from(this.exchanges.values()).sort(
        (left, right) =>
          left.exchange.startedAt - right.exchange.startedAt
          || left.seq - right.seq,
      );
      this.orderedIndexDirty = false;
    }
    return this.orderedIndex;
  }

  /** 从 opaque cursor 后一个位置开始，避免分页重复。 */
  private findCursorBoundary(
    ordered: readonly TemporaryExchangeRecord[],
    startedAt: number,
    seq: number,
    sort: SessionQuery['sort'],
  ): number {
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const record = ordered[middle];
      if (!record) {
        break;
      }
      const comparison = this.compareCursor(record, startedAt, seq);
      const moveRight = sort === 'started_asc'
        ? comparison <= 0
        : comparison < 0;
      if (moveRight) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return sort === 'started_asc' ? low : low - 1;
  }

  /** 比较一条有序记录与 cursor 的 `(startedAt, seq)` 元组。 */
  private compareCursor(
    record: TemporaryExchangeRecord,
    startedAt: number,
    seq: number,
  ): number {
    return record.exchange.startedAt - startedAt || record.seq - seq;
  }

  /** 判断 Exchange 是否满足当前 Session/结构化/搜索过滤。 */
  private matches(exchange: ExchangeInput, query: SessionQuery): boolean {
    const filter = query.filter;
    if (filter.sessionId && exchange.sessionId !== filter.sessionId) {
      return false;
    }
    if (filter.host && exchange.host !== filter.host) {
      return false;
    }
    if (filter.method && exchange.method.toUpperCase() !== filter.method.toUpperCase()) {
      return false;
    }
    if (filter.status !== undefined && exchange.statusCode !== filter.status) {
      return false;
    }
    if (
      filter.mime
      && !(exchange.responseMime ?? '').toLowerCase().startsWith(filter.mime.toLowerCase())
    ) {
      return false;
    }
    if (filter.appName && exchange.appName !== filter.appName) {
      return false;
    }
    if (filter.protocol && !this.matchesProtocol(exchange.protocol, filter.protocol)) {
      return false;
    }
    if (filter.search) {
      const search = filter.search.toLocaleLowerCase();
      const haystack = `${exchange.url}\n${exchange.host ?? ''}\n${exchange.method}\n${exchange.responseMime ?? ''}`
        .toLocaleLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  }

  /** 映射协议别名到 UI 分组。 */
  private matchesProtocol(
    protocol: string,
    group: NonNullable<SessionQuery['filter']['protocol']>,
  ): boolean {
    const normalized = protocol.toLowerCase();
    if (group === 'h1') {
      return ['h1', 'http/1.0', 'http/1.1'].includes(normalized);
    }
    if (group === 'h2') {
      return ['h2', 'http/2'].includes(normalized);
    }
    return normalized === 'ws' || normalized.includes('websocket');
  }

  /** 计算 cleanup 会删除的 Session 数量。 */
  private countRemovedSessions(scope: CleanupScope): number {
    if (scope.kind === 'all') {
      return this.sessions.size;
    }
    if (scope.kind === 'all-except-session') {
      return Array.from(this.sessions.keys()).filter(
        (id) => id !== scope.sessionId,
      ).length;
    }
    return this.sessions.has(scope.sessionId) ? 1 : 0;
  }

  /** 判断 cleanup 是否删除指定 Exchange。 */
  private shouldRemoveExchange(
    exchange: ExchangeInput,
    scope: CleanupScope,
  ): boolean {
    return scope.kind === 'all'
      || scope.kind === 'all-except-session'
      || exchange.sessionId === scope.sessionId;
  }

  /** 删除 cleanup 后不再被任何 Exchange/frame 引用的 body metadata。 */
  private rebuildBodyRefs(): void {
    const referenced = new Set<string>();
    for (const record of this.exchanges.values()) {
      const exchange = record.exchange;
      const requestId = exchange.requestBody?.id ?? exchange.requestBodyId;
      const responseId = exchange.responseBody?.id ?? exchange.responseBodyId;
      const requestOriginalId = exchange.requestBodyEffect?.originalBody?.id;
      const responseOriginalId = exchange.responseBodyEffect?.originalBody?.id;
      if (requestId) referenced.add(requestId);
      if (responseId) referenced.add(responseId);
      if (requestOriginalId) referenced.add(requestOriginalId);
      if (responseOriginalId) referenced.add(responseOriginalId);
    }
    for (const frames of this.webSocketFrames.values()) {
      for (const frame of frames) {
        if (frame.payload?.id) referenced.add(frame.payload.id);
      }
    }
    for (const id of this.bodyRefs.keys()) {
      if (!referenced.has(id)) {
        this.bodyRefs.delete(id);
      }
    }
  }

  /** 深复制 Exchange 的嵌套 header/body metadata。 */
  private copyExchange(exchange: ExchangeInput): ExchangeInput {
    return {
      ...exchange,
      headers: exchange.headers?.map((header) => ({ ...header })),
      requestBody: exchange.requestBody ? { ...exchange.requestBody } : undefined,
      responseBody: exchange.responseBody ? { ...exchange.responseBody } : undefined,
      requestBodyEffect: exchange.requestBodyEffect
        ? {
            ...exchange.requestBodyEffect,
            originalBody: exchange.requestBodyEffect.originalBody
              ? { ...exchange.requestBodyEffect.originalBody }
              : undefined,
          }
        : undefined,
      responseBodyEffect: exchange.responseBodyEffect
        ? {
            ...exchange.responseBodyEffect,
            originalBody: exchange.responseBodyEffect.originalBody
              ? { ...exchange.responseBodyEffect.originalBody }
              : undefined,
          }
        : undefined,
    };
  }
}
