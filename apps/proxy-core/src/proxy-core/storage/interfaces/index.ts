/**
 * Storage 层 Core 内部域类型。
 *
 * 写入侧类型（ExchangeInput 等）只在 Proxy Core 进程内流转，不是 wire 协议。
 * 查询返回的 Exchange 摘要直接复用 core-protocol 的 CaptureExchangeSummary，
 * 使分页查询与实时事件共用同一行结构，避免重复定义。
 */

import type {
  CaptureExchangeDetail,
  CaptureExchangeSummary,
  RuleDefinition,
  RuleSet,
  WebSocketFrameSummary,
} from '@interceptor/core-protocol';
import type { DatabaseSync } from 'node:sqlite';

import type { MigrationResult } from '../../migration-runner';

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

export type WebSocketFrameDirection = 'client-to-server' | 'server-to-client';

/** WebSocket 应用消息子记录；payload 先写 Blob，再随 body_ref 原子绑定到帧。 */
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
  readonly host?: string;
  readonly method?: string;
  readonly status?: number;
  readonly mime?: string;
  readonly process?: string;
  readonly search?: string;
  readonly protocol?: 'h1' | 'h2' | 'ws';
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

export interface ExchangeResponsePatch {
  readonly id: string;
  readonly statusCode?: number;
  readonly statusText?: string;
  readonly responseMime?: string;
  readonly responseStartedAt?: number;
  readonly completedAt?: number;
  readonly responseBytes?: number;
  readonly responseBodyId?: string;
  readonly state: ExchangeInput['state'];
  readonly errorCode?: string;
  readonly headers?: readonly HeaderInput[];
}

export type StorageWorkerRequest =
  | { readonly kind: 'ensure-session'; readonly session: CaptureSessionInput }
  | { readonly kind: 'append-exchanges'; readonly exchanges: ExchangeInput[] }
  | { readonly kind: 'update-exchange'; readonly patch: ExchangeResponsePatch }
  | { readonly kind: 'query-sessions'; readonly query: SessionQuery }
  | { readonly kind: 'exchange-detail'; readonly exchangeId: string }
  | { readonly kind: 'storage-status' }
  | { readonly kind: 'cleanup'; readonly scope: CleanupScope }
  | { readonly kind: 'referenced-hashes' }
  | { readonly kind: 'snapshot'; readonly targetPath: string }
  | {
      readonly kind: 'save-rule-set';
      readonly expectedRevision: number;
      readonly rules: readonly RuleDefinition[];
    }
  | { readonly kind: 'load-rule-set' }
  | {
      readonly kind: 'append-rule-hits';
      readonly exchangeId: string;
      readonly hits: readonly RuleHitInput[];
    }
  | {
      readonly kind: 'append-websocket-frames';
      readonly exchangeId: string;
      readonly frames: readonly WebSocketFrameInput[];
    }
  | {
      readonly kind: 'query-websocket-frames';
      readonly query: WebSocketFrameQuery;
    }
  | { readonly kind: 'count-rule-hits' }
  | { readonly kind: 'close' };

export interface StorageWorkerRequestEnvelope {
  readonly requestId: number;
  readonly request: StorageWorkerRequest;
}

export type StorageWorkerResultFor<K extends StorageWorkerRequest['kind']> =
  K extends 'append-exchanges'
    ? { id: string; seq: number }[]
    : K extends 'query-sessions'
      ? SessionQueryPage
      : K extends 'exchange-detail'
        ? CaptureExchangeDetail | null
        : K extends 'query-websocket-frames'
          ? WebSocketFramePage
          : K extends 'storage-status'
            ? StorageStats
            : K extends 'cleanup'
              ? CleanupResult
              : K extends 'referenced-hashes'
                ? string[]
                : K extends 'save-rule-set'
                  ? RuleSet
                  : K extends 'load-rule-set'
                    ? RuleSet
                    : K extends 'count-rule-hits'
                      ? RuleHitCount[]
                      : void;

export type StorageWorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'fatal'; readonly message: string }
  | {
      readonly type: 'result';
      readonly requestId: number;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly type: 'result';
      readonly requestId: number;
      readonly ok: false;
      readonly error: { readonly name: string; readonly message: string };
    };

export interface StorageWorkerData {
  readonly databaseLocation: string;
}

export interface StorageStatusReport {
  readonly sessionCount: number;
  readonly exchangeCount: number;
  readonly bodyCount: number;
  readonly databaseBytes: number;
  readonly blobBytes: number;
  readonly totalBytes: number;
  readonly quotaBytes: number;
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

export interface PendingStorageRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface OpenCaptureDatabaseResult {
  readonly db: DatabaseSync;
  readonly migration: MigrationResult;
}

export interface StorageKeysetCursor {
  readonly startedAt: number;
  readonly seq: number;
}

export interface StorageSummaryRow {
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

export interface StorageDetailRow extends StorageSummaryRow {
  url: string;
  port: number | null;
  statusText: string | null;
  requestMime: string | null;
  errorCode: string | null;
  streamId: number | null;
  requestBodyId: string | null;
  responseBodyId: string | null;
}

export interface StorageHeaderRow {
  kind: string;
  name: string;
  value: string;
  isPseudo: number;
}

export interface StorageBodyRefRow {
  blobHash: string | null;
  mediaType: string | null;
  contentEncoding: string | null;
  encodedSize: number;
  decodedSize: number | null;
  truncated: number;
  decodeStatus: string;
}

export interface StorageWebSocketFrameRow extends StorageBodyRefRow {
  seq: number;
  direction: 'client-to-server' | 'server-to-client';
  opcode: 1 | 2;
  timestamp: number;
  payloadSize: number;
  payloadBodyId: string | null;
}
