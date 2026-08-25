import { randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { createServer, type Server as HttpServer } from 'node:http';
import net from 'node:net';

import { WebSocketServer } from 'ws';

/** One raw WebSocket client whose handshake and frames explicitly traverse Interceptor. */
export class ProxiedWebSocketClient extends EventEmitter {
  /** Underlying TCP connection to the Interceptor listener. */
  private readonly socket: net.Socket;
  /** 握手后尚未解析的服务端WebSocket字节。 */
  private frameBuffer = Buffer.alloc(0);
  /** 从真实代理连接收到的UTF-8文本消息。 */
  private readonly observedTextMessages: string[] = [];

  /** Create a connected client after the proxy returned HTTP 101. */
  private constructor(socket: net.Socket) {
    super();
    this.socket = socket;
  }

  /** Open an RFC 6455 connection through an explicit HTTP proxy listener. */
  static async open(
    proxyPort: number,
    targetUrl: string,
  ): Promise<ProxiedWebSocketClient> {
    const target = new URL(targetUrl);
    const proxyTarget = `http://${target.host}${target.pathname}${target.search}`;
    const socket = net.connect(proxyPort, '127.0.0.1');
    const client = new ProxiedWebSocketClient(socket);
    await once(socket, 'connect');
    const responseHead = client.readHttpResponseHead();
    socket.write(
      `GET ${proxyTarget} HTTP/1.1\r\n` +
        `Host: ${target.host}\r\n` +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==\r\n\r\n',
    );
    const { head, remainder } = await responseHead;
    if (!head.startsWith('HTTP/1.1 101')) {
      client.destroy();
      throw new Error(`Unexpected WebSocket proxy response: ${head}`);
    }
    client.startFrameCapture(remainder);
    return client;
  }

  /** Send one masked close frame with no reason text. */
  sendClose(closeCode: number): void {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(closeCode, 0);
    this.socket.write(this.maskedFrame(8, payload));
  }

  /** Send one masked UTF-8 text message through the real proxy connection. */
  sendText(message: string): void {
    this.socket.write(this.maskedFrame(1, Buffer.from(message, 'utf8')));
  }

  /** 等待真实代理连接收到一条精确服务端文本消息。 */
  async waitForText(message: string, timeoutMs = 5_000): Promise<void> {
    if (this.observedTextMessages.includes(message)) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('text', onText);
        reject(new Error(`Timed out waiting for WebSocket text: ${message}`));
      }, timeoutMs);
      const onText = (observed: string): void => {
        if (observed !== message) {
          return;
        }
        clearTimeout(timer);
        this.off('text', onText);
        resolve();
      };
      this.on('text', onText);
    });
  }

  /** 返回客户端是否已观察到精确文本。 */
  hasText(message: string): boolean {
    return this.observedTextMessages.includes(message);
  }

  /** 返回真实代理socket是否已经关闭。 */
  isClosed(): boolean {
    return this.socket.destroyed;
  }

  /** Destroy the test-owned client socket. */
  destroy(): void {
    this.socket.destroy();
  }

  /** Resolve once the complete HTTP Upgrade response head arrives. */
  private readHttpResponseHead(): Promise<{ head: string; remainder: Buffer }> {
    return new Promise((resolve, reject) => {
      let response = Buffer.alloc(0);
      const cleanup = (): void => {
        this.socket.off('data', onData);
        this.socket.off('error', onError);
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onData = (chunk: Buffer): void => {
        response = Buffer.concat([response, chunk]);
        const headersEnd = response.indexOf('\r\n\r\n');
        if (headersEnd < 0) {
          return;
        }
        cleanup();
        resolve({
          head: response.subarray(0, headersEnd).toString('utf8'),
          remainder: response.subarray(headersEnd + 4),
        });
      };
      this.socket.on('data', onData);
      this.socket.once('error', onError);
    });
  }

  /** 握手完成后持续解析服务端发送的WebSocket帧。 */
  private startFrameCapture(remainder: Buffer): void {
    const consume = (chunk: Buffer): void => {
      this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);
      while (this.tryReadFrame()) {
        /* 持续消费完整帧。 */
      }
    };
    if (remainder.byteLength > 0) {
      consume(remainder);
    }
    this.socket.on('data', consume);
  }

  /** 解析一条完整服务端帧；字节不足时返回false。 */
  private tryReadFrame(): boolean {
    if (this.frameBuffer.byteLength < 2) {
      return false;
    }
    const opcode = this.frameBuffer[0]! & 0x0f;
    const masked = (this.frameBuffer[1]! & 0x80) !== 0;
    let payloadLength = this.frameBuffer[1]! & 0x7f;
    let offset = 2;
    if (payloadLength === 126) {
      if (this.frameBuffer.byteLength < 4) return false;
      payloadLength = this.frameBuffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (this.frameBuffer.byteLength < 10) return false;
      const length = this.frameBuffer.readBigUInt64BE(2);
      if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('WebSocket frame exceeds the safe integer range.');
      }
      payloadLength = Number(length);
      offset = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + payloadLength;
    if (this.frameBuffer.byteLength < frameLength) {
      return false;
    }
    const mask = masked ? this.frameBuffer.subarray(offset, offset + 4) : null;
    const payload = Buffer.from(
      this.frameBuffer.subarray(offset + maskLength, frameLength),
    );
    if (mask) {
      for (let index = 0; index < payload.byteLength; index += 1) {
        payload[index] = payload[index]! ^ mask[index % mask.byteLength]!;
      }
    }
    this.frameBuffer = this.frameBuffer.subarray(frameLength);
    if (opcode === 1) {
      const text = payload.toString('utf8');
      this.observedTextMessages.push(text);
      this.emit('text', text);
    }
    return true;
  }

  /** Build one final masked client-to-server frame. */
  private maskedFrame(opcode: number, payload: Buffer): Buffer {
    if (payload.byteLength > 125) {
      throw new Error('E2E WebSocket control payload exceeds 125 bytes.');
    }
    const mask = randomBytes(4);
    const frame = Buffer.alloc(2 + mask.byteLength + payload.byteLength);
    frame[0] = 0x80 | opcode;
    frame[1] = 0x80 | payload.byteLength;
    mask.copy(frame, 2);
    for (let index = 0; index < payload.byteLength; index += 1) {
      frame[6 + index] = payload[index]! ^ mask[index % mask.length]!;
    }
    return frame;
  }
}

/** Deterministic WebSocket origin and explicit-proxy clients owned by one workflow. */
export class WebSocketLab {
  /** HTTP Upgrade server backing the WebSocket origin. */
  private readonly server: HttpServer;

  /** WebSocket protocol endpoint layered over the HTTP server. */
  private readonly webSocketServer: WebSocketServer;

  /** Raw proxy clients created by this fixture. */
  private readonly clients = new Set<ProxiedWebSocketClient>();

  /** Close codes observed by the real origin. */
  private readonly observedCloseCodes: number[] = [];

  /** Text messages observed by the real origin. */
  private readonly observedMessages: string[] = [];

  /** Random origin port selected by the operating system. */
  readonly port: number;

  /** Create one running lab after its random port is known. */
  private constructor(server: HttpServer, webSocketServer: WebSocketServer, port: number) {
    this.server = server;
    this.webSocketServer = webSocketServer;
    this.port = port;
  }

  /** Start a WebSocket origin that records close codes. */
  static async start(): Promise<WebSocketLab> {
    const server = createServer();
    const webSocketServer = new WebSocketServer({ noServer: true });
    let webSocketLab: WebSocketLab;
    server.on('upgrade', (request, socket, head) => {
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });
    webSocketServer.on('connection', (webSocket) => {
      webSocket.on('message', (data, isBinary) => {
        if (!isBinary) {
          webSocketLab.observedMessages.push(data.toString());
        }
        webSocket.send(data, { binary: isBinary });
      });
      webSocket.on('close', (closeCode) => {
        webSocketLab.observedCloseCodes.push(closeCode);
      });
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('WebSocket lab did not expose a numeric port.'));
          return;
        }
        resolve(address.port);
      });
    });
    webSocketLab = new WebSocketLab(server, webSocketServer, port);
    return webSocketLab;
  }

  /** Open one connection through Interceptor and retain it for deterministic cleanup. */
  async openThroughProxy(
    proxyPort: number,
    requestPath: string,
  ): Promise<ProxiedWebSocketClient> {
    const client = await ProxiedWebSocketClient.open(
      proxyPort,
      `ws://127.0.0.1:${this.port}${requestPath}`,
    );
    this.clients.add(client);
    return client;
  }

  /** 让真实origin主动向所有已建立连接发送文本。 */
  sendFromOrigin(message: string): void {
    for (const webSocket of this.webSocketServer.clients) {
      if (webSocket.readyState === 1) {
        webSocket.send(message);
      }
    }
  }

  /** Return the latest close code observed by the origin. */
  latestCloseCode(): number | undefined {
    return this.observedCloseCodes.at(-1);
  }

  /** Return whether the real origin observed an exact text message. */
  hasMessage(message: string): boolean {
    return this.observedMessages.includes(message);
  }

  /** Return serializable origin evidence. */
  evidence(): object {
    return {
      closeCodes: [...this.observedCloseCodes],
      messages: [...this.observedMessages],
    };
  }

  /** Terminate all clients and server-side sockets before closing the origin. */
  async close(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();
    for (const webSocket of this.webSocketServer.clients) {
      webSocket.terminate();
    }
    await new Promise<void>((resolve) => this.webSocketServer.close(() => resolve()));
    if (this.server.listening) {
      await new Promise<void>((resolve, reject) => {
        this.server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
}
