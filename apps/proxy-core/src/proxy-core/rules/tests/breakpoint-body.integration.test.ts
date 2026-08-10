import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/internal/capture-event-queue';
import { RecordingCaptureService } from '../../proxy/tests/test-capture-service';
import { RuleService } from '../entry';
import { BreakpointQueue } from '../internal/breakpoint-queue';

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
  close: () => Promise<void>;
}> {
  const received: string[] = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      received.push(body);
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
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
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

function breakpointRule(phase: 'request' | 'response'): RuleDefinition {
  return {
    kind: 'rule',
    id: `rule-breakpoint-${phase}`,
    name: `Pause on ${phase}`,
    enabled: true,
    priority: 100,
    matchers: [{ type: 'host', value: '127.0.0.1', mode: 'exact' }],
    actions: [
      { type: 'breakpoint', phase, timeoutMs: 30_000, onTimeout: 'continue' },
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
});
