import { randomUUID, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { Agent, createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { generateCACertificate } from 'mockttp';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RuleAction, WebSocketBreakpointSettings, WebSocketFrameDirection } from '@interceptor/core-protocol';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { HttpMessageService } from '../../../http-message/entry';
import { HttpInterceptionService } from '../../../http-interception/entry';
import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import type { InspectionHttpMessage } from '../../interfaces/inspection';
import type { InspectionCapability } from '../../interfaces';
import type { InspectionWebSocketFrame, InspectionWebSocketMessage } from '../../interfaces/websocket';
import { inspectionWebSocketOperationId } from '../../utils/websocket-ids';
import { parseInspectionWebSocketMessage } from '../../utils/websocket-protocol';
import { HttpChannel } from '../../internal/http-channel';
import { ObservedHttpRecording } from './observed-http-recording';
import { decodeInspectionChunk, encodeInspectionChunk, parseInspectionMessage } from '../../utils/inspection-protocol';

describe('HTTP copy channel over real WSS', () => {
  let identity: { key: string; cert: string };
  const cleanups: Array<() => Promise<void>> = [];
  beforeAll(async () => { identity = await generateCACertificate(); });
  afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

  async function setup(actions: RuleAction[] = [], recording: Partial<ObservedHttpRecording> = {},
    capabilities: readonly InspectionCapability[] = ['http']) {
    const sessionId = randomUUID();
    const exchangeId = randomUUID();
    const envelope = { protocolVersion: 2 as const, sessionId, exchangeId };
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({
      revision: 1, nodes: actions.length === 0 ? [] : [{
        kind: 'rule', id: 'mobile-rule', name: 'Mobile rule', priority: 1, enabled: true,
        matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }], actions,
      }],
    });
    const httpRecording = Object.assign(new ObservedHttpRecording(), recording);
    let webSocketSettings: WebSocketBreakpointSettings | null = null;
    let released = 0;
    let channel: HttpChannel | undefined;
    const server = createServer(identity);
    const webSocketServer = new WebSocketServer({ server, perMessageDeflate: false });
    const serverPeers = new Set<WebSocket>();
    webSocketServer.on('connection', socket => {
      serverPeers.add(socket);
      socket.once('close', () => serverPeers.delete(socket));
      channel = new HttpChannel(socket, sessionId, capabilities,
        new HttpInterceptionService(ruleService, new HttpMessageService()),
        ruleService, () => webSocketSettings,
        httpRecording, new CoreDiagnostics(), () => { released++; });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const agent = new Agent({
      ca: identity.cert,
      checkServerIdentity: (_hostname, certificate) =>
        certificate.raw.equals(new X509Certificate(identity.cert).raw)
          ? undefined : new Error('Unexpected test certificate'),
    });
    const peer = new WebSocket(`wss://127.0.0.1:${(server.address() as AddressInfo).port}`, { agent });
    const incoming: Array<{ data: Buffer; binary: boolean }> = [];
    peer.on('message', (data, binary) => {
      if (!Buffer.isBuffer(data)) throw new Error('Expected Buffer');
      incoming.push({ data, binary });
    });
    await once(peer, 'open');
    cleanups.push(async () => {
      peer.terminate();
      for (const socket of serverPeers) socket.terminate();
      breakpointQueue.closeAll();
      await new Promise<void>((resolve, reject) => webSocketServer.close(error => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      agent.destroy();
    });
    async function next() {
      await vi.waitFor(() => expect(incoming.length).toBeGreaterThan(0));
      return incoming.shift()!;
    }
    async function nextMessage() {
      const item = await next();
      expect(item.binary).toBe(false);
      return parseInspectionMessage(item.data.toString('utf8'), sessionId);
    }
    async function nextWebSocketMessage() {
      const item = await next();
      expect(item.binary).toBe(false);
      return parseInspectionWebSocketMessage(item.data.toString('utf8'), sessionId);
    }
    const send = (message: InspectionHttpMessage | InspectionWebSocketMessage) => peer.send(JSON.stringify(message));
    const request = (stageId = randomUUID()): Extract<InspectionHttpMessage, { type: 'http.request' }> => ({
      ...envelope, type: 'http.request', stageId,
      request: { method: 'POST', url: 'https://api.test/items', httpVersion: '2',
        headers: [['X-Tag', 'first'], ['x-tag', 'second'], ['X-Empty', '']] },
    });
    return {
      peer, envelope, send, request, next, nextMessage, messages: httpRecording.messages,
      chunks: httpRecording.chunks, breakpointQueue,
      channel: () => channel!, settled: () => httpRecording.settledCount, released: () => released,
      incoming,
      nextWebSocketMessage, frames: httpRecording.frames, traffic: () => httpRecording.traffic,
      setWebSocketSettings(settings: WebSocketBreakpointSettings | null) { webSocketSettings = settings; },
    };
  }

  async function prepareWebSocketUpgrade(lab: Awaited<ReturnType<typeof setup>>) {
    const request = lab.request();
    lab.send({ ...request, request: { ...request.request, method: 'GET', httpVersion: '1.1',
      headers: [['Connection', 'Upgrade'], ['Upgrade', 'websocket']] } });
    const requestDecision = await lab.nextMessage();
    if (requestDecision.type !== 'http.decision') throw new Error('Expected request decision');
    lab.send({ ...lab.envelope, type: 'http.applied',
      stageId: requestDecision.stageId, decisionId: requestDecision.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(),
      response: { statusCode: 101, headers: [['Connection', 'Upgrade'], ['Upgrade', 'websocket']] } });
    const responseDecision = await lab.nextMessage();
    if (responseDecision.type !== 'http.decision') throw new Error('Expected response decision');
    lab.send({ ...lab.envelope, type: 'http.applied',
      stageId: responseDecision.stageId, decisionId: responseDecision.decisionId });
    return { ...lab.envelope, type: 'http.upgraded' as const,
      stageId: responseDecision.stageId, decisionId: responseDecision.decisionId };
  }

  async function upgradeWebSocket(lab: Awaited<ReturnType<typeof setup>>) {
    const upgraded = await prepareWebSocketUpgrade(lab);
    lab.send(upgraded);
    expect(await lab.nextMessage()).toEqual({ ...upgraded, type: 'http.upgrade-ready' });
  }

  async function sendWebSocketOriginal(
    lab: Awaited<ReturnType<typeof setup>>, direction: WebSocketFrameDirection, sequence: number,
    frame: InspectionWebSocketFrame, content: Buffer, closeCode: number | null = null,
  ) {
    const message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }> = {
      ...lab.envelope, type: 'ws.message', direction, sequence, frame, byteLength: content.length, closeCode,
      stageId: inspectionWebSocketOperationId(lab.envelope.exchangeId, direction, sequence, 'message'),
      bodyId: inspectionWebSocketOperationId(lab.envelope.exchangeId, direction, sequence, 'original'),
    };
    lab.send(message);
    for (let offset = 0; offset < content.length; offset += 32768) {
      const payload = content.subarray(offset, offset + 32768);
      lab.peer.send(encodeInspectionChunk({ bodyId: message.bodyId, offset, payload }));
      expect(await lab.nextMessage()).toMatchObject({
        type: 'body.ack', bodyId: message.bodyId, offset: offset + payload.length,
      });
    }
    lab.send({ ...lab.envelope, type: 'body.end', bodyId: message.bodyId, byteLength: content.length, trailers: [] });
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.received', bodyId: message.bodyId, byteLength: content.length });
    return message;
  }

  async function nextWebSocketDecision(lab: Awaited<ReturnType<typeof setup>>) {
    const message = await lab.nextWebSocketMessage();
    if (message.type !== 'ws.decision') throw new Error('Expected WebSocket decision');
    return message;
  }

  async function closeWebSocket(lab: Awaited<ReturnType<typeof setup>>, clientSequence: number, serverSequence: number,
    requestBytes: number, responseBytes: number) {
    for (const [direction, sequence] of [['client-to-server', clientSequence], ['server-to-client', serverSequence]] as const) {
      await sendWebSocketOriginal(lab, direction, sequence, 'close', Buffer.alloc(0), 1000);
      const decision = await nextWebSocketDecision(lab);
      expect(decision.decision).toEqual({ action: 'bypass' });
      lab.send({ ...lab.envelope, type: 'ws.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    }
    lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes, responseBytes });
    expect((await lab.nextMessage()).type).toBe('exchange.completed');
    await vi.waitFor(() => expect(lab.released()).toBe(1));
  }

  it('upgrades the same WSS and explicitly decides every WS message and close', async () => {
    const lab = await setup([], {}, ['http', 'websocket']);
    await upgradeWebSocket(lab);
    const content = Buffer.alloc(70001, 0x61);
    const original = await sendWebSocketOriginal(lab, 'client-to-server', 0, 'binary', content);
    const decision = await nextWebSocketDecision(lab);
    expect(decision).toMatchObject({ stageId: original.stageId, decision: { action: 'bypass' } });
    expect(lab.frames).toHaveLength(1);
    expect(Buffer.from(lab.frames[0]!.content)).toEqual(content);
    expect(lab.traffic()).toEqual({ requestBytes: 0, responseBytes: 0 });
    lab.send({ ...lab.envelope, type: 'ws.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    await vi.waitFor(() => expect(lab.traffic()).toEqual({ requestBytes: 70001, responseBytes: 0 }));
    await closeWebSocket(lab, 1, 0, 70001, 0);
  });

  it('uses shared WS breakpoints for replacement and drop without replacing the captured original', async () => {
    const lab = await setup([], { captureId: 'captured-ws' }, ['http', 'websocket']);
    await upgradeWebSocket(lab);
    lab.setWebSocketSettings({ exchangeId: 'captured-ws', direction: 'both', frames: ['message'] });
    await sendWebSocketOriginal(lab, 'client-to-server', 0, 'text', Buffer.from('original'));
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    const pending = lab.breakpointQueue.list()[0]!;
    expect(pending.snapshot).toMatchObject({ exchangeId: 'captured-ws', webSocketFrameSequence: 1, body: 'original' });
    lab.breakpointQueue.resolve(pending.id, 'continue', { body: 'edited-by-pc' });
    const decision = await nextWebSocketDecision(lab);
    if (decision.decision.action !== 'replace') throw new Error('Expected replacement');
    const replacementId = decision.decision.body.bodyId;
    expect(replacementId).toBe(inspectionWebSocketOperationId(lab.envelope.exchangeId, 'client-to-server', 0, 'replacement'));
    const binary = await lab.next();
    expect(binary.binary).toBe(true);
    const chunk = decodeInspectionChunk(binary.data);
    expect(Buffer.from(chunk.payload).toString()).toBe('edited-by-pc');
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId: replacementId, offset: chunk.payload.byteLength });
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.end', bodyId: replacementId, byteLength: 12 });
    lab.send({ ...lab.envelope, type: 'body.received', bodyId: replacementId, byteLength: 12 });
    lab.send({ ...lab.envelope, type: 'ws.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    expect(Buffer.from(lab.frames[0]!.content).toString()).toBe('original');
    await sendWebSocketOriginal(lab, 'server-to-client', 0, 'text', Buffer.from('drop-me'));
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    lab.breakpointQueue.resolve(lab.breakpointQueue.list()[0]!.id, 'drop');
    const dropped = await nextWebSocketDecision(lab);
    expect(dropped.decision).toEqual({ action: 'drop' });
    lab.send({ ...lab.envelope, type: 'ws.applied', stageId: dropped.stageId, decisionId: dropped.decisionId });
    await closeWebSocket(lab, 1, 1, 12, 0);
  });

  it('drops a lifecycle-aborted WS suspension without inventing a connection cancellation', async () => {
    const lab = await setup([], { captureId: 'retired-ws' }, ['http', 'websocket']);
    await upgradeWebSocket(lab);
    lab.setWebSocketSettings({ exchangeId: 'retired-ws', direction: 'both', frames: ['message'] });
    await sendWebSocketOriginal(lab, 'client-to-server', 0, 'text', Buffer.from('pending'));
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    expect(lab.breakpointQueue.abortQueue('ws:retired-ws')).toBe(1);
    const incoming = await lab.next();
    expect(incoming.binary).toBe(false);
    expect(JSON.parse(incoming.data.toString('utf8'))).toMatchObject({ type: 'ws.decision', decision: { action: 'drop' } });
    const discarded = parseInspectionWebSocketMessage(incoming.data.toString('utf8'), lab.envelope.sessionId);
    if (discarded.type !== 'ws.decision') throw new Error('Expected WebSocket decision');
    expect(discarded.decision).toEqual({ action: 'drop' });
    lab.send({ ...lab.envelope, type: 'ws.applied', stageId: discarded.stageId, decisionId: discarded.decisionId });
    lab.setWebSocketSettings(null);
    await sendWebSocketOriginal(lab, 'client-to-server', 1, 'text', Buffer.from('next'));
    const continued = await nextWebSocketDecision(lab);
    expect(continued.decision).toEqual({ action: 'bypass' });
    lab.send({ ...lab.envelope, type: 'ws.applied', stageId: continued.stageId, decisionId: continued.decisionId });
    await closeWebSocket(lab, 2, 0, 4, 0);
  });

  it('cancels the active shared WS breakpoint and drains the upgraded exchange', async () => {
    const lab = await setup([], { captureId: 'cancel-ws' }, ['http', 'websocket']);
    await upgradeWebSocket(lab);
    lab.setWebSocketSettings({ exchangeId: 'cancel-ws', direction: 'both', frames: ['message'] });
    await sendWebSocketOriginal(lab, 'client-to-server', 0, 'text', Buffer.from('pending'));
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    lab.channel().cancel();
    const cancel = await lab.nextMessage();
    expect(cancel.type).toBe('exchange.cancel');
    if (cancel.type !== 'exchange.cancel') throw new Error('Expected cancellation');
    lab.send({ ...lab.envelope, type: 'exchange.cancelled', cancellationId: cancel.cancellationId });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.breakpointQueue.size).toBe(0);
    expect(lab.incoming).toEqual([]);
  });

  it('does not grant a WS upgrade to an HTTP-only negotiated session', async () => {
    const lab = await setup();
    lab.send(await prepareWebSocketUpgrade(lab));
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.incoming).toEqual([]);
  });

  it('requires separate request and response decisions and confirms actual completion', async () => {
    const lab = await setup();
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected decision');
    expect(decision.decision).toEqual({ action: 'bypass' });
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 200, headers: [] } });
    const response = await lab.nextMessage();
    if (response.type !== 'http.decision') throw new Error('Expected response decision');
    expect(response.phase).toBe('response');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
    lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
    expect((await lab.nextMessage()).type).toBe('exchange.completed');
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.settled()).toBeGreaterThan(0);
  });

  it('completes HTTP after the shared status rule replaces an origin upgrade', async () => {
    const lab = await setup([{ type: 'status', statusCode: 200 }]);
    const request = lab.request();
    lab.send({ ...request, request: { ...request.request, method: 'GET', httpVersion: '1.1',
      headers: [['Connection', 'Upgrade'], ['Upgrade', 'websocket'],
        ['Sec-WebSocket-Version', '13'], ['Sec-WebSocket-Key', 'dGhlIHNhbXBsZSBub25jZQ==']] } });
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected request decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(),
      response: { statusCode: 101, headers: [['Connection', 'Upgrade'], ['Upgrade', 'websocket'],
        ['Sec-WebSocket-Accept', 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=']] } });
    const response = await lab.nextMessage();
    expect(response).toMatchObject({ type: 'http.decision', phase: 'response',
      decision: { action: 'intercept', statusCode: 200 } });
    if (response.type !== 'http.decision') throw new Error('Expected response decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
    lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
    expect((await lab.nextMessage()).type).toBe('exchange.completed');
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.settled()).toBeGreaterThan(0);
  });

  it('closes explicitly instead of sending a manufactured upgrade decision', async () => {
    const lab = await setup([{ type: 'status', statusCode: 101 }]);
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected request decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 200, headers: [] } });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.incoming).toHaveLength(0);
    expect(lab.settled()).toBeGreaterThan(0);
    expect(lab.breakpointQueue.size).toBe(0);
  });

  it('settles recording ownership after a queued recording operation rejects', async () => {
    const lab = await setup([], { async recordMessage() { throw new Error('Recording rejected'); } });
    const closed = once(lab.peer, 'close');
    lab.send(lab.request());
    await closed;
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.settled()).toBeGreaterThan(0);
  });

  it('returns edited headers while preserving unedited duplicate order and empty values', async () => {
    const lab = await setup([{ type: 'header', phase: 'request', op: 'set', name: 'x-edited', value: 'yes' }]);
    lab.send(lab.request());
    const message = await lab.nextMessage();
    expect(message.type).toBe('http.decision');
    if (message.type !== 'http.decision' || message.decision.action !== 'intercept') throw new Error('Expected edit');
    expect(message.decision.headers).toEqual([
      ['X-Tag', 'first'], ['x-tag', 'second'], ['X-Empty', ''], ['x-edited', 'yes'],
    ]);
  });

  it('sends exact replacement content in acknowledged binary chunks', async () => {
    const text = 'x'.repeat(32769);
    const lab = await setup([{ type: 'synthetic', statusCode: 200, headers: [], body: text }]);
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision' || decision.decision.action !== 'respond') throw new Error('Expected synthetic');
    const bodyId = decision.decision.body.bodyId;
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    const first = await lab.next();
    expect(first.binary).toBe(true);
    const chunk = decodeInspectionChunk(first.data);
    expect(chunk.payload.byteLength).toBe(32768);
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId, offset: 32768 });
    const second = decodeInspectionChunk((await lab.next()).data);
    expect(second.offset).toBe(32768);
    expect(second.payload.byteLength).toBe(1);
    expect(Buffer.concat([Buffer.from(chunk.payload), Buffer.from(second.payload)]))
      .toEqual(Buffer.from(text));
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId, offset: 32769 });
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.end', bodyId, byteLength: 32769, trailers: [] });
    lab.send({ ...lab.envelope, type: 'body.received', bodyId, byteLength: 32769 });
  });

  it('finishes a replacement end before another phase starts sending its replacement', async () => {
    let allowResponse!: () => void;
    let responseStarted!: () => void;
    let allowEnd!: () => void;
    let endStarted!: () => void;
    const responseGate = new Promise<void>(resolve => { allowResponse = resolve; });
    const responseRecording = new Promise<void>(resolve => { responseStarted = resolve; });
    const endGate = new Promise<void>(resolve => { allowEnd = resolve; });
    const endRecording = new Promise<void>(resolve => { endStarted = resolve; });
    let requestBodyId: string;
    const lab = await setup([
      { type: 'body', phase: 'request', format: 'text', content: 'req' },
      { type: 'body', phase: 'response', format: 'text', content: 'resp' },
    ], {
      async recordMessage(message) {
        if (message.type === 'http.decision' && message.phase === 'response') {
          responseStarted();
          await responseGate;
        }
        if (message.type === 'body.end' && message.bodyId === requestBodyId) {
          endStarted();
          await endGate;
        }
      },
    });
    try {
      lab.send(lab.request());
      const request = await lab.nextMessage();
      if (request.type !== 'http.decision' || request.decision.action !== 'intercept'
        || request.decision.body.action !== 'replace') throw new Error('Expected request replacement');
      requestBodyId = request.decision.body.bodyId;
      expect(Buffer.from(decodeInspectionChunk((await lab.next()).data).payload)).toEqual(Buffer.from('req'));
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: request.stageId, decisionId: request.decisionId });
      lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 200, headers: [] } });
      await responseRecording;
      lab.send({ ...lab.envelope, type: 'body.ack', bodyId: requestBodyId, offset: 3 });
      const pong = once(lab.peer, 'pong');
      lab.peer.ping();
      await pong;
      allowResponse();
      await endRecording;
      const response = await lab.nextMessage();
      if (response.type !== 'http.decision' || response.decision.action !== 'intercept'
        || response.decision.body.action !== 'replace') throw new Error('Expected response replacement');
      const afterDecision = once(lab.peer, 'pong');
      lab.peer.ping();
      await afterDecision;
      expect(lab.incoming).toHaveLength(0);
      allowEnd();
      expect(await lab.nextMessage()).toMatchObject({ type: 'body.end', bodyId: requestBodyId, byteLength: 3 });
      const replacement = await lab.next();
      expect(replacement.binary).toBe(true);
      expect(decodeInspectionChunk(replacement.data)).toMatchObject({
        bodyId: response.decision.body.bodyId, offset: 0, payload: new Uint8Array(Buffer.from('resp')),
      });
      const responseBodyId = response.decision.body.bodyId;
      lab.send({ ...lab.envelope, type: 'body.received', bodyId: requestBodyId, byteLength: 3 });
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
      lab.send({ ...lab.envelope, type: 'body.ack', bodyId: responseBodyId, offset: 4 });
      expect(await lab.nextMessage()).toMatchObject({ type: 'body.end', bodyId: responseBodyId, byteLength: 4 });
      lab.send({ ...lab.envelope, type: 'body.received', bodyId: responseBodyId, byteLength: 4 });
      lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 3, responseBytes: 4 });
      expect((await lab.nextMessage()).type).toBe('exchange.completed');
      await vi.waitFor(() => expect(lab.released()).toBe(1));
    } finally {
      allowResponse();
      allowEnd();
    }
  });

  it('acknowledges original content only after its consumer receives the exact bytes', async () => {
    const lab = await setup();
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    const bodyId = randomUUID();
    lab.send({ ...lab.envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength: 3 });
    lab.peer.send(encodeInspectionChunk({ bodyId, offset: 0, payload: new Uint8Array([0, 255, 1]) }));
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.ack', bodyId, offset: 3 });
    expect(lab.chunks).toEqual([{ bodyId, offset: 0, payload: new Uint8Array([0, 255, 1]) }]);
    lab.send({ ...lab.envelope, type: 'body.end', bodyId, byteLength: 3, trailers: [] });
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.received', bodyId, byteLength: 3 });
  });

  it('records an incomplete upload before acknowledging it and can complete the response normally', async () => {
    let recorded = false;
    let allowRecord!: () => void;
    const recordGate = new Promise<void>(resolve => { allowRecord = resolve; });
    const lab = await setup([], { async recordMessage(message) {
      if (message.type === 'body.stopped') {
        recorded = true;
        await recordGate;
      }
    } });
    try {
      lab.send(lab.request());
      const request = await lab.nextMessage();
      if (request.type !== 'http.decision') throw new Error('Expected request decision');
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: request.stageId, decisionId: request.decisionId });
      lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 413, headers: [] } });
      const response = await lab.nextMessage();
      if (response.type !== 'http.decision') throw new Error('Expected response decision');
      const bodyId = randomUUID();
      lab.send({ ...lab.envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 100 });
      lab.send({ ...lab.envelope, type: 'body.stopped', bodyId, byteLength: 0, reason: 'early-response' });
      await vi.waitFor(() => expect(recorded).toBe(true));
      expect(lab.incoming).toHaveLength(0);
      allowRecord();
      expect(await lab.nextMessage()).toMatchObject({ type: 'body.received', bodyId, byteLength: 0 });
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
      lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
      expect((await lab.nextMessage()).type).toBe('exchange.completed');
      await vi.waitFor(() => expect(lab.released()).toBe(1));
    } finally {
      allowRecord();
    }
  });

  it('stops a discarded request replacement and ignores its ack while the response replacement owes one', async () => {
    const lab = await setup([
      { type: 'body', phase: 'request', format: 'text', content: 'q'.repeat(70001) },
      { type: 'body', phase: 'response', format: 'text', content: 'response' },
    ]);
    lab.send(lab.request());
    const request = await lab.nextMessage();
    if (request.type !== 'http.decision' || request.decision.action !== 'intercept'
      || request.decision.body.action !== 'replace') throw new Error('Expected request replacement');
    const requestBodyId = request.decision.body.bodyId;
    const first = decodeInspectionChunk((await lab.next()).data);
    expect(first.payload.byteLength).toBe(32768);
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: request.stageId, decisionId: request.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 413, headers: [] } });
    const response = await lab.nextMessage();
    if (response.type !== 'http.decision' || response.decision.action !== 'intercept'
      || response.decision.body.action !== 'replace') throw new Error('Expected response replacement');
    const responseBodyId = response.decision.body.bodyId;
    lab.send({ ...lab.envelope, type: 'body.discard', bodyId: requestBodyId });
    expect(await lab.nextMessage()).toMatchObject({
      type: 'body.stopped', bodyId: requestBodyId, byteLength: 32768, reason: 'early-response',
    });
    const next = await lab.next();
    expect(next.binary).toBe(true);
    expect(decodeInspectionChunk(next.data)).toMatchObject({ bodyId: responseBodyId, offset: 0 });
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId: requestBodyId, offset: 32768 });
    const pong = once(lab.peer, 'pong');
    lab.peer.ping();
    await pong;
    expect(lab.incoming).toHaveLength(0);
    lab.send({ ...lab.envelope, type: 'body.received', bodyId: requestBodyId, byteLength: 32768 });
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId: responseBodyId, offset: 8 });
    expect(await lab.nextMessage()).toMatchObject({ type: 'body.end', bodyId: responseBodyId, byteLength: 8 });
    lab.send({ ...lab.envelope, type: 'body.received', bodyId: responseBodyId, byteLength: 8 });
    lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
    expect((await lab.nextMessage()).type).toBe('exchange.completed');
    await vi.waitFor(() => expect(lab.released()).toBe(1));
  });

  it('processes Android cancel while a real shared breakpoint is suspended', async () => {
    const lab = await setup([{ type: 'breakpoint', phase: 'request' }]);
    lab.send(lab.request());
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    const cancellationId = randomUUID();
    lab.send({ ...lab.envelope, type: 'exchange.cancel', cancellationId, reason: 'client-closed' });
    expect(await lab.nextMessage()).toMatchObject({ type: 'exchange.cancelled', cancellationId });
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(0));
    await vi.waitFor(() => expect(lab.released()).toBe(1));
  });

  it('records exact trailers before confirming the body end on WSS', async () => {
    let consume!: () => void;
    let recordingEnd = false;
    const trailers: Array<[string, string]> = [['X-Tag', 'one'], ['x-tag', 'two'], ['X-Empty', '']];
    const consumed = new Promise<void>(resolve => { consume = resolve; });
    const lab = await setup([], {
      async recordMessage(message) {
        if (message.type === 'body.end') {
          expect(message.trailers).toEqual(trailers);
          recordingEnd = true;
          await consumed;
        }
      },
    });
    try {
      lab.send(lab.request());
      const decision = await lab.nextMessage();
      if (decision.type !== 'http.decision') throw new Error('Expected decision');
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
      const bodyId = randomUUID();
      lab.send({ ...lab.envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength: 0 });
      lab.send({ ...lab.envelope, type: 'body.end', bodyId, byteLength: 0, trailers });
      await vi.waitFor(() => expect(recordingEnd).toBe(true));
      expect(lab.incoming).toEqual([]);
      consume();
      expect(await lab.nextMessage()).toEqual({ ...lab.envelope, type: 'body.received', bodyId, byteLength: 0 });
    } finally {
      consume();
    }
  });

  it('sends PC cancellation and waits for Android acknowledgement before releasing the channel', async () => {
    const lab = await setup([{ type: 'breakpoint', phase: 'request' }]);
    lab.send(lab.request());
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    lab.channel().cancel();
    lab.channel().cancel();
    const message = await lab.nextMessage();
    if (message.type !== 'exchange.cancel') throw new Error('Expected cancel');
    expect(lab.released()).toBe(0);
    lab.send({ ...lab.envelope, type: 'exchange.cancelled', cancellationId: message.cancellationId });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.breakpointQueue.size).toBe(0);
  });

  it('cancels pending rules on abrupt transport loss and releases exactly once', async () => {
    const lab = await setup([{ type: 'breakpoint', phase: 'request' }]);
    lab.send(lab.request());
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    lab.peer.terminate();
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.breakpointQueue.size).toBe(0);
    lab.channel().close();
    expect(lab.released()).toBe(1);
  });

  it('returns response edits through the same channel instead of bypassing after request approval', async () => {
    const lab = await setup([{ type: 'status', statusCode: 202 }]);
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected request decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: {
      statusCode: 200, headers: [['Set-Cookie', 'one'], ['Set-Cookie', 'two']],
    } });
    const response = await lab.nextMessage();
    expect(response).toMatchObject({ type: 'http.decision', phase: 'response', decision: {
      action: 'intercept', statusCode: 202, headers: [['Set-Cookie', 'one'], ['Set-Cookie', 'two']], body: { action: 'keep' },
    } });
  });

  it('does not acknowledge a body block before its consumer has completed', async () => {
    let consume!: () => void;
    let consuming = false;
    const consumed = new Promise<void>(resolve => { consume = resolve; });
    const lab = await setup([], { recordChunk: () => { consuming = true; return consumed; } });
    try {
      lab.send(lab.request());
      const decision = await lab.nextMessage();
      if (decision.type !== 'http.decision') throw new Error('Expected decision');
      lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
      const bodyId = randomUUID();
      lab.send({ ...lab.envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength: 1 });
      lab.peer.send(encodeInspectionChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }));
      await vi.waitFor(() => expect(consuming).toBe(true));
      expect(lab.incoming).toHaveLength(0);
      consume();
      expect((await lab.nextMessage()).type).toBe('body.ack');
    } finally {
      consume();
    }
  });

  it('fails explicitly rather than acknowledging a body that could not be consumed', async () => {
    const lab = await setup([], { async recordChunk() { throw new Error('Storage failed'); } });
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision') throw new Error('Expected decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    const bodyId = randomUUID();
    lab.send({ ...lab.envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength: 1 });
    lab.peer.send(encodeInspectionChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }));
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.incoming).toHaveLength(0);
  });

  it('does not return success when terminal recording fails', async () => {
    const lab = await setup([], { async settle() { throw new Error('Storage failed'); } });
    lab.send(lab.request());
    const request = await lab.nextMessage();
    if (request.type !== 'http.decision') throw new Error('Expected decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: request.stageId, decisionId: request.decisionId });
    lab.send({ ...lab.envelope, type: 'http.response', stageId: randomUUID(), response: { statusCode: 200, headers: [] } });
    const response = await lab.nextMessage();
    if (response.type !== 'http.decision') throw new Error('Expected decision');
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: response.stageId, decisionId: response.decisionId });
    lab.send({ ...lab.envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.incoming).toHaveLength(0);
  });

  it('rejects Android trying to send a PC decision and releases pending breakpoints', async () => {
    const lab = await setup([{ type: 'breakpoint', phase: 'request' }]);
    const request = lab.request();
    if (request.type !== 'http.request') throw new Error('Expected request');
    lab.send(request);
    await vi.waitFor(() => expect(lab.breakpointQueue.size).toBe(1));
    lab.send({ ...lab.envelope, type: 'http.decision', stageId: request.stageId,
      decisionId: randomUUID(), phase: 'request', decision: { action: 'bypass' } });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.breakpointQueue.size).toBe(0);
    expect(lab.incoming).toHaveLength(0);
  });

  it('lets cancellation win over a content acknowledgement already in flight', async () => {
    const lab = await setup([{ type: 'synthetic', statusCode: 200, headers: [], body: 'replacement' }]);
    lab.send(lab.request());
    const decision = await lab.nextMessage();
    if (decision.type !== 'http.decision' || decision.decision.action !== 'respond') throw new Error('Expected synthetic');
    await lab.next();
    lab.channel().cancel();
    const cancellation = await lab.nextMessage();
    if (cancellation.type !== 'exchange.cancel') throw new Error('Expected cancellation');
    lab.send({ ...lab.envelope, type: 'body.ack', bodyId: decision.decision.body.bodyId, offset: 11 });
    lab.send({ ...lab.envelope, type: 'http.applied', stageId: decision.stageId, decisionId: decision.decisionId });
    lab.send({ ...lab.envelope, type: 'exchange.cancelled', cancellationId: cancellation.cancellationId });
    await vi.waitFor(() => expect(lab.released()).toBe(1));
    expect(lab.incoming).toHaveLength(0);
  });
});
