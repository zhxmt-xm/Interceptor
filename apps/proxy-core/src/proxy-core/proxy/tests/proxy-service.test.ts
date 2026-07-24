import { createHash } from 'node:crypto';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateCACertificate, getLocal } from 'mockttp';

import type {
  CaptureSessionInput,
  ExchangeInput,
  WebSocketFrameInput,
} from '../../storage/interfaces';
import { RuleEngine } from '../../rules/entry';
import { BreakpointQueue } from '../../rules/rule-breakpoint-queue';
import { ProxyService } from '../entry';
import type { CaptureSink } from '../interfaces';
import { CaptureEventQueue } from '../proxy-capture-event-queue';

class RecordingSink implements CaptureSink {
  readonly sessions: CaptureSessionInput[] = [];
  readonly exchanges: ExchangeInput[] = [];
  readonly bodies: Buffer[] = [];
  readonly exchangeUpdates: Array<{
    id: string;
    completedAt?: number;
    state: ExchangeInput['state'];
  }> = [];
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

  updateExchange(patch: {
    id: string;
    completedAt?: number;
    state: ExchangeInput['state'];
  }): Promise<void> {
    this.exchangeUpdates.push(patch);
    return Promise.resolve();
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

/** 经显式代理建立 CONNECT 后完成一笔不受信任本地源站的 TLS 请求。 */
function passthroughHttpsGet(
  proxyPort: number,
  originPort: number,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `127.0.0.1:${originPort}`,
    });
    request.on('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        reject(new Error(`CONNECT failed: ${response.statusCode ?? 0}`));
        return;
      }
      if (head.length > 0) {
        socket.unshift(head);
      }
      const tlsSocket = tls.connect(
        { socket, servername: 'localhost', rejectUnauthorized: false },
        () => {
          tlsSocket.write(
            `GET /secure HTTP/1.1\r\nHost: 127.0.0.1:${originPort}\r\n` +
              'Connection: close\r\n\r\n',
          );
        },
      );
      let responseText = '';
      tlsSocket.on('data', (data: Buffer) => {
        responseText += data.toString('utf8');
      });
      tlsSocket.on('end', () => {
        const line = responseText.split('\r\n', 1)[0] ?? '';
        const match = line.match(/HTTP\/1\.\d (\d{3})/);
        if (!match) {
          reject(new Error(`HTTPS tunnel returned no HTTP status: ${JSON.stringify(responseText)}`));
          return;
        }
        resolve(Number(match[1]));
      });
      tlsSocket.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

function proxiedGet(
  proxy: { host: string; port: number },
  absoluteUrl: string,
): Promise<{
  status: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: proxy.host, port: proxy.port, method: 'GET', path: absoluteUrl },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        }));
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

function waitForSocketData(socket: net.Socket, timeoutMs = 250): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('data', onData);
      resolve(null);
    }, timeoutMs);
    const onData = (data: Buffer): void => {
      clearTimeout(timer);
      resolve(data);
    };
    socket.once('data', onData);
  });
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

  it('matches a URL written as host/path and applies a response action', async () => {
    let upstreamRequestHeader: string | undefined;
    const origin = await startOrigin((request, response) => {
      upstreamRequestHeader = request.headers['x-request-rule'] as string | undefined;
      response.writeHead(200, {
        'content-type': 'text/plain',
        'x-response-rule': 'before',
      });
      response.end('ok');
    });
    await proxy.stop();
    const ruleEngine = new RuleEngine(new BreakpointQueue());
    ruleEngine.setRuleSet({
      revision: 1,
      rules: [{
        id: 'url-rule',
        name: 'URL rule',
        enabled: true,
        priority: 100,
        matchers: [{
          type: 'url',
          value: `127.0.0.1:${origin.port}/link_setting/v1/link_setting/get`,
          mode: 'contains',
        }],
        actions: [
          {
            type: 'header',
            phase: 'request',
            op: 'append',
            name: 'x-request-rule',
            value: 'upstream',
          },
          {
            type: 'header',
            phase: 'response',
            op: 'set',
            name: 'x-response-rule',
            value: 'after',
          },
        ],
      }],
    });
    proxy = new ProxyService(sink, new CaptureEventQueue(), ruleEngine);
    address = await proxy.start();
    try {
      const response = await proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/link_setting/v1/link_setting/get`,
      );
      expect(response.status).toBe(200);
      expect(upstreamRequestHeader).toBe('upstream');
      expect(response.headers['x-response-rule']).toBe('after');
      await waitForExchange(sink);
      expect(sink.exchanges[0]?.headers).toEqual(expect.arrayContaining([
        {
          kind: 'request',
          name: 'x-request-rule',
          value: 'upstream',
          ruleEffect: 'append',
        },
        {
          kind: 'response',
          name: 'x-response-rule',
          value: 'before',
          ruleEffect: 'replace',
        },
        {
          kind: 'response',
          name: 'x-response-rule',
          value: 'after',
          ruleEffect: 'set',
        },
      ]));
    } finally {
      await origin.close();
    }
  });

  it('stops the Mockttp listener, preserves records, and appends after restart', async () => {
    const origin = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    try {
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/before-stop`),
      ).resolves.toMatchObject({ status: 200 });
      await waitForExchange(sink);
      expect(sink.exchanges).toHaveLength(1);
      const firstSessionId = sink.sessions[0]?.id;

      const stoppedPort = address.port;
      await proxy.stop();
      expect(proxy.status()).toMatchObject({
        listening: false,
        port: null,
        sessionId: null,
      });
      await expect(
        proxiedGet(
          { host: '127.0.0.1', port: stoppedPort },
          `http://127.0.0.1:${origin.port}/while-stopped`,
        ),
      ).rejects.toThrow();
      expect(sink.exchanges).toHaveLength(1);

      address = await proxy.start();
      expect(sink.sessions).toHaveLength(2);
      expect(sink.sessions[1]?.id).not.toBe(firstSessionId);
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/after-restart`),
      ).resolves.toMatchObject({ status: 200 });
      await expect.poll(() => sink.exchanges.length).toBe(2);
      expect(sink.exchanges.map((exchange) => exchange.path)).toEqual([
        '/before-stop',
        '/after-restart',
      ]);
    } finally {
      await origin.close();
    }
  });

  it('pauses recording without stopping the listener, then resumes', async () => {
    const origin = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    try {
      // 记录中：请求被捕获。
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/while-recording`),
      ).resolves.toMatchObject({ status: 200 });
      await waitForExchange(sink);
      expect(sink.exchanges).toHaveLength(1);

      // 暂停记录：监听器仍在，流量继续转发但新连接不再落库。
      proxy.setRecording(false);
      expect(proxy.status()).toMatchObject({ listening: true, recording: false });
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/while-paused`),
      ).resolves.toMatchObject({ status: 200 });
      expect(sink.exchanges).toHaveLength(1);

      // 恢复记录：新请求重新被捕获，暂停期间的请求不出现在记录中。
      proxy.setRecording(true);
      expect(proxy.status()).toMatchObject({ listening: true, recording: true });
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/after-resume`),
      ).resolves.toMatchObject({ status: 200 });
      await expect.poll(() => sink.exchanges.length).toBe(2);
      expect(sink.exchanges.map((exchange) => exchange.path)).toEqual([
        '/while-recording',
        '/after-resume',
      ]);
    } finally {
      await origin.close();
    }
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
      expect(exchange?.responseStartedAt).toBeGreaterThanOrEqual(exchange?.startedAt ?? 0);
      expect(exchange?.completedAt).toBeGreaterThanOrEqual(exchange?.responseStartedAt ?? 0);
      expect(exchange?.headers?.some((h) => h.kind === 'response')).toBe(true);
    } finally {
      await origin.close();
    }
  });

  it('passes HTTPS through without a CA and captures only encrypted tunnel metadata', async () => {
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    try {
      await expect(passthroughHttpsGet(address.port, origin.port)).resolves.toBe(200);
      await waitForExchange(sink);

      expect(sink.exchanges).toHaveLength(1);
      expect(sink.exchanges[0]).toMatchObject({
        method: 'CONNECT',
        scheme: 'https',
        host: '127.0.0.1',
        port: origin.port,
        protocol: 'tls',
        statusCode: 200,
        responseMime: 'application/x-encrypted-tunnel',
        state: 'request-complete',
        headers: [],
      });
      expect(sink.bodies).toHaveLength(0);
      await expect.poll(() => sink.exchangeUpdates.length).toBe(1);
      expect(sink.exchangeUpdates[0]).toMatchObject({
        id: sink.exchanges[0]?.id,
        state: 'completed',
      });
    } finally {
      await origin.stop();
    }
  }, 20_000);

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
        protocol: 'ws',
        statusCode: 101,
        state: 'request-complete',
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

  it('pauses websocket messages before forwarding and supports edit/drop', async () => {
    await proxy.stop();
    const breakpointQueue = new BreakpointQueue();
    const ruleEngine = new RuleEngine(breakpointQueue);
    proxy = new ProxyService(sink, new CaptureEventQueue(), ruleEngine);
    proxy.setWebSocketBreakpointsEnabled(true);
    address = await proxy.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      sendWebSocketFrame(socket, 1, Buffer.from('before'));
      await expect.poll(() => breakpointQueue.size).toBe(1);
      await expect(waitForSocketData(socket)).resolves.toBeNull();

      const first = breakpointQueue.list()[0];
      expect(first?.snapshot).toMatchObject({
        direction: 'client-to-server',
        opcode: 1,
        bodyFormat: 'text',
        body: 'before',
      });
      breakpointQueue.resolve(first!.id, 'continue', { body: 'after' });
      await expect.poll(() => breakpointQueue.size).toBe(1);
      const echoed = breakpointQueue.list()[0];
      expect(echoed?.snapshot).toMatchObject({
        direction: 'server-to-client',
        opcode: 1,
        body: 'after',
      });
      breakpointQueue.resolve(echoed!.id, 'continue');
      const editedEcho = await waitForSocketData(socket, 1_000);
      expect(editedEcho?.includes(Buffer.from('after'))).toBe(true);

      sendWebSocketFrame(socket, 1, Buffer.from('drop-me'));
      await expect.poll(() => breakpointQueue.size).toBe(1);
      const second = breakpointQueue.list()[0];
      breakpointQueue.resolve(second!.id, 'drop');
      await expect(waitForSocketData(socket)).resolves.toBeNull();
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });
});
