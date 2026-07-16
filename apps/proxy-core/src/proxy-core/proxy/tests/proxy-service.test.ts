import { createHash } from 'node:crypto';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getLocal } from 'mockttp';

import type {
  CaptureSessionInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/types';
import { CaptureEventQueue } from '../capture-event-queue';
import { ProxyService, type CaptureSink } from '../proxy-service';

class RecordingSink implements CaptureSink {
  readonly sessions: CaptureSessionInput[] = [];
  readonly exchanges: ExchangeInput[] = [];
  readonly bodies: Buffer[] = [];
  readonly webSocketFrames: Array<{
    exchangeId: string;
    frame: WebSocketFrameInput;
  }> = [];

  ensureSession(session: CaptureSessionInput): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    this.exchanges.push(...exchanges);
    return Promise.resolve(
      exchanges.map((e, index) => ({ id: e.id, seq: index + 1 })),
    );
  }

  async writeBody(
    source: AsyncIterable<Uint8Array>,
  ): Promise<{ hash: string; size: number; deduplicated: boolean }> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    this.bodies.push(buffer);
    return {
      hash: createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
      deduplicated: false,
    };
  }

  appendRuleHits(): Promise<void> {
    return Promise.resolve();
  }

  appendWebSocketFrames(
    exchangeId: string,
    frames: readonly WebSocketFrameInput[],
  ): Promise<void> {
    this.webSocketFrames.push(
      ...frames.map((frame) => ({ exchangeId, frame })),
    );
    return Promise.resolve();
  }
}

function startOrigin(
  handler: http.RequestListener,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function proxiedGet(
  proxy: { host: string; port: number },
  absoluteUrl: string,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: proxy.host, port: proxy.port, method: 'GET', path: absoluteUrl },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitForExchange(sink: RecordingSink): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (sink.exchanges.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function waitForWebSocketFrames(
  sink: RecordingSink,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (sink.webSocketFrames.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function openProxiedWebSocket(
  proxyAddress: { host: string; port: number },
  targetUrl: string,
): Promise<net.Socket> {
  const target = new URL(targetUrl);
  const proxyTarget = `http://${target.host}${target.pathname}${target.search}`;
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyAddress.port, proxyAddress.host);
    let response = Buffer.alloc(0);
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', fail);
    socket.on('data', function onData(chunk: Buffer) {
      response = Buffer.concat([response, chunk]);
      const headersEnd = response.indexOf('\r\n\r\n');
      if (headersEnd < 0) {
        return;
      }
      socket.off('data', onData);
      socket.off('error', fail);
      const statusLine = response.subarray(0, headersEnd).toString('utf8');
      if (!statusLine.startsWith('HTTP/1.1 101')) {
        fail(new Error(`Unexpected WebSocket response: ${response.toString('utf8')}`));
        return;
      }
      resolve(socket);
    });
    socket.once('connect', () => {
      socket.write(
        `GET ${proxyTarget} HTTP/1.1\r\n` +
          `Host: ${target.host}\r\n` +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          'Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==\r\n\r\n',
      );
    });
  });
}

function sendWebSocketFrame(
  socket: net.Socket,
  opcode: 1 | 2 | 8,
  payload: Uint8Array,
): void {
  if (payload.byteLength > 125) {
    throw new Error('Test frame payload exceeds the short frame limit.');
  }
  const mask = Uint8Array.from([0x11, 0x22, 0x33, 0x44]);
  const frame = Buffer.alloc(6 + payload.byteLength);
  frame[0] = 0x80 | opcode;
  frame[1] = 0x80 | payload.byteLength;
  frame.set(mask, 2);
  for (let index = 0; index < payload.byteLength; index += 1) {
    frame[6 + index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  }
  socket.write(frame);
}

describe('ProxyService (Mockttp explicit proxy)', () => {
  let sink: RecordingSink;
  let proxy: ProxyService;
  let address: { host: string; port: number };

  beforeEach(async () => {
    sink = new RecordingSink();
    proxy = new ProxyService(sink, new CaptureEventQueue());
    address = await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
  });

  it('registers a capture session and reports listening status', () => {
    expect(sink.sessions).toHaveLength(1);
    expect(sink.sessions[0]?.captureMode).toBe('explicit-proxy');
    const status = proxy.status();
    expect(status.listening).toBe(true);
    expect(status.port).toBe(address.port);
  });

  it('forwards an absolute-form request and captures a canonical exchange', async () => {
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    try {
      const response = await proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/api/ping`,
      );
      expect(response.status).toBe(200);
      expect(response.body).toBe('{"ok":true}');

      await waitForExchange(sink);
      expect(sink.exchanges).toHaveLength(1);
      const exchange = sink.exchanges[0];
      expect(exchange).toMatchObject({
        method: 'GET',
        host: '127.0.0.1',
        port: origin.port,
        path: '/api/ping',
        protocol: 'http/1.1',
        statusCode: 200,
        responseMime: 'application/json',
        state: 'completed',
      });
      expect(exchange?.headers?.some((h) => h.kind === 'response')).toBe(true);
    } finally {
      await origin.close();
    }
  });

  it('persists request and response bodies as body_ref references', async () => {
    const origin = await startOrigin((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"echo":true}');
    });
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = http.request(
          {
            host: address.host,
            port: address.port,
            method: 'POST',
            path: `http://127.0.0.1:${origin.port}/submit`,
            headers: { 'content-type': 'application/json' },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          },
        );
        req.on('error', reject);
        req.end('{"name":"interceptor"}');
      });
      expect(status).toBe(200);

      await waitForExchange(sink);
      const exchange = sink.exchanges[0];
      expect(exchange?.requestBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.mediaType).toBe('application/json');
      // Blob 里应存下了请求与响应两段正文。
      expect(sink.bodies.length).toBeGreaterThanOrEqual(2);
    } finally {
      await origin.close();
    }
  });

  it('captures a websocket upgrade and ordered text/binary messages', async () => {
    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      sendWebSocketFrame(socket, 1, Buffer.from('hello'));
      sendWebSocketFrame(socket, 2, Uint8Array.from([1, 2, 3]));

      await waitForWebSocketFrames(sink, 4);
      expect(sink.exchanges).toHaveLength(1);
      expect(sink.exchanges[0]).toMatchObject({
        method: 'GET',
        scheme: 'ws',
        protocol: 'http/1.1',
        statusCode: 101,
      });
      const clientFrames = sink.webSocketFrames
        .map(({ frame }) => frame)
        .filter((frame) => frame.direction === 'client-to-server');
      const serverFrames = sink.webSocketFrames
        .map(({ frame }) => frame)
        .filter((frame) => frame.direction === 'server-to-client');
      expect(
        clientFrames.map(({ opcode, payloadSize }) => ({ opcode, payloadSize })),
      ).toEqual([
        { opcode: 1, payloadSize: 5 },
        { opcode: 2, payloadSize: 3 },
      ]);
      expect(
        serverFrames.map(({ opcode, payloadSize }) => ({ opcode, payloadSize })),
      ).toEqual([
        { opcode: 1, payloadSize: 5 },
        { opcode: 2, payloadSize: 3 },
      ]);
      expect(
        sink.webSocketFrames.every(({ frame }) => Boolean(frame.payload?.blobHash)),
      ).toBe(true);
      expect(new Set(sink.webSocketFrames.map(({ exchangeId }) => exchangeId)).size).toBe(
        1,
      );
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });
});
