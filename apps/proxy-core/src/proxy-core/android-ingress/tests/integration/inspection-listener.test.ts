import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { Agent } from 'node:https';
import net from 'node:net';
import { generateCACertificate } from 'mockttp';
import WebSocket from 'ws';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { HttpMessageService } from '../../../http-message/entry';
import { HttpInterceptionService } from '../../../http-interception/entry';
import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import { AndroidIngressService } from '../../entry';
import { ObservedHttpRecording } from './observed-http-recording';

const pin = (cert: string) => `sha256/${createHash('sha256')
  .update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64')}`;

describe('v2 paired inspection listener', () => {
  let pc: { key: string; cert: string };
  let device: { key: string; cert: string };
  let wrong: { key: string; cert: string };
  const cleanups: Array<() => Promise<void>> = [];
  beforeAll(async () => { [pc, device, wrong] = await Promise.all([
    generateCACertificate(), generateCACertificate(), generateCACertificate(),
  ]); });
  afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

  async function setup(settle: () => Promise<void> = async () => {}) {
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [] });
    let recordings = 0;
    const androidIngressService = new AndroidIngressService(new HttpInterceptionService(ruleService, new HttpMessageService()),
      ruleService, () => null,
      () => {
        recordings++;
        const httpRecording = new ObservedHttpRecording();
        httpRecording.settle = settle;
        return httpRecording;
      }, new CoreDiagnostics());
    cleanups.push(() => androidIngressService.stop());
    const address = await androidIngressService.start({ identity: pc, devicePin: pin(device.cert) });
    const peers = new Set<WebSocket>();
    const agents = new Set<Agent>();
    cleanups.push(async () => {
      for (const peer of peers) peer.terminate();
      for (const agent of agents) agent.destroy();
      breakpointQueue.closeAll();
    });
    function connect(path: string, token?: string, identity: typeof device | null = device) {
      const agent = new Agent({
        ca: pc.cert, ...(identity ?? {}),
        checkServerIdentity: (_host, certificate) => pin(new X509Certificate(certificate.raw).toString()) === pin(pc.cert)
          ? undefined : new Error('Unexpected PC identity'),
      });
      agents.add(agent);
      const peer = new WebSocket(`wss://127.0.0.1:${address.port}${path}`, {
        agent, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
      peer.on('error', () => {});
      peers.add(peer);
      return peer;
    }
    async function control() {
      const peer = connect('/android/v2/control');
      await once(peer, 'open');
      const ready = once(peer, 'message');
      peer.send(JSON.stringify({ type: 'session.hello', protocolVersion: 2, appVersion: '0.1.0', capabilities: ['http'] }));
      const [bytes] = await ready;
      const session = JSON.parse(bytes.toString()) as { sessionId: string; sessionToken: string };
      return { peer, ...session };
    }
    return { androidIngressService, address, connect, control, breakpointQueue, ruleService, recordings: () => recordings };
  }

  async function rejectsUpgrade(peer: WebSocket) {
    await expect(once(peer, 'open')).rejects.toThrow();
  }

  it('starts without a local proxy listener and authorizes data only after control hello', async () => {
    const lab = await setup();
    await rejectsUpgrade(lab.connect('/android/v2/exchange', 'a'.repeat(43)));
    const session = await lab.control();
    const peer = lab.connect('/android/v2/exchange', session.sessionToken);
    await once(peer, 'open');
    const received = once(peer, 'message');
    peer.send(JSON.stringify({
      type: 'http.request', protocolVersion: 2, sessionId: session.sessionId, exchangeId: randomUUID(),
      stageId: randomUUID(), request: { method: 'GET', url: 'https://api.test/', httpVersion: '1.1', headers: [] },
    }));
    const [bytes] = await received;
    expect(JSON.parse(bytes.toString())).toMatchObject({ type: 'http.decision', decision: { action: 'bypass' } });
    expect(lab.recordings()).toBe(1);
  });

  it('rejects wrong device identity, missing identity, second control and all old endpoints', async () => {
    const lab = await setup();
    await rejectsUpgrade(lab.connect('/android/v2/control', undefined, wrong));
    await rejectsUpgrade(lab.connect('/android/v2/control', undefined, null));
    const session = await lab.control();
    await rejectsUpgrade(lab.connect('/android/v2/control'));
    for (const path of ['/android/v1/control', '/android/v1/tcp', '/android/v1/dns', '/android/v2/exchange?token=x']) {
      await rejectsUpgrade(lab.connect(path, session.sessionToken));
    }
    await rejectsUpgrade(lab.connect('/android/v2/exchange', 'x'.repeat(43)));
  });

  it('revokes old credentials on control close and cancels a pending real breakpoint', async () => {
    const lab = await setup();
    lab.ruleService.setRuleSet({ revision: 2, nodes: [{
      kind: 'rule', id: 'pause', name: 'Pause', priority: 1, enabled: true,
      matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }],
      actions: [{ type: 'breakpoint', phase: 'request' }],
    }] });
    const session = await lab.control();
    const peer = lab.connect('/android/v2/exchange', session.sessionToken);
    await once(peer, 'open');
    peer.send(JSON.stringify({
      type: 'http.request', protocolVersion: 2, sessionId: session.sessionId, exchangeId: randomUUID(),
      stageId: randomUUID(), request: { method: 'POST', url: 'https://api.test/', httpVersion: '2', headers: [] },
    }));
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    session.peer.terminate();
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(0));
    await vi.waitFor(() => expect(peer.readyState).toBe(WebSocket.CLOSED));
    await rejectsUpgrade(lab.connect('/android/v2/exchange', session.sessionToken));
    const next = await lab.control();
    expect(next.sessionToken).not.toBe(session.sessionToken);
  });

  it('limits data exchanges to sixteen until their sockets actually close', async () => {
    const lab = await setup();
    const session = await lab.control();
    const peers: WebSocket[] = [];
    for (let index = 0; index < 16; index++) {
      const peer = lab.connect('/android/v2/exchange', session.sessionToken);
      await once(peer, 'open');
      peers.push(peer);
    }
    await rejectsUpgrade(lab.connect('/android/v2/exchange', session.sessionToken));
    const closed = once(peers[0]!, 'close');
    peers[0]!.terminate();
    await closed;
    await vi.waitFor(() => expect(lab.recordings()).toBe(16));
    await new Promise(resolve => setTimeout(resolve, 30));
    const replacement = lab.connect('/android/v2/exchange', session.sessionToken);
    await once(replacement, 'open');
    expect(lab.recordings()).toBe(17);
  });

  it('stop closes control and data and releases its listening port for restart', async () => {
    const lab = await setup();
    const session = await lab.control();
    const peer = lab.connect('/android/v2/exchange', session.sessionToken);
    await once(peer, 'open');
    await Promise.all([lab.androidIngressService.stop(), lab.androidIngressService.stop()]);
    await vi.waitFor(() => expect(peer.readyState).toBe(WebSocket.CLOSED));
    const probe = net.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(lab.address.port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    const next = await lab.androidIngressService.start({ identity: pc, devicePin: pin(device.cert) });
    expect(next.host).toBe('127.0.0.1');
  });

  it('does not free a closed socket slot until its asynchronous recording is settled', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const lab = await setup(() => gate);
    try {
      const session = await lab.control();
      const peers: WebSocket[] = [];
      for (let index = 0; index < 16; index++) {
        const peer = lab.connect('/android/v2/exchange', session.sessionToken);
        await once(peer, 'open');
        peers.push(peer);
      }
      const closed = once(peers[0]!, 'close');
      peers[0]!.terminate();
      await closed;
      await rejectsUpgrade(lab.connect('/android/v2/exchange', session.sessionToken));
      release();
      await new Promise(resolve => setTimeout(resolve, 30));
      const replacement = lab.connect('/android/v2/exchange', session.sessionToken);
      await once(replacement, 'open');
    } finally {
      release();
    }
  });

  it('stop waits for channel recording instead of reporting cleanup before persistence finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const lab = await setup(() => gate);
    try {
      const session = await lab.control();
      const peer = lab.connect('/android/v2/exchange', session.sessionToken);
      await once(peer, 'open');
      let stopped = false;
      const stopping = lab.androidIngressService.stop().then(() => { stopped = true; });
      await vi.waitFor(() => expect(peer.readyState).toBe(WebSocket.CLOSED));
      expect(stopped).toBe(false);
      release();
      await stopping;
      expect(stopped).toBe(true);
    } finally {
      release();
    }
  });
});
