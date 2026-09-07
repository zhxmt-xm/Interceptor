import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import type { Duplex, Writable } from 'node:stream';

import { HttpProxyAgent } from 'http-proxy-agent';
import WebSocket, { Receiver, Sender, WebSocketServer } from 'ws';

import type {
  TrafficMessageDraft,
  TrafficProtocolEvent,
  TrafficRequestFact,
  WebSocketTrafficRequestDraft,
} from '../scenarios/interfaces.ts';
import {
  closeServer,
  listen,
  responseFact,
  stringHeaders,
  type TrafficExecution,
} from '../shared/traffic-utils.ts';

/**
 * 拥有唯一的 WebSocket echo origin，并记录真实收到的消息与关闭码。
 * run 和断点 workflow 都通过 openThroughProxy 创建同一种客户端，帧处理统一由 ws 完成。
 * 本类只负责 origin、场景编排与资源回收，不另建第二种客户端或协议实现。
 */
export class WebSocketTrafficRunner {
  /** 接收 HTTP Upgrade 的本地 HTTP server。 */
  readonly #originServer: Server;
  /** 操作系统分配的 origin 端口，不是 Interceptor 代理端口。 */
  readonly #originPort: number;
  /** 按 runId 关联真实 Upgrade 请求，避免并发场景串用握手证据。 */
  readonly #requestByRunId = new Map<string, TrafficRequestFact>();
  /** 各场景的 origin 端连接，用于精确发送 server-to-client 消息。 */
  readonly #serverByRunId = new Map<string, WebSocket>();
  /** 负责服务端握手、帧解析和 echo 的 ws 实例。 */
  readonly #webSocketServer: WebSocketServer;
  /** 当前所有场景和断点客户端，由 runner 在关闭时统一销毁。 */
  readonly #clients = new Set<ProxiedWebSocketClient>();
  /** origin 实际收到的关闭码，保留代理编辑后的结果而非客户端意图。 */
  readonly #observedCloseCodes: number[] = [];
  /** origin 实际收到的文本，用于确认 Continue、Edit 或 Drop 的转发结果。 */
  readonly #observedMessages: string[] = [];

  /** 绑定已监听的 HTTP server 与其 WebSocket 服务。 */
  private constructor(
    originServer: Server,
    originPort: number,
    webSocketServer: WebSocketServer,
  ) {
    this.#originServer = originServer;
    this.#originPort = originPort;
    this.#webSocketServer = webSocketServer;
  }

  /** 在随机 loopback 端口启动 echo origin，同时建立握手和消息观测。 */
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
        if (!isBinary) webSocketTrafficRunner.#observedMessages.push(data.toString());
        webSocket.send(data, { binary: isBinary });
      });
      webSocket.on('close', (closeCode) => {
        webSocketTrafficRunner.#observedCloseCodes.push(closeCode);
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

  /** 暴露 origin 端口，供流量定位及释放验证使用。 */
  get port(): number {
    return this.#originPort;
  }

  /** 场景与断点共用的客户端创建入口；连接可持续跨越多次 UI 操作。 */
  async openThroughProxy(
    proxyPort: number,
    requestPath: string,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<ProxiedWebSocketClient> {
    const client = await ProxiedWebSocketClient.open(
      proxyPort,
      `ws://127.0.0.1:${this.#originPort}${requestPath}`,
      headers,
    );
    this.#clients.add(client);
    client.once('close', () => this.#clients.delete(client));
    return client;
  }

  /** 从 origin 向当前所有 OPEN 连接广播文本，支持入站断点与双向队列测试。 */
  sendFromOrigin(message: string): void {
    for (const webSocket of this.#webSocketServer.clients) {
      if (webSocket.readyState === WebSocket.OPEN) webSocket.send(message);
    }
  }

  /** 返回 origin 最近观察到的关闭码，包括真实 TCP 断开对应的 1006。 */
  latestCloseCode(): number | undefined {
    return this.#observedCloseCodes.at(-1);
  }

  /** 查询指定文本是否真正到达 origin，而非仅在客户端调用过 send。 */
  hasMessage(message: string): boolean {
    return this.#observedMessages.includes(message);
  }

  /** 返回脱离内部数组的观测快照，后续收包不会改变已经保存的证据。 */
  evidence(): { readonly closeCodes: readonly number[]; readonly messages: readonly string[] } {
    return {
      closeCodes: [...this.#observedCloseCodes],
      messages: [...this.#observedMessages],
    };
  }

  /**
  * 使用与断点相同的客户端执行一次 Draft，支持长文本、binary、ping/pong 和正常关闭。
  * 场景显式回复 Ping、执行完整关闭；单发控制帧不会改变其他客户端的生命周期。
   */
  async run(
    draft: WebSocketTrafficRequestDraft,
    proxyPort: number,
  ): Promise<TrafficExecution> {
    const runId = randomUUID();
    const targetUrl = `ws://127.0.0.1:${this.#originPort}${draft.path}`;
    const attempt = { method: 'GET', path: draft.path, url: targetUrl };
    const events: TrafficProtocolEvent[] = [];
    let client: ProxiedWebSocketClient | null = null;
    try {
      const proxiedWebSocketClient = await this.openThroughProxy(proxyPort, draft.path, {
        ...draft.headers,
        'x-playground-run-id': runId,
      });
      client = proxiedWebSocketClient;
      client.on('ping', (data: Buffer) => proxiedWebSocketClient.sendPong(data));
      events.push({ type: 'open' });
      const server = await this.#waitForServer(runId);
      const request = this.#requestByRunId.get(runId);
      if (request === undefined) {
        throw new Error('WebSocket origin did not record the upgraded request.');
      }

      for (const message of draft.clientMessages) {
        const received = once(client, 'message');
        events.push(messageEvent(message, 'client-to-server'));
        if (message.encoding === 'base64') client.sendBinary(messageBuffer(message));
        else client.sendText(message.data);
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
          client.sendPing('playground-ping');
          events.push({ direction: 'client-to-server', type: 'ping' });
          await pong;
          events.push({ direction: 'server-to-client', type: 'pong' });
        } else if (control === 'pong') {
          const observed = once(server, 'pong');
          client.sendPong('playground-pong');
          await observed;
          events.push({ direction: 'client-to-server', type: 'pong' });
        } else {
          await client.closeGracefully(1000, 'playground-complete');
          events.push({ type: 'close' });
        }
      }
      if (!client.isClosed()) {
        await client.closeGracefully(1000, 'playground-complete');
        events.push({ type: 'close' });
      }
      return {
        attempt,
        events,
        protocol: 'websocket',
        request,
        response: responseFact(Buffer.alloc(0), client.handshake.headers, client.handshake.statusCode, []),
        state: 'complete',
      };
    } catch (error) {
      client?.destroy();
      return {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        events,
        protocol: 'websocket',
        request: this.#requestByRunId.get(runId) ?? null,
        state: 'failed',
      };
    } finally {
      client?.destroy();
      this.#requestByRunId.delete(runId);
    }
  }

  /** 销毁长期客户端与服务端连接，再关闭 ws 和 HTTP listener。 */
  async close(): Promise<void> {
    for (const client of this.#clients) client.destroy();
    this.#clients.clear();
    for (const webSocket of this.#webSocketServer.clients) webSocket.terminate();
    await new Promise<void>((resolve) => this.#webSocketServer.close(() => resolve()));
    await closeServer(this.#originServer);
  }

  /** 等待当前 run 的真实 origin 连接建立，避免 client open 与服务端记录的短暂竞态。 */
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

/**
 * 普通场景与断点共用的显式代理 WebSocket 客户端，帧编码和解析统一交给 ws。
 * sendCloseFrame 只写帧；closeGracefully 才启动完整关闭流程，不以模式开关维护两套客户端。
 * 消息和控制帧从真实 socket 观测；origin、场景编排与自动 pong 策略由调用方所有。
 */
export class ProxiedWebSocketClient extends EventEmitter {
  /** 连接 Interceptor listener 的真实 TCP socket，不绕过代理直连 origin。 */
  private readonly socket: Duplex;
  /** 同一 socket 上的 ws 帧发送器，支持文本、binary、mask 和控制帧。 */
  private readonly sender: Sender;
  /** ws 增量解析器，包含分片重组，不再自行解析 frameBuffer。 */
  private readonly receiver: Receiver;
  /** 代理实际返回的 Upgrade 响应，供场景展示两端握手事实。 */
  readonly handshake: { readonly statusCode: number; readonly headers: Readonly<Record<string, string>> };
  /** 已收到的完整文本消息，用于补偿事件先于断言发生的时序。 */
  private readonly observedTextMessages: string[] = [];
  /** 对端实际发来的关闭帧，区别于单纯 TCP 断开。 */
  private receivedCloseFrame: { readonly code: number; readonly reason: Buffer } | null = null;
  /** 仅完整关闭操作设置；单独发送 Close 帧不会改变该状态。 */
  private gracefulCloseRequested = false;
  /** 同一次完整关闭的结算任务，重复调用不重复发送关闭帧。 */
  private gracefulClosePromise: Promise<void> | null = null;
  /** 最近的解析或网络错误，用于向等待中的关闭和消息操作报告失败。 */
  private failure: Error | null = null;
  /** 将 ws 异步写入错误收敛到统一断开路径。 */
  private readonly reportWriteError = (error?: Error): void => {
    if (error) this.fail(error);
  };

  /** 接管完成 Upgrade 的 socket，先注册所有接收事件，再开始消费网络字节。 */
  private constructor(socket: Duplex, handshake: ProxiedWebSocketClient['handshake']) {
    super();
    this.socket = socket;
    this.handshake = handshake;
    this.sender = new Sender(socket);
    this.receiver = new Receiver({ isServer: false, binaryType: 'nodebuffer' });
    this.receiver.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString('utf8');
        this.observedTextMessages.push(text);
        this.emit('text', text);
      }
      this.emit('message', data, isBinary);
    });
    this.receiver.on('ping', (data: Buffer) => this.emit('ping', data));
    this.receiver.on('pong', (data: Buffer) => this.emit('pong', data));
    this.receiver.on('conclude', (code: number, reason: Buffer) => {
      this.receivedCloseFrame = { code, reason };
      this.emit('close-frame', code, reason);
      if (this.gracefulCloseRequested) this.socket.end();
    });
    this.receiver.on('error', (error: Error) => this.fail(error));
    socket.on('error', (error: Error) => this.fail(error));
    socket.once('close', () => {
      socket.unpipe(this.receiver);
      this.receiver.destroy();
      this.emit('close', this.receivedCloseFrame?.code ?? 1006, this.receivedCloseFrame?.reason ?? Buffer.alloc(0));
    });
  }

  /** Node 解析 HTTP Upgrade，HttpProxyAgent 生成 absolute-form 请求；校验 101 与 accept 后开放操作。 */
  static async open(
    proxyPort: number,
    targetUrl: string,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<ProxiedWebSocketClient> {
    const target = new URL(targetUrl);
    target.protocol = 'http:';
    const key = randomBytes(16).toString('base64');
    const expectedAccept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    return new Promise((resolve, reject) => {
      const outgoing = request(target, {
        agent: new HttpProxyAgent(`http://127.0.0.1:${proxyPort}`),
        headers: {
          ...headers,
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-version': '13',
          'sec-websocket-key': key,
        },
      });
      outgoing.once('error', reject);
      outgoing.once('response', (response) => {
        response.resume();
        reject(new Error(`Unexpected WebSocket proxy response: HTTP ${response.statusCode}`));
      });
      outgoing.once('upgrade', (response, socket, head) => {
        if (response.statusCode !== 101
          || response.headers.upgrade?.toLowerCase() !== 'websocket'
          || response.headers['sec-websocket-accept'] !== expectedAccept) {
          socket.destroy();
          reject(new Error('Invalid WebSocket Upgrade response.'));
          return;
        }
        const client = new ProxiedWebSocketClient(socket, {
          statusCode: response.statusCode,
          headers: stringHeaders(response.headers),
        });
        if (head.byteLength > 0) client.receiver.write(head);
        socket.pipe(client.receiver);
        resolve(client);
      });
      outgoing.end();
    });
  }

  /** 只发送带指定 code 的 masked Close 帧，不改变本地连接状态或发起关闭超时。 */
  sendCloseFrame(closeCode: number, reason: string | Buffer = ''): void {
    this.sender.close(closeCode, reason, true, this.reportWriteError);
  }

  /** 发送关闭帧并等待对端确认与 TCP 关闭，超时明确失败并回收 socket。 */
  closeGracefully(closeCode = 1000, reason = ''): Promise<void> {
    if (this.gracefulClosePromise) return this.gracefulClosePromise;
    if (this.isClosed()) return this.failure ? Promise.reject(this.failure) : Promise.resolve();
    this.gracefulCloseRequested = true;
    this.gracefulClosePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('WebSocket close handshake timed out.')), 30_000);
      this.once('close', () => {
        clearTimeout(timer);
        if (this.failure) reject(this.failure);
        else if (!this.receivedCloseFrame) reject(new Error('WebSocket disconnected without a Close frame.'));
        else resolve();
      });
      try {
        this.sendCloseFrame(closeCode, reason);
        if (this.receivedCloseFrame) this.socket.end();
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return this.gracefulClosePromise;
  }

  /** 发送完整文本消息，扩展长度与 masking 由 ws 编码。 */
  sendText(message: string): void {
    this.sendMessage(message, false);
  }

  /** 保留原始二进制字节并使用 binary opcode。 */
  sendBinary(message: Buffer): void {
    this.sendMessage(message, true);
  }

  /** 共用文本与二进制发送路径；只有完整关闭开始后才拒绝新消息。 */
  private sendMessage(message: string | Buffer, binary: boolean): void {
    if (this.gracefulCloseRequested) throw new Error('WebSocket is closing.');
    this.sender.send(message, { binary, compress: false, fin: true, mask: true }, this.reportWriteError);
  }

  /** 显式发送 Ping，使用 pong 事件观察对端实际回复。 */
  sendPing(data: string | Buffer): void {
    this.sender.ping(data, true, this.reportWriteError);
  }

  /** 显式发送 Pong；普通场景可在 ping 事件中调用，断点场景不被强制自动回复。 */
  sendPong(data: string | Buffer): void {
    this.sender.pong(data, true, this.reportWriteError);
  }

  /** 等待精确文本；已收到时立即返回，超时移除监听并明确失败。 */
  async waitForText(message: string, timeoutMs = 5_000): Promise<void> {
    if (this.observedTextMessages.includes(message)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('text', onText);
        reject(new Error(`Timed out waiting for WebSocket text: ${message}`));
      }, timeoutMs);
      const onText = (observed: string): void => {
        if (observed !== message) return;
        clearTimeout(timer);
        this.off('text', onText);
        resolve();
      };
      this.on('text', onText);
    });
  }

  /** 查询客户端实际收到的文本，不能以 origin 已发送代替该事实。 */
  hasText(message: string): boolean {
    return this.observedTextMessages.includes(message);
  }

  /** 返回底层 socket 是否已销毁，而非仅检查是否发送过 Close 帧。 */
  isClosed(): boolean {
    return this.socket.destroyed;
  }

  /** 立即断开测试拥有的 TCP 连接，用于客户端取消和最终清理。 */
  destroy(): void {
    this.socket.destroy();
  }

  /** 记录首个错误并回收 socket；已有事件等待者立即收到错误，关闭任务也会失败。 */
  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.socket.destroy();
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }
}

/** 根据 Draft 声明的编码恢复实际发送字节。 */
function messageBuffer(message: TrafficMessageDraft): Buffer {
  return Buffer.from(message.data, message.encoding);
}

/** 记录场景主动发送的消息及方向，不冒充接收端已收到的事实。 */
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

/** 从真实接收数据生成文本或二进制证据。 */
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

/** ws 已导出 Sender/Receiver，当前 @types/ws 尚未声明；这里只补本文件使用的公开 API。 */
declare module 'ws' {
  /** ws 的帧编码器，不管理 WebSocket 连接状态。 */
  export class Sender {
    constructor(socket: Duplex);
    send(
      data: string | Buffer,
      options: { binary: boolean; compress: boolean; fin: boolean; mask: boolean },
      callback: (error?: Error) => void,
    ): void;
    close(code: number, reason: string | Buffer, mask: boolean, callback: (error?: Error) => void): void;
    ping(data: string | Buffer, mask: boolean, callback: (error?: Error) => void): void;
    pong(data: string | Buffer, mask: boolean, callback: (error?: Error) => void): void;
  }

  /** ws 的增量帧解析器，负责拆包、分片重组和校验，不自动回复控制帧。 */
  export class Receiver extends Writable {
    constructor(options: { isServer: boolean; binaryType: 'nodebuffer' });
  }
}
