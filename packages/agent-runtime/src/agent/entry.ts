import type {
  AgentExecutionMode,
  AgentMessage,
  AgentRunEvent,
  AgentResumeOptions,
  AgentRunInput,
  AgentRunResult,
  AgentSuspendedRunResult,
  AgentTool,
  AgentToolSource,
  AgentToolSourceSnapshot,
  AgentWarning,
  ModelAdapter,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ModelToolCall,
  ModelUsage,
  ToolExecutionResult,
  ToolMessage,
} from '../interfaces';
import { ModelCallError } from '../models/errors';
import {
  isReplaySafeTransientModelError,
  type ModelRetryPolicy,
} from '../models/retry';

/**
 * Exposes the default visible checkpoint policy instead of hiding a hard limit.
 * 公开默认的可见检查点策略，而不是隐藏硬上限。
 */
export const DEFAULT_AGENT_EXECUTION_MODE: AgentExecutionMode = Object.freeze({
  type: 'checkpointed',
  stepsPerCheckpoint: 10,
});

/**
 * Configures the model, Tool set, execution mode, and optional retry policy.
 * 配置模型、Tool 集合、执行模式与可选重试策略。
 */
export interface AgentRunLoopOptions {
  model: ModelAdapter;
  toolSource: AgentToolSource;
  executionMode?: AgentExecutionMode;
  modelRetryPolicy?: ModelRetryPolicy;
  onRunEvent?: (event: AgentRunEvent) => void | Promise<void>;
}

/**
 * Tracks the immediately preceding Tool call for duplicate-call warnings.
 * 跟踪紧邻的前一次 Tool 调用，用于生成重复调用 warning。
 */
interface PreviousToolCall {
  id: string;
  signature: string;
}

/**
 * Carries mutable state across one run segment without mutating caller input.
 * 在一个运行分段中携带可变状态，同时不修改调用方输入。
 */
interface AgentRunProgress {
  messages: AgentMessage[];
  steps: number;
  usage: ModelUsage;
  usageMissingFields: Set<keyof ModelUsage>;
  modelCallUsages: Array<ModelUsage | null>;
  warnings: AgentWarning[];
  previousToolCall: PreviousToolCall | undefined;
  abortSignal: AbortSignal;
  maxOutputTokens: number | undefined;
}

/**
 * Reports a Provider stream that violates the normalized Runtime protocol.
 * 表示 Provider stream 违反 Runtime 统一协议。
 */
export class ModelProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelProtocolError';
  }
}

/**
 * Owns the provider-neutral Agent loop, cancellation, retries, checkpoints, and Tool dispatch.
 * 统一拥有 Provider 无关的 Agent loop、取消、重试、检查点与 Tool 分派。
 */
export class AgentRunLoop {
  /**
   * Exposes the immutable execution mode selected for this Runtime.
   * 暴露该 Runtime 已选择的不可变执行模式。
   */
  readonly executionMode: AgentExecutionMode;
  /** Model adapter used for every model attempt. / 每次模型 attempt 使用的适配器。 */
  readonly #model: ModelAdapter;
  /** Resolves current Tool exposure for every request and execution. / 为每次请求和执行解析当前Tool暴露状态。 */
  readonly #toolSource: AgentToolSource;
  /** Optional policy for replay-safe transient model failures. / 用于 replay-safe 瞬时模型故障的可选策略。 */
  readonly #modelRetryPolicy: ModelRetryPolicy | undefined;
  /** Ordered observer used by the persistent Session owner. / 持久Session owner使用的有序观察者。 */
  readonly #onRunEvent: ((event: AgentRunEvent) => void | Promise<void>) | undefined;

  /**
   * Validates configuration once and snapshots the Tool registry.
   * 一次性校验配置并建立 Tool registry 快照。
   */
  constructor(options: AgentRunLoopOptions) {
    this.#model = options.model;
    this.executionMode = normalizeExecutionMode(
      options.executionMode ?? DEFAULT_AGENT_EXECUTION_MODE,
    );
    if (options.modelRetryPolicy !== undefined
      && (!Number.isInteger(options.modelRetryPolicy.maxRetries)
        || options.modelRetryPolicy.maxRetries < 0)) {
      throw new RangeError('modelRetryPolicy.maxRetries must be a non-negative integer.');
    }
    this.#modelRetryPolicy = options.modelRetryPolicy;
    this.#onRunEvent = options.onRunEvent;
    this.#toolSource = options.toolSource;
  }

  /**
   * Starts a new run from caller-provided history.
   * 从调用方提供的历史启动一次新运行。
   */
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.#runSegment({
      messages: [...input.messages],
      steps: 0,
      usage: {},
      usageMissingFields: new Set(),
      modelCallUsages: [],
      warnings: [],
      previousToolCall: undefined,
      abortSignal: input.abortSignal ?? new AbortController().signal,
      maxOutputTokens: input.maxOutputTokens,
    });
  }

  /**
   * Continues a suspended run from its next model call without replaying completed Tools.
   * 从下一次模型调用恢复暂停运行，不重复执行已完成的 Tool。
   */
  async resume(
    suspendedRun: AgentSuspendedRunResult,
    options: AgentResumeOptions = {},
  ): Promise<AgentRunResult> {
    return this.#runSegment({
      messages: [...suspendedRun.messages],
      steps: suspendedRun.steps,
      usage: { ...suspendedRun.usage },
      usageMissingFields: new Set(
        MODEL_USAGE_FIELDS.filter((field) =>
          suspendedRun.steps > 0 && suspendedRun.usage[field] === undefined),
      ),
      modelCallUsages: suspendedRun.modelCallUsages.map((usage) =>
        usage === null ? null : { ...usage }),
      warnings: [...suspendedRun.warnings],
      previousToolCall: findLastToolCall(suspendedRun.messages),
      abortSignal: options.abortSignal ?? new AbortController().signal,
      maxOutputTokens: undefined,
    });
  }

  /**
   * Executes one checkpoint segment and returns either completion or resumable suspension.
   * 执行一个检查点分段，并返回完成结果或可恢复暂停结果。
   */
  async #runSegment(progress: AgentRunProgress): Promise<AgentRunResult> {
    let segmentSteps = 0;

    while (true) {
      progress.abortSignal.throwIfAborted();
      const toolSnapshot = this.#toolSnapshot(progress.messages);
      const disclosedToolNames = new Set(
        toolSnapshot.tools.map((tool) => tool.descriptor.name),
      );
      const requestMessages = [
        ...toolSnapshot.systemMessages.map((message) => structuredClone(message)),
        ...progress.messages,
      ];
      const toolDescriptors = toolSnapshot.tools.map((tool) => tool.descriptor);
      const maxOutputTokens = this.#requestMaxOutputTokens(
        requestMessages,
        toolDescriptors,
        progress.maxOutputTokens,
      );
      await this.#onRunEvent?.({ type: 'model-call-started', maxOutputTokens });
      // One Step is one complete model response plus all Tool calls it requested.
      // 一个 Step 包含一次完整模型响应及其请求的全部 Tool 调用。
      const response = await this.#requestModelWithRetry(
        {
          messages: requestMessages,
          tools: toolDescriptors,
          maxOutputTokens,
        },
        progress.abortSignal,
      );
      progress.messages.push(response.message);
      progress.modelCallUsages.push(response.usage === undefined ? null : { ...response.usage });
      addUsage(progress.usage, response.usage, progress.usageMissingFields);
      progress.steps += 1;
      segmentSteps += 1;

      if (response.message.toolCalls.length === 0) {
        return {
          outcome: 'completed',
          output: response.message.content,
          messages: progress.messages,
          steps: progress.steps,
          usage: progress.usage,
          modelCallUsages: progress.modelCallUsages,
          warnings: progress.warnings,
        };
      }

      // Tool results are committed before a checkpoint so resume never repeats side effects.
      // Tool Result 在检查点之前落账，因此 resume 不会重复副作用。
      for (const toolCall of response.message.toolCalls) {
        progress.abortSignal.throwIfAborted();
        const signature = toolCallSignature(toolCall);
        if (progress.previousToolCall?.signature === signature) {
          progress.warnings.push({
            code: 'repeated_tool_call',
            toolName: toolCall.name,
            previousToolCallId: progress.previousToolCall.id,
            toolCallId: toolCall.id,
          });
        }
        progress.previousToolCall = { id: toolCall.id, signature };
        const { message: toolMessage, result: toolResult } = await this.#executeTool(
          toolCall,
          progress.messages,
          disclosedToolNames,
          progress.abortSignal,
        );
        await this.#onRunEvent?.({
          type: 'tool-result',
          toolCall: structuredClone(toolCall),
          result: structuredClone(toolResult),
        });
        progress.messages.push(toolMessage);
      }

      if (shouldSuspend(this.executionMode, segmentSteps)) {
        return {
          outcome: 'suspended',
          reason: 'step-checkpoint',
          messages: progress.messages,
          steps: progress.steps,
          usage: progress.usage,
          modelCallUsages: progress.modelCallUsages,
          warnings: progress.warnings,
        };
      }
    }
  }

  /**
   * Retries only explicitly classified replay-safe transient model failures.
   * 只重试被明确分类为 replay-safe 的瞬时模型故障。
   */
  async #requestModelWithRetry(
    request: ModelRequest,
    abortSignal: AbortSignal,
  ): Promise<ModelResponse> {
    let retryNumber = 0;

    while (true) {
      let observedEvent = false;
      try {
        return await this.#collectModelResponse(
          request,
          abortSignal,
          () => {
            observedEvent = true;
          },
        );
      } catch (error) {
        const retryPolicy = this.#modelRetryPolicy;
        if (!(error instanceof ModelCallError)
          || retryPolicy === undefined
          || observedEvent
          || !isReplaySafeTransientModelError(error)
          || retryNumber >= retryPolicy.maxRetries) {
          throw error;
        }

        retryNumber += 1;
        const delayMs = retryPolicy.delayBeforeRetry(error, retryNumber);
        if (delayMs === undefined) {
          throw error;
        }
        if (!Number.isFinite(delayMs) || delayMs < 0) {
          throw new RangeError('Model retry delay must be a non-negative finite number.');
        }
        await waitForRetry(delayMs, abortSignal);
      }
    }
  }

  /**
   * Collects normalized stream events into one protocol-complete response.
   * 将统一的 stream event 聚合为一条协议完整的响应。
   */
  async #collectModelResponse(
    request: ModelRequest,
    abortSignal: AbortSignal,
    observeEvent: () => void,
  ): Promise<ModelResponse> {
    let content = '';
    let reasoningContent: string | undefined;
    const toolCalls: ModelToolCall[] = [];
    let usage: ModelUsage | undefined;
    let completed = false;

    for await (const event of this.#model.stream(request, { abortSignal })) {
      abortSignal.throwIfAborted();
      observeEvent();
      if (completed) {
        throw new ModelProtocolError('Model stream emitted an event after response-completed.');
      }
      await this.#onRunEvent?.(event);
      switch (event.type) {
        case 'text-delta':
          content += event.delta;
          break;
        case 'reasoning-delta':
          reasoningContent = (reasoningContent ?? '') + event.delta;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
        case 'usage':
          usage = event.usage;
          break;
        case 'response-completed':
          completed = true;
          break;
      }
    }
    abortSignal.throwIfAborted();

    if (!completed) {
      throw new ModelProtocolError('Model stream ended without a response-completed event.');
    }

    return {
      message: {
        role: 'assistant',
        content,
        ...(reasoningContent === undefined ? {} : { reasoningContent }),
        toolCalls,
      },
      ...(usage === undefined ? {} : { usage }),
    };
  }

  #requestMaxOutputTokens(
    messages: readonly AgentMessage[],
    toolDescriptors: readonly AgentTool['descriptor'][],
    requestedMaximum: number | undefined,
  ): number {
    const estimatedInputTokens = messages.reduce((total, message) => {
      const contentBytes = message.role === 'assistant'
        ? Buffer.byteLength(message.content)
          + Buffer.byteLength(message.reasoningContent ?? '')
          + Buffer.byteLength(JSON.stringify(message.toolCalls))
        : message.role === 'tool'
          ? Buffer.byteLength(message.content) + Buffer.byteLength(message.name)
          : Buffer.byteLength(message.content);
      return total + contentBytes + 64;
    }, toolDescriptors.length === 0
      ? 0
      : Buffer.byteLength(JSON.stringify(toolDescriptors)));
    const remainingContextTokens = this.#model.capabilities.contextWindowTokens
      - estimatedInputTokens;
    if (remainingContextTokens <= 0) {
      throw new Error('Agent message exceeds the model Context Window.');
    }
    return Math.min(
      requestedMaximum ?? this.#model.capabilities.maxOutputTokens,
      this.#model.capabilities.maxOutputTokens,
      remainingContextTokens,
    );
  }

  /**
   * Resolves one Tool call into a correlated Tool message.
   * 将一次 Tool 调用解析为带关联 ID 的 Tool 消息。
   */
  async #executeTool(
    toolCall: ModelToolCall,
    messages: readonly AgentMessage[],
    disclosedToolNames: ReadonlySet<string>,
    abortSignal: AbortSignal,
  ): Promise<{ message: ToolMessage; result: ToolExecutionResult }> {
    const tool = disclosedToolNames.has(toolCall.name)
      ? this.#toolSnapshot(messages).tools
        .find((candidate) => candidate.descriptor.name === toolCall.name)
      : undefined;
    const result = tool === undefined
      ? {
          ok: false as const,
          error: {
            code: 'unknown_tool',
            message: `Unknown tool "${toolCall.name}".`,
          },
        }
      : await tool.execute(toolCall.arguments, { abortSignal });

    return {
      result,
      message: {
        role: 'tool',
        toolCallId: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(result),
      },
    };
  }

  /** Validates one dynamic Tool snapshot before it reaches a Model or executor. */
  #toolSnapshot(messages: readonly AgentMessage[]): AgentToolSourceSnapshot {
    const snapshot = this.#toolSource.snapshot(messages);
    const names = new Set<string>();
    for (const tool of snapshot.tools) {
      if (names.has(tool.descriptor.name)) {
        throw new Error(`Duplicate tool "${tool.descriptor.name}".`);
      }
      names.add(tool.descriptor.name);
    }
    return snapshot;
  }
}

/**
 * Adds only Provider-reported Usage fields and leaves missing facts unknown.
 * 只累计 Provider 已报告的 Usage 字段，缺失事实保持未知。
 */
const MODEL_USAGE_FIELDS = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cacheHitInputTokens',
  'cacheMissInputTokens',
] as const satisfies readonly (keyof ModelUsage)[];

function addUsage(
  total: ModelUsage,
  next: ModelUsage | undefined,
  missingFields: Set<keyof ModelUsage>,
): void {
  for (const field of MODEL_USAGE_FIELDS) {
    const value = next?.[field];
    if (value === undefined) {
      missingFields.add(field);
      delete total[field];
      continue;
    }
    if (!missingFields.has(field)) {
      total[field] = addOptional(total[field], value);
    }
  }
}

/**
 * Adds an optional metric without converting an absent value into zero.
 * 累加可选指标，同时不把缺失值误写成零。
 */
function addOptional(current: number | undefined, next: number | undefined): number | undefined {
  if (next === undefined) {
    return current;
  }
  return (current ?? 0) + next;
}

/**
 * Validates and snapshots the execution mode at the Runtime boundary.
 * 在 Runtime 边界校验并快照执行模式。
 */
function normalizeExecutionMode(executionMode: AgentExecutionMode): AgentExecutionMode {
  if (executionMode.type === 'continuous') {
    return Object.freeze({ type: 'continuous' });
  }
  if (!Number.isInteger(executionMode.stepsPerCheckpoint)
    || executionMode.stepsPerCheckpoint < 1) {
    throw new RangeError('stepsPerCheckpoint must be a positive integer.');
  }
  return Object.freeze({
    type: 'checkpointed',
    stepsPerCheckpoint: executionMode.stepsPerCheckpoint,
  });
}

/**
 * Determines whether the current segment reached its visible checkpoint.
 * 判断当前分段是否到达可见检查点。
 */
function shouldSuspend(executionMode: AgentExecutionMode, segmentSteps: number): boolean {
  return executionMode.type === 'checkpointed'
    && segmentSteps >= executionMode.stepsPerCheckpoint;
}

/**
 * Restores duplicate-call context from the latest assistant Tool call.
 * 从最近的助手 Tool 调用恢复重复调用检测上下文。
 */
function findLastToolCall(messages: readonly AgentMessage[]): PreviousToolCall | undefined {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== 'assistant' || message.toolCalls.length === 0) {
      continue;
    }
    const toolCall = message.toolCalls.at(-1);
    if (toolCall !== undefined) {
      return {
        id: toolCall.id,
        signature: toolCallSignature(toolCall),
      };
    }
  }
  return undefined;
}

/**
 * Builds a sensitive-data-free signature from a Tool name and canonical arguments.
 * 使用 Tool 名与规范化参数构造不额外保存敏感数据的签名。
 */
function toolCallSignature(toolCall: ModelToolCall): string {
  return `${toolCall.name}\u0000${canonicalJson(toolCall.arguments)}`;
}

/**
 * Serializes JSON-like values with stable object-key ordering.
 * 使用稳定的对象键顺序序列化 JSON-like 值。
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/**
 * Waits for retry backoff while preserving immediate caller cancellation.
 * 等待重试退避，同时保持调用方取消可立即生效。
 */
async function waitForRetry(delayMs: number, abortSignal: AbortSignal): Promise<void> {
  abortSignal.throwIfAborted();
  if (delayMs === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortSignal.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(abortSignal.reason);
    };
    abortSignal.addEventListener('abort', abort, { once: true });
  });
}