import { describe, expect, it, vi } from 'vitest';
import {
  defineTool,
  z,
  type ModelAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../src';
import { AgentRunLoop } from '../../src/agent/entry';
import { staticToolSource, TEST_MODEL_CAPABILITIES } from './model-fixtures';

class CancellationModel implements ModelAdapter {
  readonly capabilities = TEST_MODEL_CAPABILITIES;
  readonly requests: ModelRequest[] = [];
  readonly #stream: (signal: AbortSignal) => AsyncIterable<ModelStreamEvent>;

  constructor(stream: (signal: AbortSignal) => AsyncIterable<ModelStreamEvent>) {
    this.#stream = stream;
  }

  stream(request: ModelRequest, options: { abortSignal: AbortSignal }): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    return this.#stream(options.abortSignal);
  }
}

function completedResponse(content: string): AsyncIterable<ModelStreamEvent> {
  return (async function* stream(): AsyncIterable<ModelStreamEvent> {
    yield { type: 'text-delta', delta: content };
    yield { type: 'response-completed' };
  })();
}

describe('AgentRuntime cancellation', () => {
  it('does not call the model when the run is already cancelled', async () => {
    const model = new CancellationModel(() => completedResponse('Unexpected.'));
    const agentRuntime = new AgentRunLoop({ model, toolSource: staticToolSource() });
    const abortController = new AbortController();
    const reason = new Error('User stopped the turn.');
    abortController.abort(reason);

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Do not start.' }],
      abortSignal: abortController.signal,
    })).rejects.toBe(reason);
    expect(model.requests).toHaveLength(0);
  });

  it('does not accept a final response emitted after cancellation', async () => {
    const abortController = new AbortController();
    const reason = new Error('User stopped the model call.');
    const model = new CancellationModel(() => (async function* stream() {
      abortController.abort(reason);
      yield { type: 'text-delta' as const, delta: 'Late response.' };
      yield { type: 'response-completed' as const };
    })());
    const agentRuntime = new AgentRunLoop({ model, toolSource: staticToolSource() });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Stop during the model call.' }],
      abortSignal: abortController.signal,
    })).rejects.toBe(reason);
    expect(model.requests).toHaveLength(1);
  });

  it('does not execute a tool when cancellation wins after the model response', async () => {
    const abortController = new AbortController();
    const reason = new Error('User stopped before the tool.');
    const execute = vi.fn(() => 'Unexpected.');
    const tool = defineTool({
      name: 'read_status',
      description: 'Read status.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const model = new CancellationModel(() => (async function* stream() {
      yield {
        type: 'tool-call' as const,
        toolCall: { id: 'call-1', name: 'read_status', arguments: {} },
      };
      abortController.abort(reason);
      yield { type: 'response-completed' as const };
    })());
    const agentRuntime = new AgentRunLoop({ model, toolSource: staticToolSource([tool]) });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Stop before the tool.' }],
      abortSignal: abortController.signal,
    })).rejects.toBe(reason);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not start another model call when a tool returns after cancellation', async () => {
    const abortController = new AbortController();
    const reason = new Error('User stopped during the tool.');
    const execute = vi.fn(() => {
      abortController.abort(reason);
      return 'Late result.';
    });
    const tool = defineTool({
      name: 'read_status',
      description: 'Read status.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const onRunEvent = vi.fn();
    const model = new CancellationModel(() => (async function* stream() {
      yield {
        type: 'tool-call' as const,
        toolCall: { id: 'call-1', name: 'read_status', arguments: {} },
      };
      yield { type: 'response-completed' as const };
    })());
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource([tool]),
      onRunEvent,
    });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Stop during the tool.' }],
      abortSignal: abortController.signal,
    })).rejects.toBe(reason);
    expect(execute).toHaveBeenCalledOnce();
    expect(model.requests).toHaveLength(1);
    expect(onRunEvent).toHaveBeenCalledWith({
      type: 'tool-result',
      toolCall: { id: 'call-1', name: 'read_status', arguments: {} },
      result: { ok: true, value: 'Late result.' },
    });
  });
});