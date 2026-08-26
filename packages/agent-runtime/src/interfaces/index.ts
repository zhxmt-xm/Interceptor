export interface ModelToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls: readonly ModelToolCall[];
}

export interface ToolMessage {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
}

export type AgentMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export interface ModelToolDescriptor {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface ModelRequest {
  messages: readonly AgentMessage[];
  tools: readonly ModelToolDescriptor[];
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ModelResponse {
  message: AssistantMessage;
  usage?: ModelUsage;
}

export interface ModelCallOptions {
  abortSignal: AbortSignal;
}

export interface ModelAdapter {
  complete(request: ModelRequest, options: ModelCallOptions): Promise<ModelResponse>;
}

export interface ToolExecutionContext {
  abortSignal: AbortSignal;
}

export interface AgentTool {
  descriptor: ModelToolDescriptor;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export type ToolExecutionResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; issues?: readonly ToolInputIssue[] };

export interface ToolInputIssue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
}

export interface AgentRunInput {
  messages: readonly AgentMessage[];
  abortSignal?: AbortSignal;
}

export interface AgentRunResult {
  output: string;
  messages: readonly AgentMessage[];
  steps: number;
  usage: ModelUsage;
}