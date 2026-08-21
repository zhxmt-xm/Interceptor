/**
 * M7 规则引擎的可序列化模型：Rule、Matcher、Action、RuleSet。
 *
 * 纯数据（无 callback 或运行时对象），可存 SQLite、经 wire 传输、按 revision 版本化。
 * Core 在内存中把 matcher 编译为判定函数，在 Mockttp passthrough 的 beforeRequestHead/
 * beforeResponseHead 头部阶段求值；持久化模型绝不包含 JavaScript 代码或 Mockttp 运行时句柄。
 */

import type { TreeFolder, TreeNode } from './tree';

/** 规则作用阶段：请求发往上游前，或响应返回客户端前。 */
export type RulePhase = 'request' | 'response';

export interface InfiniteBreakpointTimeout {
  readonly mode: 'infinite';
}

export interface FiniteBreakpointTimeout {
  readonly mode: 'finite';
  readonly timeoutMs: number;
}

export type BreakpointTimeout = InfiniteBreakpointTimeout | FiniteBreakpointTimeout;

export type RuleBreakpointAction =
  | {
      readonly type: 'breakpoint';
      readonly phase: RulePhase;
      readonly timeout: InfiniteBreakpointTimeout;
    }
  | {
      readonly type: 'breakpoint';
      readonly phase: RulePhase;
      readonly timeout: FiniteBreakpointTimeout;
      readonly onTimeout: 'continue' | 'drop';
    };

/** 字符串匹配模式：包含（默认）、精确、正则。 */
export type StringMatchMode = 'contains' | 'exact' | 'regex';

/** 键值匹配模式：包含（默认）、精确、正则。 */
export type KeyMatchMode = 'contains' | 'exact' | 'regex';

/** 单个 Matcher（同一规则内多个 Matcher 为 AND 关系）。 */
export type RuleMatcher =
  | { readonly type: 'method'; readonly value: string }
  | {
      readonly type: 'host';
      readonly value: string;
      readonly mode: StringMatchMode;
      readonly caseSensitive?: boolean;
    }
  | {
      readonly type: 'path';
      readonly value: string;
      readonly mode: StringMatchMode;
      readonly caseSensitive?: boolean;
    }
  | {
      readonly type: 'url';
      readonly value: string;
      readonly mode: StringMatchMode;
      readonly caseSensitive?: boolean;
    }
  | {
      readonly type: 'query';
      readonly key: string;
      readonly mode: KeyMatchMode;
      readonly value?: string;
      readonly caseSensitive?: boolean;
    }
  | {
      readonly type: 'header';
      readonly phase: RulePhase;
      readonly name: string;
      readonly mode: KeyMatchMode;
      readonly value?: string;
      readonly caseSensitive?: boolean;
    }
  | { readonly type: 'status'; readonly min: number; readonly max: number }
  | { readonly type: 'mime'; readonly phase: RulePhase; readonly value: string };

export type RuleMatcherType = RuleMatcher['type'];

/** Header 修改操作。 */
export type HeaderOperation = 'set' | 'append' | 'remove';

/** 名/值对（synthetic 响应头等）。 */
export interface RuleHeaderPair {
  readonly name: string;
  readonly value: string;
}

/** 单个 Action（同一规则内按声明顺序依次应用）。 */
export type RuleAction =
  | {
      readonly type: 'header';
      readonly phase: RulePhase;
      readonly op: HeaderOperation;
      readonly name: string;
      readonly value?: string;
    }
  | {
      readonly type: 'query';
      readonly op: 'set' | 'remove';
      readonly name: string;
      readonly value?: string;
    }
  | {
      readonly type: 'body';
      readonly phase: RulePhase;
      readonly format: 'text' | 'json';
      readonly content: string;
    }
  | {
      readonly type: 'synthetic';
      readonly statusCode: number;
      readonly headers?: readonly RuleHeaderPair[];
      readonly body?: string;
    }
  | { readonly type: 'map-local'; readonly path: string }
  | {
      readonly type: 'map-remote';
      readonly scheme?: 'http' | 'https';
      readonly host?: string;
      readonly port?: number;
      readonly path?: string;
    }
  | { readonly type: 'block'; readonly mode: 'reset' | 'close' }
  | { readonly type: 'status'; readonly statusCode: number }
  | { readonly type: 'delay'; readonly phase: RulePhase; readonly ms: number }
  | RuleBreakpointAction;

export type RuleActionType = RuleAction['type'];

/** 一条规则：标识 + 匹配条件（AND）+ 动作序列。 */
export interface RuleDefinition {
  readonly kind: 'rule';
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** 数值小者优先；同优先级按 id 稳定排序。Renderer 在每次结构变更后按树的深度优先顺序重新分配。 */
  readonly priority: number;
  readonly matchers: readonly RuleMatcher[];
  readonly actions: readonly RuleAction[];
}

/** 命名目录，可继续嵌套目录或规则；只用于组织，不参与匹配与优先级。 */
export type RuleFolder = TreeFolder<RuleDefinition>;

export type RuleNode = TreeNode<RuleDefinition>;

/** 版本化规则集：revision 单调递增，用于乐观并发与原子替换。 */
export interface RuleSet {
  readonly revision: number;
  readonly nodes: readonly RuleNode[];
}

/** 单条规则命中的请求数（按 Rule × Exchange 去重），供 Rules UI hit counter。 */
export interface RuleHitCount {
  readonly ruleId: string;
  readonly count: number;
}
/** 规则 payload 不在 Core Protocol 传输层施加资源上限。 */
