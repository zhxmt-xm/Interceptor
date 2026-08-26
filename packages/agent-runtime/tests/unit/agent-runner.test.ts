import { describe, expect, it, vi } from 'vitest';
import {
  AgentMaxStepsError,
  AgentRunner,
  defineTool,
  z,
  type AgentMessage,
  type ModelAdapter,
  type ModelRequest,
  type ModelResponse,
} from '../../src';

class QueueModel implements ModelAdapter {
  readonly requests: ModelRequest[] = [];
  readonly #responses: ModelResponse[];

  constructor(responses: ModelResponse[]) {
    this.#responses = [...responses];
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push({
      ...request,
      messages: [...request.messages],
      tools: [...request.tools],
    });
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error('QueueModel has no response left');
    }
    return response;
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

describe('AgentRunner', () => {
  it('returns a final model answer without executing tools', async () => {
    const model = new QueueModel([finalResponse('Hello')]);
    const agentRunner = new AgentRunner({ model, tools: [] });

    const result = await agentRunner.run({
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
    const agentRunner = new AgentRunner({ model, tools: [multiply] });

    const result = await agentRunner.run({
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
    const agentRunner = new AgentRunner({ model, tools: [multiply] });

    await agentRunner.run({ messages: [userMessage('What is 6 * 7?')] });

    expect(execute).not.toHaveBeenCalled();
    const toolMessage = model.requests[1]?.messages.at(-1);
    expect(toolMessage?.role).toBe('tool');
    if (toolMessage?.role !== 'tool') {
      throw new Error('Expected a tool message');
    }
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: false,
      error: 'Invalid arguments for tool "multiply".',
    });
  });

  it('returns an unknown tool error to the model', async () => {
    const model = new QueueModel([
      toolResponse('missing_tool', {}),
      finalResponse('That tool is unavailable.'),
    ]);
    const agentRunner = new AgentRunner({ model, tools: [] });

    await agentRunner.run({ messages: [userMessage('Use the missing tool')] });

    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      name: 'missing_tool',
      content: JSON.stringify({
        ok: false,
        error: 'Unknown tool "missing_tool".',
      }),
    });
  });

  it('stops a model that keeps requesting tools', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'Return the supplied value.',
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: ({ value }) => value,
    });
    const model = new QueueModel([
      toolResponse('echo', { value: 'one' }, 'call-1'),
      toolResponse('echo', { value: 'two' }, 'call-2'),
    ]);
    const agentRunner = new AgentRunner({
      model,
      tools: [echo],
      maxSteps: 2,
    });

    await expect(agentRunner.run({
      messages: [userMessage('Never stop')],
    })).rejects.toBeInstanceOf(AgentMaxStepsError);
    expect(model.requests).toHaveLength(2);
  });
});