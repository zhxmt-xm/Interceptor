import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuleAction } from '@interceptor/core-protocol';
import { HttpMessageService } from '../../../http-message/entry';
import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { HttpInterceptionService } from '../../entry';

describe('HTTP copy file replacement decisions', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-http-copy-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function setup(actions: RuleAction[]) {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1,
      nodes: [{
        kind: 'rule', id: 'file-rule', name: 'File rule', enabled: true, priority: 1,
        matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }], actions,
      }],
    });
    return {
      breakpointQueue,
      httpInterceptionService: new HttpInterceptionService(ruleService, new HttpMessageService()),
    };
  }

  const request = {
    method: 'POST', url: 'https://api.test/file', host: 'api.test', path: '/file',
    query: new URLSearchParams(), headers: { 'content-length': '100' },
  };

  it('returns Map Local binary content rather than sending its PC file path to Android', async () => {
    const filePath = path.join(directory, 'mapped.bin');
    const content = Uint8Array.from({ length: 65537 }, (_, index) => index % 256);
    await writeFile(filePath, content);
    const { httpInterceptionService } = setup([{ type: 'map-local', path: filePath }]);
    const result = await httpInterceptionService.evaluateRequest(request, new AbortController().signal);
    expect(result.decision).toEqual({
      action: 'respond', statusCode: 200, headers: { 'content-type': 'application/octet-stream' },
      body: { action: 'replace', content },
    });
    expect(JSON.stringify(result)).not.toContain(filePath);
  });

  it('applies a breakpoint File replacement with content coding and leaves the observed copy untouched', async () => {
    const filePath = path.join(directory, 'edited.bin');
    const content = new Uint8Array([0, 255, 128, 1, 2, 3]);
    await writeFile(filePath, content);
    const { httpInterceptionService, breakpointQueue } = setup([
      { type: 'header', phase: 'request', op: 'set', name: 'content-encoding', value: 'gzip' },
      { type: 'breakpoint', phase: 'request' },
    ]);
    const resultPromise = httpInterceptionService.evaluateRequest(request, new AbortController().signal);
    await vi.waitFor(() => expect(breakpointQueue.size).toBe(1));
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue', { bodyFilePath: filePath });
    const result = await resultPromise;
    expect(result.decision.action).toBe('intercept');
    if (result.decision.action !== 'intercept' || result.decision.body.action !== 'replace') {
      throw new Error('Expected file replacement');
    }
    expect(new Uint8Array(gunzipSync(result.decision.body.content))).toEqual(content);
    expect(result.decision.headers['content-length']).toBe(String(result.decision.body.content.byteLength));
    expect(request.headers).toEqual({ 'content-length': '100' });
    expect(result.bodyEffect?.source).toBe('file');
    expect(JSON.stringify(result)).not.toContain(filePath);
  });
});
