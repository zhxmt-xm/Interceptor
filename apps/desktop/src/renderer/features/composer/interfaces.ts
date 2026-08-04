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
  readonly sending: boolean;
  readonly sendError: string | null;
  readonly requestTab: RequestTab;
  readonly responseTab: ResponseTab;
}

/** 目录操作菜单的锚点：菜单绝对定位在 Collection 分栏内。 */
export interface FolderMenuAnchor {
  readonly folderId: string;
  readonly top: number;
  readonly left: number;
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
