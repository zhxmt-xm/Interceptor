/**
 * Composer 的请求集合：可嵌套的命名目录树 + 请求条目。
 *
 * 纯数据，整棵树作为一个 JSON 持久化并按 revision 版本化——集合规模只有几十到几百条，
 * 因此不需要树形表、排序字段或增量 upsert/move 命令，读写只有"读整棵树"和"写整棵树"。
 */
import type { TreeFolder, TreeNode } from './tree';
/** 请求编辑器里的一行键值（Query / Headers / Form 三处共用）。 */
export interface ComposerFieldRow {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  /** 未启用的行保留在集合里，但不参与发送。 */
  readonly enabled: boolean;
}

/** 请求体形态：none 不发送正文，form 由 Renderer 编码为 urlencoded 字符串。 */
export type ComposerBodyType = 'none' | 'json' | 'text' | 'form';

/** 认证配置：发送时合成 authorization header，不写回 headers 列表。 */
export interface ComposerAuth {
  readonly type: 'none' | 'bearer' | 'basic';
  readonly token: string;
  readonly username: string;
  readonly password: string;
}

/** 传输偏好：auto/http1.1 走 http/https，h2 走 http2。 */
export type ComposerProtocol = 'auto' | 'http/1.1' | 'h2';

/** 集合里的一条请求：编辑态的完整快照，Send 时由 Renderer 组装成 composer.send 载荷。 */
export interface CollectionRequest {
  readonly kind: 'request';
  readonly id: string;
  readonly name: string;
  readonly method: string;
  readonly url: string;
  readonly protocol: ComposerProtocol;
  readonly query: readonly ComposerFieldRow[];
  readonly headers: readonly ComposerFieldRow[];
  readonly bodyType: ComposerBodyType;
  readonly bodyText: string;
  readonly bodyForm: readonly ComposerFieldRow[];
  readonly auth: ComposerAuth;
}

/** 命名目录，可继续嵌套目录或请求。 */
export type CollectionFolder = TreeFolder<CollectionRequest>;

export type CollectionNode = TreeNode<CollectionRequest>;

/** 版本化集合：revision 单调递增，用于乐观并发与原子替换。 */
export interface Collection {
  readonly revision: number;
  readonly nodes: readonly CollectionNode[];
}
