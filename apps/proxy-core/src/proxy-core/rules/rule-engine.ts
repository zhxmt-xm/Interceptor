/**
 * M7/T7.7 规则引擎：把已编译的规则集应用到单个 Exchange 的请求/响应阶段，串起
 * matcher-compiler、action-executor 与 breakpoint-queue，产出可应用到 Mockttp
 * beforeRequest/beforeResponse 的评估结果与 RuleHit 审计。
 *
 * 热更新不丢流量：setRuleSet 原子替换 `this.ruleSet`/`this.compiled` 引用，进行中的
 * 评估持有旧引用不受影响，新评估读新引用（不 reset Mockttp server）。matcher 基于进入
 * 时的请求上下文（context 不可变），action 累积改写可变 state。
 */

import type {
  BreakpointEdit,
  RuleDefinition,
  RuleHeaderPair,
  RuleSet,
} from '@interceptor/core-protocol';

import {
  applyRequestAction,
  applyResponseAction,
  type ActionExecutorOptions,
  type MutableRequestState,
  type MutableResponseState,
  type SyntheticResponseInit,
} from './action-executor';
import type {
  BreakpointOutcome,
  BreakpointQueue,
  BreakpointSnapshot,
} from './breakpoint-queue';
import {
  compileRuleMatchers,
  type CompiledMatcher,
  type HeaderBag,
  type MatchContext,
} from './matcher-compiler';

/** 一条规则命中的审计记录；exchange id 由 proxy-service 关联后落 rule_hit 表。 */
export interface RuleHitRecord {
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly phase: 'request' | 'response';
  readonly action: string;
  readonly summary: string;
}

/** 请求阶段评估结果：继续转发（state 已改写）/ 短路响应 / 阻断连接。 */
export type RequestEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly delayMs: number;
      readonly throttleBps?: number;
    }
  | {
      readonly kind: 'respond';
      readonly response: SyntheticResponseInit;
      readonly hits: readonly RuleHitRecord[];
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
    };

/** 响应阶段评估结果：继续返回（state 已改写）或阻断（断点 drop）。 */
export type ResponseEvaluation =
  | {
      readonly kind: 'continue';
      readonly hits: readonly RuleHitRecord[];
      readonly delayMs: number;
      readonly throttleBps?: number;
    }
  | {
      readonly kind: 'block';
      readonly mode: 'reset' | 'close';
      readonly hits: readonly RuleHitRecord[];
    };

export interface BreakpointHitInfo {
  readonly id: string;
  readonly phase: 'request' | 'response';
}

export interface RuleEngineOptions {
  readonly mapLocalRoots?: readonly string[];
  /** 断点命中时通知（供推送 Renderer / 诊断）；不阻塞挂起本身。 */
  readonly onBreakpointHit?: (info: BreakpointHitInfo) => void;
}

interface CompiledRule {
  readonly rule: RuleDefinition;
  readonly matcher: CompiledMatcher;
}

/**
 * Core 独占的规则引擎实例，由 proxy-service 在 beforeRequest/beforeResponse 调用，
 * 由 core-application 在 rules.replace 成功后 setRuleSet 热切换。
 */
export class RuleEngine {
  private ruleSet: RuleSet = { revision: 0, rules: [] };
  private compiled: readonly CompiledRule[] = [];
  private breakpointsOn = true;
  private readonly executorOptions: ActionExecutorOptions;

  constructor(
    private readonly breakpoints: BreakpointQueue,
    private readonly options: RuleEngineOptions = {},
  ) {
    this.executorOptions = { mapLocalRoots: options.mapLocalRoots };
  }

  /**
   * 原子替换规则集并重编译匹配器：只保留 enabled 规则，按 priority 升序、同优先级按 id
   * 稳定排序。调用方：core-application 在 rules.replace 成功后。
   */
  setRuleSet(ruleSet: RuleSet): void {
    this.ruleSet = ruleSet;
    this.compiled = ruleSet.rules
      .filter((rule) => rule.enabled)
      .slice()
      .sort(comparePriority)
      .map((rule) => ({ rule, matcher: compileRuleMatchers(rule.matchers) }));
  }

  get revision(): number {
    return this.ruleSet.revision;
  }

  get hasRules(): boolean {
    return this.compiled.length > 0;
  }

  /** 全局“break on match”开关；关闭时命中 breakpoint action 直接放行不挂起。 */
  get breakpointsEnabled(): boolean {
    return this.breakpointsOn;
  }

  setBreakpointsEnabled(enabled: boolean): void {
    this.breakpointsOn = enabled;
  }

  /**
   * 请求阶段评估：按序应用匹配规则的请求侧 action，累积改写与流控，遇短路/阻断即返回。
   */
  async evaluateRequest(
    context: MatchContext,
    state: MutableRequestState,
  ): Promise<RequestEvaluation> {
    const hits: RuleHitRecord[] = [];
    let delayMs = 0;
    let throttleBps: number | undefined;

    for (const compiled of this.compiled) {
      if (!compiled.matcher(context)) {
        continue;
      }
      for (const action of compiled.rule.actions) {
        if (action.type === 'breakpoint') {
          if (action.phase !== 'request') {
            continue;
          }
          const resolved = await this.awaitBreakpoint(
            'request',
            action,
            buildRequestSnapshot(compiled.rule.name, state),
          );
          hits.push(this.toHit(compiled.rule, 'request', 'breakpoint', resolved.state));
          if (resolved.state === 'edited' && resolved.edit) {
            applyRequestEdit(state, resolved.edit);
          }
          if (isDropped(resolved.state, resolved.timeoutPolicy)) {
            return { kind: 'block', mode: 'close', hits };
          }
          continue;
        }
        const outcome = await applyRequestAction(state, action, this.executorOptions);
        if (outcome.kind === 'none') {
          continue;
        }
        hits.push(
          this.toHit(compiled.rule, 'request', outcome.summary.action, outcome.summary.detail),
        );
        if (outcome.kind === 'respond') {
          return { kind: 'respond', response: outcome.response, hits };
        }
        if (outcome.kind === 'block') {
          return { kind: 'block', mode: outcome.mode, hits };
        }
        if (outcome.kind === 'delay') {
          delayMs = Math.max(delayMs, outcome.ms);
        } else if (outcome.kind === 'throttle') {
          throttleBps =
            throttleBps === undefined
              ? outcome.bytesPerSecond
              : Math.min(throttleBps, outcome.bytesPerSecond);
        }
      }
    }
    return { kind: 'continue', hits, delayMs, throttleBps };
  }

  /**
   * 响应阶段评估：按序应用匹配规则的响应侧 action；断点 drop 阻断，其余继续。
   */
  async evaluateResponse(
    context: MatchContext,
    state: MutableResponseState,
  ): Promise<ResponseEvaluation> {
    const hits: RuleHitRecord[] = [];
    let delayMs = 0;
    let throttleBps: number | undefined;

    for (const compiled of this.compiled) {
      if (!compiled.matcher(context)) {
        continue;
      }
      for (const action of compiled.rule.actions) {
        if (action.type === 'breakpoint') {
          if (action.phase !== 'response') {
            continue;
          }
          const resolved = await this.awaitBreakpoint(
            'response',
            action,
            buildResponseSnapshot(compiled.rule.name, state),
          );
          hits.push(this.toHit(compiled.rule, 'response', 'breakpoint', resolved.state));
          if (resolved.state === 'edited' && resolved.edit) {
            applyResponseEdit(state, resolved.edit);
          }
          if (isDropped(resolved.state, resolved.timeoutPolicy)) {
            return { kind: 'block', mode: 'close', hits };
          }
          continue;
        }
        const outcome = applyResponseAction(state, action);
        if (outcome.kind === 'none') {
          continue;
        }
        hits.push(
          this.toHit(compiled.rule, 'response', outcome.summary.action, outcome.summary.detail),
        );
        if (outcome.kind === 'delay') {
          delayMs = Math.max(delayMs, outcome.ms);
        } else if (outcome.kind === 'throttle') {
          throttleBps =
            throttleBps === undefined
              ? outcome.bytesPerSecond
              : Math.min(throttleBps, outcome.bytesPerSecond);
        }
      }
    }
    return { kind: 'continue', hits, delayMs, throttleBps };
  }

  private async awaitBreakpoint(
    phase: 'request' | 'response',
    action: { timeoutMs: number; onTimeout: 'continue' | 'drop' },
    snapshot: BreakpointSnapshot,
  ): Promise<BreakpointOutcome> {
    if (!this.breakpointsOn) {
      return { state: 'continued' };
    }
    const { id, outcome } = this.breakpoints.suspend(
      phase,
      action.timeoutMs,
      action.onTimeout,
      snapshot,
    );
    this.options.onBreakpointHit?.({ id, phase });
    return outcome;
  }

  private toHit(
    rule: RuleDefinition,
    phase: 'request' | 'response',
    action: string,
    summary: string,
  ): RuleHitRecord {
    return {
      ruleId: rule.id,
      ruleRevision: this.ruleSet.revision,
      phase,
      action,
      summary,
    };
  }
}

function comparePriority(a: RuleDefinition, b: RuleDefinition): number {
  return a.priority !== b.priority
    ? a.priority - b.priority
    : a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0;
}

function isDropped(
  state: 'continued' | 'edited' | 'dropped' | 'timed_out',
  timeoutPolicy: 'continue' | 'drop' | undefined,
): boolean {
  return state === 'dropped' || (state === 'timed_out' && timeoutPolicy === 'drop');
}

function applyRequestEdit(state: MutableRequestState, edit: BreakpointEdit): void {
  if (edit.method !== undefined) {
    state.method = edit.method;
  }
  if (edit.url !== undefined) {
    state.url = edit.url;
  }
  if (edit.headers !== undefined) {
    state.headers = pairsToBag(edit.headers);
  }
  if (edit.body !== undefined) {
    state.body = edit.body;
  }
}

function applyResponseEdit(
  state: MutableResponseState,
  edit: BreakpointEdit,
): void {
  if (edit.statusCode !== undefined) {
    state.statusCode = edit.statusCode;
  }
  if (edit.headers !== undefined) {
    state.headers = pairsToBag(edit.headers);
  }
  if (edit.body !== undefined) {
    state.body = edit.body;
  }
}

function pairsToBag(pairs: readonly RuleHeaderPair[]): HeaderBag {
  const bag: HeaderBag = {};
  for (const pair of pairs) {
    const existing = bag[pair.name];
    if (existing === undefined) {
      bag[pair.name] = pair.value;
    } else if (Array.isArray(existing)) {
      existing.push(pair.value);
    } else {
      bag[pair.name] = [existing, pair.value];
    }
  }
  return bag;
}

/** 断点快照正文上限（256 KiB）；仅供 UI 展示/编辑。 */
const MAX_SNAPSHOT_BODY = 256 * 1024;

function bagToPairs(bag: HeaderBag): RuleHeaderPair[] {
  const pairs: RuleHeaderPair[] = [];
  for (const [name, value] of Object.entries(bag)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        pairs.push({ name, value: item });
      }
    } else if (value !== undefined) {
      pairs.push({ name, value: String(value) });
    }
  }
  return pairs;
}

function bodyToString(body: string | Uint8Array | undefined): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body.length > MAX_SNAPSHOT_BODY ? body.slice(0, MAX_SNAPSHOT_BODY) : body;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(body.subarray(0, MAX_SNAPSHOT_BODY));
}

function buildRequestSnapshot(
  ruleName: string,
  state: MutableRequestState,
): BreakpointSnapshot {
  return {
    ruleName,
    method: state.method,
    url: state.url,
    headers: bagToPairs(state.headers),
    body: bodyToString(state.body),
  };
}

function buildResponseSnapshot(
  ruleName: string,
  state: MutableResponseState,
): BreakpointSnapshot {
  return {
    ruleName,
    statusCode: state.statusCode,
    headers: bagToPairs(state.headers),
    body: bodyToString(state.body),
  };
}
