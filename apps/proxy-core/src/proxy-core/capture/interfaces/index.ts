/**
 * Capture 层 Core 内部域类型。
 *
 * 写入侧类型（ExchangeInput 等）只在 Proxy Core 进程内流转，不是 wire 协议。
 * 查询返回的 Exchange 摘要直接复用 core-protocol 的 CaptureExchangeSummary，
 * 使分页查询与实时事件共用同一行结构，避免重复定义。
 */

import type {
  CaptureExchangeDetail,
  CaptureExchangeSummary,
  CaptureHeaderRuleEffect,
  WebSocketFrameSummary,
} from "@interceptor/core-protocol";

export type ExchangeState =
  | "pending"
  | "request-complete"
  | "response-streaming"
  | "completed"
  | "failed"
  | "aborted";

export type HeaderKind =
  "request" | "response" | "request-trailer" | "response-trailer";

export interface HeaderInput {
  readonly kind: HeaderKind;
  readonly name: string;
  readonly value: string;
  readonly isPseudo?: boolean;
  readonly ruleEffect?: CaptureHeaderRuleEffect;
  readonly ruleId?: string;
}

export type BodyDecodeStatus = "ok" | "failed" | "skipped";

export type CaptureBodySide = 'request' | 'response';

/** 同一Exchange/side当前可读的正文状态，内容hash只在提交后存在。 */
export interface CaptureBodySnapshot {
  readonly bodyHash?: string;
  readonly encodedSize: number;
  readonly available: boolean;
  readonly complete: boolean;
}

/**
 * 一段正文的内容寻址引用。写入 BodyStore 后由代理数据面提供，
 * appendExchanges 据此把 hash metadata 绑定到内存 Exchange。
 */
export interface BodyRefInput {
  readonly id: string;
  /** 内容哈希；空正文或被省略时为 undefined。 */
  readonly blobHash?: string;
  readonly encodedSize: number;
  readonly decodedSize?: number;
  readonly contentEncoding?: string;
  readonly mediaType?: string;
  readonly truncated?: boolean;
  readonly decodeStatus?: BodyDecodeStatus;
}

/** Capture内部正文证据；Original仍保留带id的BodyRefInput供存储与Archive引用。 */
export interface BodyRuleEffectInput {
  readonly ruleId: string;
  readonly effect: 'replace';
  readonly source: 'text' | 'file';
  readonly originalState: 'available' | 'empty' | 'unavailable';
  readonly originalBody?: BodyRefInput;
}

/**
 * 追加一条 Exchange 时由上游（M3 代理数据面）提供的字段。
 * `seq` 由 ExchangeStore 分配，不由调用方提供。
 */
export interface ExchangeInput {
  readonly id: string;
  readonly sessionId: string;
  readonly connectionId?: string;
  readonly streamId?: number;
  readonly method: string;
  readonly scheme?: string;
  readonly host?: string;
  readonly port?: number;
  readonly path?: string;
  readonly url: string;
  readonly protocol: string;
  readonly statusCode?: number;
  readonly statusText?: string;
  readonly requestMime?: string;
  readonly responseMime?: string;
  /** 发起该请求的本机应用 id（可执行文件路径派生）。 */
  readonly appId?: string;
  /** 发起该请求的本机应用展示名。 */
  readonly appName?: string;
  readonly startedAt: number;
  readonly requestSentAt?: number;
  readonly responseStartedAt?: number;
  readonly completedAt?: number;
  readonly requestBytes?: number;
  readonly responseBytes?: number;
  readonly requestBodyId?: string;
  readonly responseBodyId?: string;
  readonly state: ExchangeState;
  readonly errorCode?: string;
  /** 实际执行过 action 的规则 id，按首次命中顺序去重。 */
  readonly ruleIds?: readonly string[];
  readonly headers?: readonly HeaderInput[];
  /** 请求/响应正文引用；提供时 appendExchanges 会绑定临时 hash metadata。 */
  readonly requestBody?: BodyRefInput;
  readonly responseBody?: BodyRefInput;
  readonly requestBodyEffect?: BodyRuleEffectInput;
  readonly responseBodyEffect?: BodyRuleEffectInput;
}

export type WebSocketFrameDirection = "client-to-server" | "server-to-client";

/** WebSocket 应用消息子记录；payload 先写 BodyStore，再绑定到帧 metadata。 */
export interface WebSocketFrameInput {
  readonly direction: WebSocketFrameDirection;
  readonly opcode: 1 | 2 | 8;
  readonly payloadSize: number;
  readonly timestamp: number;
  readonly payload?: BodyRefInput;
}

export interface WebSocketFrameQuery {
  readonly exchangeId: string;
  readonly cursor?: string;
  readonly limit: number;
  readonly direction?: WebSocketFrameDirection;
}

export interface WebSocketFramePage {
  readonly items: WebSocketFrameSummary[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

export interface CaptureSessionInput {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  readonly captureMode: string;
  readonly appVersion: string;
  readonly ruleSetRevision?: number;
}

export interface SessionQueryFilter {
  readonly sessionId?: string;
  readonly host?: string;
  readonly method?: string;
  readonly status?: number;
  readonly mime?: string;
  /** 按发起流量的本机应用展示名筛选。 */
  readonly appName?: string;
  readonly search?: string;
  readonly protocol?: "h1" | "h2" | "ws";
}

export interface SessionQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly sort: "started_desc" | "started_asc";
  readonly filter: SessionQueryFilter;
}

export interface SessionQueryPage {
  readonly items: CaptureExchangeSummary[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

export interface StorageStats {
  readonly sessionCount: number;
  readonly exchangeCount: number;
  readonly databaseBytes: number;
  readonly bodyRefCount: number;
  readonly referencedBodyBytes: number;
}

/** Core 内单条临时 Exchange 记录；详情与排序序号只保存一份。 */
export interface TemporaryExchangeRecord {
  readonly seq: number;
  readonly exchange: ExchangeInput;
}

/** Core 内单条临时 WebSocket frame 记录。 */
export interface TemporaryWebSocketFrameRecord extends WebSocketFrameInput {
  readonly seq: number;
}

/** Native archive 导出使用的不可变单 Exchange 快照。 */
export interface CaptureSnapshotExchange {
  readonly exchange: ExchangeInput;
  readonly frames: readonly WebSocketFrameInput[];
}

/** 发送给一次性 Archive Worker 的有界 Capture 快照批次。 */
export interface CaptureSnapshotBatch {
  /** 仅首批携带 Session 元数据。 */
  readonly sessions: readonly CaptureSessionInput[];
  readonly exchanges: readonly CaptureSnapshotExchange[];
}

/** Archive 导出在点击时捕获的 request 与 Body hash 时间切面。 */
export interface CaptureArchiveSnapshot {
  readonly bodyHashes: readonly string[];
  readonly batches: AsyncIterable<CaptureSnapshotBatch>;
}

export type CleanupScope =
  | { readonly kind: "all" }
  | { readonly kind: "all-except-session"; readonly sessionId: string }
  | { readonly kind: "session"; readonly sessionId: string };

export interface CleanupResult {
  readonly removedSessions: number;
  readonly removedExchanges: number;
  /** 清理后仍被引用的 blob hash 集合，供 Blob GC 计算可删除文件。 */
  readonly referencedBlobHashes: string[];
}

/** 一条规则命中审计；由 rule-engine 产出，proxy-service 关联 exchange 后交给 Capture Store。 */
export interface RuleHitInput {
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly phase: "request" | "response";
  readonly action: string;
  readonly summary?: string;
}

/** 单条规则命中的请求数（按 Rule × Exchange 去重）；供 Rules UI hit counter。 */
export interface RuleHitCount {
  readonly ruleId: string;
  readonly count: number;
}

/**
 * 对已存在 Exchange 的增量更新。除 `id` 外全部可选，未提供的字段保持原值；
 * `headers` 为追加语义，`ruleIds` 按首次出现顺序去重合并。
 */
export interface ExchangePatch {
  readonly id: string;
  readonly state?: ExchangeInput["state"];
  readonly requestMime?: string;
  readonly requestSentAt?: number;
  readonly requestBytes?: number;
  readonly requestBodyId?: string;
  readonly appId?: string;
  readonly appName?: string;
  readonly statusCode?: number;
  readonly statusText?: string;
  readonly responseMime?: string;
  readonly responseStartedAt?: number;
  readonly responseBytes?: number;
  readonly responseBodyId?: string;
  readonly completedAt?: number;
  readonly errorCode?: string;
  readonly headers?: readonly HeaderInput[];
  readonly ruleIds?: readonly string[];
  readonly requestBody?: BodyRefInput;
  readonly responseBody?: BodyRefInput;
  readonly requestBodyEffect?: BodyRuleEffectInput;
  readonly responseBodyEffect?: BodyRuleEffectInput;
}

export interface CaptureStatusReport {
  readonly sessionCount: number;
  readonly exchangeCount: number;
  readonly bodyCount: number;
  readonly databaseBytes: number;
  readonly blobBytes: number;
  readonly totalBytes: number;
}

export interface BlobWriteResult {
  readonly hash: string;
  readonly size: number;
  readonly deduplicated: boolean;
}

export interface BlobGcResult {
  readonly removedBlobs: number;
  readonly freedBytes: number;
}

/** BodyStore 中驻内存的内容寻址正文。 */
export interface TemporaryMemoryBodyEntry {
  readonly kind: "memory";
  readonly hash: string;
  readonly size: number;
  readonly data: Buffer;
}

/** BodyStore 中 spill 到 Core 临时目录的正文。 */
export interface TemporarySpillBodyEntry {
  readonly kind: "spill";
  readonly hash: string;
  readonly size: number;
  readonly filePath: string;
}

/** BodyStore 的正文位置索引。 */
export type TemporaryBodyEntry =
  TemporaryMemoryBodyEntry | TemporarySpillBodyEntry;

export interface StorageKeysetCursor {
  readonly startedAt: number;
  readonly seq: number;
}
