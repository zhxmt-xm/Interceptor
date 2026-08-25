import { createHash } from 'node:crypto';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateCACertificate, getLocal } from 'mockttp';
import { WebSocketServer } from 'ws';

import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';
import { decryptWithCertificate } from './test-tls-setup';

/** 只拦应用消息、不设超时的 WebSocket 断点配置。 */
function messageBreakpoint(exchangeId: string) {
  return {
    exchangeId,
    direction: 'both',
    frames: ['message'],
  } as const;
}

/** 等待 101 Exchange 落库并返回它的 id；断点作用域靠它锁定连接。 */
async function webSocketExchangeId(
  captureService: RecordingCaptureService,
): Promise<string> {
  await expect.poll(() => captureService.exchanges.length).toBeGreaterThan(0);
  return captureService.exchanges[captureService.exchanges.length - 1]!.id;
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
  servername = 'localhost',
  connectHostname = '127.0.0.1',
  rejectUnauthorized = false,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `${connectHostname}:${originPort}`,
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
        { socket, servername, rejectUnauthorized },
        () => {
          tlsSocket.write(
            `GET /secure HTTP/1.1\r\nHost: ${connectHostname}:${originPort}\r\n` +
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

/** 经显式代理发起带正文的请求，正文按多个 chunk 写出以覆盖增量路径。 */
function proxiedRequest(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  method: string,
  body: Buffer,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method,
        path: absoluteUrl,
        // 独立连接：避免复用上一个测试遗留的 keep-alive socket。
        agent: false,
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: text }));
      },
    );
    req.on('error', reject);
    const chunkSize = 1024;
    for (let offset = 0; offset < body.byteLength; offset += chunkSize) {
      req.write(body.subarray(offset, offset + chunkSize));
    }
    req.end();
  });
}

/** 分两块慢速上传，用于验证请求头不被正文阻塞。 */
function slowUpload(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  gapMs: number,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: 'POST',
        path: absoluteUrl,
        agent: false,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.write(Buffer.alloc(512, 1));
    setTimeout(() => {
      req.write(Buffer.alloc(512, 2));
      req.end();
    }, gapMs);
  });
}

/** 分离响应头与响应体的到达时机，用于验证下载流式。 */
function proxiedGetStreaming(
  proxy: { host: string; port: number },
  absoluteUrl: string,
): {
  head: Promise<number | undefined>;
  body: Promise<string>;
} {
  let resolveHead!: (status: number | undefined) => void;
  let resolveBody!: (text: string) => void;
  let rejectAll!: (error: Error) => void;
  const head = new Promise<number | undefined>((resolve) => {
    resolveHead = resolve;
  });
  const body = new Promise<string>((resolve, reject) => {
    resolveBody = resolve;
    rejectAll = reject;
  });
  const req = http.request(
    {
      host: proxy.host,
      port: proxy.port,
      method: 'GET',
      path: absoluteUrl,
      agent: false,
    },
    (res) => {
      resolveHead(res.statusCode);
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => resolveBody(text));
    },
  );
  req.on('error', rejectAll);
  req.end();
  return { head, body };
}

async function waitForExchange(recordingCaptureService: RecordingCaptureService): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (recordingCaptureService.exchanges.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function waitForTlsCompatibilityEvents(
  proxyService: ProxyService,
): Promise<ReturnType<ProxyService['drainTlsCompatibilityEvents']>> {
  const events: ReturnType<ProxyService['drainTlsCompatibilityEvents']> = [];
  await expect.poll(() => {
    events.push(...proxyService.drainTlsCompatibilityEvents(10));
    return events.length;
  }).toBeGreaterThan(0);
  return events;
}

async function waitForWebSocketFrames(
  recordingCaptureService: RecordingCaptureService,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (recordingCaptureService.webSocketFrames.length < count && Date.now() < deadline) {
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
  opcode: 1 | 2 | 8 | 9 | 10,
  payload: Uint8Array,
): void {
  if (payload.byteLength > 0xffff) {
    throw new Error('Test frame payload exceeds the 16-bit length limit.');
  }
  const short = payload.byteLength <= 125;
  const headerLength = short ? 2 : 4;
  const mask = Uint8Array.from([0x11, 0x22, 0x33, 0x44]);
  const frame = Buffer.alloc(headerLength + mask.length + payload.byteLength);
  frame[0] = 0x80 | opcode;
  if (short) {
    frame[1] = 0x80 | payload.byteLength;
  } else {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payload.byteLength, 2);
  }
  frame.set(mask, headerLength);
  for (let index = 0; index < payload.byteLength; index += 1) {
    frame[headerLength + mask.length + index] =
      (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  }
  socket.write(frame);
}

/** 累积解析下行（未掩码）数据帧，直到收满 count 条，用于逐字节校验回显正文。 */
function readWebSocketFrames(
  socket: net.Socket,
  count: number,
  timeoutMs = 3_000,
): Promise<Array<{ opcode: number; payload: Buffer }>> {
  return new Promise((resolve, reject) => {
    const frames: Array<{ opcode: number; payload: Buffer }> = [];
    let buffer = Buffer.alloc(0);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('data', onData);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out with ${frames.length}/${count} frames.`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.byteLength < 2) {
          return;
        }
        const opcode = buffer[0]! & 0x0f;
        const masked = (buffer[1]! & 0x80) !== 0;
        let length = buffer[1]! & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.byteLength < 4) {
            return;
          }
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.byteLength < 10) {
            return;
          }
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (masked) {
          offset += 4;
        }
        if (buffer.byteLength < offset + length) {
          return;
        }
        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        buffer = buffer.subarray(offset + length);
        if (opcode === 1 || opcode === 2) {
          frames.push({ opcode, payload });
          if (frames.length === count) {
            cleanup();
            resolve(frames);
            return;
          }
        }
      }
    };
    socket.on('data', onData);
  });
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

/** 占用一个端口后立即释放，得到一个确定无人监听的本地端口。 */
function reserveClosedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

describe('ProxyService (Mockttp explicit proxy)', () => {
  let recordingCaptureService: RecordingCaptureService;
  let proxyService: ProxyService;
  let address: { host: string; port: number };

  beforeEach(async () => {
    recordingCaptureService = new RecordingCaptureService();
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue());
    address = await proxyService.start();
  });

  afterEach(async () => {
    await proxyService.stop();
  });

  it('registers a capture session and reports listening status', () => {
    expect(recordingCaptureService.sessions).toHaveLength(1);
    expect(recordingCaptureService.sessions[0]?.captureMode).toBe('explicit-proxy');
    const status = proxyService.status();
    expect(status.listening).toBe(true);
    expect(status.port).toBe(address.port);
  });

  it('creates a pending exchange as soon as request headers arrive', async () => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const origin = await startOrigin((_request, response) => {
      void responseGate.then(() => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('done');
      });
    });
    try {
      const inFlight = proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/slow`,
      );

      // 响应尚未开始，但 Exchange 必须已经落库并可见。
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(1);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
        method: 'GET',
        path: '/slow',
        state: 'pending',
      });
      expect(recordingCaptureService.exchanges[0]?.statusCode).toBeUndefined();

      releaseResponse();
      await expect(inFlight).resolves.toMatchObject({ status: 200 });
      await expect.poll(() => recordingCaptureService.exchanges[0]?.state).toBe('completed');
      expect(recordingCaptureService.exchanges).toHaveLength(1);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
        statusCode: 200,
        responseBytes: 4,
      });
    } finally {
      releaseResponse();
      await origin.close();
    }
  });

  it('stores a small single-segment request body without losing its head', async () => {
    const origin = await startOrigin((request, response) => {
      request.resume();
      request.on('end', () => {
        // 源站主动关闭，避免收尾时代理仍持有闲置上游连接而抛出无人处理的 reset。
        response.writeHead(200, {
          'content-type': 'text/plain',
          connection: 'close',
        });
        response.end('ok');
      });
    });
    // 头部与正文同段到达时，body-data 事件可能先于 request-initiated；丢首块会直接变乱码。
    const body = Buffer.from('{"tiny":"single-segment-request-body"}');
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const request = http.request(
            {
              host: address.host,
              port: address.port,
              method: 'POST',
              path: `http://127.0.0.1:${origin.port}/tiny`,
              agent: false,
              headers: {
                'content-type': 'application/json',
                'content-length': String(body.byteLength),
                // 每笔用独立且立即关闭的连接，避免闲置连接在收尾时抛出无人处理的 reset。
                connection: 'close',
              },
            },
            (response) => {
              response.resume();
              response.on('end', () => {
                settled = true;
                resolve();
              });
            },
          );
          request.on('error', (error) => {
            if (!settled) {
              reject(error);
            }
          });
          request.end(body);
        });
      }

      await expect
        .poll(() => recordingCaptureService.bodies.filter((stored) => stored.equals(body)).length)
        .toBe(5);
      expect(
        recordingCaptureService.exchanges.map((exchange) => exchange.requestBytes),
      ).toEqual(Array.from({ length: 5 }, () => body.byteLength));
    } finally {
      await origin.close();
    }
  });

  it('accumulates request body bytes incrementally across chunks', async () => {
    const received: Buffer[] = [];
    const origin = await startOrigin((request, response) => {
      request.on('data', (chunk: Buffer) => received.push(chunk));
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
      });
    });
    try {
      const body = Buffer.alloc(3 * 1024, 9);
      const response = await proxiedRequest(
        address,
        `http://127.0.0.1:${origin.port}/upload`,
        'POST',
        body,
      );
      expect(response.status).toBe(200);
      await expect.poll(() => recordingCaptureService.exchanges[0]?.state).toBe('completed');
      expect(recordingCaptureService.exchanges[0]?.requestBytes).toBe(body.byteLength);
      expect(Buffer.concat(received).byteLength).toBe(body.byteLength);
      expect(recordingCaptureService.bodies.some((entry) => entry.equals(body))).toBe(true);
    } finally {
      await origin.close();
    }
  });

  it('drops in-flight state and rejects late events after a capture reset', async () => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const origin = await startOrigin((_request, response) => {
      void responseGate.then(() => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('late');
      });
    });
    try {
      const inFlight = proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/cleared`,
      );
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(1);

      // Clear 推进 generation，此后该请求的所有迟到事件都必须被丢弃。
      proxyService.prepareCaptureReset();
      recordingCaptureService.exchangeUpdates.length = 0;

      releaseResponse();
      await expect(inFlight).resolves.toMatchObject({ status: 200 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(recordingCaptureService.exchangeUpdates).toHaveLength(0);
    } finally {
      releaseResponse();
      await origin.close();
    }
  });

  it('sends request headers upstream before a slow upload finishes, even with rules', async () => {
    let headersReceivedAt = 0;
    let bodyCompletedAt = 0;
    const origin = await startOrigin((request, response) => {
      headersReceivedAt = Date.now();
      request.resume();
      request.on('end', () => {
        bodyCompletedAt = Date.now();
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
      });
    });
    await proxyService.stop();
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
        id: 'upload-rule',
        name: 'Upload rule',
        enabled: true,
        priority: 100,
        matchers: [{ type: 'path', value: '/slow-upload', mode: 'contains' }],
        actions: [{
          type: 'header',
          phase: 'request',
          op: 'set',
          name: 'x-upload-rule',
          value: 'applied',
        }],
      }],
    });
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    address = await proxyService.start();
    try {
      const gapMs = 300;
      const startedAt = Date.now();
      await expect(
        slowUpload(address, `http://127.0.0.1:${origin.port}/slow-upload`, gapMs),
      ).resolves.toBe(200);

      // 规则命中仍不得等待完整上传：源站必须在第二块发出前就收到请求头。
      expect(headersReceivedAt - startedAt).toBeLessThan(gapMs);
      expect(bodyCompletedAt - headersReceivedAt).toBeGreaterThanOrEqual(
        gapMs - 50,
      );
    } finally {
      await origin.close();
    }
  });

  it('streams response headers to the client before the origin finishes the body', async () => {
    let releaseBody!: () => void;
    const bodyGate = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    const origin = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.write('first-');
      void bodyGate.then(() => response.end('last'));
    });
    await proxyService.stop();
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
        id: 'download-rule',
        name: 'Download rule',
        enabled: true,
        priority: 100,
        matchers: [{ type: 'path', value: '/slow-download', mode: 'contains' }],
        actions: [{
          type: 'header',
          phase: 'response',
          op: 'set',
          name: 'x-download-rule',
          value: 'applied',
        }],
      }],
    });
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    address = await proxyService.start();
    try {
      const stream = proxiedGetStreaming(
        address,
        `http://127.0.0.1:${origin.port}/slow-download`,
      );

      // 命中响应规则仍必须流式：响应头在源站结束正文之前就到达客户端。
      await expect(stream.head).resolves.toBe(200);

      releaseBody();
      await expect(stream.body).resolves.toBe('first-last');
    } finally {
      releaseBody();
      await origin.close();
    }
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
    await proxyService.stop();
    const ruleService = new RuleService(new BreakpointQueue());
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
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
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    address = await proxyService.start();
    try {
      const response = await proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/link_setting/v1/link_setting/get`,
      );
      expect(response.status).toBe(200);
      expect(upstreamRequestHeader).toBe('upstream');
      expect(response.headers['x-response-rule']).toBe('after');
      await waitForExchange(recordingCaptureService);
      expect(recordingCaptureService.exchanges[0]?.headers).toEqual(expect.arrayContaining([
        {
          kind: 'request',
          name: 'x-request-rule',
          value: 'upstream',
          ruleEffect: 'append',
          ruleId: 'url-rule',
        },
        {
          kind: 'response',
          name: 'x-response-rule',
          value: 'before',
          ruleEffect: 'replace',
          ruleId: 'url-rule',
        },
        {
          kind: 'response',
          name: 'x-response-rule',
          value: 'after',
          ruleEffect: 'set',
          ruleId: 'url-rule',
        },
      ]));
      expect(recordingCaptureService.exchanges[0]?.ruleIds).toEqual(['url-rule']);
    } finally {
      await origin.close();
    }
  });

  it('records an edited breakpoint header as a Capture rule effect', async () => {
    const origin = await startOrigin((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule',
        id: 'request-breakpoint',
        name: 'Request breakpoint',
        enabled: true,
        priority: 100,
        matchers: [{ type: 'path', value: '/breakpoint-effect', mode: 'exact' }],
        actions: [{
          type: 'breakpoint',
          phase: 'request',
        }],
      }],
    });
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    address = await proxyService.start();
    try {
      const inFlight = proxiedGet(
        address,
        `http://127.0.0.1:${origin.port}/breakpoint-effect`,
      );
      await expect.poll(() => breakpointQueue.size).toBe(1);
      const [paused] = breakpointQueue.list();
      breakpointQueue.resolve(paused!.id, 'continue', {
        headers: [
          ...paused!.snapshot.headers,
          { name: 'x-breakpoint-edit', value: 'added' },
        ],
        editedHeaderNames: ['x-breakpoint-edit'],
      });

      await expect(inFlight).resolves.toMatchObject({ status: 200 });
      await waitForExchange(recordingCaptureService);
      expect(recordingCaptureService.exchanges[0]?.headers).toEqual(expect.arrayContaining([{
        kind: 'request',
        name: 'x-breakpoint-edit',
        value: 'added',
        ruleEffect: 'set',
        ruleId: 'request-breakpoint',
      }]));
    } finally {
      breakpointQueue.closeAll();
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
      await waitForExchange(recordingCaptureService);
      expect(recordingCaptureService.exchanges).toHaveLength(1);
      const firstSessionId = recordingCaptureService.sessions[0]?.id;

      const stoppedPort = address.port;
      await proxyService.stop();
      expect(proxyService.status()).toMatchObject({
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
      expect(recordingCaptureService.exchanges).toHaveLength(1);

      address = await proxyService.start();
      expect(recordingCaptureService.sessions).toHaveLength(2);
      expect(recordingCaptureService.sessions[1]?.id).not.toBe(firstSessionId);
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/after-restart`),
      ).resolves.toMatchObject({ status: 200 });
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(2);
      expect(recordingCaptureService.exchanges.map((exchange) => exchange.path)).toEqual([
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
      await waitForExchange(recordingCaptureService);
      expect(recordingCaptureService.exchanges).toHaveLength(1);

      // 暂停记录：监听器仍在，流量继续转发但新连接不再落库。
      proxyService.pauseRecording();
      expect(proxyService.status()).toMatchObject({ listening: true, recording: false });
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/while-paused`),
      ).resolves.toMatchObject({ status: 200 });
      expect(recordingCaptureService.exchanges).toHaveLength(1);

      // 恢复记录：新请求重新被捕获，暂停期间的请求不出现在记录中。
      proxyService.resumeRecording();
      expect(proxyService.status()).toMatchObject({ listening: true, recording: true });
      await expect(
        proxiedGet(address, `http://127.0.0.1:${origin.port}/after-resume`),
      ).resolves.toMatchObject({ status: 200 });
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(2);
      expect(recordingCaptureService.exchanges.map((exchange) => exchange.path)).toEqual([
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

      await waitForExchange(recordingCaptureService);
      expect(recordingCaptureService.exchanges).toHaveLength(1);
      const exchange = recordingCaptureService.exchanges[0];
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

  it('mirrors an unreachable upstream as a client connection error', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const deadPort = await reserveClosedPort();
    // 上游连不上时不得伪造 502：客户端必须收到连接错误，Exchange 记 aborted +
    // 真实 errorCode，且 Mockttp 不再把上游错误堆栈打到 Core 控制台。
    await expect(
      proxiedGet(address, `http://localhost:${deadPort}/unreachable`),
    ).rejects.toMatchObject({ code: 'ECONNRESET' });

    await expect.poll(() => recordingCaptureService.exchanges[0]?.state).toBe('aborted');
    expect(recordingCaptureService.exchanges[0]?.errorCode).toBe('ECONNREFUSED');
    expect(recordingCaptureService.exchanges[0]?.statusCode).toBeUndefined();
    expect(recordingCaptureService.bodies).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('passes HTTPS through without a CA and captures only encrypted tunnel metadata', async () => {
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    try {
      await expect(passthroughHttpsGet(address.port, origin.port)).resolves.toBe(200);
      await waitForExchange(recordingCaptureService);

      expect(recordingCaptureService.exchanges).toHaveLength(1);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
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
      expect(recordingCaptureService.bodies).toHaveLength(0);
      await expect.poll(() => recordingCaptureService.exchangeUpdates.length).toBe(1);
      expect(recordingCaptureService.exchangeUpdates[0]).toMatchObject({
        id: recordingCaptureService.exchanges[0]?.id,
        state: 'completed',
      });
    } finally {
      await origin.stop();
    }
  }, 20_000);

  it('passes through only configured TLS hosts while continuing to intercept others', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    try {
      await decryptWithCertificate(
        proxyService,
        ca,
        ['localhost', '127.0.0.1'],
        ['localhost'],
      );

      await expect(
        passthroughHttpsGet(address.port, origin.port, 'localhost', 'localhost'),
      ).resolves.toBe(200);
      await expect(
        passthroughHttpsGet(address.port, origin.port, 'mitm.localhost'),
      ).resolves.toBe(200);

      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(2);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
        method: 'CONNECT',
        protocol: 'tls',
        responseMime: 'application/x-encrypted-tunnel',
      });
      expect(recordingCaptureService.exchanges[1]).toMatchObject({
        method: 'GET',
        path: '/secure',
        protocol: 'http/1.1',
        statusCode: 200,
      });
    } finally {
      await origin.stop();
    }
  }, 20_000);

  it('applies passthrough list changes to new connections without rebuilding the listener', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    const insecureHosts = ['localhost', '127.0.0.1'];
    try {
      await decryptWithCertificate(proxyService, ca, insecureHosts);
      await expect(
        passthroughHttpsGet(address.port, origin.port, 'localhost', 'localhost'),
      ).resolves.toBe(200);
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(1);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
        method: 'GET',
        path: '/secure',
      });
      const before = proxyService.status();

      proxyService.replacePassthroughHosts(['localhost']);

      // 重建会清空代际计数并换掉会话；两者不变即证明 listener 是原地生效的。
      const after = proxyService.status();
      expect(after.port).toBe(before.port);
      expect(after.sessionId).toBe(before.sessionId);
      expect(after.capturedExchanges).toBe(before.capturedExchanges);

      await expect(
        passthroughHttpsGet(address.port, origin.port, 'localhost', 'localhost'),
      ).resolves.toBe(200);
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(2);
      expect(recordingCaptureService.exchanges[1]).toMatchObject({
        method: 'CONNECT',
        protocol: 'tls',
        responseMime: 'application/x-encrypted-tunnel',
      });
    } finally {
      await origin.stop();
    }
  }, 20_000);

  it('stops intercepting once MITM is turned off, without rebuilding the listener', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    const insecureHosts = ['localhost', '127.0.0.1'];
    try {
      await decryptWithCertificate(proxyService, ca, insecureHosts);
      await expect(
        passthroughHttpsGet(address.port, origin.port, 'localhost', 'localhost'),
      ).resolves.toBe(200);
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(1);
      const before = proxyService.status();

      // 停止解密等价于全量 passthrough，身份材料不变，因此不必重建。
      proxyService.stopHttpsDecryption();

      const after = proxyService.status();
      expect(after.port).toBe(before.port);
      expect(after.sessionId).toBe(before.sessionId);
      expect(after.capturedExchanges).toBe(before.capturedExchanges);

      await expect(
        passthroughHttpsGet(address.port, origin.port, 'localhost', 'localhost'),
      ).resolves.toBe(200);
      await expect.poll(() => recordingCaptureService.exchanges.length).toBe(2);
      expect(recordingCaptureService.exchanges[1]).toMatchObject({
        method: 'CONNECT',
        protocol: 'tls',
      });
    } finally {
      await origin.stop();
    }
  }, 20_000);

  it('reports one compatibility event per TLS generation and host', async () => {
    const ca = await generateCACertificate();
    const originCertificate = await generateCACertificate();
    const origin = getLocal({ https: originCertificate });
    await origin.forGet('/secure').thenReply(200, 'secure');
    await origin.start();
    try {
      await decryptWithCertificate(proxyService, ca, ['localhost', '127.0.0.1']);
      await expect(
        passthroughHttpsGet(
          address.port,
          origin.port,
          'localhost',
          'localhost',
          true,
        ),
      ).rejects.toBeDefined();
      await expect(
        passthroughHttpsGet(
          address.port,
          origin.port,
          'localhost',
          'localhost',
          true,
        ),
      ).rejects.toBeDefined();

      const firstGenerationEvents = await waitForTlsCompatibilityEvents(proxyService);
      expect(firstGenerationEvents).toHaveLength(1);
      expect(firstGenerationEvents[0]?.host).toBe('localhost');
      const firstGeneration = firstGenerationEvents[0]?.generation ?? 0;
      expect(firstGeneration).toBeGreaterThan(0);
      expect(['cert-rejected', 'reset', 'closed']).toContain(
        firstGenerationEvents[0]?.reason,
      );

      // 任一 TLS 变更都开启新代际，同一 host 因此可以再次上报。
      await proxyService.startHttpsDecryption();
      await expect(
        passthroughHttpsGet(
          address.port,
          origin.port,
          'localhost',
          'localhost',
          true,
        ),
      ).rejects.toBeDefined();

      const secondGenerationEvents = await waitForTlsCompatibilityEvents(proxyService);
      expect(secondGenerationEvents).toHaveLength(1);
      expect(secondGenerationEvents[0]?.host).toBe('localhost');
      expect(secondGenerationEvents[0]?.generation).toBeGreaterThan(firstGeneration);
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

      await waitForExchange(recordingCaptureService);
      const exchange = recordingCaptureService.exchanges[0];
      expect(exchange?.requestBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.blobHash).toBeDefined();
      expect(exchange?.responseBody?.mediaType).toBe('application/json');
      // Blob 里应存下了请求与响应两段正文。
      expect(recordingCaptureService.bodies.length).toBeGreaterThanOrEqual(2);
    } finally {
      await origin.close();
    }
  });

  it('keeps the uploaded request body when the origin responds early', async () => {
    // 源站收到部分正文后立即返回 413 并结束响应，此时客户端仍在上传：
    // 响应侧先进入终态，请求侧 writer 仍在写，必须一并收尾。
    const origin = await startOrigin((req, res) => {
      req.once('data', () => {
        // 等 Mockttp 的 body-data 攒批（20ms）投递到 Capture 后再结束响应。
        setTimeout(() => {
          res.writeHead(413, { 'content-type': 'text/plain' });
          res.end('too large');
        }, 150);
      });
    });
    let request: http.ClientRequest | undefined;
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        request = http.request(
          {
            host: address.host,
            port: address.port,
            method: 'POST',
            path: `http://127.0.0.1:${origin.port}/upload`,
            headers: { 'content-type': 'application/octet-stream' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        request.on('error', reject);
        // 只写一块且不 end，保持请求侧停在 body 阶段。
        request.write(Buffer.alloc(4_096, 0x61));
      });
      expect(status).toBe(413);

      await expect
        .poll(() => recordingCaptureService.exchanges[0]?.state, { timeout: 5_000 })
        .toBe('completed');
      const exchange = recordingCaptureService.exchanges[0];
      // 前提：确实观察到了已上传的字节，否则本用例没有覆盖到目标路径。
      expect(exchange?.requestBytes).toBeGreaterThan(0);
      // 回归点：已上传的部分必须 finalize 并绑定 body 引用，而不是被丢弃。
      expect(exchange?.requestBodyId).toBeDefined();
      expect(exchange?.requestBody?.blobHash).toBeDefined();
    } finally {
      request?.destroy();
      await origin.close();
    }
  });

  it('marks the exchange aborted when the upstream websocket upgrade fails', async () => {
    // 上游端口无人监听：bridge 的 waitForOpen 失败并抛出，Mockttp 只会发出
    // completed `response`（Capture 已退订），必须由 bridge 自己判终态。
    const closedPort = await reserveClosedPort();
    await expect(
      openProxiedWebSocket(address, `ws://127.0.0.1:${closedPort}/ws`),
    ).rejects.toThrow();

    await expect
      .poll(() => recordingCaptureService.exchanges[0]?.state, { timeout: 5_000 })
      .toBe('aborted');
  });

  it('closes the upstream websocket when the client disconnects during the upgrade', async () => {
    // 源站握手由测试显式放行，用来精确制造「客户端已断开但上游才刚建立」的竞态。
    const upstreamServer = new WebSocketServer({ noServer: true });
    let upstreamOpened = false;
    let upstreamClosed = false;
    upstreamServer.on('connection', (upstream) => {
      upstreamOpened = true;
      upstream.on('close', () => {
        upstreamClosed = true;
      });
    });
    let releaseUpstream = (): void => undefined;
    const upstreamGate = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    let upgradeReceived = false;
    const originHttp = http.createServer();
    originHttp.on('upgrade', (request, socket, head) => {
      upgradeReceived = true;
      void upstreamGate.then(() => {
        upstreamServer.handleUpgrade(request, socket, head, (upstream) => {
          upstreamServer.emit('connection', upstream, request);
        });
      });
    });
    await new Promise<void>((resolve) => {
      originHttp.listen(0, '127.0.0.1', resolve);
    });
    const originPort = (originHttp.address() as AddressInfo).port;

    const client = net.connect(address.port, address.host);
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', () => resolve());
        client.once('error', reject);
      });
      client.write(
        `GET http://127.0.0.1:${originPort}/ws HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${originPort}\r\n` +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          'Sec-WebSocket-Key: AAECAwQFBgcICQoLDA0ODw==\r\n\r\n',
      );

      // bridge 已把 Upgrade 转给源站，此时上游握手仍被 gate 挡着。
      await expect.poll(() => upgradeReceived, { timeout: 5_000 }).toBe(true);
      client.destroy();
      // 等 Capture 观察到断开（5.5.3 的终态），确保下游确实先于上游结束。
      await expect
        .poll(() => recordingCaptureService.exchanges[0]?.state, { timeout: 5_000 })
        .toBe('aborted');

      releaseUpstream();
      // 前提：源站仍会完成握手，上游连接确实建立了。
      await expect.poll(() => upstreamOpened, { timeout: 5_000 }).toBe(true);
      // 回归点：下游已不可用，ws 的 completeUpgrade 不会回调，
      // bridge 必须自己关掉这条孤儿上游连接。
      await expect.poll(() => upstreamClosed, { timeout: 5_000 }).toBe(true);
    } finally {
      releaseUpstream();
      client.destroy();
      upstreamServer.close();
      await new Promise<void>((resolve) => {
        originHttp.close(() => resolve());
      });
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

      await waitForWebSocketFrames(recordingCaptureService, 4);
      expect(recordingCaptureService.exchanges).toHaveLength(1);
      expect(recordingCaptureService.exchanges[0]).toMatchObject({
        method: 'GET',
        scheme: 'ws',
        protocol: 'ws',
        statusCode: 101,
        state: 'request-complete',
      });
      const clientFrames = recordingCaptureService.webSocketFrames
        .map(({ frame }) => frame)
        .filter((frame) => frame.direction === 'client-to-server');
      const serverFrames = recordingCaptureService.webSocketFrames
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
        recordingCaptureService.webSocketFrames.every(({ frame }) => Boolean(frame.payload?.blobHash)),
      ).toBe(true);
      expect(new Set(recordingCaptureService.webSocketFrames.map(({ exchangeId }) => exchangeId)).size).toBe(
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

  it('forwards and stores websocket text and binary payloads byte-for-byte', async () => {
    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    // 多字节 UTF-8 与全 256 字节值：任何字符集转换或掩码错误都会让逐字节比较失败。
    const text = Buffer.from('中文 — naïve café 🎈🚀 \u00e9\u0301 end', 'utf8');
    const binary = Buffer.from(
      Uint8Array.from({ length: 256 }, (_value, index) => index),
    );
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      const echoed = readWebSocketFrames(socket, 2);
      sendWebSocketFrame(socket, 1, text);
      sendWebSocketFrame(socket, 2, binary);

      // Client 侧：回显帧的 opcode 与正文与发出的完全一致。
      await expect(echoed).resolves.toEqual([
        { opcode: 1, payload: text },
        { opcode: 2, payload: binary },
      ]);

      // Capture 侧：payload 内容寻址 hash 等于原始字节的 hash，即逐字节一致。
      // 两个方向各自串行落库，跨方向顺序不保证，故按方向分别断言。
      await waitForWebSocketFrames(recordingCaptureService, 4);
      const textHash = createHash('sha256').update(text).digest('hex');
      const binaryHash = createHash('sha256').update(binary).digest('hex');
      const expectedSequence = [
        {
          opcode: 1,
          payloadSize: text.byteLength,
          blobHash: textHash,
          mediaType: 'text/plain; charset=utf-8',
        },
        {
          opcode: 2,
          payloadSize: binary.byteLength,
          blobHash: binaryHash,
          mediaType: 'application/octet-stream',
        },
      ];
      const recorded = (direction: string) =>
        recordingCaptureService.webSocketFrames
          .map(({ frame }) => frame)
          .filter((frame) => frame.direction === direction)
          .map((frame) => ({
            opcode: frame.opcode,
            payloadSize: frame.payloadSize,
            blobHash: frame.payload?.blobHash,
            mediaType: frame.payload?.mediaType,
          }));
      expect(recorded('client-to-server')).toEqual(expectedSequence);
      expect(recorded('server-to-client')).toEqual(expectedSequence);
      expect(recordingCaptureService.bodies.some((body) => body.equals(text))).toBe(true);
      expect(recordingCaptureService.bodies.some((body) => body.equals(binary))).toBe(true);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });

  it('keeps binary websocket payloads intact through an unedited breakpoint', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    // 断点面板把二进制正文渲染成 hex 字符串；未编辑时必须原样转发，不能走 hex 回转。
    const binary = Buffer.from(
      Uint8Array.from({ length: 256 }, (_value, index) => index),
    );
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints(
        messageBreakpoint(await webSocketExchangeId(recordingCaptureService)),
      );
      const echoed = readWebSocketFrames(socket, 1);
      sendWebSocketFrame(socket, 2, binary);

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const outbound = breakpointQueue.list()[0];
      expect(outbound?.snapshot).toMatchObject({
        direction: 'client-to-server',
        opcode: 2,
        bodyFormat: 'hex',
      });
      breakpointQueue.resolve(outbound!.id, 'continue');

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const inbound = breakpointQueue.list()[0];
      expect(inbound?.snapshot.direction).toBe('server-to-client');
      breakpointQueue.resolve(inbound!.id, 'continue');

      await expect(echoed).resolves.toEqual([{ opcode: 2, payload: binary }]);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });

  it('restores edited websocket hex as exact binary frame bytes', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    const original = Buffer.from([0x00, 0x7f, 0x80, 0xff]);
    const edited = Buffer.from([0xde, 0xad, 0x00, 0xff, 0x42]);
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints(
        messageBreakpoint(await webSocketExchangeId(recordingCaptureService)),
      );
      const echoed = readWebSocketFrames(socket, 1);
      sendWebSocketFrame(socket, 2, original);

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const outbound = breakpointQueue.list()[0];
      expect(outbound?.snapshot).toMatchObject({
        direction: 'client-to-server',
        opcode: 2,
        bodyFormat: 'hex',
        body: '00 7f 80 ff',
      });
      breakpointQueue.resolve(outbound!.id, 'continue', {
        body: 'DE AD 00 ff 42',
      });

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const inbound = breakpointQueue.list()[0];
      expect(inbound?.snapshot).toMatchObject({
        direction: 'server-to-client',
        opcode: 2,
        bodyFormat: 'hex',
        body: 'de ad 00 ff 42',
      });
      breakpointQueue.resolve(inbound!.id, 'continue');

      await expect(echoed).resolves.toEqual([{ opcode: 2, payload: edited }]);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });

  it('forwards an edited websocket close code without replacing the body', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const upstreamServer = new WebSocketServer({ noServer: true });
    let upstreamCloseCode: number | undefined;
    upstreamServer.on('connection', (upstream) => {
      upstream.on('close', (closeCode) => {
        upstreamCloseCode = closeCode;
      });
    });
    const originHttp = http.createServer();
    originHttp.on('upgrade', (request, originSocket, head) => {
      upstreamServer.handleUpgrade(request, originSocket, head, (upstream) => {
        upstreamServer.emit('connection', upstream, request);
      });
    });
    await new Promise<void>((resolve) => {
      originHttp.listen(0, '127.0.0.1', resolve);
    });
    const originPort = (originHttp.address() as AddressInfo).port;
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${originPort}/echo`,
      );
      proxyService.enableWebSocketBreakpoints({
        exchangeId: await webSocketExchangeId(recordingCaptureService),
        direction: 'client-to-server',
        frames: ['close'],
      });
      sendWebSocketFrame(socket, 8, Buffer.from([0x03, 0xe8]));

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const outbound = breakpointQueue.list()[0];
      expect(outbound?.snapshot).toMatchObject({
        direction: 'client-to-server',
        frame: 'close',
        closeCode: 1000,
      });
      breakpointQueue.resolve(outbound!.id, 'continue', { closeCode: 1001 });

      await expect.poll(() => upstreamCloseCode).toBe(1001);
    } finally {
      socket?.destroy();
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
      await new Promise<void>((resolve) => originHttp.close(() => resolve()));
    }
  });

  it('keeps a websocket frame pending until the user continues it unchanged', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    const payload = Buffer.from('forward-after-wait');
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints({
        exchangeId: await webSocketExchangeId(recordingCaptureService),
        direction: 'client-to-server',
        frames: ['message'],
      });
      const echoed = readWebSocketFrames(socket, 1);
      sendWebSocketFrame(socket, 1, payload);

      await expect.poll(() => breakpointQueue.size, { timeout: 500 }).toBe(1);
      await expect(waitForSocketData(socket)).resolves.toBeNull();
      const [pending] = breakpointQueue.list();
      expect(pending?.snapshot).toMatchObject({ webSocketFrameSequence: 1 });
      breakpointQueue.resolve(pending!.id, 'continue');
      await expect(echoed).resolves.toEqual([{ opcode: 1, payload }]);
      expect(breakpointQueue.size).toBe(0);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });

  it('aborts pending websocket frames when the client disconnects abnormally', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints({
        exchangeId: await webSocketExchangeId(recordingCaptureService),
        direction: 'client-to-server',
        frames: ['message'],
      });
      sendWebSocketFrame(socket, 1, Buffer.from('disconnect-before-continue'));
      await expect.poll(() => breakpointQueue.size).toBe(1);

      socket.destroy();
      await expect.poll(() => breakpointQueue.size).toBe(0);
    } finally {
      socket?.destroy();
      await origin.stop();
    }
  });

  it('waits for in-flight websocket capture before resetting capture storage', async () => {
    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    let releaseAppend!: () => void;
    const appendReleased = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    let markAppendStarted!: () => void;
    const appendStarted = new Promise<void>((resolve) => {
      markAppendStarted = resolve;
    });
    const appendWebSocketFrames = recordingCaptureService.appendWebSocketFrames.bind(
      recordingCaptureService,
    );
    vi.spyOn(recordingCaptureService, 'appendWebSocketFrames').mockImplementation(
      async (...args) => {
        markAppendStarted();
        await appendReleased;
        return appendWebSocketFrames(...args);
      },
    );
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      sendWebSocketFrame(socket, 1, Buffer.from('capture-before-reset'));
      await appendStarted;

      let resetCompleted = false;
      const reset = Promise.resolve(proxyService.prepareCaptureReset()).then((sessionId) => {
        resetCompleted = true;
        return sessionId;
      });
      await Promise.resolve();
      expect(resetCompleted).toBe(false);

      releaseAppend();
      await expect(reset).resolves.toBe(recordingCaptureService.sessions[0]?.id);
      expect(recordingCaptureService.webSocketFrames).toHaveLength(1);
    } finally {
      releaseAppend();
      socket?.destroy();
      await origin.stop();
    }
  });

  it('pauses websocket messages before forwarding and supports edit/drop', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    proxyService = new ProxyService(recordingCaptureService, new CaptureEventQueue(), ruleService);
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints(
        messageBreakpoint(await webSocketExchangeId(recordingCaptureService)),
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

  it('only pauses the configured direction', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints({
        exchangeId: await webSocketExchangeId(recordingCaptureService),
        direction: 'client-to-server',
        frames: ['message'],
      });
      const echoed = readWebSocketFrames(socket, 1);
      sendWebSocketFrame(socket, 1, Buffer.from('outbound'));

      await expect.poll(() => breakpointQueue.size).toBe(1);
      const outbound = breakpointQueue.list()[0];
      expect(outbound?.snapshot.direction).toBe('client-to-server');
      breakpointQueue.resolve(outbound!.id, 'continue');

      // 回程方向不在配置内，必须直通而不再挂起。
      await expect(echoed).resolves.toEqual([
        { opcode: 1, payload: Buffer.from('outbound') },
      ]);
      expect(breakpointQueue.size).toBe(0);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });

  it('pauses ping frames only when the ping frame kind is configured', async () => {
    await proxyService.stop();
    const breakpointQueue = new BreakpointQueue();
    proxyService = new ProxyService(
      recordingCaptureService,
      new CaptureEventQueue(),
      new RuleService(breakpointQueue),
    );
    address = await proxyService.start();

    const origin = getLocal();
    await origin.forAnyWebSocket().thenEcho();
    await origin.start();
    let socket: net.Socket | undefined;
    try {
      socket = await openProxiedWebSocket(
        address,
        `ws://127.0.0.1:${origin.port}/echo`,
      );
      proxyService.enableWebSocketBreakpoints({
        exchangeId: await webSocketExchangeId(recordingCaptureService),
        direction: 'both',
        frames: ['ping'],
      });
      const echoed = readWebSocketFrames(socket, 1);
      // 应用消息不在配置内，直接放行。
      sendWebSocketFrame(socket, 1, Buffer.from('passthrough'));
      await expect(echoed).resolves.toEqual([
        { opcode: 1, payload: Buffer.from('passthrough') },
      ]);
      expect(breakpointQueue.size).toBe(0);

      sendWebSocketFrame(socket, 9, Buffer.from('hb'));
      await expect.poll(() => breakpointQueue.size).toBe(1);
      const ping = breakpointQueue.list()[0];
      expect(ping?.snapshot).toMatchObject({
        frame: 'ping',
        direction: 'client-to-server',
        ruleName: 'WebSocket ping',
      });
      breakpointQueue.resolve(ping!.id, 'continue');
      await expect.poll(() => breakpointQueue.size).toBe(0);
    } finally {
      if (socket) {
        sendWebSocketFrame(socket, 8, new Uint8Array());
        socket.destroy();
      }
      await origin.stop();
    }
  });
});
