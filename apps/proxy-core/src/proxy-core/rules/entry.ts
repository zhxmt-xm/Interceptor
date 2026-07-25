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
  RuleDefinition,
  RuleSet,
} from '@interceptor/core-protocol';

import { RuleActionExecutor } from './rule-action-executor';
import { BreakpointQueue } from './rule-breakpoint-queue';
import type {
  BreakpointOutcome,
  BreakpointSnapshot,
  CompiledRule,
  MatchContext,
  MutableRequestState,
  MutableResponseState,
  RequestEvaluation,
  ResponseEvaluation,
  RuleEngineOptions,
  RuleHeaderEffect,
  RuleHitRecord,
} from './interfaces';
import * as RuleUtils from './utils';

/**
 * Core 独占的规则引擎实例，由 proxy-service 在 beforeRequest/beforeResponse 调用，
 * 由 core-application 在 rules.replace 成功后 setRuleSet 热切换。
 */
export class RuleEngine {
  /** 当前持久化规则集快照。 */
  private ruleSet: RuleSet = { revision: 0, rules: [] };
  /** 当前启用且已编译的规则，按优先级排序。 */
  private compiled: readonly CompiledRule[] = [];
  /** 含响应动作的规则及其请求阶段预筛选器。 */
  private responseCandidates: readonly CompiledRule[] = [];
  /** 含请求动作且可在请求阶段完整判定的规则。 */
  private requestCandidates: readonly CompiledRule[] = [];
  /** 可能改变响应规则 request 匹配字段的请求规则。 */
  private responseContextMutators: readonly CompiledRule[] = [];
  /** 全局断点命中开关。 */
  private breakpointsOn = true;
  /** 共享等待中断点队列。 */
  private readonly breakpoints: BreakpointQueue;
  /** 规则引擎装配选项。 */
  private readonly options: RuleEngineOptions;
  /** 请求与响应 action 执行器。 */
  private readonly actionExecutor: RuleActionExecutor;

  /** 绑定断点队列并固定通知配置。 */
  constructor(
    breakpoints: BreakpointQueue,
    options: RuleEngineOptions = {},
  ) {
    this.breakpoints = breakpoints;
    this.options = options;
    this.actionExecutor = new RuleActionExecutor();
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
      .sort(RuleUtils.comparePriority)
      .map((rule) => ({
        rule,
        matcher: RuleUtils.compileRuleMatchers(rule.matchers),
      }));
    this.responseCandidates = this.compiled
      .filter(({ rule }) => rule.actions.some(RuleUtils.isResponseAction))
      .map(({ rule }) => ({
        rule,
        matcher: RuleUtils.compileRequestPhaseMatchers(rule.matchers),
      }));
    this.requestCandidates = this.compiled
      .filter(({ rule }) => rule.actions.some(RuleUtils.isRequestAction));
    this.responseContextMutators = this.requestCandidates
      .filter(({ rule }) => rule.actions.some(RuleUtils.mutatesResponseMatchContext));
  }

  /** 返回当前规则集 revision。 */
  get revision(): number {
    return this.ruleSet.revision;
  }

  /** 返回是否存在至少一条启用规则。 */
  get hasRules(): boolean {
    return this.compiled.length > 0;
  }

  /** 判断请求是否可能命中响应动作；用于避免无关响应进入 Mockttp 全量缓冲 hook。 */
  mightHandleResponse(context: MatchContext): boolean {
    return this.responseCandidates.some(({ matcher }) => matcher(context))
      || (
        this.responseCandidates.length > 0
        && this.responseContextMutators.some(({ matcher }) => matcher(context))
      );
  }

  /** 判断请求是否可能命中请求 action；用于避免无关请求进入 Mockttp 全量缓冲 hook。 */
  mightHandleRequest(context: MatchContext): boolean {
    return this.requestCandidates.some(({ matcher }) => matcher(context));
  }

  /** 全局“break on match”开关；关闭时命中 breakpoint action 直接放行不挂起。 */
  get breakpointsEnabled(): boolean {
    return this.breakpointsOn;
  }

  /** 设置全局断点命中开关。 */
  setBreakpointsEnabled(enabled: boolean): void {
    this.breakpointsOn = enabled;
  }

  /** 显式 WebSocket 消息断点；由 Proxy bridge 在转发消息前调用。 */
  async pauseWebSocketMessage(
    snapshot: BreakpointSnapshot,
    timeoutMs = 0,
  ): Promise<BreakpointOutcome> {
    if (!this.breakpointsOn) {
      return { state: 'continued' };
    }
    const { id, outcome } = this.breakpoints.suspend(
      'websocket',
      timeoutMs,
      'continue',
      snapshot,
    );
    this.options.onBreakpointHit?.({ id, phase: 'websocket' });
    return outcome;
  }

  /**
   * 请求阶段评估：按序应用匹配规则的请求侧 action，累积改写与流控，遇短路/阻断即返回。
   */
  async evaluateRequest(
    context: MatchContext,
    state: MutableRequestState,
  ): Promise<RequestEvaluation> {
    const hits: RuleHitRecord[] = [];
    const headerEffects: RuleHeaderEffect[] = [];
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
            RuleUtils.buildRequestSnapshot(compiled.rule.name, state),
          );
          hits.push(this.toHit(compiled.rule, 'request', 'breakpoint', resolved.state));
          if (resolved.state === 'edited' && resolved.edit) {
            RuleUtils.applyRequestEdit(state, resolved.edit);
          }
          if (RuleUtils.isDropped(resolved.state, resolved.timeoutPolicy)) {
            return { kind: 'block', mode: 'close', hits, headerEffects };
          }
          continue;
        }
        const previousHeaderValues = action.type === 'header'
          ? RuleUtils.headerValues(state.headers, action.name)
          : [];
        const outcome = await this.actionExecutor.applyRequest(state, action);
        if (outcome.kind === 'none') {
          continue;
        }
        if (action.type === 'header' && action.phase === 'request') {
          headerEffects.push(...RuleUtils.buildHeaderEffects(
            compiled.rule.id,
            action,
            previousHeaderValues,
          ));
        }
        hits.push(
          this.toHit(compiled.rule, 'request', outcome.summary.action, outcome.summary.detail),
        );
        if (outcome.kind === 'respond') {
          return { kind: 'respond', response: outcome.response, hits, headerEffects };
        }
        if (outcome.kind === 'block') {
          return { kind: 'block', mode: outcome.mode, hits, headerEffects };
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
    return { kind: 'continue', hits, headerEffects, delayMs, throttleBps };
  }

  /**
   * 响应阶段评估：按序应用匹配规则的响应侧 action；断点 drop 阻断，其余继续。
   */
  async evaluateResponse(
    context: MatchContext,
    state: MutableResponseState,
  ): Promise<ResponseEvaluation> {
    const hits: RuleHitRecord[] = [];
    const headerEffects: RuleHeaderEffect[] = [];
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
            RuleUtils.buildResponseSnapshot(compiled.rule.name, state),
          );
          hits.push(this.toHit(compiled.rule, 'response', 'breakpoint', resolved.state));
          if (resolved.state === 'edited' && resolved.edit) {
            RuleUtils.applyResponseEdit(state, resolved.edit);
          }
          if (RuleUtils.isDropped(resolved.state, resolved.timeoutPolicy)) {
            return { kind: 'block', mode: 'close', hits, headerEffects };
          }
          continue;
        }
        const previousHeaderValues = action.type === 'header'
          ? RuleUtils.headerValues(state.headers, action.name)
          : [];
        const outcome = this.actionExecutor.applyResponse(state, action);
        if (outcome.kind === 'none') {
          continue;
        }
        if (action.type === 'header' && action.phase === 'response') {
          headerEffects.push(...RuleUtils.buildHeaderEffects(
            compiled.rule.id,
            action,
            previousHeaderValues,
          ));
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
    return { kind: 'continue', hits, headerEffects, delayMs, throttleBps };
  }

  /** 挂起规则断点并发布命中通知；关闭开关时直接继续。 */
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

  /** 构造不含敏感值的规则命中审计记录。 */
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
