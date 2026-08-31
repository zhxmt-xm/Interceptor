import { createHash } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';

export interface OpenAiCompatibleObservation {
  readonly requestSequence: number;
  readonly profileId: string;
  readonly modelId: string;
  readonly authorizationConfigured: boolean;
  readonly requestBodyHash: string;
  aborted: boolean;
}

interface OpenAiCompatibleTurnScript {
  readonly events: readonly string[];
  readonly delayMs: number;
  readonly holdOpen: boolean;
}

export interface OpenAiCompatibleTurnOptions {
  readonly textChunks: readonly string[];
  readonly reasoningChunks?: readonly string[];
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheHitInputTokens: number;
    readonly cacheMissInputTokens: number;
  };
  readonly delayMs?: number;
  readonly holdOpen?: boolean;
}

export interface OpenAiCompatibleToolCallOptions {
  readonly callId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly delayMs?: number;
}

/** Deterministic OpenAI-compatible endpoint owned by one Agent workflow. */
export class OpenAiCompatibleLab {
  /** Loopback HTTP server implementing streaming Chat Completions. */
  private readonly server: HttpServer;
  /** Random port selected by the operating system. */
  readonly port: number;
  /** Redacted observations in request-completion order. */
  private readonly observations: OpenAiCompatibleObservation[] = [];
  /** Full request bodies retained only in memory for business assertions. */
  private readonly requestBodies: Array<Record<string, unknown>> = [];
  /** Deterministic responses consumed by later Chat requests. */
  private readonly turnScripts: OpenAiCompatibleTurnScript[] = [];

  /** Create a running lab after its random port is known. */
  private constructor(server: HttpServer, port: number) {
    this.server = server;
    this.port = port;
  }

  /** Start one loopback server with isolated profile paths. */
  static async start(): Promise<OpenAiCompatibleLab> {
    let openAiCompatibleLab: OpenAiCompatibleLab;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const requestBody = Buffer.concat(chunks);
        const pathMatch = request.url?.match(/^\/([^/]+)\/v1\/chat\/completions$/);
        if (request.method !== 'POST' || !pathMatch) {
          response.writeHead(404).end();
          return;
        }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(requestBody.toString('utf8')) as Record<string, unknown>;
        } catch {
          response.writeHead(400).end();
          return;
        }
        const observation: OpenAiCompatibleObservation = {
          requestSequence: openAiCompatibleLab.observations.length + 1,
          profileId: pathMatch[1]!,
          modelId: typeof body.model === 'string' ? body.model : '',
          authorizationConfigured: typeof request.headers.authorization === 'string',
          requestBodyHash: createHash('sha256').update(requestBody).digest('hex'),
          aborted: false,
        };
        openAiCompatibleLab.observations.push(observation);
        openAiCompatibleLab.requestBodies.push(structuredClone(body));
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'close',
        });
        const script = openAiCompatibleLab.turnScripts.shift() ?? {
          events: [
            JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }),
            JSON.stringify({
              choices: [],
              usage: {
                prompt_tokens: 2,
                completion_tokens: 1,
                total_tokens: 3,
                prompt_cache_hit_tokens: 0,
                prompt_cache_miss_tokens: 2,
              },
            }),
            '[DONE]',
          ],
          delayMs: 0,
          holdOpen: false,
        };
        let completed = false;
        response.once('close', () => {
          if (!completed) {
            observation.aborted = true;
          }
        });
        void (async () => {
          for (const event of script.events) {
            if (response.destroyed) return;
            if (script.delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, script.delayMs));
            }
            response.write(`data: ${event}\n\n`);
          }
          if (!script.holdOpen && !response.destroyed) {
            completed = true;
            response.end();
          }
        })();
      });
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('OpenAI-compatible lab did not expose a numeric port.'));
          return;
        }
        resolve(address.port);
      });
    });
    openAiCompatibleLab = new OpenAiCompatibleLab(server, port);
    return openAiCompatibleLab;
  }

  /** Return one profile-specific base URL accepted by Settings. */
  baseUrl(profileId: string): string {
    return `http://127.0.0.1:${this.port}/${profileId}/v1`;
  }

  /** Queue one deterministic Streaming response for the next Chat request. */
  enqueueTurn(options: OpenAiCompatibleTurnOptions): void {
    const events = [
      ...(options.reasoningChunks ?? []).map((reasoningContent) => JSON.stringify({
        choices: [{ delta: { reasoning_content: reasoningContent } }],
      })),
      ...options.textChunks.map((content) => JSON.stringify({
        choices: [{ delta: { content } }],
      })),
      ...(options.usage === undefined ? [] : [JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: options.usage.inputTokens,
          completion_tokens: options.usage.outputTokens,
          total_tokens: options.usage.inputTokens + options.usage.outputTokens,
          prompt_cache_hit_tokens: options.usage.cacheHitInputTokens,
          prompt_cache_miss_tokens: options.usage.cacheMissInputTokens,
        },
      })]),
      ...(options.holdOpen ? [] : ['[DONE]']),
    ];
    this.turnScripts.push({
      events,
      delayMs: options.delayMs ?? 0,
      holdOpen: options.holdOpen ?? false,
    });
  }

  /** Queue one complete structured Tool Call for the next Chat request. */
  enqueueToolCall(options: OpenAiCompatibleToolCallOptions): void {
    this.turnScripts.push({
      events: [
        JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: options.callId,
                type: 'function',
                function: {
                  name: options.name,
                  arguments: JSON.stringify(options.arguments),
                },
              }],
            },
          }],
        }),
        '[DONE]',
      ],
      delayMs: options.delayMs ?? 0,
      holdOpen: false,
    });
  }

  /** Return full detached requests for in-memory assertions only; never attach this value. */
  requestsForAssertions(): readonly Record<string, unknown>[] {
    return this.requestBodies.map((body) => structuredClone(body));
  }

  /** Return detached redacted request evidence. */
  evidence(): readonly OpenAiCompatibleObservation[] {
    return this.observations.map((observation) => ({ ...observation }));
  }

  /** Close the test-owned endpoint. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }
}
