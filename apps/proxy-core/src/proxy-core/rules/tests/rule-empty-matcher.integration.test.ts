import { promises as fs } from 'node:fs';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { RuleDefinition, RuleMatcher } from '@interceptor/core-protocol';

import { initializeRuntime } from '../../constants';
import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/proxy-capture-event-queue';
import { StorageService } from '../../storage/entry';
import { RuleEngine } from '../entry';
import { BreakpointQueue } from '../rule-breakpoint-queue';

/**
 * 端到端：真实 RuleEngine + 真实 Mockttp 代理 + 真实源站。
 *
 * 未填写的条件必须解释为“还没配好”，绝不能退化成“匹配一切”——否则用户刚点
 * New rule、还没输入 host，所有真实流量就已经被改写。
 */

function startOrigin(
  onRequest: (request: http.IncomingMessage) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    onRequest(request);
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
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
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: proxy.host, port: proxy.port, method: 'GET', path: absoluteUrl },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** 一条已启用规则：给出条件，动作固定为注入一个可观察的请求头。 */
function injectingRule(matchers: RuleMatcher[]): RuleDefinition {
  return {
    id: 'rule-inject',
    name: 'Inject header',
    enabled: true,
    priority: 100,
    matchers,
    actions: [
      { type: 'header', phase: 'request', op: 'set', name: 'x-injected', value: '1' },
    ],
  };
}

describe('Rule matchers with unfilled values (real proxy)', () => {
  let dataDir = '';
  let storage: StorageService | null = null;
  let proxy: ProxyService | null = null;
  let origin: { port: number; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    await proxy?.stop();
    await storage?.dispose();
    await origin?.close();
    proxy = null;
    storage = null;
    origin = null;
    if (dataDir) {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  /** 装配真实 storage + engine + 代理 + 源站，返回代理地址与源站收到的头部。 */
  async function startStack(): Promise<{
    address: { host: string; port: number };
    engine: RuleEngine;
    originPort: number;
    seenHeaders: http.IncomingHttpHeaders[];
  }> {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-empty-matcher-'));
    initializeRuntime([`--data-dir=${dataDir}`]);
    storage = new StorageService();
    await storage.initialize();
    const engine = new RuleEngine(new BreakpointQueue());
    proxy = new ProxyService(storage, new CaptureEventQueue(), engine);
    const address = await proxy.start({ port: 0 });
    const seenHeaders: http.IncomingHttpHeaders[] = [];
    origin = await startOrigin((request) => {
      seenHeaders.push(request.headers);
    });
    return { address, engine, originPort: origin.port, seenHeaders };
  }

  it('never matches live traffic while a condition value is still empty', async () => {
    const { address, engine, originPort, seenHeaders } = await startStack();

    for (const matchers of [
      [{ type: 'host', value: '', mode: 'contains' }] satisfies RuleMatcher[],
      [{ type: 'host', value: '', mode: 'regex' }] satisfies RuleMatcher[],
      [{ type: 'path', value: '', mode: 'contains' }] satisfies RuleMatcher[],
      [{ type: 'url', value: '', mode: 'regex' }] satisfies RuleMatcher[],
      [] satisfies RuleMatcher[],
    ]) {
      engine.setRuleSet({ revision: 1, rules: [injectingRule(matchers)] });
      seenHeaders.length = 0;

      await expect(
        proxiedGet(address, `http://127.0.0.1:${originPort}/probe`),
      ).resolves.toBe(200);

      expect(seenHeaders).toHaveLength(1);
      expect(seenHeaders[0]?.['x-injected'], JSON.stringify(matchers)).toBeUndefined();
    }
  });

  it('matches once the condition actually has a value', async () => {
    const { address, engine, originPort, seenHeaders } = await startStack();
    engine.setRuleSet({
      revision: 1,
      rules: [injectingRule([{ type: 'host', value: '127.0.0.1', mode: 'contains' }])],
    });

    await expect(
      proxiedGet(address, `http://127.0.0.1:${originPort}/probe`),
    ).resolves.toBe(200);

    expect(seenHeaders[0]?.['x-injected']).toBe('1');
  });
});
