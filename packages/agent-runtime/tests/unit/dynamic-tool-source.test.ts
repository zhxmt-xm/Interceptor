import { describe, expect, it, vi } from 'vitest';

import {
  defineTool,
  ToolExecutionError,
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
      kind: 'query',
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
      kind: 'query',
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
      kind: 'query',
      name: 'discover_tools',
      description: 'Discover Tools.',
      inputSchema: z.object({}).strict(),
      execute: () => ({ names: ['get_exchange'] }),
    });
    const executeGetExchange = vi.fn(() => ({ id: 'exchange-1' }));
    const getExchange = defineTool({
      kind: 'query',
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

  it('asks before a change Tool and returns tool_denied without executing it', async () => {
    const execute = vi.fn(() => ({ recording: false }));
    const stopRecording = defineTool({
      kind: 'change',
      name: 'stop_recording',
      description: 'Pause capture without stopping the proxy.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const authorizeToolCall = vi.fn(async () => 'deny' as const);
    const model = new QueueModel([
      toolResponse('stop_recording', 'call-stop'),
      finalResponse('Recording was left running.'),
    ]);
    const runLoop = new AgentRunLoop({
      model,
      toolSource: { snapshot: () => ({ systemMessages: [], tools: [stopRecording] }) },
      authorizeToolCall,
    });

    const result = await runLoop.run({ messages: [{ role: 'user', content: 'Stop capture.' }] });

    expect(authorizeToolCall).toHaveBeenCalledWith(
      {
        toolCall: { id: 'call-stop', name: 'stop_recording', arguments: {} },
        description: 'Pause capture without stopping the proxy.',
        effect: 'Pause capture without stopping the proxy.',
      },
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual({
      role: 'tool',
      toolCallId: 'call-stop',
      name: 'stop_recording',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'tool_denied',
          message: 'Tool "stop_recording" was denied by the user.',
        },
      }),
    });
  });

  it('describes the current change effect before requesting approval', async () => {
    const execute = vi.fn(() => ({ exchangeCount: 0, bodyCount: 0 }));
    const describeEffect = vi.fn(async () => ({
      text: 'Scope: all\nThis permanently deletes 7 exchange(s) and 3 body/bodies.',
      metadata: { scope: 'all', exchangeCount: 7, bodyCount: 3 },
    }));
    const clearCapture = defineTool({
      kind: 'change',
      name: 'clear_capture',
      description: 'Delete captured exchanges and bodies.',
      inputSchema: z.object({}).strict(),
      describeEffect,
      execute,
    });
    const authorizeToolCall = vi.fn(async () => 'deny' as const);
    const model = new QueueModel([
      toolResponse('clear_capture', 'call-clear'),
      finalResponse('Capture was preserved.'),
    ]);
    const runLoop = new AgentRunLoop({
      model,
      toolSource: { snapshot: () => ({ systemMessages: [], tools: [clearCapture] }) },
      authorizeToolCall,
    });

    await runLoop.run({ messages: [{ role: 'user', content: 'Clear capture.' }] });

    expect(describeEffect).toHaveBeenCalledWith(
      {},
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(authorizeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: 'Scope: all\nThis permanently deletes 7 exchange(s) and 3 body/bodies.',
        effectMetadata: { scope: 'all', exchangeCount: 7, bodyCount: 3 },
      }),
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('falls back to the static effect when dynamic description fails', async () => {
    const clearCapture = defineTool({
      kind: 'change',
      name: 'clear_capture',
      description: 'Delete captured exchanges and bodies.',
      effect: 'Captured traffic will be deleted.',
      inputSchema: z.object({}).strict(),
      describeEffect: async () => {
        throw new Error('usage unavailable');
      },
      execute: () => ({ exchangeCount: 0 }),
    });
    const authorizeToolCall = vi.fn(async () => 'deny' as const);
    const runLoop = new AgentRunLoop({
      model: new QueueModel([
        toolResponse('clear_capture', 'call-clear-fallback'),
        finalResponse('Capture was preserved.'),
      ]),
      toolSource: { snapshot: () => ({ systemMessages: [], tools: [clearCapture] }) },
      authorizeToolCall,
    });

    await runLoop.run({ messages: [{ role: 'user', content: 'Clear capture.' }] });

    expect(authorizeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ effect: 'Captured traffic will be deleted.' }),
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(authorizeToolCall.mock.calls[0]?.[0]).not.toHaveProperty('effectMetadata');
  });

  it('returns an explicit dynamic-description Tool error without requesting approval', async () => {
    const execute = vi.fn(() => ({ state: 'continued' }));
    const continueBreakpoint = defineTool({
      kind: 'change',
      name: 'continue_breakpoint',
      description: 'Forward one suspended item unchanged.',
      inputSchema: z.object({}).strict(),
      describeEffect: async () => {
        throw new ToolExecutionError(
          'invalid_arguments',
          'The Breakpoint is no longer pending.',
        );
      },
      execute,
    });
    const authorizeToolCall = vi.fn(async () => 'allow' as const);
    const runLoop = new AgentRunLoop({
      model: new QueueModel([
        toolResponse('continue_breakpoint', 'call-stale'),
        finalResponse('The Breakpoint is stale.'),
      ]),
      toolSource: { snapshot: () => ({ systemMessages: [], tools: [continueBreakpoint] }) },
      authorizeToolCall,
    });

    const result = await runLoop.run({
      messages: [{ role: 'user', content: 'Continue the stale Breakpoint.' }],
    });

    expect(authorizeToolCall).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual({
      role: 'tool',
      toolCallId: 'call-stale',
      name: 'continue_breakpoint',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'invalid_arguments',
          message: 'The Breakpoint is no longer pending.',
        },
      }),
    });
  });

  it('does not request approval when cancellation interrupts dynamic description', async () => {
    let descriptionStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      descriptionStarted = resolve;
    });
    const clearCapture = defineTool({
      kind: 'change',
      name: 'clear_capture',
      description: 'Delete captured exchanges and bodies.',
      inputSchema: z.object({}).strict(),
      describeEffect: async (_input, context) => {
        descriptionStarted?.();
        await new Promise<void>((_resolve, reject) => {
          context.abortSignal.addEventListener('abort', () => reject(context.abortSignal.reason), {
            once: true,
          });
        });
        return 'unreachable';
      },
      execute: () => ({ exchangeCount: 0 }),
    });
    const authorizeToolCall = vi.fn(async () => 'allow' as const);
    const abortController = new AbortController();
    const runLoop = new AgentRunLoop({
      model: new QueueModel([toolResponse('clear_capture', 'call-clear-cancelled')]),
      toolSource: { snapshot: () => ({ systemMessages: [], tools: [clearCapture] }) },
      authorizeToolCall,
    });

    const running = runLoop.run({
      messages: [{ role: 'user', content: 'Clear capture.' }],
      abortSignal: abortController.signal,
    });
    await started;
    abortController.abort(new Error('cancelled'));

    await expect(running).rejects.toThrow('cancelled');
    expect(authorizeToolCall).not.toHaveBeenCalled();
  });

  it('rechecks a change Tool after approval before invoking its executor', async () => {
    const execute = vi.fn(() => ({ recording: false }));
    const stopRecording = defineTool({
      kind: 'change',
      name: 'stop_recording',
      description: 'Pause capture without stopping the proxy.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const source = new MutableToolSource();
    source.tools = [stopRecording];
    let resolveDecision!: (decision: 'allow' | 'deny') => void;
    const authorizeToolCall = vi.fn(() => new Promise<'allow' | 'deny'>((resolve) => {
      resolveDecision = resolve;
    }));
    const model = new QueueModel([
      toolResponse('stop_recording', 'call-stop'),
      finalResponse('The Tool became unavailable.'),
    ]);
    const runLoop = new AgentRunLoop({ model, toolSource: source, authorizeToolCall });

    const resultPromise = runLoop.run({ messages: [{ role: 'user', content: 'Stop capture.' }] });
    await vi.waitFor(() => expect(authorizeToolCall).toHaveBeenCalledOnce());
    source.tools = [];
    resolveDecision('allow');
    const result = await resultPromise;

    expect(execute).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual({
      role: 'tool',
      toolCallId: 'call-stop',
      name: 'stop_recording',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'unknown_tool',
          message: 'Unknown tool "stop_recording".',
        },
      }),
    });
  });

  it('does not execute a same-name query substituted while change approval is pending', async () => {
    const executeChange = vi.fn(() => ({ recording: false }));
    const executeQuery = vi.fn(() => ({ recording: true }));
    const stopRecording = defineTool({
      kind: 'change',
      name: 'stop_recording',
      description: 'Pause capture without stopping the proxy.',
      inputSchema: z.object({}).strict(),
      execute: executeChange,
    });
    const substitutedQuery = defineTool({
      kind: 'query',
      name: 'stop_recording',
      description: 'Read capture state.',
      inputSchema: z.object({}).strict(),
      execute: executeQuery,
    });
    const source = new MutableToolSource();
    source.tools = [stopRecording];
    let resolveDecision!: (decision: 'allow' | 'deny') => void;
    const authorizeToolCall = vi.fn(() => new Promise<'allow' | 'deny'>((resolve) => {
      resolveDecision = resolve;
    }));
    const model = new QueueModel([
      toolResponse('stop_recording', 'call-substituted'),
      finalResponse('The Tool became unavailable.'),
    ]);
    const runLoop = new AgentRunLoop({ model, toolSource: source, authorizeToolCall });

    const resultPromise = runLoop.run({ messages: [{ role: 'user', content: 'Stop capture.' }] });
    await vi.waitFor(() => expect(authorizeToolCall).toHaveBeenCalledOnce());
    source.tools = [substitutedQuery];
    resolveDecision('allow');
    const result = await resultPromise;

    expect(executeChange).not.toHaveBeenCalled();
    expect(executeQuery).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual({
      role: 'tool',
      toolCallId: 'call-substituted',
      name: 'stop_recording',
      content: JSON.stringify({
        ok: false,
        error: {
          code: 'unknown_tool',
          message: 'Unknown tool "stop_recording".',
        },
      }),
    });
  });
});