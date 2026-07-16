import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

import {
  matchers,
  webSocketSteps,
  type Mockttp,
  type OngoingRequest,
  type WebSocketRuleData,
} from 'mockttp';
import WebSocket, { WebSocketServer, type RawData } from 'ws';

export type WebSocketMessageDirection =
  | 'client-to-server'
  | 'server-to-client';

export interface WebSocketBridgeMessage {
  readonly streamId: string;
  readonly url: string;
  readonly direction: WebSocketMessageDirection;
  readonly content: Buffer;
  readonly isBinary: boolean;
}

export type WebSocketBridgeDecision =
  | {
      readonly action: 'forward';
      readonly content: Uint8Array;
      readonly isBinary: boolean;
    }
  | { readonly action: 'drop' };

export interface WebSocketBridgeOptions {
  readonly intercept: (
    message: WebSocketBridgeMessage,
  ) => Promise<WebSocketBridgeDecision>;
  readonly ignoreCertificateErrors: (hostname: string) => boolean;
  readonly onError?: (error: Error) => void;
}

interface SocketPair {
  readonly downstream: WebSocket;
  readonly upstream: WebSocket;
}

/**
 * WebSocket 数据面 bridge。Mockttp 继续拥有 listener、Upgrade 预处理和观测事件；
 * bridge 只替换其不可扩展的消息直通 step，以便在每条消息发送前 await 断点决策。
 */
export class WebSocketBridge {
  private readonly pairs = new Set<SocketPair>();
  private readonly downstreamServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    autoPong: false,
    skipUTF8Validation: true,
  });

  constructor(private readonly options: WebSocketBridgeOptions) {}

  async register(server: Mockttp): Promise<void> {
    const step = Object.assign(new webSocketSteps.ListenWebSocketStep(), {
      handle: (
        request: OngoingRequest & IncomingMessage,
        socket: Socket,
        head: Buffer,
      ) => this.handle(request, socket, head),
    });
    const rule: WebSocketRuleData = {
      matchers: [new matchers.WildcardMatcher()],
      steps: [step],
    };
    await server.addWebSocketRule(rule);
  }

  close(): void {
    for (const pair of this.pairs) {
      pair.downstream.terminate();
      pair.upstream.terminate();
    }
    this.pairs.clear();
  }

  private async handle(
    request: OngoingRequest & IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): Promise<void> {
    const url = toWebSocketUrl(request.url ?? '');
    const protocols = readProtocols(request.headers['sec-websocket-protocol']);
    const options: WebSocket.ClientOptions = {
      headers: forwardedHeaders(request.headers),
      perMessageDeflate: false,
      autoPong: false,
      skipUTF8Validation: true,
      rejectUnauthorized: !this.options.ignoreCertificateErrors(url.hostname),
    };
    const upstream = protocols.length > 0
      ? new WebSocket(url, protocols, options)
      : new WebSocket(url, options);

    try {
      await waitForOpen(upstream);
    } catch (error) {
      upstream.terminate();
      throw error;
    }

    if (upstream.protocol) {
      request.headers['sec-websocket-protocol'] = upstream.protocol;
    } else {
      delete request.headers['sec-websocket-protocol'];
    }
    delete request.headers['sec-websocket-extensions'];

    this.downstreamServer.handleUpgrade(request, socket, head, (downstream) => {
      socket.emit('ws-upgrade', downstream);
      this.connectPair(request, downstream, upstream);
    });
  }

  private connectPair(
    request: OngoingRequest,
    downstream: WebSocket,
    upstream: WebSocket,
  ): void {
    const pair = { downstream, upstream };
    this.pairs.add(pair);
    let clientTail = Promise.resolve();
    let serverTail = Promise.resolve();

    downstream.on('message', (data, isBinary) => {
      clientTail = clientTail.then(() =>
        this.forward(request, upstream, 'client-to-server', data, isBinary),
      ).catch((error: unknown) => this.failPair(pair, error));
    });
    upstream.on('message', (data, isBinary) => {
      serverTail = serverTail.then(() =>
        this.forward(request, downstream, 'server-to-client', data, isBinary),
      ).catch((error: unknown) => this.failPair(pair, error));
    });

    downstream.on('ping', (data) => sendControl(upstream, 'ping', data));
    upstream.on('ping', (data) => sendControl(downstream, 'ping', data));
    downstream.on('pong', (data) => sendControl(upstream, 'pong', data));
    upstream.on('pong', (data) => sendControl(downstream, 'pong', data));

    downstream.on('close', (code, reason) => closePeer(upstream, code, reason));
    upstream.on('close', (code, reason) => closePeer(downstream, code, reason));
    downstream.on('error', (error) => this.failPair(pair, error));
    upstream.on('error', (error) => this.failPair(pair, error));
    const cleanup = (): void => {
      if (downstream.readyState === WebSocket.CLOSED && upstream.readyState === WebSocket.CLOSED) {
        this.pairs.delete(pair);
      }
    };
    downstream.on('close', cleanup);
    upstream.on('close', cleanup);
  }

  private async forward(
    request: OngoingRequest,
    target: WebSocket,
    direction: WebSocketMessageDirection,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    const decision = await this.options.intercept({
      streamId: request.id,
      url: request.url,
      direction,
      content: toBuffer(data),
      isBinary,
    });
    if (decision.action === 'drop' || target.readyState !== WebSocket.OPEN) {
      return;
    }
    await sendMessage(target, decision.content, decision.isBinary);
  }

  private failPair(pair: SocketPair, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.options.onError?.(normalized);
    pair.downstream.terminate();
    pair.upstream.terminate();
    this.pairs.delete(pair);
  }
}

function toWebSocketUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`Unsupported WebSocket protocol: ${url.protocol}`);
  }
  return url;
}

function readProtocols(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value ?? '';
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function forwardedHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const blocked = new Set([
    'connection',
    'host',
    'upgrade',
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-extensions',
    'sec-websocket-protocol',
  ]);
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !blocked.has(name.toLowerCase())) {
      result[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return result;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('open', opened);
      socket.off('error', failed);
    };
    const opened = (): void => {
      cleanup();
      resolve();
    };
    const failed = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.once('open', opened);
    socket.once('error', failed);
  });
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  const exhaustive: never = data;
  throw new Error(`Unsupported WebSocket payload: ${String(exhaustive)}`);
}

function sendMessage(
  socket: WebSocket,
  content: Uint8Array,
  isBinary: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(content, { binary: isBinary }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function sendControl(
  socket: WebSocket,
  kind: 'ping' | 'pong',
  data: Buffer,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket[kind](data, undefined, () => undefined);
  }
}

function closePeer(socket: WebSocket, code: number, reason: Buffer): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  if (code >= 1000 && code <= 4999 && ![1004, 1005, 1006].includes(code)) {
    socket.close(code, reason);
  } else {
    socket.close();
  }
}