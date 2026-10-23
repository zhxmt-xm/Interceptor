import { randomUUID, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { Agent, createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCACertificate } from 'mockttp';
import WebSocket, { WebSocketServer } from 'ws';

const { locations } = vi.hoisted(() => ({ locations: { captureTemp: '' } }));
vi.mock('../../../constants', async importOriginal => ({
  ...await importOriginal<typeof import('../../../constants')>(),
  get captureTempDirectory() { return locations.captureTemp; },
}));

import { CaptureService } from '../../../capture/entry';
import { BodyWriter } from '../../../capture/internal/body-writer';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { CaptureEventQueue } from '../../../proxy/internal/capture-event-queue';
import { HttpMessageService } from '../../../http-message/entry';
import { HttpInterceptionService } from '../../../http-interception/entry';
import { RuleService } from '../../../rules/entry';
import { BreakpointQueue } from '../../../rules/internal/breakpoint-queue';
import type {
  InspectionHeaders, InspectionHttpMessage, InspectionRequestDecision, InspectionResponseDecision,
} from '../../interfaces/inspection';
import type { InspectionRuleOutcome } from '../../interfaces/recording';
import type { InspectionWebSocketMessage } from '../../interfaces/websocket';
import { HttpRecording } from '../../internal/http-recording';
import { HttpChannel } from '../../internal/http-channel';
import { parseInspectionMessage } from '../../utils/inspection-protocol';

describe('Android HTTP recording through real Capture', () => {
  let directory: string;
  let captureService: CaptureService;
  let captureEventQueue: CaptureEventQueue;
  let diagnostics: CoreDiagnostics;
  const envelope = { protocolVersion: 2 as const, sessionId: randomUUID(), exchangeId: randomUUID() };
  const emptyOutcome: InspectionRuleOutcome = { hits: [], headerEffects: [] };

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-http-recording-'));
    locations.captureTemp = path.join(directory, 'capture-temp');
    captureService = new CaptureService();
    captureEventQueue = new CaptureEventQueue();
    diagnostics = new CoreDiagnostics({ sink() {} });
    await captureService.initialize();
    await captureService.ensureSession({ id: 'recording', name: 'Recording', startedAt: 1,
      captureMode: 'android', appVersion: '0.1.0' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await captureService.dispose();
    await fs.rm(directory, { recursive: true, force: true });
  });

  function createRecording(recording = true) {
    return new HttpRecording(captureService, captureEventQueue, {
      sessionId: 'recording',
      recording,
      appId: 'android:test-device',
      appName: 'Android · Test device',
    }, diagnostics);
  }

  async function request(httpRecording: HttpRecording) {
    const stageId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'http.request', stageId,
      request: { method: 'POST', url: 'https://api.test/items?one=1', httpVersion: '1.1',
        headers: [['X-Tag', 'one'], ['x-tag', 'two'], ['X-Empty', ''], ['Content-Type', 'text/plain']] } }, 'android');
    return stageId;
  }

  async function decision(
    httpRecording: HttpRecording, stageId: string,
    value: { phase: 'request'; decision: InspectionRequestDecision }
      | { phase: 'response'; decision: InspectionResponseDecision },
    outcome = emptyOutcome,
  ) {
    const decisionId = randomUUID();
    await httpRecording.recordRuleOutcome(stageId, outcome);
    const message: InspectionHttpMessage = { ...envelope, type: 'http.decision', stageId, decisionId, ...value };
    await httpRecording.recordMessage(message, 'pc');
    return { ...envelope, type: 'http.applied' as const, stageId, decisionId };
  }

  async function body(
    httpRecording: HttpRecording, phase: 'request' | 'response', role: 'original' | 'applied',
    content: Buffer, trailers: InspectionHeaders = [],
  ) {
    const bodyId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId, phase, role,
      byteLength: content.byteLength }, 'android');
    for (let offset = 0; offset < content.byteLength; offset += 32768) {
      await httpRecording.recordChunk({ bodyId, offset, payload: content.subarray(offset, offset + 32768) });
    }
    await httpRecording.recordMessage({ ...envelope, type: 'body.end', bodyId, byteLength: content.byteLength, trailers }, 'android');
  }

  it('creates an independent Capture exchange at request headers before any PC decision', async () => {
    const httpRecording = createRecording();
    await request(httpRecording);
    const detail = await captureService.getExchangeDetail(httpRecording.exchangeId);
    expect(httpRecording.exchangeId).not.toBe(envelope.exchangeId);
    expect(detail).toMatchObject({ url: 'https://api.test/items?one=1', scheme: 'https', port: 443,
      summary: {
        method: 'POST', protocol: 'http/1.1', state: 'pending', requestBytes: 0, responseBytes: 0,
        appId: 'android:test-device', appName: 'Android · Test device',
      } });
    expect(detail?.requestHeaders.slice(0, 3)).toEqual([
      { name: 'X-Tag', value: 'one' }, { name: 'x-tag', value: 'two' }, { name: 'X-Empty', value: '' },
    ]);
    expect(captureEventQueue.drain(10)).toMatchObject([{
      kind: 'exchange-added',
      summary: { id: httpRecording.exchangeId, appId: 'android:test-device', appName: 'Android · Test device' },
    }]);
    await httpRecording.settle();
    expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary.state).toBe('aborted');
  });

  it('records original WS messages and only publishes actual applied transfer totals', async () => {
    const httpRecording = createRecording();
    const requestStageId = await request(httpRecording);
    expect(captureEventQueue.drain(10)).toMatchObject([{ kind: 'exchange-added' }]);
    await httpRecording.recordMessage(await decision(httpRecording, requestStageId,
      { phase: 'request', decision: { action: 'bypass' } }), 'android');
    const responseStageId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'http.response', stageId: responseStageId,
      response: { statusCode: 101, headers: [['Upgrade', 'websocket']] } }, 'android');
    const applied = await decision(httpRecording, responseStageId, { phase: 'response', decision: { action: 'bypass' } });
    await httpRecording.recordMessage(applied, 'android');
    await httpRecording.recordMessage({ ...applied, type: 'http.upgraded' }, 'android');
    const content = Buffer.alloc(70001, 0x61);
    const message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }> = {
      ...envelope, type: 'ws.message', stageId: randomUUID(), bodyId: randomUUID(),
      direction: 'client-to-server', sequence: 0, frame: 'text', byteLength: content.length, closeCode: null,
    };
    expect(await httpRecording.recordWebSocketFrame(message, content, 1234)).toBe(1);
    const frame = (await captureService.queryWebSocketFrames({ exchangeId: httpRecording.exchangeId, limit: 10 })).items[0]!;
    expect(frame).toMatchObject({ seq: 1, direction: 'client-to-server', opcode: 1, payloadSize: 70001, timestamp: 1234 });
    expect(await captureService.readBodyRange(frame.payload!.bodyHash!, 0, content.length)).toEqual(content);
    expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary)
      .toMatchObject({ protocol: 'ws', requestBytes: 0, responseBytes: 0 });
    await httpRecording.updateWebSocketTraffic(2, 3);
    expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary)
      .toMatchObject({ requestBytes: 2, responseBytes: 3 });
    expect(captureEventQueue.drain(20).some(event => event.kind === 'exchange-updated' && event.summary.protocol === 'ws')).toBe(true);
    await httpRecording.recordMessage({ ...envelope, type: 'exchange.complete', requestBytes: 2, responseBytes: 3 }, 'android');
    await httpRecording.settle();
  });

  it('keeps WS recording paused or cleared without creating late frame records', async () => {
    for (const paused of [true, false]) {
      const httpRecording = createRecording(!paused);
      await request(httpRecording);
      if (!paused) await captureService.cleanup({ kind: 'all' });
      const message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }> = {
        ...envelope, type: 'ws.message', stageId: randomUUID(), bodyId: randomUUID(),
        direction: 'server-to-client', sequence: 0, frame: 'binary', byteLength: 3, closeCode: null,
      };
      expect(await httpRecording.recordWebSocketFrame(message, Buffer.from([1, 2, 3]), 1234)).toBeUndefined();
      await httpRecording.updateWebSocketTraffic(0, 3);
      expect(await captureService.getExchangeDetail(httpRecording.exchangeId)).toBeNull();
      expect((await captureService.queryWebSocketFrames({ exchangeId: httpRecording.exchangeId, limit: 10 })).items).toEqual([]);
      await httpRecording.settle();
    }
  });

  it('records real channel rule results only after the WSS application acknowledgement', async () => {
    const identity = await generateCACertificate();
    const server = createServer(identity);
    const webSocketServer = new WebSocketServer({ server });
    const breakpointQueue = new BreakpointQueue();
    const ruleService = new RuleService(breakpointQueue);
    ruleService.setRuleSet({ revision: 1, nodes: [{ kind: 'rule', id: 'real-rule', name: 'Real rule',
      priority: 1, enabled: true, matchers: [{ type: 'host', mode: 'exact', value: 'api.test' }],
      actions: [{ type: 'header', phase: 'request', op: 'set', name: 'x-real-rule', value: 'yes' }] }] });
    const httpRecording = createRecording();
    let httpChannel: HttpChannel | undefined;
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    webSocketServer.on('connection', socket => {
      httpChannel = new HttpChannel(socket, envelope.sessionId, ['http'],
        new HttpInterceptionService(ruleService, new HttpMessageService()), ruleService, () => null,
        httpRecording, diagnostics, release);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const expectedCertificate = new X509Certificate(identity.cert);
    const agent = new Agent({ ca: identity.cert, checkServerIdentity: (_host, certificate) =>
      certificate.raw.equals(expectedCertificate.raw) ? undefined : new Error('Unexpected WSS identity') });
    const peer = new WebSocket(`wss://127.0.0.1:${(server.address() as AddressInfo).port}`, { agent });
    try {
      await once(peer, 'open');
      const received = once(peer, 'message');
      peer.send(JSON.stringify({ ...envelope, type: 'http.request', stageId: randomUUID(),
        request: { method: 'GET', url: 'https://api.test/', httpVersion: '1.1', headers: [] } }));
      const [bytes] = await received;
      if (!Buffer.isBuffer(bytes)) throw new Error('Expected WSS Buffer');
      const result = parseInspectionMessage(bytes.toString('utf8'), envelope.sessionId);
      if (result.type !== 'http.decision') throw new Error('Expected request decision');
      expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary.ruleIds).toBeUndefined();
      peer.send(JSON.stringify({ ...envelope, type: 'http.applied', stageId: result.stageId, decisionId: result.decisionId }));
      await vi.waitFor(async () => {
        expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary.ruleIds).toEqual(['real-rule']);
      });
      expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.requestHeaders)
        .toContainEqual({ name: 'x-real-rule', value: 'yes', ruleEffect: 'set', ruleId: 'real-rule' });
    } finally {
      peer.terminate();
      httpChannel?.close();
      if (httpChannel) await released;
      breakpointQueue.closeAll();
      await new Promise<void>((resolve, reject) => webSocketServer.close(error => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      agent.destroy();
    }
  });

  it.each(['request', 'response'] as const)('stores %s replacement from actual applied bytes and keeps Original evidence', async phase => {
    const httpRecording = createRecording();
    const requestStage = await request(httpRecording);
    let stageId = requestStage;
    if (phase === 'response') {
      await httpRecording.recordMessage(await decision(httpRecording, requestStage, { phase: 'request', decision: { action: 'bypass' } }), 'android');
      stageId = randomUUID();
      await httpRecording.recordMessage({ ...envelope, type: 'http.response', stageId,
        response: { statusCode: 200, headers: [['Content-Type', 'text/plain']] } }, 'android');
    }
    const outcome: InspectionRuleOutcome = {
      hits: [{ ruleId: 'body-rule', ruleRevision: 1, phase, action: 'body', summary: 'replace' }],
      headerEffects: [{ ruleId: 'body-rule', phase, effect: 'set', name: 'X-Edited', value: 'yes' }],
      bodyEffect: { ruleId: 'body-rule', phase, effect: 'replace', source: 'text' },
    };
    const replacement = { action: 'replace' as const, bodyId: randomUUID(), byteLength: 5 };
    const applied = await decision(httpRecording, stageId, phase === 'request'
      ? { phase: 'request', decision: { action: 'intercept', method: 'POST', url: 'https://api.test/items?one=1',
        headers: [['Content-Type', 'text/plain'], ['X-Edited', 'yes']], editedHeaderNames: ['x-edited'],
        body: replacement, delayMs: 0 } }
      : { phase: 'response', decision: { action: 'intercept', statusCode: 202, headers: [['Content-Type', 'text/plain'], ['X-Edited', 'yes']],
        editedHeaderNames: ['x-edited'], body: replacement, delayMs: 0 } }, outcome);
    expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.summary.ruleIds).toBeUndefined();
    await httpRecording.recordMessage(applied, 'android');
    await body(httpRecording, phase, 'original', Buffer.from('original'), [['X-Original-Trailer', 'only-original']]);
    await body(httpRecording, phase, 'applied', Buffer.from('phone'));
    const detail = await captureService.getExchangeDetail(httpRecording.exchangeId);
    const final = phase === 'request' ? detail?.requestBody : detail?.responseBody;
    const effect = phase === 'request' ? detail?.requestBodyEffect : detail?.responseBodyEffect;
    expect(final?.encodedSize).toBe(5);
    expect(effect).toMatchObject({ ruleId: 'body-rule', source: 'text', originalState: 'available' });
    expect((await captureService.readBodyRange(final!.bodyHash!, 0, 99)).toString()).toBe('phone');
    expect((await captureService.readBodyRange(effect!.originalBody!.bodyHash!, 0, 99)).toString()).toBe('original');
    expect(phase === 'request' ? detail?.requestTrailers : detail?.responseTrailers).toEqual([]);
    expect(detail?.summary.ruleIds).toEqual(['body-rule']);
    await httpRecording.settle();
  });

  it.each([Buffer.alloc(0), Buffer.from('prefix')])(
    'keeps a stopped response original separate from the complete applied replacement (%s)', async prefix => {
      const httpRecording = createRecording();
      const requestStageId = await request(httpRecording);
      await httpRecording.recordMessage(await decision(httpRecording, requestStageId,
        { phase: 'request', decision: { action: 'bypass' } }), 'android');
      const responseStageId = randomUUID();
      await httpRecording.recordMessage({ ...envelope, type: 'http.response', stageId: responseStageId,
        response: { statusCode: 200, headers: [['Content-Type', 'text/event-stream']] } }, 'android');
      const applied = await decision(httpRecording, responseStageId, {
        phase: 'response', decision: { action: 'intercept', statusCode: 202, headers: [['Content-Type', 'text/plain']],
          editedHeaderNames: ['content-type'], body: { action: 'replace', bodyId: randomUUID(), byteLength: 3 }, delayMs: 0 },
      }, { hits: [], headerEffects: [], bodyEffect: { ruleId: 'replacement', phase: 'response', effect: 'replace', source: 'text' } });
      await httpRecording.recordMessage(applied, 'android');
      const bodyId = randomUUID();
      await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId, phase: 'response',
        role: 'original', byteLength: null }, 'android');
      if (prefix.length) await httpRecording.recordChunk({ bodyId, offset: 0, payload: prefix });
      await httpRecording.recordMessage({ ...envelope, type: 'body.stopped', bodyId,
        byteLength: prefix.length, reason: 'response-replaced' }, 'android');
      await body(httpRecording, 'response', 'applied', Buffer.from('NEW'));
      await httpRecording.recordMessage({ ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 3 }, 'android');
      await httpRecording.settle();
      const detail = await captureService.getExchangeDetail(httpRecording.exchangeId);
      expect(detail).toMatchObject({ summary: { state: 'completed', statusCode: 202, responseBytes: 3 },
        responseBody: { encodedSize: 3, truncated: false },
        responseBodyEffect: prefix.length
          ? { originalState: 'available', originalBody: { encodedSize: prefix.length, truncated: true } }
          : { originalState: 'unavailable' },
        responseTrailers: [] });
      expect(await captureService.readBodyRange(detail!.responseBody!.bodyHash!, 0, 99)).toEqual(Buffer.from('NEW'));
      if (prefix.length) {
        expect(await captureService.readBodyRange(detail!.responseBodyEffect!.originalBody!.bodyHash!, 0, 99)).toEqual(prefix);
      } else {
        expect(detail!.responseBodyEffect!.originalBody).toBeUndefined();
      }
    },
  );

  it('records stopped upload prefixes as truncated while allowing a completed exchange', async () => {
    const httpRecording = createRecording();
    const stageId = await request(httpRecording);
    await httpRecording.recordMessage(await decision(httpRecording, stageId, { phase: 'request', decision: { action: 'bypass' } }), 'android');
    const bodyId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 100 }, 'android');
    await httpRecording.recordChunk({ bodyId, offset: 0, payload: Buffer.from('prefix') });
    await httpRecording.recordMessage({ ...envelope, type: 'body.stopped', bodyId, byteLength: 6, reason: 'early-response' }, 'android');
    await httpRecording.recordMessage({ ...envelope, type: 'exchange.complete', requestBytes: 6, responseBytes: 0 }, 'android');
    await httpRecording.settle();
    expect(await captureService.getExchangeDetail(httpRecording.exchangeId)).toMatchObject({
      summary: { state: 'completed', requestBytes: 6, responseBytes: 0 }, requestBody: { encodedSize: 6, truncated: true },
    });
  });

  it('settles an interrupted response as a readable truncated prefix and does not invent completion', async () => {
    const httpRecording = createRecording();
    const stageId = await request(httpRecording);
    await httpRecording.recordMessage(await decision(httpRecording, stageId, { phase: 'request', decision: { action: 'bypass' } }), 'android');
    const responseStageId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'http.response', stageId: responseStageId,
      response: { statusCode: 200, headers: [] } }, 'android');
    await httpRecording.recordMessage(await decision(httpRecording, responseStageId, { phase: 'response', decision: { action: 'bypass' } }), 'android');
    const bodyId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId, phase: 'response', role: 'applied', byteLength: 100 }, 'android');
    await httpRecording.recordChunk({ bodyId, offset: 0, payload: Buffer.from('partial') });
    await Promise.all([httpRecording.settle(), httpRecording.settle()]);
    const detail = await captureService.getExchangeDetail(httpRecording.exchangeId);
    expect(detail).toMatchObject({ summary: { state: 'aborted', responseBytes: 7 }, responseBody: { encodedSize: 7, truncated: true } });
    expect((await captureService.readBodyRange(detail!.responseBody!.bodyHash!, 0, 99)).toString()).toBe('partial');
  });

  it('does not record paused exchanges or recreate a cleared exchange from late messages', async () => {
    const paused = createRecording(false);
    await request(paused);
    await paused.settle();
    expect(await captureService.getExchangeDetail(paused.exchangeId)).toBeNull();
    const cleared = createRecording();
    await captureService.cleanup({ kind: 'all' });
    await request(cleared);
    await cleared.settle();
    expect(await captureService.getExchangeDetail(cleared.exchangeId)).toBeNull();
    expect(captureEventQueue.pendingCount).toBe(0);
  });

  it('releases an Original upload when cancellation precedes the request decision', async () => {
    const httpRecording = createRecording();
    await request(httpRecording);
    const bodyId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId,
      phase: 'request', role: 'original', byteLength: null }, 'android');
    for (let offset = 0; offset < 4 * 1024 * 1024; offset += 32768) {
      await httpRecording.recordChunk({ bodyId, offset, payload: Buffer.alloc(32768, 0x61) });
    }
    expect(await fs.readdir(locations.captureTemp)).toHaveLength(1);
    await httpRecording.recordMessage({ ...envelope, type: 'exchange.cancel',
      cancellationId: randomUUID(), reason: 'client-closed' }, 'android');
    await httpRecording.settle();
    expect(await fs.readdir(locations.captureTemp)).toEqual([]);
    expect((await captureService.getExchangeDetail(httpRecording.exchangeId))?.errorCode).toBe('android-client-closed');
  });

  it('closes recording admission synchronously when Clear races the first request', async () => {
    const httpRecording = createRecording();
    const clearing = captureService.cleanup({ kind: 'all' });
    try {
      await request(httpRecording);
    } finally {
      await clearing;
    }
    await httpRecording.settle();
    expect(await captureService.getExchangeDetail(httpRecording.exchangeId)).toBeNull();
    expect(captureEventQueue.pendingCount).toBe(0);
  });

  it('keeps a pending recording when a different Capture session is deleted', async () => {
    await captureService.ensureSession({ id: 'obsolete', name: 'Old Recording', startedAt: 0,
      captureMode: 'android', appVersion: '0.1.0' });
    const httpRecording = createRecording();
    await captureService.cleanup({ kind: 'session', sessionId: 'obsolete' });
    await request(httpRecording);
    expect(await captureService.getExchangeDetail(httpRecording.exchangeId)).not.toBeNull();
    await httpRecording.settle();
  });

  it('clears pending records even when Clear retains their session metadata', async () => {
    const httpRecording = createRecording();
    await captureService.cleanup({ kind: 'all-except-sessions', sessionIds: ['recording'] });
    await request(httpRecording);
    await httpRecording.settle();
    expect(await captureService.getExchangeDetail(httpRecording.exchangeId)).toBeNull();
    expect(captureEventQueue.pendingCount).toBe(0);
    expect((await captureService.status()).sessionCount).toBe(1);
  });

  it('waits for real spill writes and Clear leaves no writer or late capture event', async () => {
    const httpRecording = createRecording();
    const stageId = await request(httpRecording);
    await httpRecording.recordMessage(await decision(httpRecording, stageId, { phase: 'request', decision: { action: 'bypass' } }), 'android');
    const bodyId = randomUUID();
    await httpRecording.recordMessage({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: null }, 'android');
    for (let offset = 0; offset < 4 * 1024 * 1024; offset += 32768) {
      await httpRecording.recordChunk({ bodyId, offset, payload: Buffer.alloc(32768, 0x61) });
    }
    expect(await fs.readdir(locations.captureTemp)).toHaveLength(1);
    await expect(captureService.getExchangeBodySnapshot(httpRecording.exchangeId, 'request')).resolves.toMatchObject({
      encodedSize: 4 * 1024 * 1024, complete: false, available: true,
    });
    captureEventQueue.reset();
    await captureService.cleanup({ kind: 'all' });
    await httpRecording.recordChunk({ bodyId, offset: 4 * 1024 * 1024, payload: Buffer.from('late') });
    await httpRecording.settle();
    expect(await fs.readdir(locations.captureTemp)).toEqual([]);
    expect(captureEventQueue.pendingCount).toBe(0);
  });

  it('surfaces body commit failure without declaring missing bytes saved or failing HTTP', async () => {
    const httpRecording = createRecording();
    const stageId = await request(httpRecording);
    await httpRecording.recordMessage(await decision(httpRecording, stageId, { phase: 'request', decision: { action: 'bypass' } }), 'android');
    const warning = vi.spyOn(diagnostics, 'warn');
    vi.spyOn(BodyWriter.prototype, 'finalize').mockRejectedValueOnce(new Error('disk unavailable'));
    await body(httpRecording, 'request', 'applied', Buffer.from('not-saved'));
    const detail = await captureService.getExchangeDetail(httpRecording.exchangeId);
    expect(detail?.requestBody).toMatchObject({ encodedSize: 9, truncated: true, decodeStatus: 'failed' });
    expect(detail?.requestBody?.bodyHash).toBeUndefined();
    expect(warning).toHaveBeenCalledWith('android.capture-body-failed', expect.any(Object));
    await httpRecording.settle();
  });
});
