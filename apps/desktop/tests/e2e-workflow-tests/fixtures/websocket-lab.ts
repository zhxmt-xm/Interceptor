import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server as HttpServer } from 'node:http';
import net from 'node:net';

import { WebSocketServer } from 'ws';

/** One raw WebSocket client whose handshake and frames explicitly traverse Interceptor. */
export class ProxiedWebSocketClient {
  /** Underlying TCP connection to the Interceptor listener. */
  private readonly socket: net.Socket;

  /** Create a connected client after the proxy returned HTTP 101. */
  private constructor(socket: net.Socket) {
    this.socket = socket;
  }

  /** Open an RFC 6455 connection through an explicit HTTP proxy listener. */
  static async open(
    proxyPort: number,
    targetUrl: string,
  ): Promise<ProxiedWebSocketClient> {
    const target = new URL(targetUrl);
    const socket = net.connect(proxyPort, '127.0.0.1');
    const client = new ProxiedWebSocketClient(socket);
    await once(socket, 'connect');
    const responseHead = client.readHttpResponseHead();
    socket.write(
      `GET ${targetUrl} HTTP/1.1\r\n` +
        `Host: ${target.host}\r\n` +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==\r\n\r\n',
    );
    const head = await responseHead;
    if (!head.startsWith('HTTP/1.1 101')) {
      client.destroy();
      throw new Error(`Unexpected WebSocket proxy response: ${head}`);
    }
    return client;
  }

  /** Send one masked close frame with no reason text. */
  sendClose(closeCode: number): void {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(closeCode, 0);
    this.socket.write(this.maskedFrame(8, payload));
  }

  /** Destroy the test-owned client socket. */
  destroy(): void {
    this.socket.destroy();
  }

  /** Resolve once the complete HTTP Upgrade response head arrives. */
  private readHttpResponseHead(): Promise<string> {
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
        resolve(response.subarray(0, headersEnd).toString('utf8'));
      };
      this.socket.on('data', onData);
      this.socket.once('error', onError);
    });
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

  /** Return the latest close code observed by the origin. */
  latestCloseCode(): number | undefined {
    return this.observedCloseCodes.at(-1);
  }

  /** Return serializable origin evidence. */
  evidence(): object {
    return { closeCodes: [...this.observedCloseCodes] };
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
