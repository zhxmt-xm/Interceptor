import type {
  CollectionNode,
  CollectionRequest,
  ComposerAuth,
  ComposerBodyType,
  ComposerFieldRow,
  ComposerProtocol,
  ComposerTiming,
} from '@interceptor/core-protocol';

import type { ComposerResponse } from '../../../shared/desktop-api';

/** 认证方式；authorization 只在发送时合成。 */
export type ComposerAuthType = ComposerAuth['type'];

/** 请求编辑区的四个页签。 */
export type RequestTab = 'query' | 'headers' | 'body' | 'auth';

/** 响应区的四个页签。 */
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing';

/** 一次已完成发送的重放记录；只存在内存，与 Collection 互不写入。 */
export interface HistoryEntry {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly at: number;
  readonly status: number;
  readonly ok: boolean;
  readonly durationMs: number;
}

/** 一个打开的请求文档的运行态：响应与发送状态按文档隔离，切 tab 不丢。 */
export interface DocumentRuntime {
  readonly response: ComposerResponse | null;
  /** 当前response的格式化视图；null表示尚未格式化，原始body始终保留在response。 */
  readonly formattedResponseBody: string | null;
  readonly sending: boolean;
  readonly sendError: string | null;
  readonly requestTab: RequestTab;
  readonly responseTab: ResponseTab;
}

export type {
  CollectionNode,
  CollectionRequest,
  ComposerAuth,
  ComposerBodyType,
  ComposerFieldRow,
  ComposerProtocol,
  ComposerTiming,
};
