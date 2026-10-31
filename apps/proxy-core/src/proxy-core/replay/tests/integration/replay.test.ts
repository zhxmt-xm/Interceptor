import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../../constants';
import { CaptureService } from '../../../capture/entry';
import type { ExchangeInput } from '../../../capture/interfaces';
import { ProxyService } from '../../../proxy/entry';
import { CaptureEventQueue } from '../../../proxy/internal/capture-event-queue';
import { ReplayService } from '../../entry';

/**
 * 只覆盖真实 UI 无法构造的拒绝路径：exchange 已不存在、非 HTTP 行、代理未监听、
 * 正文丢失/截断与发送失败。可经 UI 构造的请求/响应一致性由 capture.replay* E2E 覆盖。
 */
describe('ReplayService rejections', () => {
  let dataDir = '';
  let captureService: CaptureService | null = null;
  let proxyService: ProxyService | null = null;
  let replayService: ReplayService | null = null;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-replay-'));
    initializeRuntime([`--data-dir=${dataDir}`]);
    captureService = new CaptureService();
    await captureService.initialize();
    proxyService = new ProxyService(captureService, new CaptureEventQueue());
    replayService = new ReplayService(captureService, proxyService);
  });

  afterEach(async () => {
    await proxyService?.stop();
    await captureService?.dispose();
    replayService = null;
    proxyService = null;
    captureService = null;
    if (dataDir) {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  /** 写入一条 Session 与一条已完成的 Exchange，正文按线上编码保存。 */
  async function seedExchange(
    body: Buffer,
    overrides: Partial<ExchangeInput> = {},
  ): Promise<string> {
    const service = captureService!;
    await service.ensureSession({
      id: 'session-replay',
      name: 'Recording',
      startedAt: 1,
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
    const stored = await service.writeBody((async function* () {
      yield body;
    })());
    const exchangeId = overrides.id ?? 'ex-replay-source';
    await service.appendExchanges([{
      id: exchangeId,
      sessionId: 'session-replay',
      method: 'POST',
      url: 'http://127.0.0.1/replay',
      host: '127.0.0.1',
      path: '/replay',
      protocol: 'HTTP/1.1',
      startedAt: 1,
      completedAt: 2,
      state: 'completed',
      requestBytes: body.byteLength,
      responseBytes: 2,
      requestMime: 'text/plain',
      headers: [
        { kind: 'request', name: 'content-type', value: 'text/plain' },
        { kind: 'request', name: 'host', value: '127.0.0.1' },
      ],
      requestBody: {
        id: `body-${exchangeId}`,
        blobHash: stored.hash,
        encodedSize: stored.size,
        mediaType: 'text/plain',
      },
      ...overrides,
    }]);
    return exchangeId;
  }

  it('rejects an unknown exchange without sending anything', async () => {
    await proxyService!.start();
    const outcome = await replayService!.replay(
      'ex-missing',
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: false, reason: 'not-found' });
  });

  it('rejects exchanges that are not HTTP', async () => {
    await proxyService!.start();
    const sourceId = await seedExchange(Buffer.alloc(0), {
      id: 'ex-replay-ws',
      protocol: 'ws',
    });
    const outcome = await replayService!.replay(
      sourceId,
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: false, reason: 'unsupported-exchange' });
  });

  it('rejects replay while the proxy is not listening', async () => {
    const sourceId = await seedExchange(Buffer.alloc(0), {
      id: 'ex-replay-offline',
    });
    const outcome = await replayService!.replay(
      sourceId,
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: false, reason: 'proxy-not-listening' });
  });

  it('rejects a request whose body was not captured', async () => {
    await proxyService!.start();
    const sourceId = await seedExchange(Buffer.alloc(0), {
      id: 'ex-replay-missing-body',
      requestBytes: 10,
      requestBody: undefined,
    });
    const outcome = await replayService!.replay(
      sourceId,
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: false, reason: 'request-body-unavailable' });
  });

  it('rejects a truncated request body', async () => {
    await proxyService!.start();
    const sourceId = await seedExchange(Buffer.from('partial'), {
      id: 'ex-replay-truncated',
      requestBody: {
        id: 'body-truncated',
        blobHash: (await captureService!.writeBody((async function* () {
          yield Buffer.from('partial');
        })())).hash,
        encodedSize: 7,
        truncated: true,
      },
    });
    const outcome = await replayService!.replay(
      sourceId,
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: false, reason: 'request-body-truncated' });
  });

  it('returns send-failed when an HTTP/2 replay targets a cleartext URL', async () => {
    await proxyService!.start();
    const sourceId = await seedExchange(Buffer.alloc(0), {
      id: 'ex-replay-h2-cleartext',
      protocol: 'HTTP/2',
      url: 'http://127.0.0.1:9/replay/h2',
      port: 9,
      path: '/replay/h2',
    });
    const outcome = await replayService!.replay(
      sourceId,
      new AbortController().signal,
    );
    expect(outcome).toMatchObject({ ok: false, reason: 'send-failed' });
    if (!outcome.ok) {
      expect(outcome.message).toContain('HTTPS');
    }
  });
});
