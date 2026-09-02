import { randomUUID } from 'node:crypto';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import type {
  HttpTrafficRequestDraft,
  TrafficRequestFact,
  TrafficScenarioId,
} from '../interfaces.ts';
import {
  closeServer,
  elapsed,
  listen,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from './traffic-utils.ts';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export class HttpTrafficRunner {
  readonly #originServer: Server;
  readonly #originPort: number;
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();

  private constructor(originServer: Server, originPort: number) {
    this.#originServer = originServer;
    this.#originPort = originPort;
  }

  static async start(): Promise<HttpTrafficRunner> {
    let httpTrafficRunner: HttpTrafficRunner;
    const originServer = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      const scenarioId = readHeader(incoming.headers, 'x-playground-scenario-id') as TrafficScenarioId | undefined;
      let respondedEarly = false;
      incoming.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
        if (scenarioId === 'h1-early-response' && !respondedEarly) {
          respondedEarly = true;
          respondJson(response, { response: 'sent-before-request-completed' });
        }
      });
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        const runId = readHeader(incoming.headers, 'x-playground-run-id');
        if (runId !== undefined) {
          httpTrafficRunner.#requestByRunId.set(runId, {
            body: body.toString('utf8'),
            bodyBytes: body.byteLength,
            bodyEncoding: 'utf8',
            headers: stringHeaders(incoming.headers),
            method: incoming.method ?? 'GET',
            path: incoming.url ?? '/',
            url: `http://127.0.0.1:${httpTrafficRunner.#originPort}${incoming.url ?? '/'}`,
          });
        }
        if (respondedEarly) return;
        respondToScenario(response, scenarioId, body, incoming.socket);
      });
    });
    const originPort = await listen(originServer);
    httpTrafficRunner = new HttpTrafficRunner(originServer, originPort);
    return httpTrafficRunner;
  }

  async run(
    scenarioId: TrafficScenarioId,
    draft: HttpTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = randomUUID();
    const attempt = {
      method: draft.method,
      path: draft.path,
      url: this.#originUrl(draft.path),
    };
    try {
      const response = await this.#requestThroughProxy(proxyPort, runId, scenarioId, draft);
      const requestFact = await this.#readRequestFact(runId);
      return {
        attempt,
        protocol: 'http/1.1',
        request: requestFact,
        response,
        state: scenarioId === 'h1-abort' || response.statusCode >= 500 ? 'failed' : 'complete',
      };
    } catch (error) {
      const requestFact = await this.#readRequestFact(runId);
      return {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        protocol: 'http/1.1',
        request: requestFact,
        state: 'failed',
      };
    }
  }

  async close(): Promise<void> {
    await closeServer(this.#originServer);
  }

  async #requestThroughProxy(
    proxyPort: number,
    runId: string,
    scenarioId: TrafficScenarioId,
    draft: HttpTrafficRequestDraft,
  ) {
    const bodyChunks = scenarioId === 'h1-upload' || scenarioId === 'h1-early-response'
      ? splitIntoTimedChunks(draft.body)
      : draft.body.length > 0 ? [draft.body] : [];
    const bodyBytes = bodyChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
    return new Promise<ReturnType<typeof responseFact>>((resolve, reject) => {
      const startedAtMs = performance.now();
      let settled = false;
      let outgoing: ReturnType<typeof request>;
      const settle = (
        outcome: { readonly error: unknown } | { readonly response: ReturnType<typeof responseFact> },
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
        method: draft.method,
        path: this.#originUrl(draft.path),
        headers: {
          connection: scenarioId === 'h1-early-response' ? 'keep-alive' : 'close',
          host: `127.0.0.1:${this.#originPort}`,
          ...draft.headers,
          ...(bodyChunks.length > 0 ? { 'content-length': String(bodyBytes) } : {}),
          'x-playground-run-id': runId,
          'x-playground-scenario-id': scenarioId,
        },
      }, (incoming) => {
        const chunks: Buffer[] = [];
        const chunkTimingsMs: number[] = [];
        incoming.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
          chunkTimingsMs.push(elapsed(startedAtMs));
        });
        incoming.on('error', (error) => settle({ error }));
        incoming.on('aborted', () => settle({ error: new Error('Proxy response was aborted.') }));
        incoming.on('close', () => {
          if (!incoming.complete) settle({ error: new Error('Proxy response closed before completion.') });
        });
        incoming.on('end', () => settle({
          response: responseFact(
            Buffer.concat(chunks),
            stringHeaders(incoming.headers),
            incoming.statusCode ?? 0,
            chunkTimingsMs,
            stringHeaders(incoming.trailers),
          ),
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

  async #readRequestFact(runId: string): Promise<TrafficRequestFact | null> {
    const deadline = performance.now() + 500;
    while (!this.#requestByRunId.has(runId) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const requestFact = this.#requestByRunId.get(runId) ?? null;
    this.#requestByRunId.delete(runId);
    return requestFact;
  }

  #originUrl(path: string): string {
    return `http://127.0.0.1:${this.#originPort}${path}`;
  }
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function respondToScenario(
  response: ServerResponse,
  scenarioId: TrafficScenarioId | undefined,
  requestBody: Buffer,
  socket: { destroy: () => void },
): void {
  switch (scenarioId) {
    case 'h1-json':
      respondJson(response, { orderId: 'ord_42', status: 'ready', items: 3 });
      return;
    case 'h1-upload':
      respondJson(response, { receivedBytes: requestBody.byteLength, sha: 'playground-upload' });
      return;
    case 'h1-stream':
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.write('{"chunk":1}\n');
      setTimeout(() => response.write('{"chunk":2}\n'), 35);
      setTimeout(() => response.end('{"chunk":3}\n'), 70);
      return;
    case 'h1-abort':
      socket.destroy();
      return;
    case 'body-json': respond(response, Buffer.from('{"ready":true,"items":[1,2,3]}'), 'application/json'); return;
    case 'body-text': respond(response, Buffer.from('Interceptor plain text body.'), 'text/plain; charset=utf-8'); return;
    case 'body-html': respond(response, Buffer.from('<!doctype html><html><body><h1>Interceptor</h1></body></html>'), 'text/html; charset=utf-8'); return;
    case 'body-css': respond(response, Buffer.from('body { color: #2570e0; }'), 'text/css; charset=utf-8'); return;
    case 'body-javascript': respond(response, Buffer.from('const captured = true;\nconsole.log(captured);'), 'text/javascript; charset=utf-8'); return;
    case 'body-xml': respond(response, Buffer.from('<?xml version="1.0"?><capture ready="true"/>'), 'application/xml'); return;
    case 'body-yaml': respond(response, Buffer.from('capture:\n  ready: true\n  count: 3\n'), 'application/yaml'); return;
    case 'body-svg': respond(response, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#2570e0"/></svg>'), 'image/svg+xml'); return;
    case 'body-markdown': respond(response, Buffer.from('# Capture Lab\n\n- request\n- response\n'), 'text/markdown; charset=utf-8'); return;
    case 'body-form': respond(response, Buffer.from('name=Interceptor&ready=true'), 'application/x-www-form-urlencoded'); return;
    case 'body-png': respond(response, PNG_1X1, 'image/png'); return;
    case 'body-binary': respond(response, Buffer.from([0, 1, 2, 3, 127, 128, 254, 255]), 'application/octet-stream'); return;
    case 'body-audio': respond(response, wavFixture(), 'audio/wav'); return;
    case 'body-video': respond(response, mp4Fixture(), 'video/mp4'); return;
    case 'body-unknown-text': respond(response, Buffer.from('Unknown MIME, valid UTF-8 text.')); return;
    case 'body-unknown-binary': respond(response, Buffer.from([0, 159, 146, 150, 255])); return;
    case 'encoding-gzip': respond(response, gzipSync('{"encoding":"gzip"}'), 'application/json', { 'Content-Encoding': 'gzip' }); return;
    case 'encoding-deflate': respond(response, deflateSync('{"encoding":"deflate"}'), 'application/json', { 'Content-Encoding': 'deflate' }); return;
    case 'encoding-br': respond(response, brotliCompressSync('{"encoding":"br"}'), 'application/json', { 'Content-Encoding': 'br' }); return;
    case 'encoding-corrupt-gzip': respond(response, Buffer.from([0x1f, 0x8b, 0x08, 0, 1, 2, 3]), 'application/json', { 'Content-Encoding': 'gzip' }); return;
    case 'encoding-invalid-image': respond(response, Buffer.from('not-a-png'), 'image/png'); return;
    default:
      response.writeHead(404).end();
  }
}

function respond(
  response: ServerResponse,
  body: Buffer,
  contentType?: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(200, {
    'Content-Length': body.byteLength,
    ...(contentType === undefined ? {} : { 'Content-Type': contentType }),
    ...headers,
  });
  response.end(body);
}

function respondJson(response: ServerResponse, body: Readonly<Record<string, unknown>>): void {
  respond(response, Buffer.from(JSON.stringify(body, null, 2)), 'application/json');
}

function splitIntoTimedChunks(body: string): readonly string[] {
  if (body.length < 3) return [body];
  const firstBoundary = Math.ceil(body.length / 3);
  const secondBoundary = Math.ceil(body.length * 2 / 3);
  return [body.slice(0, firstBoundary), body.slice(firstBoundary, secondBoundary), body.slice(secondBoundary)];
}

function wavFixture(): Buffer {
  const buffer = Buffer.alloc(48);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(40, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8_000, 24);
  buffer.writeUInt32LE(8_000, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(4, 40);
  buffer.set([128, 160, 96, 128], 44);
  return buffer;
}

function mp4Fixture(): Buffer {
  return Buffer.from([
    0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
  ]);
}