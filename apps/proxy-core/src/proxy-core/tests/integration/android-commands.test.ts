import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { Agent } from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { AndroidStatusResult, CoreCommand, CoreResult, CoreToMainMessage } from '@interceptor/core-protocol';
import { CORE_PROTOCOL_VERSION } from '@interceptor/core-protocol';
import { generateCACertificate } from 'mockttp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { CoreApplication, type CoreLifecycleMessage, type CoreParentPort, type ParentMessageEvent } from '../../core-application';
import type { RpcMessagePort } from '../../core-rpc-server';
import { CaptureService } from '../../capture/entry';
import { initializeRuntime } from '../../constants';
import { HttpRecording } from '../../android-ingress/internal/http-recording';
import { AndroidIngressService } from '../../android-ingress/entry';
import type { InspectionHttpMessage } from '../../android-ingress/interfaces/inspection';
import { parseInspectionMessage } from '../../android-ingress/utils/inspection-protocol';
import { ProxyService } from '../../proxy/entry';
import { CaptureEventQueue } from '../../proxy/internal/capture-event-queue';
import { RuleService } from '../../rules/entry';
import { BreakpointQueue } from '../../rules/internal/breakpoint-queue';
import { WorkspaceService } from '../../workspace/entry';

describe('Core Android commands and capture ownership', () => {
  let pcIdentity: { key: string; cert: string };
  let deviceIdentity: { key: string; cert: string };
  let directory: string;
  let captureService: CaptureService;
  let captureEventQueue: CaptureEventQueue;
  let proxyService: ProxyService;
  let ruleService: RuleService;
  let breakpointQueue: BreakpointQueue;
  let coreApplication: CoreApplication;
  let parentListener: ((event: ParentMessageEvent) => void) | undefined;
  let lifecycle: CoreLifecycleMessage[];
  let rpcMessages: CoreToMainMessage[];
  let rpcEvents: EventEmitter;
  let peers: WebSocket[];
  let agents: Agent[];
  let peerErrors: Error[];
  const query = { limit: 100, sort: 'started_desc', filter: {} } as const;

  beforeAll(async () => {
    [pcIdentity, deviceIdentity] = await Promise.all([generateCACertificate(), generateCACertificate()]);
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-core-android-'));
    initializeRuntime([`--data-dir=${directory}`]);
    lifecycle = [];
    rpcMessages = [];
    rpcEvents = new EventEmitter();
    peers = [];
    agents = [];
    peerErrors = [];
    parentListener = undefined;
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const parentPort: CoreParentPort = {
      on(_event, listener) { parentListener = listener; },
      postMessage(message) { lifecycle.push(message); },
    };
    captureService = new CaptureService();
    captureEventQueue = new CaptureEventQueue();
    breakpointQueue = new BreakpointQueue();
    ruleService = new RuleService(breakpointQueue);
    const workspaceService = new WorkspaceService();
    proxyService = new ProxyService(captureService, captureEventQueue, ruleService);
    coreApplication = new CoreApplication(parentPort, {
      captureService, captureEventQueue, proxyService, breakpointQueue, ruleService, workspaceService,
    });
    coreApplication.start();
    await captureService.initialize();
  });

  afterEach(async () => {
    for (const peer of peers) peer.terminate();
    for (const agent of agents) agent.destroy();
    coreApplication.stop();
    await expect.poll(() => vi.mocked(process.exit).mock.calls.length).toBe(1);
    await rm(directory, { recursive: true, force: true });
    expect(peerErrors).toEqual([]);
    vi.restoreAllMocks();
  });

  function execute(command: CoreCommand, signal = new AbortController().signal): Promise<CoreResult> {
    return coreApplication.executeCommand(command, signal);
  }

  function readStatus(result: CoreResult): AndroidStatusResult['payload'] {
    if (result.type !== 'android.status') throw new Error(`Unexpected result: ${result.type}`);
    return result.payload;
  }

  async function startAndroid() {
    return readStatus(await execute({ type: 'android.start', payload: {
      identity: pcIdentity, devicePin: pin(deviceIdentity.cert),
      device: { id: 'android:test-device', name: 'Android · Test device' },
    } }));
  }

  async function status() {
    return readStatus(await execute({ type: 'android.status', payload: {} }));
  }

  function attachRpc() {
    const rpcMessagePort: RpcMessagePort = {
      on(event, listener) { rpcEvents.on(event, listener); },
      off(event, listener) { rpcEvents.off(event, listener); },
      postMessage(message) { rpcMessages.push(message); },
      start() {},
      close() { rpcEvents.removeAllListeners(); },
    };
    parentListener!({ data: { type: 'rpc-port' }, ports: [rpcMessagePort] });
  }

  function acknowledgeEvents() {
    for (const message of rpcMessages.splice(0)) {
      if (message.kind === 'event-batch') {
        rpcEvents.emit('message', { data: { kind: 'event-ack',
          protocolVersion: CORE_PROTOCOL_VERSION, batchSequence: message.batchSequence } });
      }
    }
  }

  async function connect(port: number, endpoint: string, token?: string) {
    const agent = new Agent({
      ...deviceIdentity, ca: pcIdentity.cert,
      checkServerIdentity: (_host, certificate) => pin(new X509Certificate(certificate.raw).toString()) === pin(pcIdentity.cert)
        ? undefined : new Error('Unexpected PC identity'),
    });
    agents.push(agent);
    const peer = new WebSocket(`wss://127.0.0.1:${port}${endpoint}`, {
      agent, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    peer.on('error', error => peerErrors.push(error));
    peers.push(peer);
    await once(peer, 'open');
    return peer;
  }

  async function control(port: number) {
    const peer = await connect(port, '/android/v2/control');
    const ready = once(peer, 'message');
    peer.send(JSON.stringify({ type: 'session.hello', protocolVersion: 2, appVersion: '0.1.0', capabilities: ['http'] }));
    const [bytes] = await ready;
    const value: unknown = JSON.parse(bytes.toString());
    if (!value || typeof value !== 'object' || !('sessionId' in value) || typeof value.sessionId !== 'string'
      || !('sessionToken' in value) || typeof value.sessionToken !== 'string') {
      throw new Error('Invalid inspection control response');
    }
    return { peer, port, sessionId: value.sessionId, token: value.sessionToken };
  }

  async function exchange(session: Awaited<ReturnType<typeof control>>, requestPath: string) {
    const peer = await connect(session.port, '/android/v2/exchange', session.token);
    const envelope = { protocolVersion: 2 as const, sessionId: session.sessionId, exchangeId: randomUUID() };
    const stageId = randomUUID();
    const decided = receive(peer, session.sessionId);
    send(peer, { ...envelope, type: 'http.request', stageId,
      request: { method: 'GET', url: `https://api.test${requestPath}`, httpVersion: '1.1', headers: [] } });
    const decision = await decided;
    if (decision.type !== 'http.decision') throw new Error('Expected a request decision');
    send(peer, { ...envelope, type: 'http.applied', stageId, decisionId: decision.decisionId });
    return { peer, envelope, decision };
  }

  async function finish(httpExchange: Awaited<ReturnType<typeof exchange>>) {
    const { peer, envelope } = httpExchange;
    const emptyBody = async (phase: 'request' | 'response', role: 'original' | 'applied') => {
      const bodyId = randomUUID();
      send(peer, { ...envelope, type: 'body.open', bodyId, phase, role, byteLength: 0 });
      const received = receive(peer, envelope.sessionId);
      send(peer, { ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] });
      expect(await received).toMatchObject({ type: 'body.received', bodyId, byteLength: 0 });
    };
    await emptyBody('request', 'original');
    await emptyBody('request', 'applied');
    const stageId = randomUUID();
    const decided = receive(peer, envelope.sessionId);
    send(peer, { ...envelope, type: 'http.response', stageId,
      response: { statusCode: 200, headers: [] } });
    const decision = await decided;
    if (decision.type !== 'http.decision') throw new Error('Expected a response decision');
    send(peer, { ...envelope, type: 'http.applied', stageId, decisionId: decision.decisionId });
    await emptyBody('response', 'original');
    await emptyBody('response', 'applied');
    const completed = receive(peer, envelope.sessionId);
    const closed = once(peer, 'close');
    send(peer, { ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
    expect(await completed).toMatchObject({ type: 'exchange.completed' });
    await closed;
  }

  it('stays off until an explicit command and records without starting the local Proxy listener', async () => {
    expect(await status()).toEqual({ listening: false, connected: false, host: null, port: null,
      recording: false, captureSessionId: null });
    expect((await captureService.status()).sessionCount).toBe(0);
    const listening = await startAndroid();
    expect(listening).toEqual({ listening: true, connected: false, host: '127.0.0.1',
      port: expect.any(Number), recording: true, captureSessionId: expect.any(String) });
    expect(proxyService.status().listening).toBe(false);
    const session = await control(listening.port!);
    expect(await status()).toMatchObject({ connected: true });
    const httpExchange = await exchange(session, '/core-owned');
    expect(httpExchange.decision.decision.action).toBe('bypass');
    await finish(httpExchange);
    expect((await captureService.querySessions(query)).items).toMatchObject([
      { path: '/core-owned', state: 'completed', requestBytes: 0, responseBytes: 0 },
    ]);
    expect(captureEventQueue.drain(100)).toMatchObject([{ summary: { state: 'completed' } }]);
    const result = readStatus(await execute({ type: 'android.stop', payload: {} }));
    expect(result).toEqual({ listening: false, connected: false, host: null, port: null,
      recording: false, captureSessionId: null });
    await assertPortReleased(listening.port!);
    expect((await captureService.status()).exchangeCount).toBe(1);
  });

  it('keeps the global pause intent on Android start and never backfills a paused exchange', async () => {
    await execute({ type: 'proxy.setRecording', payload: { recording: false } });
    const listening = await startAndroid();
    expect(listening.recording).toBe(false);
    const session = await control(listening.port!);
    const ignored = await exchange(session, '/paused');
    await execute({ type: 'proxy.setRecording', payload: { recording: true } });
    expect((await status()).recording).toBe(true);
    await finish(ignored);
    expect((await captureService.status()).exchangeCount).toBe(0);
    const recorded = await exchange(session, '/before-pause');
    await execute({ type: 'proxy.setRecording', payload: { recording: false } });
    await finish(recorded);
    const paused = await exchange(session, '/during-pause');
    await finish(paused);
    expect((await captureService.querySessions(query)).items).toMatchObject([{ path: '/before-pause', state: 'completed' }]);
    expect(proxyService.status().listening).toBe(false);
  });

  it('clears Android-only recording without losing its active session or cancelling protocol work', async () => {
    const listening = await startAndroid();
    const session = await control(listening.port!);
    const old = await exchange(session, '/before-clear');
    const pendingPeer = await connect(listening.port!, '/android/v2/exchange', session.token);
    await execute({ type: 'capture.cleanup', payload: { scope: 'all' } });
    expect(await captureService.status()).toMatchObject({ sessionCount: 1, exchangeCount: 0, bodyCount: 0 });
    expect((await status()).captureSessionId).toBe(listening.captureSessionId);
    await finish(old);
    const decision = receive(pendingPeer, session.sessionId);
    send(pendingPeer, { type: 'http.request', protocolVersion: 2, sessionId: session.sessionId,
      exchangeId: randomUUID(), stageId: randomUUID(),
      request: { method: 'GET', url: 'https://api.test/late-headers', httpVersion: '1.1', headers: [] } });
    expect(await decision).toMatchObject({ type: 'http.decision' });
    expect((await captureService.status()).exchangeCount).toBe(0);
    await finish(await exchange(session, '/after-clear'));
    expect((await captureService.querySessions(query)).items).toMatchObject([{ path: '/after-clear', state: 'completed' }]);
  });

  it('retains both active session shells and neither set of old exchanges on Clear', async () => {
    await execute({ type: 'proxy.start', payload: { port: 0 } });
    const localSessionId = proxyService.status().sessionId;
    const listening = await startAndroid();
    expect(listening.captureSessionId).not.toBe(localSessionId);
    const session = await control(listening.port!);
    await finish(await exchange(session, '/before-both-clear'));
    await execute({ type: 'capture.cleanup', payload: { scope: 'all' } });
    expect(await captureService.status()).toMatchObject({ sessionCount: 2, exchangeCount: 0, bodyCount: 0 });
    expect(proxyService.status().sessionId).toBe(localSessionId);
    expect((await status()).captureSessionId).toBe(listening.captureSessionId);
    const collectBodies = vi.spyOn(captureService, 'collectUnreferencedBodies');
    await execute({ type: 'proxy.stop', payload: {} });
    expect(collectBodies).not.toHaveBeenCalled();
    await finish(await exchange(session, '/after-local-stop'));
    expect((await captureService.querySessions(query)).items).toMatchObject([{ path: '/after-local-stop', state: 'completed' }]);
    await execute({ type: 'android.stop', payload: {} });
    expect(collectBodies).toHaveBeenCalledOnce();
  });

  it('rejects deleting an owned session instead of breaking subsequent Android inspection', async () => {
    const listening = await startAndroid();
    const session = await control(listening.port!);
    await finish(await exchange(session, '/before-session-delete'));
    await expect(execute({ type: 'capture.cleanup', payload: {
      scope: 'session', sessionId: listening.captureSessionId!,
    } })).rejects.toThrow('active capture session');
    await finish(await exchange(session, '/after-session-delete'));
    expect(await captureService.status()).toMatchObject({ sessionCount: 1, exchangeCount: 2 });
  });

  it('rejects duplicate or invalid starts and makes stop and subsequent restart deterministic', async () => {
    await expect(execute({ type: 'android.start', payload: {
      identity: pcIdentity,
      devicePin: 'invalid',
      device: { id: 'android:test-device', name: 'Android · Test device' },
    } }))
      .rejects.toThrow('confirmed device pin');
    expect((await captureService.status()).sessionCount).toBe(0);
    const listening = await startAndroid();
    await expect(startAndroid()).rejects.toThrow(/already active|already running/);
    expect((await status()).captureSessionId).toBe(listening.captureSessionId);
    await Promise.all([execute({ type: 'android.stop', payload: {} }), execute({ type: 'android.stop', payload: {} })]);
    await assertPortReleased(listening.port!);
    const restarted = await startAndroid();
    expect(restarted.captureSessionId).not.toBe(listening.captureSessionId);
  });

  it('publishes Android state over the existing RPC event window without credentials', async () => {
    attachRpc();
    const listening = await startAndroid();
    await expect.poll(() => rpcMessages.some(message => message.kind === 'event-batch'
      && message.androidStatus?.port === listening.port)).toBe(true);
    acknowledgeEvents();
    const session = await control(listening.port!);
    await expect.poll(() => rpcMessages.some(message => message.kind === 'event-batch'
      && message.androidStatus?.connected)).toBe(true);
    expect(JSON.stringify(rpcMessages)).not.toContain(session.token);
    expect(JSON.stringify(rpcMessages)).not.toContain(pcIdentity.key);
    acknowledgeEvents();
    await execute({ type: 'proxy.setRecording', payload: { recording: false } });
    await expect.poll(() => rpcMessages.some(message => message.kind === 'event-batch'
      && message.androidStatus?.recording === false)).toBe(true);
    acknowledgeEvents();
    const closed = once(session.peer, 'close');
    session.peer.close(1000);
    await closed;
    await expect.poll(() => rpcMessages.some(message => message.kind === 'event-batch'
      && message.androidStatus?.connected === false)).toBe(true);
  });

  it.each(['shutdown', 'rpc-close'] as const)(
    'waits for Android settlement before disposing Capture on %s',
    async reason => {
    const listening = await startAndroid();
    const session = await control(listening.port!);
    await exchange(session, '/shutdown');
    if (reason === 'rpc-close') attachRpc();
    const original = HttpRecording.prototype.settle;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let settling = false;
    vi.spyOn(HttpRecording.prototype, 'settle').mockImplementation(async function (this: HttpRecording) {
      settling = true;
      await held;
      return original.call(this);
    });
    const dispose = vi.spyOn(captureService, 'dispose');
    try {
      if (reason === 'rpc-close') rpcEvents.emit('close');
      else coreApplication.stop();
      await expect.poll(() => settling).toBe(true);
      expect(dispose).not.toHaveBeenCalled();
      expect(lifecycle.some(message => message.type === 'stopped')).toBe(false);
    } finally {
      release();
    }
    await expect.poll(() => vi.mocked(process.exit).mock.calls.length).toBe(1);
    expect(process.exit).toHaveBeenCalledWith(reason === 'shutdown' ? 0 : 1);
    expect(lifecycle.some(message => message.type === 'stopped')).toBe(reason === 'shutdown');
    expect(dispose).toHaveBeenCalledOnce();
    await assertPortReleased(listening.port!);
    },
  );

  it('closes a newly bound Android listener when its start command is cancelled', async () => {
    const abortController = new AbortController();
    const original = AndroidIngressService.prototype.start;
    let port: number | undefined;
    vi.spyOn(AndroidIngressService.prototype, 'start').mockImplementationOnce(async function (
      this: AndroidIngressService, options,
    ) {
      const address = await original.call(this, options);
      port = address.port;
      abortController.abort();
      return address;
    });
    await expect(execute({ type: 'android.start', payload: {
      identity: pcIdentity, devicePin: pin(deviceIdentity.cert),
      device: { id: 'android:test-device', name: 'Android · Test device' },
    } }, abortController.signal)).rejects.toThrow();
    expect(port).toBeTypeOf('number');
    await assertPortReleased(port!);
    expect(await status()).toMatchObject({ listening: false, captureSessionId: null });
    expect((await captureService.status()).sessionCount).toBe(0);
  });

  it('waits for an accepted Capture Clear before disposing its stores on Core shutdown', async () => {
    const originalCleanup = captureService.cleanup.bind(captureService);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let clearing = false;
    vi.spyOn(captureService, 'cleanup').mockImplementationOnce(async scope => {
      const result = await originalCleanup(scope);
      clearing = true;
      await held;
      return result;
    });
    const dispose = vi.spyOn(captureService, 'dispose');
    const cleared = execute({ type: 'capture.cleanup', payload: { scope: 'all' } });
    try {
      await expect.poll(() => clearing).toBe(true);
      coreApplication.stop();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(dispose).not.toHaveBeenCalled();
      expect(lifecycle.some(message => message.type === 'stopped')).toBe(false);
    } finally {
      release();
      await cleared;
    }
    await expect.poll(() => vi.mocked(process.exit).mock.calls.length).toBe(1);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('waits for a pending start and prevents it from surviving Core shutdown', async () => {
    const original = AndroidIngressService.prototype.start;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let port: number | undefined;
    vi.spyOn(AndroidIngressService.prototype, 'start').mockImplementationOnce(async function (
      this: AndroidIngressService, options,
    ) {
      const address = await original.call(this, options);
      port = address.port;
      await held;
      return address;
    });
    const starting = startAndroid();
    const cancelled = expect(starting).rejects.toThrow('Core is stopping');
    try {
      await expect.poll(() => port).toBeTypeOf('number');
      coreApplication.stop();
      expect(lifecycle.some(message => message.type === 'stopped')).toBe(false);
    } finally {
      release();
    }
    await cancelled;
    await expect.poll(() => vi.mocked(process.exit).mock.calls.length).toBe(1);
    await assertPortReleased(port!);
  });

  it('reports shutdown storage failures instead of announcing a successful stop', async () => {
    await startAndroid();
    const originalDispose = captureService.dispose.bind(captureService);
    vi.spyOn(captureService, 'dispose').mockImplementationOnce(async () => {
      await originalDispose();
      throw new Error('capture-dispose-failed');
    });
    coreApplication.stop();
    await expect.poll(() => vi.mocked(process.exit).mock.calls.length).toBe(1);
    expect(lifecycle).toContainEqual({ type: 'fatal', message: 'Core shutdown failed.' });
    expect(lifecycle.some(message => message.type === 'stopped')).toBe(false);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it.each([
    { phase: 'request', recording: true },
    { phase: 'request', recording: false },
    { phase: 'response', recording: true },
    { phase: 'response', recording: false },
  ] as const)('links and cancels the real $phase breakpoint with recording=$recording', async ({ phase, recording }) => {
    ruleService.setRuleSet({ revision: 1, nodes: [{
      kind: 'rule', id: 'pause-android', name: 'Pause Android', enabled: true, priority: 1,
      matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }],
      actions: [{ type: 'breakpoint', phase }],
    }] });
    await execute({ type: 'proxy.setRecording', payload: { recording } });
    const listening = await startAndroid();
    const session = await control(listening.port!);
    if (phase === 'response') {
      const httpExchange = await exchange(session, '/pending');
      send(httpExchange.peer, { ...httpExchange.envelope, type: 'http.response',
        stageId: randomUUID(), response: { statusCode: 200, headers: [] } });
    } else {
      const peer = await connect(listening.port!, '/android/v2/exchange', session.token);
      send(peer, { type: 'http.request', protocolVersion: 2, sessionId: session.sessionId,
        exchangeId: randomUUID(), stageId: randomUUID(),
        request: { method: 'GET', url: 'https://api.test/pending', httpVersion: '1.1', headers: [] } });
    }
    await expect.poll(() => breakpointQueue.list().length).toBe(1);
    const captured = (await captureService.querySessions(query)).items;
    expect(captured).toHaveLength(recording ? 1 : 0);
    expect(breakpointQueue.list()[0]?.snapshot.exchangeId).toBe(captured[0]?.id);
    expect(breakpointQueue.list()[0]?.phase).toBe(phase);
    await execute({ type: 'android.stop', payload: {} });
    expect(breakpointQueue.list()).toEqual([]);
    const finished = (await captureService.querySessions(query)).items;
    if (recording) expect(finished).toMatchObject([{ state: 'aborted' }]);
    else expect(finished).toEqual([]);
    await assertPortReleased(listening.port!);
  });
});

function pin(certificate: string): string {
  return `sha256/${createHash('sha256').update(new X509Certificate(certificate).publicKey
    .export({ type: 'spki', format: 'der' })).digest('base64')}`;
}

async function receive(peer: WebSocket, sessionId: string): Promise<InspectionHttpMessage> {
  const abortController = new AbortController();
  const options = { signal: abortController.signal };
  try {
    const [bytes, binary] = await Promise.race([
      once(peer, 'message', options),
      once(peer, 'close', options).then(() => { throw new Error('Inspection peer closed before the next reply.'); }),
    ]);
    if (binary) throw new Error('Expected an inspection JSON message');
    return parseInspectionMessage(bytes.toString(), sessionId);
  } finally {
    abortController.abort();
  }
}

function send(peer: WebSocket, message: InspectionHttpMessage): void {
  peer.send(JSON.stringify(message));
}

async function assertPortReleased(port: number): Promise<void> {
  const server = net.createServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
