import { describe, expect, it, vi } from 'vitest';
import {
  DeepSeekModelAdapter,
  ModelCallError,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../src';

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
  maxOutputTokens: 8,
};

function createSseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function createInterruptedSseResponse(firstChunk: string, streamError: Error): Response {
  const encoder = new TextEncoder();
  let read = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!read) {
        read = true;
        controller.enqueue(encoder.encode(firstChunk));
        return;
      }
      controller.error(streamError);
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

async function collectEvents(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('DeepSeekModelAdapter', () => {
  it('declares its model context and protocol capabilities', () => {
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      fetch: vi.fn<typeof globalThis.fetch>(),
    });

    expect(deepSeekModelAdapter.capabilities).toEqual({
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 384_000,
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsReasoningContent: true,
      supportsCacheUsage: true,
    });
  });

  it('rejects a non-positive attempt timeout', () => {
    expect(() => new DeepSeekModelAdapter({
      apiKey: 'test-key',
      fetch: vi.fn<typeof globalThis.fetch>(),
      attemptTimeoutMs: 0,
    })).toThrow(new RangeError('attemptTimeoutMs must be a positive finite number.'));
  });

  it('maps a request and streams text with usage', async () => {
    const response = createSseResponse([
      sseData({ choices: [{ delta: { content: 'Hel' } }] }),
      sseData({ choices: [{ delta: { content: 'lo' } }] }),
      sseData({
        choices: [],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 2,
          total_tokens: 14,
          prompt_cache_hit_tokens: 8,
          prompt_cache_miss_tokens: 4,
        },
      }),
      'data: [DONE]\n\n',
    ]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      fetch,
      model: 'deepseek-v4-flash',
    });
    const abortController = new AbortController();

    const events = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: abortController.signal,
    }));

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      },
      signal: abortController.signal,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'deepseek-v4-flash',
      messages: request.messages,
      tools: [{
        type: 'function',
        function: {
          name: 'multiply',
          description: 'Multiply two numbers.',
          parameters: request.tools[0]?.inputSchema,
        },
      }],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 8,
    });
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Hel' },
      { type: 'text-delta', delta: 'lo' },
      {
        type: 'usage',
        usage: {
          inputTokens: 12,
          outputTokens: 2,
          totalTokens: 14,
          cacheHitInputTokens: 8,
          cacheMissInputTokens: 4,
        },
      },
      { type: 'response-completed' },
    ]);
  });

  it('rejects a Provider stream that exceeds the configured byte limit', async () => {
    const response = createSseResponse([
      sseData({ choices: [{ delta: { content: 'x'.repeat(256) } }] }),
      'data: [DONE]\n\n',
    ]);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(response),
      maxResponseBytes: 128,
    });

    await expect(collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    }))).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'DeepSeek response exceeded the configured byte limit.',
    });
  });

  it('reassembles a tool call split across SSE chunks', async () => {
    const stream = [
      sseData({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-7',
              type: 'function',
              function: { name: 'multiply', arguments: '{"left":' },
            }],
          },
        }],
      }),
      sseData({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '6,"right":7}' },
            }],
          },
        }],
      }),
      'data: [DONE]\n\n',
    ].join('');
    const response = createSseResponse([
      stream.slice(0, 7),
      stream.slice(7, 83),
      stream.slice(83, 149),
      stream.slice(149),
    ]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const events = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    }));

    expect(events).toEqual([
      {
        type: 'tool-call',
        toolCall: {
          id: 'call-7',
          name: 'multiply',
          arguments: { left: 6, right: 7 },
        },
      },
      { type: 'response-completed' },
    ]);
  });

  it('streams reasoning and sends it back with assistant tool calls', async () => {
    const response = createSseResponse([
      sseData({ choices: [{ delta: { reasoning_content: 'Need the ' } }] }),
      sseData({ choices: [{ delta: { reasoning_content: 'current status.' } }] }),
      'data: [DONE]\n\n',
    ]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const events = await collectEvents(deepSeekModelAdapter.stream({
      messages: [
        { role: 'user', content: 'Read status.' },
        {
          role: 'assistant',
          content: '',
          reasoningContent: 'I need the current status.',
          toolCalls: [{ id: 'call-1', name: 'read_status', arguments: {} }],
        },
        {
          role: 'tool',
          toolCallId: 'call-1',
          name: 'read_status',
          content: '{"ok":true,"value":"healthy"}',
        },
      ],
      tools: request.tools,
    }, {
      abortSignal: new AbortController().signal,
    }));

    expect(events).toEqual([
      { type: 'reasoning-delta', delta: 'Need the ' },
      { type: 'reasoning-delta', delta: 'current status.' },
      { type: 'response-completed' },
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).messages).toEqual([
      { role: 'user', content: 'Read status.' },
      {
        role: 'assistant',
        content: null,
        reasoning_content: 'I need the current status.',
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'read_status', arguments: '{}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        content: '{"ok":true,"value":"healthy"}',
      },
    ]);
  });

  it.each([
    [400, 'invalid_request'],
    [401, 'authentication_failed'],
    [402, 'insufficient_balance'],
    [422, 'invalid_request'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [503, 'server_error'],
  ] as const)('maps HTTP %i to %s', async (statusCode, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, {
      status: statusCode,
      headers: statusCode === 429 ? { 'retry-after': '3' } : undefined,
    }));
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const error = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ModelCallError);
    expect(error).toMatchObject({
      name: 'ModelCallError',
      code,
      statusCode,
      responseStarted: false,
      replaySafety: 'safe',
      ...(statusCode === 429 ? { retryAfterMs: 3_000 } : {}),
    });
  });

  it('marks a network failure before the first event as replay-safe', async () => {
    const networkError = new TypeError('fetch failed');
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(networkError);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const error = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ModelCallError',
      code: 'network_error',
      responseStarted: false,
      replaySafety: 'safe',
      cause: networkError,
    });
  });

  it('marks a stream failure after a visible event as replay-unsafe', async () => {
    const networkError = new TypeError('connection reset');
    const response = createInterruptedSseResponse(
      sseData({ choices: [{ delta: { content: 'Partial' } }] }),
      networkError,
    );
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });
    const iterator = deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'text-delta', delta: 'Partial' },
    });
    await expect(iterator.next()).rejects.toMatchObject({
      name: 'ModelCallError',
      code: 'network_error',
      responseStarted: true,
      replaySafety: 'unsafe',
      cause: networkError,
    });
  });

  it('classifies a stream ending without DONE after output as replay-unsafe', async () => {
    const response = createSseResponse([
      sseData({ choices: [{ delta: { content: 'Partial' } }] }),
    ]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const error = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ModelCallError',
      code: 'invalid_response',
      responseStarted: true,
      replaySafety: 'unsafe',
    });
  });

  it('classifies malformed SSE JSON before output as replay-safe', async () => {
    const response = createSseResponse(['data: {not-json}\n\n']);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const error = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ModelCallError',
      code: 'invalid_response',
      responseStarted: false,
      replaySafety: 'safe',
    });
  });

  it.each([
    ['missing choices', sseData({})],
    ['invalid usage', sseData({
      choices: [],
      usage: {
        prompt_tokens: 'twelve',
        completion_tokens: 2,
        total_tokens: 14,
      },
    })],
  ])('classifies %s as an invalid response', async (_label, event) => {
    const response = createSseResponse([event, 'data: [DONE]\n\n']);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });

    const error = await collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: new AbortController().signal,
    })).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ModelCallError',
      code: 'invalid_response',
      responseStarted: false,
      replaySafety: 'safe',
    });
  });

  it('propagates abort without wrapping it as a model error', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const deepSeekModelAdapter = new DeepSeekModelAdapter({ apiKey: 'test-key', fetch });
    const abortController = new AbortController();
    abortController.abort();

    await expect(collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: abortController.signal,
    }))).rejects.toBe(abortController.signal.reason);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('classifies an attempt timeout before output as replay-safe', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) {
          reject(new Error('Expected an AbortSignal.'));
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
      const deepSeekModelAdapter = new DeepSeekModelAdapter({
        apiKey: 'test-key',
        fetch,
        attemptTimeoutMs: 1_000,
      });

      const result = collectEvents(deepSeekModelAdapter.stream(request, {
        abortSignal: new AbortController().signal,
      })).catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(result).resolves.toMatchObject({
        name: 'ModelCallError',
        code: 'attempt_timeout',
        responseStarted: false,
        replaySafety: 'safe',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies an attempt timeout after output as replay-unsafe', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) {
          throw new Error('Expected an AbortSignal.');
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(
              sseData({ choices: [{ delta: { content: 'Partial' } }] }),
            ));
            signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      });
      const deepSeekModelAdapter = new DeepSeekModelAdapter({
        apiKey: 'test-key',
        fetch,
        attemptTimeoutMs: 1_000,
      });
      const iterator = deepSeekModelAdapter.stream(request, {
        abortSignal: new AbortController().signal,
      })[Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'text-delta', delta: 'Partial' },
      });
      const next = expect(iterator.next()).rejects.toMatchObject({
        name: 'ModelCallError',
        code: 'attempt_timeout',
        responseStarted: true,
        replaySafety: 'unsafe',
      });
      await vi.advanceTimersByTimeAsync(1_000);

      await next;
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves user cancellation when it wins before the attempt timeout', async () => {
    let signalFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      signalFetchStarted = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) {
        reject(new Error('Expected an AbortSignal.'));
        return;
      }
      signalFetchStarted?.();
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const deepSeekModelAdapter = new DeepSeekModelAdapter({
      apiKey: 'test-key',
      fetch,
      attemptTimeoutMs: 60_000,
    });
    const abortController = new AbortController();
    const result = collectEvents(deepSeekModelAdapter.stream(request, {
      abortSignal: abortController.signal,
    }));
    await fetchStarted;
    abortController.abort();

    await expect(result).rejects.toBe(abortController.signal.reason);
  });
});