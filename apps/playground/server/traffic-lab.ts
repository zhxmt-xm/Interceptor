import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';

import type {
  TrafficRequestFact,
  TrafficResponseFact,
  TrafficScenarioDescriptor,
  TrafficScenarioId,
  TrafficScenarioResult,
} from './interfaces.ts';

export const TRAFFIC_SCENARIOS: readonly TrafficScenarioDescriptor[] = [
  { id: 'h1-json', title: 'H1 JSON', description: 'GET with a structured JSON response.' },
  { id: 'h1-upload', title: 'H1 upload', description: 'POST a request body in three timed chunks.' },
  { id: 'h1-stream', title: 'H1 stream', description: 'Receive three timed response chunks.' },
  { id: 'h1-failure', title: 'H1 failure', description: 'Origin resets the connection before a response.' },
];

export class TrafficLab {
  readonly #originServer: Server;
  readonly #originPort: number;
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();

  private constructor(originServer: Server, originPort: number) {
    this.#originServer = originServer;
    this.#originPort = originPort;
  }

  static async start(): Promise<TrafficLab> {
    let trafficLab: TrafficLab;
    const originServer = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        const runId = readHeader(incoming.headers, 'x-playground-run-id');
        if (runId !== undefined) {
          trafficLab.#requestByRunId.set(runId, {
            body: body.toString('utf8'),
            bodyBytes: body.byteLength,
            headers: stringHeaders(incoming.headers),
            method: incoming.method ?? 'GET',
            path: incoming.url ?? '/',
            url: `http://127.0.0.1:${trafficLab.#originPort}${incoming.url ?? '/'}`,
          });
        }
        switch (incoming.url) {
          case '/playground/h1-json':
            respondJson(response, { orderId: 'ord_42', status: 'ready', items: 3 });
            break;
          case '/playground/h1-upload':
            respondJson(response, { receivedBytes: body.byteLength, sha: 'playground-upload' });
            break;
          case '/playground/h1-stream':
            response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
            response.write('{"chunk":1}\n');
            setTimeout(() => response.write('{"chunk":2}\n'), 35);
            setTimeout(() => response.end('{"chunk":3}\n'), 70);
            break;
          case '/playground/h1-failure':
            incoming.socket.destroy();
            break;
          default:
            response.writeHead(404).end();
        }
      });
    });
    const originPort = await listen(originServer);
    trafficLab = new TrafficLab(originServer, originPort);
    return trafficLab;
  }

  scenarios(): readonly TrafficScenarioDescriptor[] {
    return TRAFFIC_SCENARIOS;
  }

  async run(scenarioId: TrafficScenarioId, proxyPort = 8888): Promise<TrafficScenarioResult> {
    if (!TRAFFIC_SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
      throw new Error(`Unknown Traffic Lab scenario "${scenarioId}".`);
    }
    const startedAt = new Date().toISOString();
    const startedAtMs = performance.now();
    const runId = randomUUID();
    const path = `/playground/${scenarioId}`;
    const method = scenarioId === 'h1-upload' ? 'POST' : 'GET';
    const attempt = {
      method,
      path,
      url: this.#originUrl(path),
    };
    try {
      const response = await this.#requestThroughProxy(proxyPort, runId, scenarioId);
      const requestFact = this.#requestByRunId.get(runId) ?? null;
      this.#requestByRunId.delete(runId);
      if (requestFact === null) {
        return {
          attempt,
          durationMs: elapsed(startedAtMs),
          error: 'Origin did not receive or record this request.',
          request: null,
          response,
          scenarioId,
          startedAt,
          state: 'failed',
        };
      }
      return {
        attempt,
        durationMs: elapsed(startedAtMs),
        request: requestFact,
        response,
        scenarioId,
        startedAt,
        state: scenarioId === 'h1-failure' || response.statusCode >= 500 ? 'failed' : 'complete',
      };
    } catch (error) {
      const requestFact = this.#requestByRunId.get(runId) ?? null;
      this.#requestByRunId.delete(runId);
      return {
        attempt,
        durationMs: elapsed(startedAtMs),
        error: error instanceof Error ? error.message : String(error),
        request: requestFact,
        scenarioId,
        startedAt,
        state: 'failed',
      };
    }
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#originServer.close((error) => error ? reject(error) : resolve());
    });
  }

  async #requestThroughProxy(
    proxyPort: number,
    runId: string,
    scenarioId: TrafficScenarioId,
  ): Promise<TrafficResponseFact> {
    const path = `/playground/${scenarioId}`;
    const bodyChunks = scenarioId === 'h1-upload'
      ? ['{"part":1,', '"message":"playground",', '"done":true}']
      : [];
    const bodyBytes = bodyChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
    return new Promise((resolve, reject) => {
      const startedAtMs = performance.now();
      let settled = false;
      let outgoing: ReturnType<typeof request>;
      const settle = (
        outcome: { readonly error: unknown } | { readonly response: TrafficResponseFact },
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if ('error' in outcome) reject(outcome.error);
        else resolve(outcome.response);
      };
      const timeout = setTimeout(() => {
        const error = new Error('Traffic Lab request timed out.');
        outgoing.destroy(error);
        settle({ error });
      }, 15_000);
      outgoing = request({
        host: '127.0.0.1',
        port: proxyPort,
        method: bodyChunks.length > 0 ? 'POST' : 'GET',
        path: this.#originUrl(path),
        headers: {
          connection: 'close',
          host: `127.0.0.1:${this.#originPort}`,
          ...(bodyChunks.length > 0 ? {
            'content-length': String(bodyBytes),
            'content-type': 'application/json',
          } : {}),
          'x-playground-run-id': runId,
        },
      }, (incoming) => {
        const chunks: Buffer[] = [];
        const chunkTimingsMs: number[] = [];
        incoming.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          chunkTimingsMs.push(elapsed(startedAtMs));
        });
        incoming.on('error', (error) => settle({ error }));
        incoming.on('aborted', () => settle({ error: new Error('Proxy response was aborted.') }));
        incoming.on('close', () => {
          if (!incoming.complete) settle({ error: new Error('Proxy response closed before completion.') });
        });
        incoming.on('end', () => settle({
          response: {
            body: Buffer.concat(chunks).toString('utf8'),
            chunkTimingsMs,
            headers: stringHeaders(incoming.headers),
            statusCode: incoming.statusCode ?? 0,
          },
        }));
      });
      outgoing.on('error', (error) => settle({ error }));
      if (bodyChunks.length === 0) {
        outgoing.end();
        return;
      }
      const writeChunk = (index: number): void => {
        const chunk = bodyChunks[index];
        if (chunk === undefined) {
          outgoing.end();
          return;
        }
        outgoing.write(chunk);
        setTimeout(() => writeChunk(index + 1), 30);
      };
      writeChunk(0);
    });
  }

  #originUrl(path: string): string {
    return `http://127.0.0.1:${this.#originPort}${path}`;
  }
}

function elapsed(startedAtMs: number): number {
  return Math.round((performance.now() - startedAtMs) * 10) / 10;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Traffic Lab origin did not expose a numeric port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function respondJson(
  response: ServerResponse,
  body: Readonly<Record<string, unknown>>,
): void {
  const text = JSON.stringify(body, null, 2);
  response.writeHead(200, {
    'Content-Length': Buffer.byteLength(text),
    'Content-Type': 'application/json',
  });
  response.end(text);
}

function stringHeaders(headers: IncomingHttpHeaders): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined) return [];
    return [[name, Array.isArray(value) ? value.join(', ') : value]];
  }));
}