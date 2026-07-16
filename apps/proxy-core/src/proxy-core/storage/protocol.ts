import type {
  CaptureExchangeDetail,
  RuleDefinition,
  RuleSet,
} from '@interceptor/core-protocol';

import type {
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
} from './types';

/**
 * Storage Worker 与主线程 host 之间的进程内消息协议。
 *
 * 该协议只在 Proxy Core 进程内的 worker_threads 通道流转，与跨进程的
 * core-protocol 完全独立。请求按 requestId 关联，Worker 逐条同步处理以串行化写入。
 */

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
