import { describe, expect, it } from 'vitest';
import {
  type ModelAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../src';
import { AgentRunLoop } from '../../src/agent/entry';
import { TEST_MODEL_CAPABILITIES } from './model-fixtures';

class EventModel implements ModelAdapter {
  readonly capabilities = TEST_MODEL_CAPABILITIES;
  readonly requests: ModelRequest[] = [];
  readonly #events: readonly ModelStreamEvent[];

  constructor(events: readonly ModelStreamEvent[]) {
    this.#events = events;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    yield* this.#events;
  }
}

describe('AgentRuntime model stream', () => {
  it('collects model events into one completed response', async () => {
    const model = new EventModel([
      { type: 'text-delta', delta: 'Hel' },
      { type: 'text-delta', delta: 'lo' },
      {
        type: 'usage',
        usage: {
          inputTokens: 12,
          outputTokens: 2,
          totalTokens: 14,
        },
      },
      { type: 'response-completed' },
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    const result = await agentRuntime.run({
      messages: [{ role: 'user', content: 'Say hello.' }],
    });

    expect(result.output).toBe('Hello');
    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Hello',
      toolCalls: [],
    });
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 2,
      totalTokens: 14,
    });
  });

  it('rejects a model stream without a terminal event', async () => {
    const model = new EventModel([
      { type: 'text-delta', delta: 'Incomplete' },
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Say hello.' }],
    })).rejects.toMatchObject({
      name: 'ModelProtocolError',
      message: 'Model stream ended without a response-completed event.',
    });
  });

  it('preserves streamed reasoning separately from assistant content', async () => {
    const model = new EventModel([
      { type: 'reasoning-delta', delta: 'Need to inspect ' },
      { type: 'reasoning-delta', delta: 'the current state.' },
      { type: 'text-delta', delta: 'The state is healthy.' },
      { type: 'response-completed' },
    ]);
    const agentRuntime = new AgentRunLoop({ model, tools: [] });

    const result = await agentRuntime.run({
      messages: [{ role: 'user', content: 'Check the state.' }],
    });

    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'The state is healthy.',
      reasoningContent: 'Need to inspect the current state.',
      toolCalls: [],
    });
  });
});