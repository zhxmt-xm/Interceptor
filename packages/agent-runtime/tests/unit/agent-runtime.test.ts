import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AGENT_EXECUTION_MODE,
  defineTool,
  z,
  type AgentMessage,
  type ModelAdapter,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamEvent,
} from '../../src';
import { AgentRunLoop } from '../../src/agent/entry';
import { TEST_MODEL_CAPABILITIES } from './model-fixtures';

class QueueModel implements ModelAdapter {
  readonly capabilities = TEST_MODEL_CAPABILITIES;
  readonly requests: ModelRequest[] = [];
  readonly #responses: ModelResponse[];

  constructor(responses: ModelResponse[]) {
    this.#responses = [...responses];
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    this.requests.push({
      ...request,
      messages: [...request.messages],
      tools: [...request.tools],
    });
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error('QueueModel has no response left');
    }
    if (response.message.content.length > 0) {
      yield { type: 'text-delta', delta: response.message.content };
    }
    for (const toolCall of response.message.toolCalls) {
      yield { type: 'tool-call', toolCall };
    }
    if (response.usage !== undefined) {
      yield { type: 'usage', usage: response.usage };
    }
    yield { type: 'response-completed' };
  }
}

function finalResponse(content: string): ModelResponse {
  return {
    message: {
      role: 'assistant',
      content,
      toolCalls: [],
    },
  };
}

function toolResponse(
  name: string,
  args: unknown,
  id = 'call-1',
): ModelResponse {
  return {
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [{ id, name, arguments: args }],
    },
  };
}

function userMessage(content: string): AgentMessage {
  return { role: 'user', content };
}

describe('AgentRunLoop', () => {
  it('uses the public checkpointed execution mode by default', () => {
    const model = new QueueModel([]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    expect(DEFAULT_AGENT_EXECUTION_MODE).toEqual({
      type: 'checkpointed',
      stepsPerCheckpoint: 10,
    });
    expect(agentRuntime.executionMode).toEqual(DEFAULT_AGENT_EXECUTION_MODE);
  });

  it('rejects an invalid checkpoint interval', () => {
    const model = new QueueModel([]);

    expect(() => new AgentRunLoop({
      model,
      tools: [],
      executionMode: { type: 'checkpointed', stepsPerCheckpoint: 0 },
    })).toThrow(new RangeError('stepsPerCheckpoint must be a positive integer.'));
  });

  it('returns a final model answer without executing tools', async () => {
    const model = new QueueModel([finalResponse('Hello')]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    const result = await agentRuntime.run({
      messages: [userMessage('Say hello')],
    });

    expect(result.output).toBe('Hello');
    expect(result.steps).toBe(1);
    expect(result.messages).toHaveLength(2);
    expect(model.requests).toHaveLength(1);
  });

  it('executes a validated tool call and returns its result to the model', async () => {
    const execute = vi.fn(({ left, right }: { left: number; right: number }) => left * right);
    const multiply = defineTool({
      name: 'multiply',
      description: 'Multiply two numbers.',
      inputSchema: z.object({
        left: z.number(),
        right: z.number(),
      }).strict(),
      execute,
    });
    const model = new QueueModel([
      toolResponse('multiply', { left: 6, right: 7 }),
      finalResponse('The result is 42.'),
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [multiply] });

    const result = await agentRuntime.run({
      messages: [userMessage('What is 6 * 7?')],
    });

    expect(result.output).toBe('The result is 42.');
    expect(result.steps).toBe(2);
    expect(execute).toHaveBeenCalledWith(
      { left: 6, right: 7 },
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      name: 'multiply',
      content: JSON.stringify({ ok: true, value: 42 }),
    });
  });

  it('accumulates cache usage across model calls', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: ({ value }) => value,
    });
    const firstResponse = toolResponse('echo', { value: 'one' });
    firstResponse.usage = {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      cacheHitInputTokens: 8,
      cacheMissInputTokens: 4,
    };
    const secondResponse = finalResponse('Finished.');
    secondResponse.usage = {
      inputTokens: 20,
      outputTokens: 4,
      totalTokens: 24,
      cacheHitInputTokens: 15,
      cacheMissInputTokens: 5,
    };
    const model = new QueueModel([firstResponse, secondResponse]);
    const agentRuntime = new AgentRunLoop({ model, tools: [echo] });

    const result = await agentRuntime.run({
      messages: [userMessage('Echo once.')],
    });

    expect(result.usage).toEqual({
      inputTokens: 32,
      outputTokens: 7,
      totalTokens: 39,
      cacheHitInputTokens: 23,
      cacheMissInputTokens: 9,
    });
  });

  it('keeps a Usage bucket unknown when any model call omits that field', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: ({ value }) => value,
    });
    const firstResponse = toolResponse('echo', { value: 'one' });
    firstResponse.usage = {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      cacheHitInputTokens: 8,
      cacheMissInputTokens: 4,
    };
    const model = new QueueModel([firstResponse, finalResponse('Finished.')]);
    const agentRuntime = new AgentRunLoop({ model, tools: [echo] });

    const result = await agentRuntime.run({ messages: [userMessage('Echo once.')] });

    expect(result.usage).toEqual({});
    expect(result.modelCallUsages).toEqual([
      {
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
        cacheHitInputTokens: 8,
        cacheMissInputTokens: 4,
      },
      null,
    ]);
  });

  it('returns invalid tool arguments to the model without executing the tool', async () => {
    const execute = vi.fn(() => 0);
    const multiply = defineTool({
      name: 'multiply',
      description: 'Multiply two numbers.',
      inputSchema: z.object({
        left: z.number(),
        right: z.number(),
      }).strict(),
      execute,
    });
    const model = new QueueModel([
      toolResponse('multiply', { left: 'six', right: 7 }),
      finalResponse('I could not calculate that because the arguments were invalid.'),
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [multiply] });

    await agentRuntime.run({ messages: [userMessage('What is 6 * 7?')] });

    expect(execute).not.toHaveBeenCalled();
    const toolMessage = model.requests[1]?.messages.at(-1);
    expect(toolMessage?.role).toBe('tool');
    if (toolMessage?.role !== 'tool') {
      throw new Error('Expected a tool message');
    }
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_arguments',
        message: 'Invalid arguments for tool "multiply".',
      },
    });
  });

  it('returns an unknown tool error to the model', async () => {
    const model = new QueueModel([
      toolResponse('missing_tool', {}),
      finalResponse('That tool is unavailable.'),
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    await agentRuntime.run({ messages: [userMessage('Use the missing tool')] });

    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      name: 'missing_tool',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'unknown_tool',
          message: 'Unknown tool "missing_tool".',
        },
      }),
    });
  });

  it('warns when consecutive tool calls have the same name and canonical arguments', async () => {
    const inspect = defineTool({
      name: 'inspect',
      description: 'Inspect values.',
      inputSchema: z.object({ left: z.number(), right: z.number() }).strict(),
      execute: ({ left, right }) => left + right,
    });
    const model = new QueueModel([
      toolResponse('inspect', { left: 1, right: 2 }, 'call-1'),
      toolResponse('inspect', { right: 2, left: 1 }, 'call-2'),
      finalResponse('Finished.'),
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [inspect] });

    const result = await agentRuntime.run({ messages: [userMessage('Inspect twice.')] });

    expect(result.warnings).toEqual([{
      code: 'repeated_tool_call',
      toolName: 'inspect',
      previousToolCallId: 'call-1',
      toolCallId: 'call-2',
    }]);
  });

  it('does not warn when consecutive tool arguments differ', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: ({ value }) => value,
    });
    const model = new QueueModel([
      toolResponse('echo', { value: 'one' }, 'call-1'),
      toolResponse('echo', { value: 'two' }, 'call-2'),
      finalResponse('Finished.'),
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [echo] });

    const result = await agentRuntime.run({ messages: [userMessage('Echo twice.')] });

    expect(result.warnings).toEqual([]);
  });

  it('suspends at a step checkpoint and resumes without repeating completed tools', async () => {
    const execute = vi.fn(({ value }: { value: string }) => value);
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute,
    });
    const model = new QueueModel([
      toolResponse('echo', { value: 'one' }, 'call-1'),
      toolResponse('echo', { value: 'two' }, 'call-2'),
      finalResponse('Finished.'),
    ]);
    const agentRuntime = new AgentRunLoop({
      model,
      tools: [echo],
      executionMode: { type: 'checkpointed', stepsPerCheckpoint: 2 },
    });

    const suspended = await agentRuntime.run({
      messages: [userMessage('Echo twice, then finish.')],
    });

    expect(suspended).toMatchObject({
      outcome: 'suspended',
      reason: 'step-checkpoint',
      steps: 2,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(model.requests).toHaveLength(2);

    if (suspended.outcome !== 'suspended') {
      throw new Error('Expected a suspended run.');
    }
    const completed = await agentRuntime.resume(suspended);

    expect(completed).toMatchObject({
      outcome: 'completed',
      output: 'Finished.',
      steps: 3,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(model.requests).toHaveLength(3);
    expect(model.requests[2]?.messages).toEqual(suspended.messages);
  });

  it('continues without a step checkpoint in continuous mode', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: ({ value }) => value,
    });
    const toolResponses = Array.from({ length: 11 }, (_, index) => toolResponse(
      'echo',
      { value: `value-${index + 1}` },
      `call-${index + 1}`,
    ));
    const model = new QueueModel([...toolResponses, finalResponse('Finished.')]);
    const agentRuntime = new AgentRunLoop({
      model,
      tools: [echo],
      executionMode: { type: 'continuous' },
    });

    const result = await agentRuntime.run({
      messages: [userMessage('Continue until finished.')],
    });

    expect(result).toMatchObject({
      outcome: 'completed',
      output: 'Finished.',
      steps: 12,
    });
    expect(model.requests).toHaveLength(12);
  });
});