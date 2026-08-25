/**
 * M7/T7.7 规则引擎：把已编译的规则集应用到单个 Exchange 的请求/响应阶段，串起
 * matcher-compiler、action-executor 与 breakpoint-queue，产出可应用到 Mockttp
 * beforeRequestHead/beforeResponseHead 的评估结果与 RuleHit 审计。
 *
 * 热更新不丢流量：setRuleSet 原子替换 `this.ruleSet`/`this.compiled` 引用，进行中的
 * 评估持有旧引用不受影响，新评估读新引用（不 reset Mockttp server）。matcher 基于进入
 * 时的请求上下文（context 不可变），action 累积改写可变 state。
 */

import {
  collectLeaves,
  type BreakpointQueueKey,
  type RuleAction,
  type RuleDefinition,
  type RuleSet,
} from '@interceptor/core-protocol';

import { ActionExecutor } from './internal/action-executor';
import { BreakpointQueue } from './internal/breakpoint-queue';
import type { DiagnosticsRecorder } from '../core-diagnostics';
import type {
  BreakpointOutcome,
  BreakpointPhase,
  BreakpointSnapshot,
  CompiledRule,
  MatchContext,
  MutableRequestState,
  MutableResponseState,
  RequestEvaluation,
  ResponseEvaluation,
  RuleBodyEffect,
  RuleServiceOptions,
  RuleHeaderEffect,
  RuleHitRecord,
} from './interfaces';
import * as RuleUtils from './utils';

/**
 * Core 独占的规则引擎实例，由 proxy-service 在 beforeRequestHead/beforeResponseHead 调用，
 * 由 core-application 在 rules.replace 成功后 setRuleSet 热切换。
 */
export class RuleService {
  /** 当前持久化规则集快照。 */
  private ruleSet: RuleSet = { revision: 0, nodes: [] };
  /** 当前启用且已编译的规则，按优先级排序。 */
  private compiled: readonly CompiledRule[] = [];
  /** 全局断点命中开关。 */
  private breakpointsOn = true;
  /** 共享等待中断点队列。 */
  private readonly breakpointQueue: BreakpointQueue;
  /** 规则引擎装配选项。 */
  private readonly options: RuleServiceOptions;
  /** 请求与响应 action 执行器。 */
  private readonly actionExecutor: ActionExecutor;
  /** 正在异步执行普通 action、尚未完成 request 评估的 Mockttp request ID。 */
  private readonly evaluatingRequestIds = new Set<string>();
  /** 评估期间已收到客户端 abort、后续不得再创建 suspension 的 request ID。 */
  private readonly abortedRequestIds = new Set<string>();
  /** 断点队列溢出等数据面事件的诊断汇。 */
  private diagnostics: DiagnosticsRecorder | null = null;

  /** 绑定断点队列并固定通知配置。 */
  constructor(
    breakpointQueue: BreakpointQueue,
    options: RuleServiceOptions = {},
  ) {
    this.breakpointQueue = breakpointQueue;
    this.options = options;
    this.actionExecutor = new ActionExecutor();
  }

  /** 注入诊断汇；调用方：CoreApplication 在 diagnostics 装配后调用一次。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /**
   * 原子替换规则集并重编译匹配器：目录只用于组织，先按深度优先摊平取出全部规则，再只保留
   * enabled 规则，按 priority 升序、同优先级按 id 稳定排序。调用方：core-application 在
   * rules.replace 成功后。
   */
  setRuleSet(ruleSet: RuleSet): void {
    this.ruleSet = ruleSet;
    this.compiled = collectLeaves(ruleSet.nodes)
      .filter((rule) => rule.enabled)
      .sort(RuleUtils.comparePriority)
      .map((rule) => ({
        rule,
        matcher: RuleUtils.compileRuleMatchers(rule.matchers),
      }));
  }

  /** 返回当前规则集 revision。 */
  get revision(): number {
    return this.ruleSet.revision;
  }

  /** 返回是否存在至少一条启用规则。 */
  get hasRules(): boolean {
    return this.compiled.length > 0;
  }

  /** 全局“break on match”开关；关闭时命中 breakpoint action 直接放行不挂起。 */
  get breakpointsEnabled(): boolean {
    return this.breakpointsOn;
  }

  /** 开启全局断点命中。调用方：breakpoint.configure command handler。 */
  enableBreakpoints(): void {
    this.breakpointsOn = true;
  }

  /** 关闭全局断点命中，命中 breakpoint action 直接放行。调用方同上。 */
  disableBreakpoints(): void {
    this.breakpointsOn = false;
  }

  /** 客户端已中止 HTTP 请求时，释放该请求仍在等待的断点。 */
  abortRequestBreakpoints(requestId: string): number {
    const evaluationAborted = this.evaluatingRequestIds.has(requestId);
    if (evaluationAborted) {
      this.abortedRequestIds.add(requestId);
    }
    const abortedCount = this.breakpointQueue.abortRequest(requestId);
    if (evaluationAborted || abortedCount > 0) {
      this.diagnostics?.info('breakpoint.request-aborted', {
        attributes: { requestId, abortedCount },
      });
    }
    return abortedCount;
  }

  /**
   * 显式 WebSocket 帧断点；由 Proxy bridge 在转发前调用。
   * 开关归 ProxyService 的 WebSocket 断点配置，与 HTTP 的 break-on-match 正交。
   */
  async pauseWebSocketMessage(
    snapshot: BreakpointSnapshot,
    queueKey: BreakpointQueueKey,
  ): Promise<BreakpointOutcome> {
    const suspension = this.breakpointQueue.suspend(
      'websocket',
      queueKey,
      undefined,
      snapshot,
    );
    this.options.onBreakpointHit?.({
      id: suspension.id,
      phase: 'websocket',
      ...(snapshot.exchangeId !== undefined
        ? { exchangeId: snapshot.exchangeId }
        : {}),
    });
    return suspension.outcome;
  }

  /**
   * 请求阶段评估：按序应用匹配规则的请求侧 action，累积改写与流控，遇短路/阻断即返回。
   */
  async evaluateRequest(
    context: MatchContext,
    state: MutableRequestState,
    requestId?: string,
    exchangeId?: string,
  ): Promise<RequestEvaluation> {
    if (requestId !== undefined) {
      this.evaluatingRequestIds.add(requestId);
    }
    try {
      return await this.evaluateRequestState(context, state, requestId, exchangeId);
    } finally {
      if (requestId !== undefined) {
        this.evaluatingRequestIds.delete(requestId);
        this.abortedRequestIds.delete(requestId);
      }
    }
  }

  /** 执行请求普通 action 与延后的 breakpoint；外层负责 request abort 生命周期。 */
  private async evaluateRequestState(
    context: MatchContext,
    state: MutableRequestState,
    requestId?: string,
    exchangeId?: string,
  ): Promise<RequestEvaluation> {
    const hits: RuleHitRecord[] = [];
    const headerEffects: RuleHeaderEffect[] = [];
    let bodyEffect: RuleBodyEffect | undefined;
    const deferredBreakpoints: Array<{
      rule: RuleDefinition;
      action: Extract<RuleAction, { type: 'breakpoint' }>;
    }> = [];
    let delayMs = 0;

    for (const compiled of this.compiled) {
      if (!compiled.matcher(context)) {
        continue;
      }
      for (const action of compiled.rule.actions) {
        if (action.type === 'breakpoint') {
          if (action.phase === 'request') {
            deferredBreakpoints.push({ rule: compiled.rule, action });
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
        if (action.type === 'body' && action.phase === 'request') {
          bodyEffect = {
            ruleId: compiled.rule.id,
            phase: 'request',
            effect: 'replace',
            source: 'text',
          };
        }
        hits.push(
          this.toHit(compiled.rule, 'request', outcome.summary.action, outcome.summary.detail),
        );
        if (outcome.kind === 'respond') {
          return {
            kind: 'respond',
            response: outcome.response,
            hits,
            headerEffects,
            bodyEffect,
          };
        }
        if (outcome.kind === 'block') {
          return { kind: 'block', mode: outcome.mode, hits, headerEffects, bodyEffect };
        }
        if (outcome.kind === 'delay') {
          delayMs = Math.max(delayMs, outcome.ms);
        }
      }
    }
    for (const { rule, action } of deferredBreakpoints) {
      const resolved = await this.awaitBreakpoint(
        'request',
        rule.id,
        RuleUtils.buildRequestSnapshot(rule.name, state, headerEffects, exchangeId),
        requestId,
      );
      hits.push(this.toHit(rule, 'request', 'breakpoint', resolved.state));
      if (resolved.state === 'aborted') {
        return { kind: 'aborted', hits, headerEffects, bodyEffect };
      }
      if (resolved.state === 'edited' && resolved.edit) {
        headerEffects.push(...RuleUtils.buildBreakpointHeaderEffects(
          rule.id,
          'request',
          state.headers,
          resolved.edit,
        ));
        const source = await RuleUtils.applyRequestEdit(state, resolved.edit);
        if (source) {
          bodyEffect = {
            ruleId: rule.id,
            phase: 'request',
            effect: 'replace',
            source,
          };
        }
      }
      if (resolved.state === 'dropped') {
        return { kind: 'block', mode: 'close', hits, headerEffects, bodyEffect };
      }
    }
    return { kind: 'continue', hits, headerEffects, bodyEffect, delayMs };
  }

  /**
   * 响应阶段评估：按序应用匹配规则的响应侧 action；断点 drop 阻断，其余继续。
   */
  async evaluateResponse(
    context: MatchContext,
    state: MutableResponseState,
    requestId?: string,
    exchangeId?: string,
  ): Promise<ResponseEvaluation> {
    const hits: RuleHitRecord[] = [];
    const headerEffects: RuleHeaderEffect[] = [];
    let bodyEffect: RuleBodyEffect | undefined;
    const deferredBreakpoints: Array<{
      rule: RuleDefinition;
      action: Extract<RuleAction, { type: 'breakpoint' }>;
    }> = [];
    let delayMs = 0;

    for (const compiled of this.compiled) {
      if (!compiled.matcher(context)) {
        continue;
      }
      for (const action of compiled.rule.actions) {
        if (action.type === 'breakpoint') {
          if (action.phase === 'response') {
            deferredBreakpoints.push({ rule: compiled.rule, action });
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
        if (action.type === 'body' && action.phase === 'response') {
          bodyEffect = {
            ruleId: compiled.rule.id,
            phase: 'response',
            effect: 'replace',
            source: 'text',
          };
        }
        hits.push(
          this.toHit(compiled.rule, 'response', outcome.summary.action, outcome.summary.detail),
        );
        if (outcome.kind === 'delay') {
          delayMs = Math.max(delayMs, outcome.ms);
        }
      }
    }
    for (const { rule, action } of deferredBreakpoints) {
      const resolved = await this.awaitBreakpoint(
        'response',
        rule.id,
        RuleUtils.buildResponseSnapshot(
          rule.name,
          context.request,
          state,
          headerEffects,
          exchangeId,
        ),
        requestId,
      );
      hits.push(this.toHit(rule, 'response', 'breakpoint', resolved.state));
      if (resolved.state === 'aborted') {
        return { kind: 'aborted', hits, headerEffects, bodyEffect };
      }
      if (resolved.state === 'edited' && resolved.edit) {
        headerEffects.push(...RuleUtils.buildBreakpointHeaderEffects(
          rule.id,
          'response',
          state.headers,
          resolved.edit,
        ));
        const source = await RuleUtils.applyResponseEdit(state, resolved.edit);
        if (source) {
          bodyEffect = {
            ruleId: rule.id,
            phase: 'response',
            effect: 'replace',
            source,
          };
        }
      }
      if (resolved.state === 'dropped') {
        return { kind: 'block', mode: 'close', hits, headerEffects, bodyEffect };
      }
    }
    return { kind: 'continue', hits, headerEffects, bodyEffect, delayMs };
  }

  /** 挂起规则断点并发布命中通知；关闭开关或队列已满时直接继续。 */
  private async awaitBreakpoint(
    phase: 'request' | 'response',
    ruleId: string,
    snapshot: BreakpointSnapshot,
    requestId?: string,
  ): Promise<BreakpointOutcome> {
    if (requestId !== undefined && this.abortedRequestIds.has(requestId)) {
      return { state: 'aborted' };
    }
    if (!this.breakpointsOn) {
      return { state: 'continued' };
    }
    const suspension = this.breakpointQueue.suspend(
      phase,
      'http',
      ruleId,
      snapshot,
      requestId,
    );
    // 请求停在这里是用户最需要解释的现象，挂起与解除都要留痕。
    this.diagnostics?.info('breakpoint.suspended', {
      attributes: {
        phase,
        rule: snapshot.ruleName,
        exchangeId: snapshot.exchangeId ?? 'unavailable',
        pending: this.breakpointQueue.size,
      },
    });
    this.options.onBreakpointHit?.({
      id: suspension.id,
      phase,
      ...(snapshot.exchangeId !== undefined
        ? { exchangeId: snapshot.exchangeId }
        : {}),
    });
    const outcome = await suspension.outcome;
    this.diagnostics?.info('breakpoint.released', {
      attributes: { phase, rule: snapshot.ruleName, state: outcome.state },
    });
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
