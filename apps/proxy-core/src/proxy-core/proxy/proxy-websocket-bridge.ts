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

import type {
  WebSocketBridgeOptions,
  WebSocketMessageDirection,
  WebSocketPair,
} from './interfaces';
import * as ProxyUtils from './utils';

/**
 * WebSocket 数据面 bridge。Mockttp 继续拥有 listener、Upgrade 预处理和观测事件；
 * bridge 只替换其不可扩展的消息直通 step，以便在每条消息发送前 await 断点决策。
 */
export class WebSocketBridge {
  /** 当前活动的下游/上游 WebSocket 对。 */
  private readonly pairs = new Set<WebSocketPair>();
  /** 只负责下游 Upgrade 的无独立端口 WebSocketServer。 */
  private readonly downstreamServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    autoPong: false,
    skipUTF8Validation: true,
  });
  /** 消息拦截、证书例外与错误上报策略。 */
  private readonly options: WebSocketBridgeOptions;

  /** 固定 bridge 策略。 */
  constructor(options: WebSocketBridgeOptions) {
    this.options = options;
  }

  /** 向 Mockttp 注册接管全部 WebSocket Upgrade 的自定义 step。 */
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

  /** 终止所有活动连接并清空 bridge 状态。 */
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
    const url = ProxyUtils.toWebSocketUrl(request.url ?? '');
    const protocols = ProxyUtils.readProtocols(
      request.headers['sec-websocket-protocol'],
    );
    const options: WebSocket.ClientOptions = {
      headers: ProxyUtils.forwardedHeaders(request.headers),
      perMessageDeflate: false,
      autoPong: false,
      skipUTF8Validation: true,
      rejectUnauthorized: !this.options.ignoreCertificateErrors(url.hostname),
    };
    const upstream = protocols.length > 0
      ? new WebSocket(url, protocols, options)
      : new WebSocket(url, options);

    try {
      await ProxyUtils.waitForOpen(upstream);
    } catch (error) {
      upstream.terminate();
      // Mockttp 随后只会发 completed `response`（Capture 已退订），
      // 在抛出前先把该 Exchange 判为终态，否则会永远停在 pending。
      this.options.onUpgradeFailed?.(
        request.id,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }

    if (upstream.protocol) {
      request.headers['sec-websocket-protocol'] = upstream.protocol;
    } else {
      delete request.headers['sec-websocket-protocol'];
    }
    delete request.headers['sec-websocket-extensions'];

    // 客户端可能在等待上游握手期间就断开。此时 ws 的 completeUpgrade 只会 destroy
    // 下游 socket 并**静默跳过回调**，connectPair 不会执行，上游连接既进不了 pairs
    // 也无人 terminate，会一直挂在源站上。故这里必须自己兜住上游。
    if (socket.destroyed || !socket.readable || !socket.writable) {
      upstream.terminate();
      return;
    }
    let paired = false;
    socket.once('close', () => {
      if (!paired) {
        upstream.terminate();
      }
    });

    this.downstreamServer.handleUpgrade(request, socket, head, (downstream) => {
      paired = true;
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

    downstream.on('ping', (data) =>
      ProxyUtils.sendControl(upstream, 'ping', data));
    upstream.on('ping', (data) =>
      ProxyUtils.sendControl(downstream, 'ping', data));
    downstream.on('pong', (data) =>
      ProxyUtils.sendControl(upstream, 'pong', data));
    upstream.on('pong', (data) =>
      ProxyUtils.sendControl(downstream, 'pong', data));

    downstream.on('close', (code, reason) =>
      ProxyUtils.closePeer(upstream, code, reason));
    upstream.on('close', (code, reason) =>
      ProxyUtils.closePeer(downstream, code, reason));
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
      content: ProxyUtils.toBuffer(data),
      isBinary,
    });
    if (decision.action === 'drop' || target.readyState !== WebSocket.OPEN) {
      return;
    }
    await ProxyUtils.sendMessage(target, decision.content, decision.isBinary);
  }

  /** 归一化连接错误、终止双方并移除活动 pair。 */
  private failPair(pair: WebSocketPair, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.options.onError?.(normalized);
    pair.downstream.terminate();
    pair.upstream.terminate();
    this.pairs.delete(pair);
  }
}
