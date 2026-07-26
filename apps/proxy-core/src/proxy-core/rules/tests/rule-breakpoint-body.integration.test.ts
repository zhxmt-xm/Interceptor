import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/proxy-capture-event-queue';
import { RecordingSink } from '../../proxy/tests/proxy-test-capture-sink';
import { RuleEngine } from '../entry';
import { BreakpointQueue } from '../rule-breakpoint-queue';

/**
 * 端到端：真实 RuleEngine + 真实 Mockttp 代理 + 真实源站。
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
  let proxy: ProxyService | null = null;
  let origin: Awaited<ReturnType<typeof startOrigin>> | null = null;
  let breakpoints: BreakpointQueue | null = null;

  afterEach(async () => {
    // 先放行任何仍挂起的断点，否则停代理会把在途请求变成未处理的 rejection。
    breakpoints?.closeAll();
    await proxy?.stop();
    await origin?.close();
    proxy = null;
    origin = null;
    breakpoints = null;
  });

  it('states that the paused request body is not available yet', async () => {
    const queue = new BreakpointQueue();
    breakpoints = queue;
    const engine = new RuleEngine(queue);
    engine.setRuleSet({ revision: 1, rules: [breakpointRule('request')] });
    proxy = new ProxyService(new RecordingSink(), new CaptureEventQueue(), engine);
    const address = await proxy.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );

    await expect.poll(() => queue.list().length).toBe(1);
    const paused = queue.list()[0];
    if (!paused) {
      throw new Error('The request breakpoint is missing.');
    }

    expect(paused.phase).toBe('request');
    expect(paused.snapshot.method).toBe('POST');
    // 头部阶段挂起时正文还没到，必须如实标注，而不是给一个看起来是空正文的编辑框。
    expect(paused.snapshot.bodyAvailable).toBe(false);
    expect(paused.snapshot.body).toBeUndefined();

    // 只改 header 就放行（Renderer 在正文不可见时不带 body），原始上传正文必须完整到达源站。
    queue.resolve(paused.id, 'continue', {
      headers: [...paused.snapshot.headers, { name: 'x-reviewed', value: 'yes' }],
    });
    await expect(inFlight).resolves.toBe(200);
    expect(origin.received).toEqual([UPLOAD_BODY]);
  });

  it('states that the paused response body is not available yet', async () => {
    const queue = new BreakpointQueue();
    breakpoints = queue;
    const engine = new RuleEngine(queue);
    engine.setRuleSet({ revision: 1, rules: [breakpointRule('response')] });
    proxy = new ProxyService(new RecordingSink(), new CaptureEventQueue(), engine);
    const address = await proxy.start({ port: 0 });
    origin = await startOrigin();

    const inFlight = proxiedPost(
      address,
      `http://127.0.0.1:${origin.port}/upload`,
      UPLOAD_BODY,
    );

    await expect.poll(() => queue.list().length).toBe(1);
    const paused = queue.list()[0];
    if (!paused) {
      throw new Error('The response breakpoint is missing.');
    }

    expect(paused.phase).toBe('response');
    expect(paused.snapshot.statusCode).toBe(200);
    expect(paused.snapshot.bodyAvailable).toBe(false);
    expect(paused.snapshot.body).toBeUndefined();

    queue.resolve(paused.id, 'continue');
    await expect(inFlight).resolves.toBe(200);
  });
});
