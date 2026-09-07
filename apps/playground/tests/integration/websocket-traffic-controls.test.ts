import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebSocketTrafficRunner } from '../../server/websocket/traffic';

describe('WebSocket traffic controls', () => {
  let webSocketLab: WebSocketTrafficRunner | null = null;

  afterEach(async () => {
    await webSocketLab?.close();
    webSocketLab = null;
  });

  it('keeps independent proxy clients open for repeated messages and origin broadcasts', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const firstClient = await webSocketLab.openThroughProxy(webSocketLab.port, '/first');
    const secondClient = await webSocketLab.openThroughProxy(webSocketLab.port, '/second');

    firstClient.sendText('first message');
    await firstClient.waitForText('first message');
    expect(secondClient.hasText('first message')).toBe(false);
    expect(webSocketLab.hasMessage('first message')).toBe(true);

    webSocketLab.sendFromOrigin('origin message');
    await firstClient.waitForText('origin message');
    await secondClient.waitForText('origin message');

    secondClient.sendText('second message');
    await secondClient.waitForText('second message');
    await secondClient.waitForText('origin message');
    expect(firstClient.hasText('second message')).toBe(false);
    expect(firstClient.isClosed()).toBe(false);
    expect(secondClient.isClosed()).toBe(false);
    expect(webSocketLab.evidence()).toEqual({
      closeCodes: [],
      messages: ['first message', 'second message'],
    });
  });

  it('sends a chosen close code and observes the actual origin close', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const client = await webSocketLab.openThroughProxy(webSocketLab.port, '/close');

    client.sendCloseFrame(1001);

    await vi.waitFor(() => expect(webSocketLab?.latestCloseCode()).toBe(1001));
    await vi.waitFor(() => expect(client.isClosed()).toBe(true));
    expect(webSocketLab.evidence()).toEqual({ closeCodes: [1001], messages: [] });
  });

  it('uses the same persistent client for long text and binary messages', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const client = await webSocketLab.openThroughProxy(webSocketLab.port, '/messages');
    const text = 'long text '.repeat(8_000);

    client.sendText(text);
    await client.waitForText(text);

    const binary = Buffer.from([0, 127, 128, 255]);
    const received = once(client, 'message');
    client.sendBinary(binary);
    const [data, isBinary] = await received;
    expect(data).toEqual(binary);
    expect(isBinary).toBe(true);
    expect(webSocketLab.hasMessage(text)).toBe(true);
  });

  it('uses the same persistent client for ping, pong and a complete close handshake', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const client = await webSocketLab.openThroughProxy(webSocketLab.port, '/controls');
    const pong = once(client, 'pong');

    client.sendPing('client-ping');

    expect((await pong)[0]).toEqual(Buffer.from('client-ping'));
    client.sendPong('client-pong');
    await client.closeGracefully(1000, 'scenario-complete');
    expect(client.isClosed()).toBe(true);
    await vi.waitFor(() => expect(webSocketLab?.latestCloseCode()).toBe(1000));
  });

  it('disconnects one client without closing another and preserves detached evidence', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const firstClient = await webSocketLab.openThroughProxy(webSocketLab.port, '/disconnect');
    const secondClient = await webSocketLab.openThroughProxy(webSocketLab.port, '/continue');
    const earlierEvidence = webSocketLab.evidence();

    firstClient.destroy();

    await vi.waitFor(() => expect(webSocketLab?.latestCloseCode()).toBe(1006));
    secondClient.sendText('after disconnect');
    await secondClient.waitForText('after disconnect');
    expect(earlierEvidence).toEqual({ closeCodes: [], messages: [] });
    expect(webSocketLab.evidence()).toEqual({
      closeCodes: [1006],
      messages: ['after disconnect'],
    });
  });

  it('closes every live client and releases the origin port on shutdown', async () => {
    webSocketLab = await WebSocketTrafficRunner.start();
    const port = webSocketLab.port;
    const firstClient = await webSocketLab.openThroughProxy(port, '/first');
    const secondClient = await webSocketLab.openThroughProxy(port, '/second');

    await webSocketLab.close();
    webSocketLab = null;

    expect(firstClient.isClosed()).toBe(true);
    expect(secondClient.isClosed()).toBe(true);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
});