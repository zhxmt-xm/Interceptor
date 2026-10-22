import { once } from 'node:events';
import { Agent, createServer } from 'node:https';
import { X509Certificate } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { generateCACertificate } from 'mockttp';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { InspectionControlSession } from '../../internal/inspection-control-session';

describe('v2 HTTP inspection control over WSS', () => {
  let identity: { key: string; cert: string };
  const cleanups: Array<() => Promise<void>> = [];
  beforeAll(async () => { identity = await generateCACertificate(); });
  afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

  async function setup() {
    const server = createServer(identity);
    const webSocketServer = new WebSocketServer({ server, perMessageDeflate: false });
    const diagnostics = new CoreDiagnostics();
    const errors: unknown[] = [];
    const sessions: InspectionControlSession[] = [];
    const sockets = new Set<WebSocket>();
    let revoked = 0;
    webSocketServer.on('connection', socket => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      try {
        sessions.push(new InspectionControlSession(socket, diagnostics, () => { revoked++; }));
      } catch (error) {
        errors.push(error);
        socket.terminate();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const agent = new Agent({
      ca: identity.cert,
      checkServerIdentity: (_host, certificate) => certificate.raw.equals(new X509Certificate(identity.cert).raw)
        ? undefined : new Error('Unexpected test identity'),
    });
    const peer = new WebSocket(`wss://127.0.0.1:${(server.address() as AddressInfo).port}`, { agent });
    const messages: string[] = [];
    peer.on('message', data => messages.push(data.toString()));
    await once(peer, 'open');
    cleanups.push(async () => {
      peer.terminate();
      for (const socket of sockets) socket.terminate();
      await new Promise<void>((resolve, reject) => webSocketServer.close(error => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      agent.destroy();
    });
    expect(errors).toEqual([]);
    return { peer, sessions, messages, revoked: () => revoked };
  }

  const hello = { type: 'session.hello', protocolVersion: 2, appVersion: '0.1.0', capabilities: ['http'] };

  it('does not grant data authorization before hello and returns only implemented capability', async () => {
    const lab = await setup();
    expect(lab.sessions[0]!.credentials()).toBeNull();
    lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(lab.messages).toHaveLength(1));
    const ready = JSON.parse(lab.messages[0]!);
    expect(ready).toEqual({
      type: 'session.ready', protocolVersion: 2,
      sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      sessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), capabilities: ['http'],
    });
    expect(lab.sessions[0]!.credentials()).toEqual({
      sessionId: ready.sessionId, sessionToken: ready.sessionToken, capabilities: ['http'],
    });
  });

  it('revokes credentials before notifying the listener and never revokes twice', async () => {
    const lab = await setup();
    lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(lab.messages).toHaveLength(1));
    lab.peer.close();
    await vi.waitFor(() => expect(lab.revoked()).toBe(1));
    expect(lab.sessions[0]!.credentials()).toBeNull();
    lab.sessions[0]!.close('service-stopped');
    expect(lab.revoked()).toBe(1);
  });

  it('negotiates HTTP and WebSocket together and returns an isolated authorization snapshot', async () => {
    const lab = await setup();
    lab.peer.send(JSON.stringify({ ...hello, capabilities: ['http', 'websocket'] }));
    await vi.waitFor(() => expect(lab.messages).toHaveLength(1));
    expect(JSON.parse(lab.messages[0]!)).toMatchObject({
      type: 'session.ready', protocolVersion: 2, capabilities: ['http', 'websocket'],
    });
    const credentials = lab.sessions[0]!.credentials()!;
    expect(credentials.capabilities).toEqual(['http', 'websocket']);
    credentials.capabilities.pop();
    expect(lab.sessions[0]!.credentials()!.capabilities).toEqual(['http', 'websocket']);
  });

  it('rejects duplicate hello instead of rotating credentials while old exchanges remain', async () => {
    const lab = await setup();
    lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(lab.messages).toHaveLength(1));
    lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(lab.revoked()).toBe(1));
    expect(lab.sessions[0]!.credentials()).toBeNull();
    expect(lab.messages).toHaveLength(1);
  });

  it.each([
    { ...hello, protocolVersion: 1 },
    { ...hello, capabilities: ['tcp'] },
    { ...hello, capabilities: ['http', 'h2'] },
    { ...hello, capabilities: ['http', 'http'] },
    { ...hello, capabilities: [] },
    { ...hello, capabilities: ['websocket'] },
    { ...hello, capabilities: ['websocket', 'http'] },
    { ...hello, capabilities: ['http', 'websocket', 'websocket'] },
    { ...hello, appVersion: ' ' },
    { ...hello, appVersion: 'a'.repeat(65) },
    { ...hello, sessionToken: 'client-selected-secret' },
  ])('rejects incompatible hello %# before issuing any credentials', async invalid => {
    const lab = await setup();
    lab.peer.send(JSON.stringify(invalid));
    await vi.waitFor(() => expect(lab.revoked()).toBe(1));
    expect(lab.sessions[0]!.credentials()).toBeNull();
    expect(lab.messages).toHaveLength(0);
  });

  it.each(['binary', 'oversized', 'malformed'])('rejects %s control input', async kind => {
    const lab = await setup();
    lab.peer.send(kind === 'binary' ? Buffer.from([1]) : kind === 'oversized' ? 'é'.repeat(32769) : '{');
    await vi.waitFor(() => expect(lab.revoked()).toBe(1));
    expect(lab.messages).toHaveLength(0);
  });

  it('generates a different identity and secret for every control session', async () => {
    const first = await setup();
    const second = await setup();
    for (const lab of [first, second]) lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => {
      expect(first.messages).toHaveLength(1);
      expect(second.messages).toHaveLength(1);
    });
    const left = first.sessions[0]!.credentials()!;
    const right = second.sessions[0]!.credentials()!;
    expect(left.sessionId).not.toBe(right.sessionId);
    expect(left.sessionToken).not.toBe(right.sessionToken);
  });

  it('does not expose a mutable capability array that changes active authorization', async () => {
    const lab = await setup();
    lab.peer.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(lab.messages).toHaveLength(1));
    lab.sessions[0]!.credentials()!.capabilities.pop();
    expect(lab.sessions[0]!.credentials()!.capabilities).toEqual(['http']);
  });

  it('revokes an authenticated socket that never sends hello', async () => {
    const lab = await setup();
    await vi.waitFor(() => expect(lab.revoked()).toBe(1), { timeout: 11_000, interval: 50 });
    expect(lab.sessions[0]!.credentials()).toBeNull();
    expect(lab.messages).toHaveLength(0);
  }, 12_000);
});
