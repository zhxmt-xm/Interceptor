import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';

import { HttpProxyAgent } from 'http-proxy-agent';
import WebSocket, { WebSocketServer } from 'ws';

import type {
  TrafficMessageDraft,
  TrafficProtocolEvent,
  TrafficRequestFact,
  WebSocketTrafficRequestDraft,
} from '../interfaces.ts';
import {
  closeServer,
  listen,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from './traffic-utils.ts';

export class WebSocketTrafficRunner {
  readonly #originServer: Server;
  readonly #originPort: number;
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();
  readonly #serverByRunId = new Map<string, WebSocket>();
  readonly #webSocketServer: WebSocketServer;

  private constructor(
    originServer: Server,
    originPort: number,
    webSocketServer: WebSocketServer,
  ) {
    this.#originServer = originServer;
    this.#originPort = originPort;
    this.#webSocketServer = webSocketServer;
  }

  static async start(): Promise<WebSocketTrafficRunner> {
    const originServer = createServer();
    const webSocketServer = new WebSocketServer({ noServer: true });
    let webSocketTrafficRunner: WebSocketTrafficRunner;
    originServer.on('upgrade', (request, socket, head) => {
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });
    webSocketServer.on('connection', (webSocket, request) => {
      const runId = request.headers['x-playground-run-id'];
      if (typeof runId === 'string') {
        webSocketTrafficRunner.#requestByRunId.set(runId, {
          body: '',
          bodyBytes: 0,
          bodyEncoding: 'utf8',
          headers: stringHeaders(request.headers),
          method: request.method ?? 'GET',
          path: request.url ?? '/',
          url: `ws://127.0.0.1:${webSocketTrafficRunner.#originPort}${request.url ?? '/'}`,
        });
        webSocketTrafficRunner.#serverByRunId.set(runId, webSocket);
        webSocket.once('close', () => webSocketTrafficRunner.#serverByRunId.delete(runId));
      }
      webSocket.on('message', (data, isBinary) => {
        webSocket.send(data, { binary: isBinary });
      });
    });
    const originPort = await listen(originServer);
    webSocketTrafficRunner = new WebSocketTrafficRunner(
      originServer,
      originPort,
      webSocketServer,
    );
    return webSocketTrafficRunner;
  }

  async run(
    draft: WebSocketTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = randomUUID();
    const targetUrl = `ws://127.0.0.1:${this.#originPort}${draft.path}`;
    const attempt = { method: 'GET', path: draft.path, url: targetUrl };
    const events: TrafficProtocolEvent[] = [];
    let client: WebSocket | null = null;
    let responseHeaders: Readonly<Record<string, string>> = {};
    let responseStatusCode = 0;
    try {
      client = new WebSocket(targetUrl, {
        agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`),
        headers: { ...draft.headers, 'x-playground-run-id': runId },
      });
      client.once('upgrade', (response) => {
        responseHeaders = stringHeaders(response.headers);
        responseStatusCode = response.statusCode ?? 0;
      });
      await waitForOpen(client);
      events.push({ type: 'open' });
      const server = await this.#waitForServer(runId);
      const request = this.#requestByRunId.get(runId);
      if (request === undefined) {
        throw new Error('WebSocket origin did not record the upgraded request.');
      }

      for (const message of draft.clientMessages) {
        const received = once(client, 'message');
        events.push(messageEvent(message, 'client-to-server'));
        client.send(messageBuffer(message), { binary: message.encoding === 'base64' });
        const [data, isBinary] = await received as [Buffer, boolean];
        events.push(observedMessageEvent(data, isBinary, 'server-to-client'));
      }
      for (const message of draft.serverMessages) {
        const received = once(client, 'message');
        server.send(messageBuffer(message), { binary: message.encoding === 'base64' });
        const [data, isBinary] = await received as [Buffer, boolean];
        events.push(observedMessageEvent(data, isBinary, 'server-to-client'));
      }
      for (const control of draft.controls) {
        if (control === 'ping') {
          const pong = once(client, 'pong');
          client.ping('playground-ping');
          events.push({ direction: 'client-to-server', type: 'ping' });
          await pong;
          events.push({ direction: 'server-to-client', type: 'pong' });
        } else if (control === 'pong') {
          const observed = once(server, 'pong');
          client.pong('playground-pong');
          await observed;
          events.push({ direction: 'client-to-server', type: 'pong' });
        } else {
          await closeWebSocket(client);
          events.push({ type: 'close' });
        }
      }
      if (client.readyState !== WebSocket.CLOSED) {
        await closeWebSocket(client);
        events.push({ type: 'close' });
      }
      return {
        attempt,
        events,
        protocol: 'websocket',
        request,
        response: responseFact(Buffer.alloc(0), responseHeaders, responseStatusCode, []),
        state: 'complete',
      };
    } catch (error) {
      client?.terminate();
      return {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        events,
        protocol: 'websocket',
        request: this.#requestByRunId.get(runId) ?? null,
        state: 'failed',
      };
    } finally {
      this.#requestByRunId.delete(runId);
    }
  }

  async close(): Promise<void> {
    for (const webSocket of this.#webSocketServer.clients) webSocket.terminate();
    await new Promise<void>((resolve) => this.#webSocketServer.close(() => resolve()));
    await closeServer(this.#originServer);
  }

  async #waitForServer(runId: string): Promise<WebSocket> {
    const deadline = performance.now() + 1_000;
    while (!this.#serverByRunId.has(runId) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const server = this.#serverByRunId.get(runId);
    if (server === undefined) throw new Error('WebSocket origin did not observe the upgraded connection.');
    return server;
  }
}

function closeWebSocket(webSocket: WebSocket): Promise<void> {
  if (webSocket.readyState === WebSocket.CLOSED) return Promise.resolve();
  const closed = once(webSocket, 'close').then(() => undefined);
  webSocket.close(1000, 'playground-complete');
  return closed;
}

function messageBuffer(message: TrafficMessageDraft): Buffer {
  return Buffer.from(message.data, message.encoding);
}

function messageEvent(
  message: TrafficMessageDraft,
  direction: TrafficProtocolEvent['direction'],
): TrafficProtocolEvent {
  return {
    data: message.data,
    direction,
    encoding: message.encoding,
    type: message.encoding === 'base64' ? 'binary' : 'message',
  };
}

function observedMessageEvent(
  data: Buffer,
  isBinary: boolean,
  direction: TrafficProtocolEvent['direction'],
): TrafficProtocolEvent {
  return {
    data: data.toString(isBinary ? 'base64' : 'utf8'),
    direction,
    encoding: isBinary ? 'base64' : 'utf8',
    type: isBinary ? 'binary' : 'message',
  };
}

function waitForOpen(webSocket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    webSocket.once('open', resolve);
    webSocket.once('error', reject);
  });
}