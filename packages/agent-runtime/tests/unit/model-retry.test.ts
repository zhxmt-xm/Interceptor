import { describe, expect, it, vi } from 'vitest';
import {
  ModelCallError,
  createTransientModelRetryPolicy,
  defineTool,
  z,
  type ModelAdapter,
  type ModelRequest,
  type ModelRetryPolicy,
  type ModelStreamEvent,
} from '../../src';
import { AgentRunLoop } from '../../src/agent/entry';
import { staticToolSource, TEST_MODEL_CAPABILITIES } from './model-fixtures';

type ModelAttempt =
  | readonly ModelStreamEvent[]
  | Error
  | { readonly events: readonly ModelStreamEvent[]; readonly error: Error };

class AttemptModel implements ModelAdapter {
  readonly capabilities = TEST_MODEL_CAPABILITIES;
  readonly requests: ModelRequest[] = [];
  readonly #attempts: ModelAttempt[];
  readonly #onAttempt: (() => void) | undefined;

  constructor(attempts: readonly ModelAttempt[], onAttempt?: () => void) {
    this.#attempts = [...attempts];
    this.#onAttempt = onAttempt;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    this.#onAttempt?.();
    const attempt = this.#attempts.shift();
    if (attempt === undefined) {
      throw new Error('AttemptModel has no attempt left.');
    }
    if (attempt instanceof Error) {
      throw attempt;
    }
    if ('events' in attempt) {
      yield* attempt.events;
      throw attempt.error;
    }
    yield* attempt;
  }
}

function modelError(
  code: ConstructorParameters<typeof ModelCallError>[0],
  replaySafety: 'safe' | 'unsafe' = 'safe',
  retryAfterMs?: number,
): ModelCallError {
  return new ModelCallError(code, `Model failed with ${code}.`, {
    responseStarted: replaySafety === 'unsafe',
    replaySafety,
    retryAfterMs,
  });
}

function completedResponse(content: string): readonly ModelStreamEvent[] {
  return [
    { type: 'text-delta', delta: content },
    { type: 'response-completed' },
  ];
}

const immediateRetryPolicy: ModelRetryPolicy = {
  maxRetries: 2,
  delayBeforeRetry: () => 0,
};

describe('AgentRuntime model retry', () => {
  it('does not retry when no policy is configured', async () => {
    const error = modelError('network_error');
    const model = new AttemptModel([error, completedResponse('Unexpected retry.')]);
    const agentRuntime = new AgentRunLoop({ model, toolSource: staticToolSource() });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Try once.' }],
    })).rejects.toBe(error);
    expect(model.requests).toHaveLength(1);
  });

  it('retries a replay-safe model failure and returns the later response', async () => {
    const model = new AttemptModel([
      modelError('network_error'),
      completedResponse('Recovered.'),
    ]);
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource(),
      modelRetryPolicy: immediateRetryPolicy,
    });

    const result = await agentRuntime.run({
      messages: [{ role: 'user', content: 'Try once.' }],
    });

    expect(result.output).toBe('Recovered.');
    expect(model.requests).toHaveLength(2);
  });

  it('does not retry after any Model event has reached the observer', async () => {
    const error = modelError('network_error');
    const model = new AttemptModel([
      {
        events: [
          { type: 'text-delta', delta: 'Visible once.' },
          { type: 'usage', usage: { inputTokens: 12 } },
        ],
        error,
      },
      completedResponse('Duplicated response.'),
    ]);
    const onRunEvent = vi.fn();
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource(),
      modelRetryPolicy: immediateRetryPolicy,
      onRunEvent,
    });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Do not duplicate visible output.' }],
    })).rejects.toBe(error);

    expect(onRunEvent).toHaveBeenCalledTimes(3);
    expect(model.requests).toHaveLength(1);
  });

  it('does not repeat a completed tool when the following model call retries', async () => {
    const execute = vi.fn(() => 'status-ok');
    const readStatus = defineTool({
      name: 'read_status',
      description: 'Read status.',
      inputSchema: z.object({}).strict(),
      execute,
    });
    const model = new AttemptModel([
      [
        {
          type: 'tool-call',
          toolCall: { id: 'call-1', name: 'read_status', arguments: {} },
        },
        { type: 'response-completed' },
      ],
      modelError('network_error'),
      completedResponse('Finished.'),
    ]);
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource([readStatus]),
      modelRetryPolicy: immediateRetryPolicy,
    });

    const result = await agentRuntime.run({
      messages: [{ role: 'user', content: 'Read status.' }],
    });

    expect(result.output).toBe('Finished.');
    expect(result.steps).toBe(2);
    expect(execute).toHaveBeenCalledOnce();
    expect(model.requests).toHaveLength(3);
    expect(model.requests[2]).toEqual(model.requests[1]);
  });

  it.each([
    modelError('authentication_failed'),
    modelError('network_error', 'unsafe'),
  ])('does not retry $code with $replaySafety replay safety', async (error) => {
    const model = new AttemptModel([error]);
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource(),
      modelRetryPolicy: immediateRetryPolicy,
    });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Do not replay.' }],
    })).rejects.toBe(error);
    expect(model.requests).toHaveLength(1);
  });

  it('returns the final error after exhausting retries', async () => {
    const firstError = modelError('server_error');
    const secondError = modelError('server_error');
    const finalError = modelError('server_error');
    const model = new AttemptModel([firstError, secondError, finalError]);
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource(),
      modelRetryPolicy: immediateRetryPolicy,
    });

    await expect(agentRuntime.run({
      messages: [{ role: 'user', content: 'Keep trying.' }],
    })).rejects.toBe(finalError);
    expect(model.requests).toHaveLength(3);
  });

  it('cancels while waiting to retry without starting another attempt', async () => {
    let signalFirstAttempt: (() => void) | undefined;
    const firstAttempt = new Promise<void>((resolve) => {
      signalFirstAttempt = resolve;
    });
    const model = new AttemptModel(
      [modelError('network_error')],
      () => signalFirstAttempt?.(),
    );
    const retryPolicy: ModelRetryPolicy = {
      maxRetries: 1,
      delayBeforeRetry: () => 60_000,
    };
    const agentRuntime = new AgentRunLoop({
      model,
      toolSource: staticToolSource(),
      modelRetryPolicy: retryPolicy,
    });
    const abortController = new AbortController();

    const run = agentRuntime.run({
      messages: [{ role: 'user', content: 'Wait before retrying.' }],
      abortSignal: abortController.signal,
    });
    await firstAttempt;
    abortController.abort();

    await expect(run).rejects.toBe(abortController.signal.reason);
    expect(model.requests).toHaveLength(1);
  });
});

describe('createTransientModelRetryPolicy', () => {
  it('uses Retry-After without applying the backoff cap or jitter', () => {
    const random = vi.fn(() => 0.5);
    const policy = createTransientModelRetryPolicy({
      maxRetries: 3,
      initialDelayMs: 500,
      maxDelayMs: 2_000,
      random,
    });

    expect(policy.delayBeforeRetry(modelError('rate_limited', 'safe', 7_000), 1)).toBe(7_000);
    expect(random).not.toHaveBeenCalled();
  });

  it('uses capped exponential backoff with full jitter for transient errors', () => {
    const policy = createTransientModelRetryPolicy({
      maxRetries: 4,
      initialDelayMs: 500,
      maxDelayMs: 1_000,
      random: () => 0.5,
    });

    expect(policy.delayBeforeRetry(modelError('network_error'), 1)).toBe(250);
    expect(policy.delayBeforeRetry(modelError('attempt_timeout'), 1)).toBe(250);
    expect(policy.delayBeforeRetry(modelError('server_error'), 2)).toBe(500);
    expect(policy.delayBeforeRetry(modelError('server_error'), 3)).toBe(500);
    expect(policy.delayBeforeRetry(modelError('invalid_request'), 1)).toBeUndefined();
    expect(policy.delayBeforeRetry(modelError('network_error', 'unsafe'), 1)).toBeUndefined();
  });
});