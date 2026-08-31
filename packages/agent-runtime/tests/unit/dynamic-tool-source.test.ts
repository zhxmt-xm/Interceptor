import { describe, expect, it, vi } from 'vitest';

import {
  defineTool,
  z,
  type AgentMessage,
  type AgentTool,
  type AgentToolSource,
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
    this.requests.push(structuredClone(request));
    const response = this.#responses.shift();
    if (response === undefined) throw new Error('QueueModel has no response left');
    for (const toolCall of response.message.toolCalls) {
      yield { type: 'tool-call', toolCall };
    }
    if (response.message.content !== '') {
      yield { type: 'text-delta', delta: response.message.content };
    }
    yield { type: 'response-completed' };
  }
}

class MutableToolSource implements AgentToolSource {
  readonly snapshots: AgentMessage[][] = [];
  systemMessages: AgentMessage[] = [];
  tools: AgentTool[] = [];

  snapshot(messages: readonly AgentMessage[]) {
    this.snapshots.push(structuredClone(messages));
    return {
      systemMessages: this.systemMessages,
      tools: this.tools,
    };
  }
}

function toolResponse(name: string, id: string): ModelResponse {
  return {
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [{ id, name, arguments: {} }],
    },
  };
}

function finalResponse(content: string): ModelResponse {
  return {
    message: { role: 'assistant', content, toolCalls: [] },
  };
}

describe('AgentRunLoop dynamic Tool source', () => {
  it('takes a fresh source snapshot for every Model Call', async () => {
    const execute = vi.fn(() => ({ listening: true }));
    const getProxyStatus = defineTool({
      name: 'get_proxy_status',
      description: 'Read proxy status.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const source = new MutableToolSource();
    source.systemMessages = [{ role: 'system', content: 'Capability index: traffic' }];
    source.tools = [getProxyStatus];
    const model = new QueueModel([
      toolResponse('get_proxy_status', 'call-1'),
      finalResponse('Recording is on.'),
    ]);
    const runLoop = new AgentRunLoop({ model, toolSource: source });

    await runLoop.run({ messages: [{ role: 'user', content: 'Check status.' }] });

    expect(source.snapshots).toHaveLength(3);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[0]?.messages[0]).toEqual({
      role: 'system',
      content: 'Capability index: traffic',
    });
    expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual(['get_proxy_status']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rechecks the current source before execution and returns unknown_tool when disabled', async () => {
    const execute = vi.fn(() => ({ listening: true }));
    const getProxyStatus = defineTool({
      name: 'get_proxy_status',
      description: 'Read proxy status.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const source = new MutableToolSource();
    source.tools = [getProxyStatus];
    const model = new QueueModel([
      toolResponse('get_proxy_status', 'call-disabled'),
      finalResponse('The Tool is unavailable.'),
    ]);
    const runLoop = new AgentRunLoop({ model, toolSource: source });
    let snapshotCalls = 0;
    const originalSnapshot = source.snapshot.bind(source);
    source.snapshot = (messages) => {
      snapshotCalls += 1;
      const snapshot = originalSnapshot(messages);
      return snapshotCalls === 1 ? snapshot : { ...snapshot, tools: [] };
    };

    await runLoop.run({ messages: [{ role: 'user', content: 'Check status.' }] });

    expect(execute).not.toHaveBeenCalled();
    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-disabled',
      name: 'get_proxy_status',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'unknown_tool',
          message: 'Unknown tool "get_proxy_status".',
        },
      }),
    });
  });

  it('does not execute a Tool that was discovered inside the same Model response', async () => {
    const discover = defineTool({
      name: 'discover_tools',
      description: 'Discover Tools.',
      inputSchema: z.object({}).strict(),
      execute: () => ({ names: ['get_exchange'] }),
    });
    const executeGetExchange = vi.fn(() => ({ id: 'exchange-1' }));
    const getExchange = defineTool({
      name: 'get_exchange',
      description: 'Read one exchange.',
      inputSchema: z.object({}).strict(),
      execute: executeGetExchange,
    });
    const source: AgentToolSource = {
      snapshot(messages) {
        const discovered = messages.some((message) => (
          message.role === 'tool' && message.toolCallId === 'call-discover'
        ));
        return {
          systemMessages: [],
          tools: discovered ? [discover, getExchange] : [discover],
        };
      },
    };
    const model = new QueueModel([
      {
        message: {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call-discover', name: 'discover_tools', arguments: {} },
            { id: 'call-guessed', name: 'get_exchange', arguments: {} },
          ],
        },
      },
      finalResponse('Discovery applies to later responses only.'),
    ]);
    const runLoop = new AgentRunLoop({ model, toolSource: source });

    const result = await runLoop.run({ messages: [{ role: 'user', content: 'Inspect.' }] });

    expect(executeGetExchange).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual({
      role: 'tool',
      toolCallId: 'call-guessed',
      name: 'get_exchange',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'unknown_tool',
          message: 'Unknown tool "get_exchange".',
        },
      }),
    });
    expect(model.requests[0]?.tools.map((tool) => tool.name)).toEqual(['discover_tools']);
    expect(model.requests[1]?.tools.map((tool) => tool.name)).toEqual([
      'discover_tools',
      'get_exchange',
    ]);
  });
});