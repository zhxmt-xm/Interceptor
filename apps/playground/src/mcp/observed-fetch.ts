import { redactMcpExchange, redactSensitiveText } from './redaction';

export interface ObservedMcpMessage {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ObservedMcpResponse extends ObservedMcpMessage {
  readonly status: number;
}

export interface ObservedMcpExchange {
  readonly durationMs: number;
  readonly error?: string;
  readonly id: string;
  readonly request: ObservedMcpMessage & {
    readonly method: string;
    readonly url: string;
  };
  readonly response?: ObservedMcpResponse;
  readonly startedAt: string;
  readonly state: 'pending' | 'complete' | 'failed';
}

export type PlaygroundFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createObservedFetch(
  token: string,
  record: (exchange: ObservedMcpExchange) => void,
  baseFetch: PlaygroundFetch = globalThis.fetch,
): PlaygroundFetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const startedAt = new Date().toISOString();
    const startedAtMs = performance.now();
    const id = crypto.randomUUID();
    const requestBody = request.method === 'GET' || request.method === 'HEAD'
      ? ''
      : await request.clone().text();
    const redactedRequest = redactMcpExchange({
      body: requestBody,
      headers: Object.fromEntries(request.headers.entries()),
    }, token);
    const requestRecord = {
      ...redactedRequest,
      method: request.method,
      url: request.url,
    };
    record({
      durationMs: 0,
      id,
      request: requestRecord,
      startedAt,
      state: 'pending',
    });
    try {
      const response = await baseFetch(request);
      void response.clone().text().then((responseBody) => {
        const redactedResponse = redactMcpExchange({
          body: responseBody,
          headers: Object.fromEntries(response.headers.entries()),
        }, token);
        record({
          durationMs: Math.round((performance.now() - startedAtMs) * 10) / 10,
          id,
          request: requestRecord,
          response: { ...redactedResponse, status: response.status },
          startedAt,
          state: 'complete',
        });
      }).catch((error: unknown) => {
        record({
          durationMs: Math.round((performance.now() - startedAtMs) * 10) / 10,
          error: redactSensitiveText(error instanceof Error ? error.message : String(error), token),
          id,
          request: requestRecord,
          startedAt,
          state: 'failed',
        });
      });
      return response;
    } catch (error) {
      record({
        durationMs: Math.round((performance.now() - startedAtMs) * 10) / 10,
        error: redactSensitiveText(error instanceof Error ? error.message : String(error), token),
        id,
        request: requestRecord,
        startedAt,
        state: 'failed',
      });
      throw error;
    }
  };
}