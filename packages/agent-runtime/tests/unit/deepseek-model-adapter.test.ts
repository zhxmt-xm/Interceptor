import { describe, expect, it, vi } from 'vitest';
import {
  DeepSeekModelAdapter,
  type DeepSeekChatClient,
  type ModelRequest,
} from '../../src';

function createClient(response: unknown): {
  client: DeepSeekChatClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue(response);
  return {
    client: {
      chat: {
        completions: { create },
      },
    },
    create,
  };
}

describe('DeepSeekModelAdapter', () => {
  it('maps Agent messages and tools to a DeepSeek Chat Completions request', async () => {
    const { client, create } = createClient({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-7',
            type: 'function',
            function: {
              name: 'multiply',
              arguments: '{"left":6,"right":7}',
            },
          }],
        },
      }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 18,
        total_tokens: 138,
      },
    });
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      client,
    });
    const request: ModelRequest = {
      messages: [
        { role: 'system', content: 'Use tools when needed.' },
        { role: 'user', content: 'What is 6 * 7?' },
      ],
      tools: [{
        name: 'multiply',
        description: 'Multiply two numbers.',
        inputSchema: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
          },
          required: ['left', 'right'],
          additionalProperties: false,
        },
      }],
    };
    const abortController = new AbortController();

    const response = await deepSeekModelAdapter.complete(request, {
      abortSignal: abortController.signal,
    });

    expect(create).toHaveBeenCalledWith(
      {
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'Use tools when needed.' },
          { role: 'user', content: 'What is 6 * 7?' },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'multiply',
            description: 'Multiply two numbers.',
            parameters: request.tools[0]?.inputSchema,
          },
        }],
      },
      { signal: abortController.signal },
    );
    expect(response).toEqual({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call-7',
          name: 'multiply',
          arguments: { left: 6, right: 7 },
        }],
      },
      usage: {
        inputTokens: 120,
        outputTokens: 18,
        totalTokens: 138,
      },
    });
  });

  it('maps assistant tool calls and tool results into the follow-up request', async () => {
    const { client, create } = createClient({
      choices: [{
        message: {
          role: 'assistant',
          content: 'The result is 42.',
          tool_calls: [],
        },
      }],
    });
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      client,
    });

    const response = await deepSeekModelAdapter.complete({
      messages: [
        { role: 'user', content: 'What is 6 * 7?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'call-7',
            name: 'multiply',
            arguments: { left: 6, right: 7 },
          }],
        },
        {
          role: 'tool',
          toolCallId: 'call-7',
          name: 'multiply',
          content: '{"ok":true,"value":42}',
        },
      ],
      tools: [],
    }, { abortSignal: new AbortController().signal });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'user', content: 'What is 6 * 7?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-7',
            type: 'function',
            function: {
              name: 'multiply',
              arguments: '{"left":6,"right":7}',
            },
          }],
        },
        {
          role: 'tool',
          tool_call_id: 'call-7',
          content: '{"ok":true,"value":42}',
        },
      ],
    });
    expect(response.message).toEqual({
      role: 'assistant',
      content: 'The result is 42.',
      toolCalls: [],
    });
  });
});