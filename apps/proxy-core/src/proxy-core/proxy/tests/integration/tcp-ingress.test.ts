import http from 'node:http';
import { once } from 'node:events';
import net, { type AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { RecordingCaptureService } from './test-capture-service';

/** 仅在 CONNECT 成功后交出 socket，不向目标发送业务字节。 */
function connectToTarget(proxyPort: number, targetPort: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `127.0.0.1:${targetPort}`,
      agent: false,
    });
    request.once('error', reject);
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`CONNECT failed: ${response.statusCode}`));
        return;
      }
      if (head.length > 0) socket.unshift(head);
      resolve(socket);
    });
    request.end();
  });
}

/** 用 origin-form HTTP 模拟 TUN 恢复出的原始 TCP 字节。 */
function sendPost(socket: net.Socket, targetPort: number, body: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.setTimeout(5_000, () => socket.destroy(new Error('TCP ingress test timed out')));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.once('error', reject);
    socket.once('end', () => resolve(Buffer.concat(chunks)));
    socket.once('close', () => reject(new Error('TCP ingress closed before response EOF')));
    socket.write(
      `POST /android-ingress HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n` +
      `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
    );
    socket.write(body);
  });
}

describe('ProxyService raw TCP ingress prerequisites', () => {
  let captureService: RecordingCaptureService;
  let breakpointQueue: BreakpointQueue;
  let ruleService: RuleService;
  let proxyService: ProxyService;
  let origin: http.Server;
  let targetPort: number;
  let proxyPort: number;
  const sockets = new Set<net.Socket>();
  let received: Array<{ body: Buffer; headers: http.IncomingHttpHeaders }>;

  beforeEach(async () => {
    captureService = new RecordingCaptureService();
    breakpointQueue = new BreakpointQueue();
    ruleService = new RuleService(breakpointQueue);
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    received = [];
    origin = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks);
        received.push({ body, headers: request.headers });
        response.writeHead(200, {
          'content-length': body.length,
          'x-origin-response': 'original',
        });

        response.end(body);
      });
    });
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    targetPort = (origin.address() as AddressInfo).port;
    proxyPort = (await proxyService.start({ port: 0 })).port;
  });

  afterEach(async () => {
    breakpointQueue.closeAll();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await proxyService.stop();
    origin.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      origin.close((error) => error ? reject(error) : resolve());
    });
  });

  it('applies request and response rules to origin-form bytes after CONNECT without replay', async () => {
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule', id: 'tcp-rule', name: 'TCP rule', enabled: true, priority: 100,
        matchers: [{ type: 'path', value: '/android-ingress', mode: 'exact' }],
        actions: [
          { type: 'header', phase: 'request', op: 'set', name: 'x-pc-rule', value: 'applied' },
          { type: 'header', phase: 'response', op: 'set', name: 'x-origin-response', value: 'edited' },
        ],
      }],
    });
    const socket = await connectToTarget(proxyPort, targetPort);
    sockets.add(socket);
    const payload = Buffer.from([0, 1, 2, 13, 10, 127, 128, 255]);
    const response = await sendPost(socket, targetPort, payload);
    expect(response.toString('latin1')).toContain('x-origin-response: edited');
    expect(response.subarray(-payload.length)).toEqual(payload);
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toEqual(payload);
    expect(received[0]!.headers['x-pc-rule']).toBe('applied');
    await expect.poll(() => captureService.exchanges.some(
      (exchange) => exchange.ruleIds?.includes('tcp-rule'),
    )).toBe(true);
  });

  it('holds the real POST at a breakpoint and sends only the edited request once', async () => {
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule', id: 'tcp-breakpoint', name: 'TCP breakpoint', enabled: true, priority: 100,
        matchers: [{ type: 'path', value: '/android-ingress', mode: 'exact' }],
        actions: [{ type: 'breakpoint', phase: 'request' }],
      }],
    });
    const socket = await connectToTarget(proxyPort, targetPort);
    sockets.add(socket);
    const payload = Buffer.from('one actual POST');
    const inFlight = sendPost(socket, targetPort, payload);
    await expect.poll(() => breakpointQueue.size).toBe(1);
    expect(received).toHaveLength(0);
    const paused = breakpointQueue.list()[0]!;
    breakpointQueue.resolve(paused.id, 'continue', {
      headers: [...paused.snapshot.headers, { name: 'x-breakpoint-edit', value: 'confirmed' }],
      editedHeaderNames: ['x-breakpoint-edit'],
    });
    expect((await inFlight).subarray(-payload.length)).toEqual(payload);
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toEqual(payload);
    expect(received[0]!.headers['x-breakpoint-edit']).toBe('confirmed');
    expect(breakpointQueue.size).toBe(0);
  });

  it('keeps rules and real forwarding active while Capture is paused', async () => {
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule', id: 'paused-rule', name: 'Paused rule', enabled: true, priority: 100,
        matchers: [{ type: 'path', value: '/android-ingress', mode: 'exact' }],
        actions: [{ type: 'header', phase: 'request', op: 'set', name: 'x-pc-rule', value: 'active' }],
      }],
    });
    proxyService.pauseRecording();
    const socket = await connectToTarget(proxyPort, targetPort);
    sockets.add(socket);
    const payload = Buffer.from('forward without recording');
    expect((await sendPost(socket, targetPort, payload)).subarray(-payload.length)).toEqual(payload);
    expect(received).toHaveLength(1);
    expect(received[0]!.headers['x-pc-rule']).toBe('active');
    await proxyService.stop();
    expect(captureService.exchanges).toHaveLength(0);
  });

  it('cancels the matching pending breakpoint when the raw TCP client disconnects', async () => {
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule', id: 'cancel-breakpoint', name: 'Cancel breakpoint', enabled: true, priority: 100,
        matchers: [{ type: 'path', value: '/android-ingress', mode: 'exact' }],
        actions: [{ type: 'breakpoint', phase: 'request' }],
      }],
    });
    const socket = await connectToTarget(proxyPort, targetPort);
    sockets.add(socket);
    const inFlight = sendPost(socket, targetPort, Buffer.from('cancel before forwarding'));
    const cancelled = expect(inFlight).rejects.toThrow('Cancel intercepted TCP stream');
    await expect.poll(() => breakpointQueue.size).toBe(1);
    expect(received).toHaveLength(0);
    socket.destroy(new Error('Cancel intercepted TCP stream'));
    await cancelled;
    await expect.poll(() => breakpointQueue.size).toBe(0);
    expect(received).toHaveLength(0);
  });

  it.each(['CONNECT', 'direct'] as const)(
    'preserves the response after upload FIN through the %s listener without Android or WSS',
    async (ingress) => {
      ruleService.setRuleSet({
        revision: 1,
        nodes: [{
          kind: 'rule', id: 'half-close', name: 'Half close', enabled: true, priority: 100,
          matchers: [{ type: 'path', value: '/android-ingress', mode: 'exact' }],
          actions: [{ type: 'breakpoint', phase: 'request' }],
        }],
      });
      const socket = ingress === 'CONNECT'
        ? await connectToTarget(proxyPort, targetPort)
        : net.connect({ host: '127.0.0.1', port: proxyPort, allowHalfOpen: true });
      socket.allowHalfOpen = true;
      sockets.add(socket);
      const payload = Buffer.from('half-close without Android');
      const response = sendPost(socket, targetPort, payload);
      // 立即订阅失败，避免断点等待期间产生未处理的Promise拒绝。
      const result = response.then(
        (bytes) => ({ bytes, error: null }),
        (error: unknown) => ({ bytes: Buffer.alloc(0), error }),
      );
      await expect.poll(() => breakpointQueue.size).toBe(1);
      expect(received).toHaveLength(0);
      await new Promise<void>((resolve) => socket.end(resolve));
      breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
      const completed = await result;
      expect(completed.error).toBeNull();
      expect(completed.bytes.toString('latin1')).toContain('HTTP/1.1 200');
      expect(completed.bytes.subarray(-payload.length)).toEqual(payload);
      expect(received).toHaveLength(1);
    },
  );
});

describe('Node HTTP half-close baseline', () => {
  it('closes the default HTTP response direction when the client sends FIN while a response is pending', async () => {
    let finishResponse: (() => void) | undefined;
    const server = http.createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        finishResponse = () => response.end('baseline-response');
      });
    });
    const serverSockets = new Set<net.Socket>();
    server.on('connection', (socket) => {
      serverSockets.add(socket);
      socket.on('close', () => serverSockets.delete(socket));
    });
    let client: net.Socket | undefined;
    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
      client = net.connect({ host: '127.0.0.1', port: address.port, allowHalfOpen: true });
      const chunks: Buffer[] = [];
      client.on('data', (chunk: Buffer) => chunks.push(chunk));
      const ended = once(client, 'end');
      client.write('POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\nConnection: close\r\n\r\nx');
      await expect.poll(() => finishResponse !== undefined).toBe(true);
      const socket = [...serverSockets][0];
      if (!socket) throw new Error('Expected accepted socket');
      const uploadEnded = once(socket, 'end');
      client.end();
      await uploadEnded;
      await ended;
      if (!finishResponse) throw new Error('HTTP request did not finish');
      finishResponse();
      await ended;
      const response = Buffer.concat(chunks).toString();
      expect(response).toBe('');
    } finally {
      client?.destroy();
      for (const socket of serverSockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
