import { promises as fs } from 'node:fs';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { RuleDefinition } from '@interceptor/core-protocol';

import { initializeRuntime } from '../../constants';
import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/proxy-capture-event-queue';
import { StorageService } from '../../storage/entry';
import { RuleEngine } from '../entry';
import { BreakpointQueue } from '../rule-breakpoint-queue';

/**
 * 端到端：真实 RuleEngine + 真实 Store + 真实 Mockttp 代理 + 真实源站。
 *
 * Rules 列表的命中数是给用户看“这条规则拦到了多少请求”，因此必须按
 * Rule × Exchange 去重，而不是按执行过的 action 次数累加。
 */

function startOrigin(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((_request, response) => {
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

/** 一条规则，三个都会执行的 action：命中一次请求仍然只能算一次。 */
function threeActionRule(): RuleDefinition {
  return {
    id: 'rule-multi',
    name: 'Three actions',
    enabled: true,
    priority: 100,
    matchers: [{ type: 'host', value: '127.0.0.1', mode: 'exact' }],
    actions: [
      { type: 'header', phase: 'request', op: 'set', name: 'x-one', value: '1' },
      { type: 'header', phase: 'request', op: 'set', name: 'x-two', value: '2' },
      { type: 'header', phase: 'response', op: 'set', name: 'x-three', value: '3' },
    ],
  };
}

describe('Rule hit counts (real proxy)', () => {
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

  it('counts matched requests, not executed actions', async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-rule-hits-'));
    initializeRuntime([`--data-dir=${dataDir}`]);
    storage = new StorageService();
    await storage.initialize();
    const engine = new RuleEngine(new BreakpointQueue());
    engine.setRuleSet({ revision: 1, rules: [threeActionRule()] });
    proxy = new ProxyService(storage, new CaptureEventQueue(), engine);
    const address = await proxy.start({ port: 0 });
    origin = await startOrigin();

    await expect(
      proxiedGet(address, `http://127.0.0.1:${origin.port}/first`),
    ).resolves.toBe(200);
    await expect.poll(async () => (await storage!.countRuleHits())[0]?.count).toBe(1);

    await expect(
      proxiedGet(address, `http://127.0.0.1:${origin.port}/second`),
    ).resolves.toBe(200);
    await expect.poll(async () => (await storage!.countRuleHits())[0]?.count).toBe(2);

    expect(await storage.countRuleHits()).toEqual([
      { ruleId: 'rule-multi', count: 2 },
    ]);
  });
});
