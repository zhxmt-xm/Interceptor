import type {
  AgentMessage,
  AgentRunInput,
  AgentRunResult,
  AgentTool,
  ModelAdapter,
  ModelToolCall,
  ModelUsage,
  ToolMessage,
} from '../interfaces';

const DEFAULT_MAX_STEPS = 10;

export interface AgentRunnerOptions {
  model: ModelAdapter;
  tools: readonly AgentTool[];
  maxSteps?: number;
}

export class AgentMaxStepsError extends Error {
  constructor(maxSteps: number) {
    super(`Agent exceeded the maximum of ${maxSteps} model steps.`);
    this.name = 'AgentMaxStepsError';
  }
}

export class AgentRunner {
  readonly #model: ModelAdapter;
  readonly #tools: ReadonlyMap<string, AgentTool>;
  readonly #toolDescriptors: readonly AgentTool['descriptor'][];
  readonly #maxSteps: number;

  constructor(options: AgentRunnerOptions) {
    this.#model = options.model;
    this.#maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    if (!Number.isInteger(this.#maxSteps) || this.#maxSteps < 1) {
      throw new RangeError('maxSteps must be a positive integer.');
    }

    const tools = new Map<string, AgentTool>();
    for (const tool of options.tools) {
      if (tools.has(tool.descriptor.name)) {
        throw new Error(`Duplicate tool "${tool.descriptor.name}".`);
      }
      tools.set(tool.descriptor.name, tool);
    }
    this.#tools = tools;
    this.#toolDescriptors = [...tools.values()].map((tool) => tool.descriptor);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const messages: AgentMessage[] = [...input.messages];
    const abortSignal = input.abortSignal ?? new AbortController().signal;
    const usage: ModelUsage = {};

    for (let step = 1; step <= this.#maxSteps; step += 1) {
      abortSignal.throwIfAborted();
      const response = await this.#model.complete(
        {
          messages: [...messages],
          tools: this.#toolDescriptors,
        },
        { abortSignal },
      );
      messages.push(response.message);
      addUsage(usage, response.usage);

      if (response.message.toolCalls.length === 0) {
        return {
          output: response.message.content,
          messages,
          steps: step,
          usage,
        };
      }

      for (const toolCall of response.message.toolCalls) {
        abortSignal.throwIfAborted();
        messages.push(await this.#executeTool(toolCall, abortSignal));
      }
    }

    throw new AgentMaxStepsError(this.#maxSteps);
  }

  async #executeTool(
    toolCall: ModelToolCall,
    abortSignal: AbortSignal,
  ): Promise<ToolMessage> {
    const tool = this.#tools.get(toolCall.name);
    const result = tool === undefined
      ? { ok: false as const, error: `Unknown tool "${toolCall.name}".` }
      : await tool.execute(toolCall.arguments, { abortSignal });

    return {
      role: 'tool',
      toolCallId: toolCall.id,
      name: toolCall.name,
      content: JSON.stringify(result),
    };
  }
}

function addUsage(total: ModelUsage, next: ModelUsage | undefined): void {
  if (next === undefined) {
    return;
  }
  total.inputTokens = addOptional(total.inputTokens, next.inputTokens);
  total.outputTokens = addOptional(total.outputTokens, next.outputTokens);
  total.totalTokens = addOptional(total.totalTokens, next.totalTokens);
}

function addOptional(current: number | undefined, next: number | undefined): number | undefined {
  if (next === undefined) {
    return current;
  }
  return (current ?? 0) + next;
}