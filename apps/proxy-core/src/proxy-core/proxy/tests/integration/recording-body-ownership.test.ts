import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';

import { CaptureService } from '../../../capture/entry';
import { initializeRuntime } from '../../../constants';
import { ProxyService } from '../../entry';
import { CaptureEventQueue } from '../../internal/capture-event-queue';

it('does not create Capture records or BodyStore bytes for a WebSocket opened while recording is paused', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-recording-ownership-'));
  initializeRuntime([`--data-dir=${directory}`]);
  const captureService = new CaptureService();
  const proxyService = new ProxyService(captureService, new CaptureEventQueue());
  const source = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const sourcePaths: Array<string | undefined> = [];
  source.on('connection', (socket, request) => {
    sourcePaths.push(request.url);
    socket.on('message', (data, binary) => socket.send(data, { binary }));
  });
  const clients: WebSocket[] = [];
  try {
    await once(source, 'listening');
    await captureService.initialize();
    const { port } = await proxyService.start();
    const address = source.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket origin did not expose a numeric port.');
    const openClient = async (requestPath: string): Promise<WebSocket> => {
      const client = new WebSocket(`ws://127.0.0.1:${port}${requestPath}`, {
        headers: { host: `127.0.0.1:${address.port}` },
      });
      clients.push(client);
      await once(client, 'open');
      return client;
    };
    const query = { limit: 10, sort: 'started_desc', filter: {} } as const;

    const recordedClient = await openClient('/recorded');
    await echo(recordedClient, 'recorded-body');
    await closeClient(recordedClient);
    await expect.poll(async () => (await captureService.querySessions(query)).items[0]?.state).toBe('completed');
    const recordedId = (await captureService.querySessions(query)).items[0]!.id;
    const baseline = await captureService.status();
    expect(baseline.exchangeCount).toBe(1);
    expect(baseline.bodyCount).toBeGreaterThan(0);
    expect(baseline.blobBytes).toBeGreaterThan(0);

    proxyService.pauseRecording();
    const ignoredClient = await openClient('/ignored');
    await echo(ignoredClient, 'ignored-before-resume');
    await expect(captureService.status()).resolves.toEqual(baseline);
    proxyService.resumeRecording();
    await echo(ignoredClient, 'ignored-after-resume-with-distinct-bytes');
    await closeClient(ignoredClient);
    await proxyService.stop();

    await expect(captureService.status()).resolves.toEqual(baseline);
    const exchanges = await captureService.querySessions(query);
    expect(exchanges.items.map((exchange) => exchange.id)).toEqual([recordedId]);
    expect(sourcePaths).toEqual(['/recorded', '/ignored']);
  } finally {
    for (const client of clients) client.terminate();
    for (const client of source.clients) client.terminate();
    await proxyService.stop();
    await new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve()));
    await captureService.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

async function echo(client: WebSocket, value: string): Promise<void> {
  const response = once(client, 'message');
  client.send(value);
  const [data] = await response;
  expect(data.toString()).toBe(value);
}

async function closeClient(client: WebSocket): Promise<void> {
  const closed = once(client, 'close');
  client.close(1000);
  await closed;
}
