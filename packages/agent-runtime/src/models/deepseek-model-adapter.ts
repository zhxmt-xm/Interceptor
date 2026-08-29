import type {
  AgentMessage,
  ModelAdapter,
  ModelCapabilities,
  ModelCallOptions,
  ModelRequest,
  ModelStreamEvent,
  ModelToolCall,
} from '../interfaces';
import { z, ZodError } from 'zod';
import { ModelCallError, type ModelCallErrorCode } from './errors';

/** Default DeepSeek API origin. / DeepSeek API 默认源站。 */
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
/** Default model used when no preset overrides it. / 未被 preset 覆盖时使用的默认模型。 */
const DEFAULT_MODEL = 'deepseek-v4-flash';
/** Bounded aggregate SSE bytes accepted from one model attempt. / 单次模型attempt可接收的SSE累计字节上限。 */
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/**
 * Configures the DeepSeek transport without exposing credentials outside Main.
 * 配置 DeepSeek transport，同时不让凭据离开 Main。
 */
export interface DeepSeekModelAdapterOptions {
  apiKey?: string;
  fetch: typeof globalThis.fetch;
  model?: string;
  baseUrl?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  attemptTimeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Accumulates one Tool call whose fields arrive across multiple SSE deltas.
 * 累积一个跨多个 SSE delta 到达的 Tool 调用。
 */
interface PendingToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

/**
 * Owns the composed caller-cancel and attempt-timeout signal lifecycle.
 * 拥有调用方取消与 attempt timeout 组合信号的生命周期。
 */
interface AttemptAbort {
  signal: AbortSignal;
  /** Reports whether the attempt timer won the cancellation race. / 表示 attempt timer 是否赢得取消竞态。 */
  didTimeout(): boolean;
  /** Stops timeout accounting after the Provider terminal event. / Provider terminal event 到达后停止 timeout 计时。 */
  finish(): void;
  /** Releases the timer and caller abort listener. / 释放 timer 与调用方 abort listener。 */
  dispose(): void;
}

/**
 * Adapts DeepSeek Chat Completions SSE into provider-neutral Runtime events.
 * 将 DeepSeek Chat Completions SSE 适配为 Provider 无关的 Runtime 事件。
 */
export class DeepSeekModelAdapter implements ModelAdapter {
  /**
   * Declares model limits and wire features consumed by Context construction.
   * 声明 Context 构建使用的模型上限与 wire 能力。
   */
  readonly capabilities: ModelCapabilities;

  /** Secret used only for the outbound Authorization header. / 仅用于出站 Authorization header 的密钥。 */
  readonly #apiKey: string | undefined;
  /** Injected fetch implementation for platform isolation and deterministic tests. / 为平台隔离与确定性测试注入的 fetch。 */
  readonly #fetch: typeof globalThis.fetch;
  /** Provider model identifier sent on every request. / 每次请求发送的 Provider 模型标识。 */
  readonly #model: string;
  /** Configurable API origin for DeepSeek-compatible endpoints. / DeepSeek-compatible endpoint 的可配置 API 源站。 */
  readonly #baseUrl: string;
  /** Optional timeout for one model attempt, never for the whole Turn. / 单次模型 attempt 的可选超时，不限制整个 Turn。 */
  readonly #attemptTimeoutMs: number | undefined;
  /** Maximum aggregate bytes accepted from one SSE response. / 单次SSE响应允许的最大累计字节数。 */
  readonly #maxResponseBytes: number;

  /**
   * Validates immutable transport configuration.
   * 校验不可变的 transport 配置。
   */
  constructor(options: DeepSeekModelAdapterOptions) {
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch;
    this.#model = options.model ?? DEFAULT_MODEL;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const contextWindowTokens = options.contextWindowTokens ?? 1_000_000;
    const maxOutputTokens = options.maxOutputTokens ?? 384_000;
    if (!Number.isSafeInteger(contextWindowTokens) || contextWindowTokens <= 0) {
      throw new RangeError('contextWindowTokens must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
      throw new RangeError('maxOutputTokens must be a positive safe integer.');
    }
    this.capabilities = Object.freeze({
      contextWindowTokens,
      maxOutputTokens,
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsReasoningContent: true,
      supportsCacheUsage: true,
    });
    if (options.attemptTimeoutMs !== undefined
      && (!Number.isFinite(options.attemptTimeoutMs) || options.attemptTimeoutMs <= 0)) {
      throw new RangeError('attemptTimeoutMs must be a positive finite number.');
    }
    this.#attemptTimeoutMs = options.attemptTimeoutMs;
    this.#maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.#maxResponseBytes) || this.#maxResponseBytes <= 0) {
      throw new RangeError('maxResponseBytes must be a positive safe integer.');
    }
  }

  /**
   * Streams one model attempt and always releases timer and abort listeners.
   * 流式执行一次模型 attempt，并始终释放 timer 与 abort listener。
   */
  async *stream(
    request: ModelRequest,
    options: ModelCallOptions,
  ): AsyncIterable<ModelStreamEvent> {
    const attemptAbort = createAttemptAbort(options.abortSignal, this.#attemptTimeoutMs);
    try {
      yield* this.#streamAttempt(request, options.abortSignal, attemptAbort);
    } finally {
      attemptAbort.dispose();
    }
  }

  /**
   * Performs the actual HTTP/SSE exchange under one composed attempt signal.
   * 在一个组合 attempt signal 下执行实际 HTTP/SSE 交换。
   */
  async *#streamAttempt(
    request: ModelRequest,
    callerSignal: AbortSignal,
    attemptAbort: AttemptAbort,
  ): AsyncIterable<ModelStreamEvent> {
    throwIfAttemptAborted(callerSignal, attemptAbort, false);
    let response: Response;
    try {
      const headers: Record<string, string> = {
        accept: 'text/event-stream',
        'content-type': 'application/json',
      };
      if (this.#apiKey !== undefined) {
        headers.authorization = `Bearer ${this.#apiKey}`;
      }
      response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.#model,
          messages: request.messages.map(toDeepSeekMessage),
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: Math.min(
            request.maxOutputTokens ?? this.capabilities.maxOutputTokens,
            this.capabilities.maxOutputTokens,
          ),
        }),
        signal: attemptAbort.signal,
      });
    } catch (error) {
      throwNormalizedAttemptError(error, callerSignal, attemptAbort, false);
    }
    throwIfAttemptAborted(callerSignal, attemptAbort, false);

    if (!response.ok) {
      throw httpError(response);
    }
    if (response.body === null) {
      throw invalidResponseError('DeepSeek response did not include a body.', false);
    }

    // Dynamic import lets this CommonJS package consume the ESM-only parser at runtime.
    // 动态 import 让这个 CommonJS package 能在运行时使用仅支持 ESM 的 parser。
    const { createParser, ParseError } = await import('eventsource-parser');
    const dataEvents: string[] = [];
    const parser = createParser({
      onEvent: (event) => dataEvents.push(event.data),
      onError: (error) => {
        throw error;
      },
    });
    const decoder = new TextDecoder();
    const pendingToolCalls = new Map<number, PendingToolCall>();
    let responseStarted = false;
    let completed = false;
    let responseBytes = 0;

    try {
      // Network chunk boundaries are arbitrary; the SSE parser reconstructs complete data events.
      // 网络 chunk 边界是任意的；SSE parser 负责还原完整 data event。
      for await (const chunk of response.body) {
        throwIfAttemptAborted(callerSignal, attemptAbort, responseStarted);
        responseBytes += chunk.byteLength;
        if (responseBytes > this.#maxResponseBytes) {
          throw invalidResponseError(
            'DeepSeek response exceeded the configured byte limit.',
            responseStarted,
          );
        }
        parser.feed(decoder.decode(chunk, { stream: true }));
        for (const event of consumeDataEvents(dataEvents, pendingToolCalls)) {
          if (completed) {
            throw invalidResponseError('DeepSeek emitted data after the DONE event.', true);
          }
          responseStarted = true;
          completed = event.type === 'response-completed';
          if (completed) {
            attemptAbort.finish();
          }
          yield event;
        }
      }
      throwIfAttemptAborted(callerSignal, attemptAbort, responseStarted);
      parser.feed(decoder.decode());
      for (const event of consumeDataEvents(dataEvents, pendingToolCalls)) {
        if (completed) {
          throw invalidResponseError('DeepSeek emitted data after the DONE event.', true);
        }
        responseStarted = true;
        completed = event.type === 'response-completed';
        if (completed) {
          attemptAbort.finish();
        }
        yield event;
      }
      if (!completed) {
        throw invalidResponseError(
          'DeepSeek stream ended without a DONE event.',
          responseStarted,
        );
      }
    } catch (error) {
      if (callerSignal.aborted) {
        throw callerSignal.reason;
      }
      if (attemptAbort.didTimeout()) {
        throw attemptTimeoutError(responseStarted, error);
      }
      if (error instanceof ModelCallError) {
        throw error;
      }
      if (error instanceof SyntaxError || error instanceof ParseError || error instanceof ZodError) {
        throw invalidResponseError('DeepSeek returned an invalid stream response.', responseStarted, error);
      }
      throw networkError(error, responseStarted);
    }
  }
}

/**
 * Composes caller cancellation and an optional per-attempt timeout into one signal.
 * 将调用方取消与可选的单次 attempt timeout 组合成一个信号。
 */
function createAttemptAbort(
  callerSignal: AbortSignal,
  attemptTimeoutMs: number | undefined,
): AttemptAbort {
  if (attemptTimeoutMs === undefined) {
    return {
      signal: callerSignal,
      didTimeout: () => false,
      finish: () => undefined,
      dispose: () => undefined,
    };
  }

  const abortController = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancelFromCaller = (): void => abortController.abort(callerSignal.reason);
  if (callerSignal.aborted) {
    cancelFromCaller();
  } else {
    callerSignal.addEventListener('abort', cancelFromCaller, { once: true });
  }
  timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort(new DOMException('Model attempt timed out.', 'TimeoutError'));
  }, attemptTimeoutMs);
  const finish = (): void => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  return {
    signal: abortController.signal,
    didTimeout: () => timedOut,
    finish,
    dispose() {
      finish();
      callerSignal.removeEventListener('abort', cancelFromCaller);
    },
  };
}

/**
 * Gives caller cancellation precedence over timeout classification.
 * 保证调用方取消优先于 timeout 分类。
 */
function throwIfAttemptAborted(
  callerSignal: AbortSignal,
  attemptAbort: AttemptAbort,
  responseStarted: boolean,
): void {
  if (callerSignal.aborted) {
    throw callerSignal.reason;
  }
  if (attemptAbort.didTimeout()) {
    throw attemptTimeoutError(responseStarted, attemptAbort.signal.reason);
  }
}

/**
 * Normalizes fetch rejection while preserving caller cancellation and timeout identity.
 * 标准化 fetch rejection，同时保留调用方取消与 timeout 身份。
 */
function throwNormalizedAttemptError(
  error: unknown,
  callerSignal: AbortSignal,
  attemptAbort: AttemptAbort,
  responseStarted: boolean,
): never {
  if (callerSignal.aborted) {
    throw callerSignal.reason;
  }
  if (attemptAbort.didTimeout()) {
    throw attemptTimeoutError(responseStarted, error);
  }
  throw networkError(error, responseStarted);
}

/**
 * Converts an HTTP failure into Provider-neutral facts.
 * 将 HTTP 失败转换为 Provider 无关事实。
 */
function httpError(response: Response): ModelCallError {
  const code = httpErrorCode(response.status);
  return new ModelCallError(code, httpErrorMessage(code), {
    statusCode: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    responseStarted: false,
    replaySafety: 'safe',
  });
}

/**
 * Maps documented DeepSeek status codes to stable Runtime categories.
 * 将 DeepSeek 文档中的状态码映射为稳定 Runtime 分类。
 */
function httpErrorCode(statusCode: number): ModelCallErrorCode {
  switch (statusCode) {
    case 400:
    case 422:
      return 'invalid_request';
    case 401:
      return 'authentication_failed';
    case 402:
      return 'insufficient_balance';
    case 429:
      return 'rate_limited';
    default:
      return statusCode >= 500 ? 'server_error' : 'http_error';
  }
}

/**
 * Produces a safe user-facing summary without including Provider response bodies.
 * 生成不包含 Provider 响应正文的安全用户摘要。
 */
function httpErrorMessage(code: ModelCallErrorCode): string {
  switch (code) {
    case 'invalid_request':
      return 'DeepSeek rejected the request.';
    case 'authentication_failed':
      return 'DeepSeek authentication failed.';
    case 'insufficient_balance':
      return 'DeepSeek account balance is insufficient.';
    case 'rate_limited':
      return 'DeepSeek rate limit was reached.';
    case 'server_error':
      return 'DeepSeek server failed to process the request.';
    default:
      return 'DeepSeek request failed.';
  }
}

/**
 * Parses Retry-After seconds or an HTTP date into milliseconds.
 * 将 Retry-After 秒数或 HTTP 日期解析为毫秒数。
 */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

/**
 * Marks transport failures unsafe once any model event became visible.
 * 一旦已有模型事件可见，就把 transport 失败标记为不可安全重放。
 */
function networkError(cause: unknown, responseStarted: boolean): ModelCallError {
  return new ModelCallError('network_error', 'DeepSeek network request failed.', {
    responseStarted,
    replaySafety: responseStarted ? 'unsafe' : 'safe',
    cause,
  });
}

/**
 * Marks one expired model attempt with replay safety derived from visible output.
 * 根据是否已有可见输出标记一次过期的模型 attempt。
 */
function attemptTimeoutError(responseStarted: boolean, cause?: unknown): ModelCallError {
  return new ModelCallError('attempt_timeout', 'DeepSeek model attempt timed out.', {
    responseStarted,
    replaySafety: responseStarted ? 'unsafe' : 'safe',
    cause,
  });
}

/**
 * Reports malformed Provider data as a protocol failure rather than a network failure.
 * 将非法 Provider 数据报告为协议失败，而不是网络失败。
 */
function invalidResponseError(
  message: string,
  responseStarted: boolean,
  cause?: unknown,
): ModelCallError {
  return new ModelCallError('invalid_response', message, {
    responseStarted,
    replaySafety: responseStarted ? 'unsafe' : 'safe',
    cause,
  });
}

/**
 * Maps provider-neutral history into DeepSeek Chat Completions messages.
 * 将 Provider 无关历史映射为 DeepSeek Chat Completions message。
 */
function toDeepSeekMessage(message: AgentMessage): Record<string, unknown> {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content.length === 0 ? null : message.content,
      ...(message.reasoningContent === undefined
        ? {}
        : { reasoning_content: message.reasoningContent }),
      ...(message.toolCalls.length === 0
        ? {}
        : {
            tool_calls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            })),
          }),
    };
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  return {
    role: message.role,
    content: message.content,
  };
}

/**
 * Converts complete SSE data events into normalized model events and reassembles Tool calls.
 * 将完整 SSE data event 转换为统一模型事件，并重组 Tool 调用。
 */
function* consumeDataEvents(
  dataEvents: string[],
  pendingToolCalls: Map<number, PendingToolCall>,
): Generator<ModelStreamEvent> {
  while (dataEvents.length > 0) {
    const data = dataEvents.shift();
    if (data === undefined) {
      return;
    }
    if (data === '[DONE]') {
      for (const pendingToolCall of pendingToolCalls.values()) {
        yield {
          type: 'tool-call',
          toolCall: completeToolCall(pendingToolCall),
        };
      }
      yield { type: 'response-completed' };
      continue;
    }

    const chunk = DeepSeekStreamChunkSchema.parse(JSON.parse(data));
    const delta = chunk.choices[0]?.delta;
    if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
      yield { type: 'reasoning-delta', delta: delta.reasoning_content };
    }
    if (typeof delta?.content === 'string' && delta.content.length > 0) {
      yield { type: 'text-delta', delta: delta.content };
    }
    for (const toolCallDelta of delta?.tool_calls ?? []) {
      const pending = pendingToolCalls.get(toolCallDelta.index) ?? {
        id: '',
        name: '',
        argumentsJson: '',
      };
      pending.id += toolCallDelta.id ?? '';
      pending.name += toolCallDelta.function?.name ?? '';
      pending.argumentsJson += toolCallDelta.function?.arguments ?? '';
      pendingToolCalls.set(toolCallDelta.index, pending);
    }
    if (chunk.usage !== undefined && chunk.usage !== null) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
          ...(chunk.usage.prompt_cache_hit_tokens === undefined
            ? {}
            : { cacheHitInputTokens: chunk.usage.prompt_cache_hit_tokens }),
          ...(chunk.usage.prompt_cache_miss_tokens === undefined
            ? {}
            : { cacheMissInputTokens: chunk.usage.prompt_cache_miss_tokens }),
        },
      };
    }
  }
}

/**
 * Parses one fully accumulated Tool call only after the Provider terminates the response.
 * 仅在 Provider 结束响应后解析一条已经完整累积的 Tool 调用。
 */
function completeToolCall(pendingToolCall: PendingToolCall): ModelToolCall {
  return {
    id: pendingToolCall.id,
    name: pendingToolCall.name,
    arguments: JSON.parse(pendingToolCall.argumentsJson) as unknown,
  };
}

/** Token count accepted from Provider Usage. / Provider Usage 接受的 Token 计数。 */
const TokenCountSchema = z.number().int().nonnegative().optional();

/**
 * Validates SSE JSON shape before any field influences Runtime control flow.
 * 在任何字段影响 Runtime 控制流之前校验 SSE JSON 结构。
 */
const DeepSeekStreamChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      reasoning_content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        index: z.number().int().nonnegative(),
        id: z.string().optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }).passthrough().optional(),
      }).passthrough()).optional(),
    }).passthrough().optional(),
  }).passthrough()),
  usage: z.object({
    prompt_tokens: TokenCountSchema,
    completion_tokens: TokenCountSchema,
    total_tokens: TokenCountSchema,
    prompt_cache_hit_tokens: TokenCountSchema,
    prompt_cache_miss_tokens: TokenCountSchema,
  }).passthrough().nullable().optional(),
}).passthrough();