/**
 * Storage 层 Core 内部域类型。
 *
 * 写入侧类型（ExchangeInput 等）只在 Proxy Core 进程内流转，不是 wire 协议。
 * 查询返回的 Exchange 摘要直接复用 core-protocol 的 CaptureExchangeSummary，
 * 使分页查询与实时事件共用同一行结构，避免重复定义。
 */

import type { CaptureExchangeSummary } from '@interceptor/core-protocol';

export type ExchangeState =
  | 'pending'
  | 'request-complete'
  | 'completed'
  | 'failed'
  | 'aborted';

export type HeaderKind =
  | 'request'
  | 'response'
  | 'request-trailer'
  | 'response-trailer';

export interface HeaderInput {
  readonly kind: HeaderKind;
  readonly name: string;
  readonly value: string;
  readonly isPseudo?: boolean;
}

export type BodyDecodeStatus = 'ok' | 'failed' | 'skipped';

/**
 * 一段正文的内容寻址引用。写入 Blob Store 后由代理数据面提供，
 * appendExchanges 会据此插入 body_ref 行并绑定到 Exchange 的 body id。
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

/**
 * 追加一条 Exchange 时由上游（M3 代理数据面）提供的字段。
 * `seq` 由 Storage Worker 分配，不由调用方提供。
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
  readonly processName?: string;
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
  readonly headers?: readonly HeaderInput[];
  /** 请求/响应正文引用；提供时 appendExchanges 会插入 body_ref 并绑定 body id。 */
  readonly requestBody?: BodyRefInput;
  readonly responseBody?: BodyRefInput;
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
  readonly host?: string;
  readonly method?: string;
  readonly status?: number;
  readonly mime?: string;
  readonly process?: string;
  readonly search?: string;
}

export interface SessionQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly sort: 'started_desc' | 'started_asc';
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

export type CleanupScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'session'; readonly sessionId: string };

export interface CleanupResult {
  readonly removedSessions: number;
  readonly removedExchanges: number;
  /** 清理后仍被引用的 blob hash 集合，供 Blob GC 计算可删除文件。 */
  readonly referencedBlobHashes: string[];
}

/** 一条规则命中审计（M7/T7.7）；由 rule-engine 产出，proxy-service 关联 exchange 后落 rule_hit 表。 */
export interface RuleHitInput {
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly phase: 'request' | 'response';
  readonly action: string;
  readonly summary?: string;
}

/** 单条规则的累计命中次数（按 ruleId 聚合 rule_hit 表）；供 Rules UI hit counter。 */
export interface RuleHitCount {
  readonly ruleId: string;
  readonly count: number;
}
