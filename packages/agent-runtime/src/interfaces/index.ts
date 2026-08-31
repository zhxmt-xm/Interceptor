/**
 * Identifies one structured tool invocation emitted by a model.
 * 标识模型生成的一次结构化 Tool 调用。
 */
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

/**
 * Carries stable application instructions into a model request.
 * 将稳定的应用指令传入一次模型请求。
 */
export interface SystemMessage {
  role: 'system';
  content: string;
}

/**
 * Carries one user-authored message in provider-neutral history.
 * 表示 Provider 无关历史中的一条用户消息。
 */
export interface UserMessage {
  role: 'user';
  content: string;
}

/**
 * Preserves assistant text, provider reasoning state, and tool calls as one ordered item.
 * 将助手文本、Provider reasoning 状态和 Tool 调用保存在同一个有序条目中。
 */
export interface AssistantMessage {
  role: 'assistant';
  content: string;
  /**
   * Keeps provider continuation state separate from user-visible assistant text.
   * 将 Provider continuation state 与用户可见的助手文本分离保存。
   */
  reasoningContent?: string;
  toolCalls: readonly ModelToolCall[];
}

/**
 * Correlates an executed Tool result with the model-issued call ID.
 * 使用模型生成的 call ID 关联一次已执行的 Tool 结果。
 */
export interface ToolMessage {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
}

/**
 * Defines the provider-neutral message history accepted by AgentRuntime.
 * 定义 AgentRuntime 接受的 Provider 无关消息历史。
 */
export type AgentMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/**
 * Describes one model-visible Tool without exposing its implementation.
 * 描述一个模型可见的 Tool，但不暴露其实现。
 */
export interface ModelToolDescriptor {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

/**
 * Contains the complete provider-neutral input for one model attempt.
 * 包含一次模型 attempt 的完整 Provider 无关输入。
 */
export interface ModelRequest {
  messages: readonly AgentMessage[];
  tools: readonly ModelToolDescriptor[];
  maxOutputTokens?: number;
}

/**
 * Records only token facts explicitly returned by the Provider.
 * 只记录 Provider 明确返回的 Token 事实。
 */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheHitInputTokens?: number;
  cacheMissInputTokens?: number;
}

/**
 * Represents one fully assembled model response after Streaming completes.
 * 表示 Streaming 完成后组装出的一次完整模型响应。
 */
export interface ModelResponse {
  message: AssistantMessage;
  usage?: ModelUsage;
}

/**
 * Defines normalized incremental events emitted by every ModelAdapter.
 * 定义所有 ModelAdapter 统一输出的增量事件。
 */
export type ModelStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call'; toolCall: ModelToolCall }
  | { type: 'usage'; usage: ModelUsage }
  | { type: 'response-completed' };

/** Extends Provider stream events with Runtime-owned Model/Tool lifecycle boundaries. */
export type AgentRunEvent =
  | { type: 'model-call-started'; maxOutputTokens: number }
  | ModelStreamEvent
  | { type: 'tool-result'; toolCall: ModelToolCall; result: ToolExecutionResult };

/**
 * Supplies caller-owned cancellation to one model attempt.
 * 向一次模型 attempt 传入调用方拥有的取消信号。
 */
export interface ModelCallOptions {
  abortSignal: AbortSignal;
}

/**
 * Declares model limits and protocol features required by Context construction.
 * 声明 Context 构建所需的模型上限与协议能力。
 */
export interface ModelCapabilities {
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly supportsStreaming: boolean;
  readonly supportsToolCalls: boolean;
  readonly supportsReasoningContent: boolean;
  readonly supportsCacheUsage: boolean;
}

/**
 * Adapts one Provider into the Runtime's normalized Streaming contract.
 * 将一个 Provider 适配为 Runtime 的统一 Streaming 契约。
 */
export interface ModelAdapter {
  readonly capabilities: ModelCapabilities;
  /**
   * Streams one normalized model attempt under caller-owned cancellation.
   * 在调用方拥有的取消信号下流式执行一次标准化模型 attempt。
   */
  stream(request: ModelRequest, options: ModelCallOptions): AsyncIterable<ModelStreamEvent>;
}

/** Describes an explicit API-key mutation without overloading empty strings. */
export type AgentCredentialChange =
  | { readonly action: 'keep' }
  | { readonly action: 'replace'; readonly apiKey: string }
  | { readonly action: 'remove' };

/** Configures the fixed hosted DeepSeek preset. */
export interface AgentDeepSeekProviderDraft {
  readonly providerId: string | null;
  readonly kind: 'deepseek';
  readonly profileName: string;
  readonly modelId: string;
  readonly credential: AgentCredentialChange;
}

/** Configures one custom OpenAI-compatible Chat Completions endpoint. */
export interface AgentOpenAiCompatibleProviderDraft {
  readonly providerId: string | null;
  readonly kind: 'openai-compatible';
  readonly profileName: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly contextWindowTokens: number;
  readonly maximumOutputTokens: number;
  readonly credential: AgentCredentialChange;
}

/** Represents one complete Provider draft accepted by Runtime. */
export type AgentProviderDraft =
  | AgentDeepSeekProviderDraft
  | AgentOpenAiCompatibleProviderDraft;

/** Exposes Provider metadata and only a redacted credential state to Renderer. */
export interface AgentModelSummary {
  readonly providerId: string;
  readonly kind: AgentProviderDraft['kind'];
  readonly profileName: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly contextWindowTokens: number;
  readonly maximumOutputTokens: number;
  readonly credentialConfigured: boolean;
  readonly credentialLastFour: string | null;
  readonly isDefault: boolean;
}

/** Returns the stable configured-model order and the default for new Chats. */
export interface AgentModelsSnapshot {
  readonly defaultProviderId: string | null;
  readonly models: readonly AgentModelSummary[];
}

/** Authorizes one exact tested draft for a single subsequent save. */
export interface AgentProviderVerification {
  readonly verificationId: string;
  readonly model: AgentModelSummary;
}

/** Describes one persisted Session in the Chat selector. */
export interface AgentSessionSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly itemCount: number;
}

/** Represents one user-authored transcript item. */
export interface AgentUserTranscriptItem {
  readonly kind: 'user-message';
  readonly itemId: string;
  readonly turnId: string;
  readonly content: string;
  readonly createdAt: number;
}

/** Represents one streamed assistant transcript item. */
export interface AgentAssistantTranscriptItem {
  readonly kind: 'assistant-message';
  readonly itemId: string;
  readonly turnId: string;
  readonly content: string;
  readonly reasoningContent: string;
  readonly partial: boolean;
  readonly createdAt: number;
}

/** Shows one model-authored Tool invocation in the durable Transcript. */
export interface AgentToolApproval {
  readonly approvalId: string;
  readonly status: 'pending' | 'allowed' | 'denied' | 'cancelled';
  readonly description: string;
  readonly effect: string;
}

/** Selects whether change Tools require a decision in one Session. */
export type AgentToolExecutionMode = 'ask' | 'auto';

/** Shows one model-authored Tool invocation in the durable Transcript. */
export interface AgentToolCallTranscriptItem {
  readonly kind: 'tool-call';
  readonly itemId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly status: 'running' | 'completed' | 'failed';
  readonly approval: AgentToolApproval | null;
  readonly createdAt: number;
}

/** Shows one locally executed Tool result correlated to its invocation. */
export interface AgentToolResultTranscriptItem {
  readonly kind: 'tool-result';
  readonly itemId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly name: string;
  readonly result: ToolExecutionResult;
  readonly createdAt: number;
}

/** Represents the complete durable transcript item set. */
export type AgentTranscriptItem =
  | AgentUserTranscriptItem
  | AgentAssistantTranscriptItem
  | AgentToolCallTranscriptItem
  | AgentToolResultTranscriptItem;

/** Defines persisted Turn terminal and running states. */
export type AgentTurnStatus =
  | 'running'
  | 'waiting-for-tool-approval'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** Exposes one persisted Turn without Provider wire details. */
export interface AgentTurnSnapshot {
  readonly turnId: string;
  readonly userItemId: string;
  readonly status: AgentTurnStatus;
  readonly retryOfTurnId: string | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Aggregates Provider-reported Token facts across completed model calls. */
export interface AgentSessionUsage {
  readonly modelCallCount: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly cacheHitInputTokens: number | null;
  readonly cacheMissInputTokens: number | null;
  readonly cacheHitRate: number | null;
  readonly cacheMetricsCoverage: number | null;
}

/** Describes the most recent model call's Context Window usage. */
export interface AgentContextUsage {
  readonly contextWindowTokens: number;
  readonly currentContextTokens: number | null;
  readonly remainingContextTokens: number | null;
  readonly maxOutputTokens: number;
  readonly source: 'provider' | 'estimated' | 'unavailable';
}

/** Returns one complete persisted Chat snapshot. */
export interface AgentSessionSnapshot {
  readonly sessionId: string;
  readonly summary: AgentSessionSummary;
  readonly toolExecutionMode: AgentToolExecutionMode;
  readonly items: readonly AgentTranscriptItem[];
  readonly turns: readonly AgentTurnSnapshot[];
  readonly currentTurn: AgentTurnSnapshot | null;
  readonly usage: AgentSessionUsage;
  readonly contextUsage: AgentContextUsage;
  readonly sequence: number;
}

/** Returns stable Session order and the explicitly selected Chat. */
export interface AgentSessionsSnapshot {
  readonly currentSessionId: string | null;
  readonly sessions: readonly AgentSessionSummary[];
}

/** Broadcasts one durable complete Session snapshot. */
export interface AgentSessionSnapshotEvent {
  readonly type: 'session-updated';
  readonly sessionId: string;
  readonly turnId: string | null;
  readonly sequence: number;
  readonly snapshot: AgentSessionSnapshot;
}

/** Broadcasts one already-persisted assistant delta without repeating full history. */
export interface AgentAssistantDeltaEvent {
  readonly type: 'assistant-delta';
  readonly sessionId: string;
  readonly turnId: string;
  readonly assistantItemId: string;
  readonly textDelta: string;
  readonly reasoningDelta: string;
  readonly updatedAt: number;
  readonly sequence: number;
}

/** Represents one ordered durable Session event. */
export type AgentRuntimeEvent = AgentSessionSnapshotEvent | AgentAssistantDeltaEvent;

/** Receives ordered durable Session updates. */
export type AgentRuntimeEventListener = (event: AgentRuntimeEvent) => void;

/** Abstracts Electron safeStorage without importing Electron into Runtime. */
export interface AgentSecureStore {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(data: Buffer): string;
}

/**
 * Provides cancellation state to one Tool execution.
 * 向一次 Tool 执行提供取消状态。
 */
export interface ToolExecutionContext {
  abortSignal: AbortSignal;
}

/** Distinguishes read-only Tool access from product state changes. */
export type AgentToolKind = 'query' | 'change';

/** Describes one change Tool call before its executor can run. */
export interface AgentToolAuthorizationRequest {
  readonly toolCall: ModelToolCall;
  readonly description: string;
  readonly effect: string;
}

/** Represents one explicit decision for a change Tool call. */
export type AgentToolAuthorizationDecision = 'allow' | 'deny';

/** Resolves one change Tool decision under caller-owned cancellation. */
export type AgentToolAuthorizer = (
  request: AgentToolAuthorizationRequest,
  context: ToolExecutionContext,
) => Promise<AgentToolAuthorizationDecision>;

/**
 * Couples a model-visible descriptor with its locally validated executor.
 * 将模型可见 descriptor 与本地校验后的执行器组合在一起。
 */
export interface AgentTool {
  readonly kind: AgentToolKind;
  readonly effect?: string;
  descriptor: ModelToolDescriptor;
  /**
   * Validates and executes one model-issued call under caller-owned cancellation.
   * 在调用方拥有的取消信号下校验并执行一次模型发起的调用。
   */
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

/** One immutable Tool exposure snapshot for a Model Call or Tool execution. */
export interface AgentToolSourceSnapshot {
  readonly systemMessages: readonly SystemMessage[];
  readonly tools: readonly AgentTool[];
}

/** Resolves currently authorized Tools from the persisted Session history. */
export interface AgentToolSource {
  snapshot(messages: readonly AgentMessage[]): AgentToolSourceSnapshot;
}

/**
 * Carries a stable, model-correctable Tool failure.
 * 表示模型可修正的稳定 Tool 失败。
 */
export interface ToolError {
  code: string;
  message: string;
}

/**
 * Distinguishes successful Tool output from a recoverable Tool error result.
 * 区分成功的 Tool 输出与可恢复的 Tool 错误结果。
 */
export type ToolExecutionResult =
  | { ok: true; value: unknown }
  | { ok: false; error: ToolError; issues?: readonly ToolInputIssue[] };

/**
 * Preserves one schema validation issue without leaking implementation errors.
 * 保存一条 Schema 校验问题，同时不泄漏实现异常。
 */
export interface ToolInputIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
}

/**
 * Starts a new in-memory Agent run from the supplied history.
 * 从给定历史启动一次新的内存 Agent 运行。
 */
export interface AgentRunInput {
  messages: readonly AgentMessage[];
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}

/** Starts a Runtime run through one configured Provider. */
export interface AgentRuntimeRunInput extends AgentRunInput {
  providerId: string;
}

/**
 * Selects visible step checkpoints or uninterrupted execution for a Session.
 * 为 Session 选择可见 Step 检查点或连续执行模式。
 */
export type AgentExecutionMode =
  | { readonly type: 'checkpointed'; readonly stepsPerCheckpoint: number }
  | { readonly type: 'continuous' };

/**
 * Supplies caller-owned cancellation when resuming a suspended run.
 * 恢复暂停运行时传入调用方拥有的取消信号。
 */
export interface AgentResumeOptions {
  abortSignal?: AbortSignal;
}

/**
 * Reports a suspicious repeated Tool call without blocking execution.
 * 报告可疑的重复 Tool 调用，但不阻止继续执行。
 */
export interface AgentWarning {
  code: 'repeated_tool_call';
  toolName: string;
  previousToolCallId: string;
  toolCallId: string;
}

/**
 * Stores state shared by completed and suspended run outcomes.
 * 保存 completed 与 suspended 两种运行结果共享的状态。
 */
interface AgentRunResultBase {
  messages: readonly AgentMessage[];
  steps: number;
  usage: ModelUsage;
  modelCallUsages: readonly (ModelUsage | null)[];
  warnings: readonly AgentWarning[];
}

/**
 * Represents a run that reached a model-authored final answer.
 * 表示已经得到模型最终回答的运行。
 */
export interface AgentCompletedRunResult extends AgentRunResultBase {
  outcome: 'completed';
  output: string;
}

/**
 * Represents a resumable run paused at a visible step checkpoint.
 * 表示在可见 Step 检查点暂停且可恢复的运行。
 */
export interface AgentSuspendedRunResult extends AgentRunResultBase {
  outcome: 'suspended';
  reason: 'step-checkpoint';
}

/**
 * Makes completion and suspension explicit at every call site.
 * 让每个调用点都显式区分完成与暂停。
 */
export type AgentRunResult = AgentCompletedRunResult | AgentSuspendedRunResult;

/** Preserves Provider identity with a Runtime-owned completed run. */
export type AgentRuntimeCompletedRunResult = AgentCompletedRunResult & {
  readonly providerId: string;
};

/** Preserves Provider identity with a Runtime-owned suspended run. */
export type AgentRuntimeSuspendedRunResult = AgentSuspendedRunResult & {
  readonly providerId: string;
};

/** Makes completion and suspension explicit at the Provider-selected Runtime boundary. */
export type AgentRuntimeRunResult =
  | AgentRuntimeCompletedRunResult
  | AgentRuntimeSuspendedRunResult;