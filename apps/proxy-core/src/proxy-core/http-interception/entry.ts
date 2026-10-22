import { randomUUID } from 'node:crypto';
import type { HttpMessageService } from '../http-message/entry';
import type { RuleService } from '../rules/entry';
import type {
  HeaderBag,
  MatchContext,
  MutableRequestState,
  MutableResponseState,
  RequestEvaluation,
  RequestMatchInput,
  ResponseEvaluation,
  RuleBodyEffect,
} from '../rules/interfaces';
import type {
  HttpInterceptionBody,
  HttpInterceptionRequestDecision,
  HttpInterceptionResponseDecision,
  HttpInterceptionResult,
} from './interfaces';

/** 将HTTP副本交给现有规则与断点，只返回决定，不执行网络操作。 */
export class HttpInterceptionService {
  /** 复用Core唯一规则实例和正文编码实例。 */
  constructor(
    private readonly ruleService: RuleService,
    private readonly httpMessageService: HttpMessageService,
  ) {}

  /** 请求副本必须取得明确决定，不因未命中规则省略回复。 */
  async evaluateRequest(
    request: RequestMatchInput,
    signal: AbortSignal,
    exchangeId?: string,
  ): Promise<HttpInterceptionResult<HttpInterceptionRequestDecision>> {
    const original = this.copyRequest(request);
    return this.evaluate<HttpInterceptionRequestDecision>(signal, async requestId => {
      const state: MutableRequestState = {
        method: original.method,
        url: original.url,
        headers: structuredClone(original.headers),
        editedHeaderNames: new Set(),
      };
      const evaluation = await this.ruleService.evaluateRequest(
        { request: original }, state, requestId, exchangeId,
      );
      if (signal.aborted || evaluation.kind === 'aborted') {
        return { ...this.audit(evaluation), decision: { action: 'aborted' } };
      }
      if (evaluation.kind === 'block') {
        return { ...this.audit(evaluation), decision: { action: 'abort', mode: evaluation.mode } };
      }
      if (evaluation.kind === 'respond') {
        const response = evaluation.response;
        const content = await this.httpMessageService.buildContent(
          response.body ?? '',
          typeof response.body === 'string' || response.body === undefined ? 'text' : 'file',
          response.headers,
        );
        return {
          ...this.audit(evaluation),
          decision: {
            action: 'respond', statusCode: response.statusCode,
            headers: structuredClone(response.headers), body: { action: 'replace', content },
          },
        };
      }
      const body = await this.prepareBody(evaluation.bodyEffect, original.headers, state);
      const editedHeaderNames = [...(state.editedHeaderNames ?? [])];
      const bypass = state.method === original.method && state.url === original.url
        && this.unchangedHeaders(original.headers, state.headers, editedHeaderNames)
        && body.action === 'keep' && evaluation.delayMs === 0;
      return {
        ...this.audit(evaluation),
        decision: bypass ? { action: 'bypass' } : {
          action: 'intercept', method: state.method, url: state.url,
          headers: state.headers, editedHeaderNames, body, delayMs: evaluation.delayMs,
        },
      };
    });
  }

  /** 响应副本独立求值，请求bypass不代表响应bypass。 */
  async evaluateResponse(
    context: MatchContext & { response: NonNullable<MatchContext['response']> },
    signal: AbortSignal,
    exchangeId?: string,
  ): Promise<HttpInterceptionResult<HttpInterceptionResponseDecision>> {
    const original = {
      request: this.copyRequest(context.request),
      response: { ...context.response, headers: structuredClone(context.response.headers) },
    };
    return this.evaluate<HttpInterceptionResponseDecision>(signal, async requestId => {
      const state: MutableResponseState = {
        statusCode: original.response.statusCode,
        headers: structuredClone(original.response.headers),
        editedHeaderNames: new Set(),
      };
      const evaluation = await this.ruleService.evaluateResponse(
        original, state, requestId, exchangeId,
      );
      if (signal.aborted || evaluation.kind === 'aborted') {
        return { ...this.audit(evaluation), decision: { action: 'aborted' } };
      }
      if (evaluation.kind === 'block') {
        return { ...this.audit(evaluation), decision: { action: 'abort', mode: evaluation.mode } };
      }
      const body = await this.prepareBody(evaluation.bodyEffect, original.response.headers, state);
      const editedHeaderNames = [...(state.editedHeaderNames ?? [])];
      const bypass = state.statusCode === original.response.statusCode
        && this.unchangedHeaders(original.response.headers, state.headers, editedHeaderNames)
        && body.action === 'keep' && evaluation.delayMs === 0;
      return {
        ...this.audit(evaluation),
        decision: bypass ? { action: 'bypass' } : {
          action: 'intercept', statusCode: state.statusCode,
          headers: state.headers, editedHeaderNames, body, delayMs: evaluation.delayMs,
        },
      };
    });
  }

  /** 每次求值独立标识与取消订阅，不能误取消其他设备或本机请求。 */
  private async evaluate<Decision>(
    signal: AbortSignal,
    evaluate: (requestId: string) => Promise<HttpInterceptionResult<Decision>>,
  ): Promise<HttpInterceptionResult<Decision | { action: 'aborted' }>> {
    if (signal.aborted) {
      return { decision: { action: 'aborted' }, hits: [], headerEffects: [] };
    }
    const requestId = `http-copy-${randomUUID()}`;
    const abort = () => { this.ruleService.abortRequestBreakpoints(requestId); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await evaluate(requestId);
      return signal.aborted ? { ...result, decision: { action: 'aborted' } } : result;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  /** 输入与matcher上下文均不与可变规则state共享header数组或query。 */
  private copyRequest(request: RequestMatchInput): RequestMatchInput {
    return {
      ...request,
      headers: structuredClone(request.headers),
      query: new URLSearchParams(request.query),
    };
  }

  /** 构造replacement并更新继承CL，未替换时不读取或缓冲原正文。 */
  private async prepareBody(
    effect: RuleBodyEffect | undefined,
    originalHeaders: HeaderBag,
    state: MutableRequestState | MutableResponseState,
  ): Promise<HttpInterceptionBody> {
    if (!effect) return { action: 'keep' };
    if (state.body === undefined) throw new Error('HTTP replacement content is missing');
    const prepared = await this.httpMessageService.prepareReplacement({
      body: state.body,
      source: effect.source,
      originalHeaders,
      headers: state.headers,
      editedHeaderNames: state.editedHeaderNames ?? new Set(),
    });
    state.headers = prepared.headers;
    return { action: 'replace', content: prepared.content };
  }

  /** 显式header编辑即使值相同也保留intercept意图。 */
  private unchangedHeaders(original: HeaderBag, final: HeaderBag, editedNames: string[]): boolean {
    return editedNames.length === 0 && JSON.stringify(original) === JSON.stringify(final);
  }

  /** 审计与决定分离，不把RuleService内部流控字段混入对外结果。 */
  private audit(evaluation: RequestEvaluation | ResponseEvaluation) {
    return {
      hits: evaluation.hits,
      headerEffects: evaluation.headerEffects,
      ...(evaluation.bodyEffect ? { bodyEffect: evaluation.bodyEffect } : {}),
    };
  }
}
