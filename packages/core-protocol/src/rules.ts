/**
 * M7 规则引擎的可序列化模型：Rule、Matcher、Action、RuleSet。
 *
 * 纯数据（无 callback 或运行时对象），可存 SQLite、经 wire 传输、按 revision 版本化。
 * 捕获启动/热更新时由 Core 编译为 Mockttp passthrough 的 beforeRequest/beforeResponse
 * 改写函数；持久化模型绝不包含 JavaScript 代码或 Mockttp 运行时句柄。
 */

/** 规则作用阶段：请求发往上游前，或响应返回客户端前。 */
export type RulePhase = 'request' | 'response';

/** 字符串匹配模式：精确、通配符（`*`）、正则。 */
export type StringMatchMode = 'exact' | 'wildcard' | 'regex';

/** 键值匹配模式：存在性、精确、正则。 */
export type KeyMatchMode = 'present' | 'exact' | 'regex';

/** 单个 Matcher（同一规则内多个 Matcher 为 AND 关系）。 */
export type RuleMatcher =
  | { readonly type: 'method'; readonly value: string }
  | { readonly type: 'host'; readonly value: string; readonly mode: StringMatchMode }
  | { readonly type: 'path'; readonly value: string; readonly mode: StringMatchMode }
  | { readonly type: 'url'; readonly value: string; readonly mode: StringMatchMode }
  | {
      readonly type: 'query';
      readonly key: string;
      readonly mode: KeyMatchMode;
      readonly value?: string;
    }
  | {
      readonly type: 'header';
      readonly phase: RulePhase;
      readonly name: string;
      readonly mode: KeyMatchMode;
      readonly value?: string;
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
  | {
      readonly type: 'throttle';
      readonly phase: RulePhase;
      readonly bytesPerSecond: number;
    }
  | {
      readonly type: 'breakpoint';
      readonly phase: RulePhase;
      readonly timeoutMs: number;
      readonly onTimeout: 'continue' | 'drop';
    };

export type RuleActionType = RuleAction['type'];

/** 一条规则：标识 + 匹配条件（AND）+ 动作序列。 */
export interface RuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** 数值小者优先；同优先级按 id 稳定排序。 */
  readonly priority: number;
  readonly matchers: readonly RuleMatcher[];
  readonly actions: readonly RuleAction[];
}

/** 版本化规则集：revision 单调递增，用于乐观并发与原子替换。 */
export interface RuleSet {
  readonly revision: number;
  readonly rules: readonly RuleDefinition[];
}

/** 单条规则的累计命中次数（按 ruleId 聚合 rule_hit 表），供 Rules UI hit counter。 */
export interface RuleHitCount {
  readonly ruleId: string;
  readonly count: number;
}

/** 规则集资源上限（wire 校验与编译护栏）。 */
export const MAX_RULES = 500;
export const MAX_MATCHERS_PER_RULE = 32;
export const MAX_ACTIONS_PER_RULE = 32;
export const MAX_RULE_NAME_LENGTH = 256;
export const MAX_RULE_ID_LENGTH = 128;
export const MAX_RULE_STRING_LENGTH = 4_096;
export const MAX_RULE_BODY_LENGTH = 1_048_576;
export const DEFAULT_RULE_PRIORITY = 100;
export const DEFAULT_BREAKPOINT_TIMEOUT_MS = 30_000;
export const MAX_RULE_DELAY_MS = 300_000;
export const MIN_RULE_THROTTLE_BPS = 1;
export const MAX_RULE_THROTTLE_BPS = 1_000_000_000;
