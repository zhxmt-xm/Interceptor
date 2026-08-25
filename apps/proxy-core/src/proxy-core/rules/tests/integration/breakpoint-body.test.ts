import { promises as fs } from 'node:fs';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

import { ProxyService } from '../../../proxy/entry';
import { CaptureEventQueue } from '../../../proxy/internal/capture-event-queue';
import { RecordingCaptureService } from '../../../proxy/tests/integration/test-capture-service';
import { RuleService } from '../../entry';
import { BreakpointQueue } from '../../internal/breakpoint-queue';

/**
 * 端到端：真实 RuleService + 真实 Mockttp 代理 + 真实源站。
 *
 * 断点面板要让用户看到被拦住的请求/响应内容。规则在头部阶段挂起，因此快照必须
 * 如实说明正文是否可见，绝不能给出一个空 body 却让用户以为原文就是空的。
 */

const UPLOAD_BODY = 'name=interceptor&kind=breakpoint';

function startOrigin(): Promise<{
  port: number;
  received: string[];
  receivedHeaders: http.IncomingHttpHeaders[];
  close: () => Promise<void>;
}> {
  const received: string[] = [];
  const receivedHeaders: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      received.push(body);
      receivedHeaders.push(request.headers);
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('origin-body');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        received,
        receivedHeaders,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function proxiedChunkedPost(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  body: string,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: 'POST',
        path: absoluteUrl,
        headers: { 'content-type': 'text/plain' },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

function proxiedPost(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  body: string,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: 'POST',
        path: absoluteUrl,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

function proxiedPostWithResponse(
  proxy: { host: string; port: number },
  absoluteUrl: string,
  body: string,
): Promise<{
  statusCode: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: 'POST',
        path: absoluteUrl,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('error', reject);
        response.on('end', () => resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

function breakpointRule(phase: 'request' | 'response'): RuleDefinition {
  return {
    kind: 'rule',
    id: `rule-breakpoint-${phase}`,
    name: `Pause on ${phase}`,
    enabled: true,
    priority: 100,
    matchers: [{ type: 'host', value: '127.0.0.1', mode: 'exact' }],
    actions: [
      {
        type: 'breakpoint',
        phase,
      },
    ],
  };
}

describe('Breakpoint snapshots (real proxy)', () => {
  let proxyService: ProxyService | null = null;
  let origin: Awaited<ReturnType<typeof startOrigin>> | null = null;
  let breakpointQueue = new BreakpointQueue();

  beforeEach(() => {
    breakpointQueue = new BreakpointQueue();
  });

  afterEach(async () => {
    // 先放行任何仍挂起的断点，否则停代理会把在途请求变成未处理的 rejection。
    breakpointQueue.closeAll();
    await proxyService?.stop();
    await origin?.close();
    proxyService = null;
    origin = null;
  });

  it('states that the paused request body is not available yet', async () => {
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );

    await expect.poll(() => breakpointQueue.list().length).toBe(1);
    const paused = breakpointQueue.list()[0];
    if (!paused) {
      throw new Error('The request breakpoint is missing.');
    }

    expect(paused.phase).toBe('request');
    expect(paused.snapshot.method).toBe('POST');
    // 头部阶段挂起时正文还没到，必须如实标注，而不是给一个看起来是空正文的编辑框。
    expect(paused.snapshot.bodyAvailable).toBe(false);
    expect(paused.snapshot.body).toBeUndefined();
    // 挂起状态要显示在 Capture 的那一行上，所以快照必须带上真实 Exchange ID。
    expect(paused.snapshot.exchangeId).toBeDefined();
    await expect
      .poll(() => captureService.exchanges.map((exchange) => exchange.id))
      .toContain(paused.snapshot.exchangeId);

    // 只改 header 就放行（Renderer 在正文不可见时不带 body），原始上传正文必须完整到达源站。
    breakpointQueue.resolve(paused.id, 'continue', {
      headers: [...paused.snapshot.headers, { name: 'x-reviewed', value: 'yes' }],
    });
    await expect(inFlight).resolves.toBe(200);
    expect(origin.received).toEqual([UPLOAD_BODY]);
  });

  it('groups concurrent HTTP breakpoints into one stable logical queue', async () => {
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const firstRequest = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/queue-a`,
      'queue-a',
    );
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const secondRequest = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/queue-b`,
      'queue-b',
    );
    await expect.poll(() => breakpointQueue.size).toBe(2);

    const pending = breakpointQueue.list();
    try {
      expect(pending).toMatchObject([
        { queueKey: 'http', ruleId: 'rule-breakpoint-request' },
        { queueKey: 'http', ruleId: 'rule-breakpoint-request' },
      ]);
      expect(pending[0]!.createdAt).toBeLessThanOrEqual(pending[1]!.createdAt);
    } finally {
      for (const breakpoint of pending) {
        breakpointQueue.resolve(breakpoint.id, 'continue');
      }
      await Promise.allSettled([firstRequest, secondRequest]);
    }
    await expect(firstRequest).resolves.toBe(200);
    await expect(secondRequest).resolves.toBe(200);
    expect(origin.received).toEqual(['queue-a', 'queue-b']);
  });

  it('releases the paused request when the client aborts', async () => {
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    let clientRequest!: http.ClientRequest;
    const clientClosed = new Promise<void>((resolve) => {
      clientRequest = http.request({
        host: address.host,
        port: address.port,
        method: 'POST',
        path: `http://127.0.0.1:${origin!.port}/upload`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(UPLOAD_BODY),
        },
      });
      clientRequest.on('error', () => resolve());
      clientRequest.on('close', () => resolve());
      clientRequest.end(UPLOAD_BODY);
    });

    await expect.poll(() => breakpointQueue.size).toBe(1);
    clientRequest.destroy();
    await clientClosed;

    await expect.poll(() => breakpointQueue.size).toBe(0);
    await expect
      .poll(() => captureService.exchanges[0]?.state)
      .toBe('aborted');
    expect(origin.received).toEqual([]);
  });

  it('states that the paused response body is not available yet', async () => {
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('response')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );

    await expect.poll(() => breakpointQueue.list().length).toBe(1);
    const paused = breakpointQueue.list()[0];
    if (!paused) {
      throw new Error('The response breakpoint is missing.');
    }

    expect(paused.phase).toBe('response');
    expect(paused.snapshot.statusCode).toBe(200);
    expect(paused.snapshot.bodyAvailable).toBe(false);
    expect(paused.snapshot.body).toBeUndefined();
    // request 与 response 两次挂起必须指向同一行，Inspector 才能原地切换编辑模式。
    expect(paused.snapshot.exchangeId).toBeDefined();
    await expect
      .poll(() => captureService.exchanges.map((exchange) => exchange.id))
      .toContain(paused.snapshot.exchangeId);

    breakpointQueue.resolve(paused.id, 'continue');
    await expect(inFlight).resolves.toBe(200);
  });

  it('replaces the uploaded body with a local file the user picked', async () => {
    // 文件只传路径：大文件与二进制都不经 IPC，Core 按路径直读。
    const fixtureDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'interceptor-breakpoint-file-'),
    );
    const fixturePath = path.join(fixtureDirectory, 'replacement.json');
    await fs.writeFile(fixturePath, '{"replaced":true}', 'utf8');

    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    try {
      const inFlight = proxiedPost(
        address,
        `http://127.0.0.1:${origin.port}/upload`,
        UPLOAD_BODY,
      );

      await expect.poll(() => breakpointQueue.list().length).toBe(1);
      const paused = breakpointQueue.list()[0]!;
      breakpointQueue.resolve(paused.id, 'continue', {
        headers: paused.snapshot.headers,
        bodyFilePath: fixturePath,
      });

      await expect(inFlight).resolves.toBe(200);
      expect(origin.received).toEqual(['{"replaced":true}']);
      await expect.poll(
        () => captureService.exchanges[0]?.requestBodyEffect,
      ).toMatchObject({
        ruleId: 'rule-breakpoint-request',
        effect: 'replace',
        source: 'file',
        originalState: 'available',
        originalBody: { encodedSize: Buffer.byteLength(UPLOAD_BODY) },
      });
      expect(captureService.exchanges[0]?.requestBody).toMatchObject({
        encodedSize: Buffer.byteLength('{"replaced":true}'),
      });
      expect(JSON.stringify(captureService.exchanges[0]?.requestBodyEffect))
        .not.toContain(fixturePath);
    } finally {
      await fs.rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it('keeps inherited chunked framing without adding content-length when the body changes', async () => {
    const replacement = 'edited request body';
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    proxyService = new ProxyService(
      new RecordingCaptureService(),
      new CaptureEventQueue(),
      ruleService,
    );
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedChunkedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [paused] = breakpointQueue.list();
    breakpointQueue.resolve(paused!.id, 'continue', {
      headers: paused!.snapshot.headers,
      body: replacement,
    });

    await expect(inFlight).resolves.toBe(200);
    expect(origin.received).toEqual([replacement]);
    expect({
      contentLength: origin.receivedHeaders[0]?.['content-length'],
      transferEncoding: origin.receivedHeaders[0]?.['transfer-encoding'],
    }).toEqual({
      contentLength: undefined,
      transferEncoding: 'chunked',
    });
  });

  it('keeps inherited chunked response framing without adding content-length when the body changes', async () => {
    const replacement = 'edited response body';
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('response')] });
    proxyService = new ProxyService(
      new RecordingCaptureService(),
      new CaptureEventQueue(),
      ruleService,
    );
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPostWithResponse(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );
    await expect.poll(() => breakpointQueue.size).toBe(1);
    const [paused] = breakpointQueue.list();
    expect(paused!.snapshot.headers).toContainEqual({
      name: 'transfer-encoding',
      value: 'chunked',
    });
    breakpointQueue.resolve(paused!.id, 'continue', {
      headers: paused!.snapshot.headers,
      body: replacement,
    });

    const response = await inFlight;
    expect(response).toMatchObject({ statusCode: 200, body: replacement });
    expect({
      contentLength: response.headers['content-length'],
      transferEncoding: response.headers['transfer-encoding'],
    }).toEqual({
      contentLength: undefined,
      transferEncoding: 'chunked',
    });
  });

  it('forwards the original body when the picked file disappeared', async () => {
    // 放行那一刻文件没了，转发原文比把正文换成空安全。
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [breakpointRule('request')] });
    const captureService = new RecordingCaptureService();
    proxyService = new ProxyService(captureService, new CaptureEventQueue(), ruleService);
    const address = await proxyService.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );

    await expect.poll(() => breakpointQueue.list().length).toBe(1);
    const paused = breakpointQueue.list()[0]!;
    breakpointQueue.resolve(paused.id, 'continue', {
      headers: paused.snapshot.headers,
      bodyFilePath: path.join(os.tmpdir(), 'interceptor-missing-fixture.json'),
    });

    await expect(inFlight).resolves.toBe(200);
    expect(origin.received).toEqual([UPLOAD_BODY]);
    expect(captureService.exchanges[0]?.requestBodyEffect).toBeUndefined();
  });
});
