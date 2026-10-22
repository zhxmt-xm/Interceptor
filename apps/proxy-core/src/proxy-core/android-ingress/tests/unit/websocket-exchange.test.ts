import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { InspectionPeer } from '../../interfaces/inspection';
import type {
  InspectionWebSocketDecision, InspectionWebSocketMessage, InspectionWebSocketProtocolMessage,
} from '../../interfaces/websocket';
import { WebSocketExchange } from '../../internal/websocket-exchange';
import { inspectionWebSocketOperationId } from '../../utils/websocket-ids';

const envelope = { protocolVersion: 2 as const, sessionId: randomUUID(), exchangeId: randomUUID() };
type Message = Extract<InspectionWebSocketMessage, { type: 'ws.message' }>;

function message(direction: Message['direction'] = 'client-to-server', sequence = 0,
  frame: Message['frame'] = 'text', byteLength = 3, closeCode: number | null = null): Message {
  return { ...envelope, type: 'ws.message', direction, sequence, frame, byteLength, closeCode,
    stageId: inspectionWebSocketOperationId(envelope.exchangeId, direction, sequence, 'message'),
    bodyId: inspectionWebSocketOperationId(envelope.exchangeId, direction, sequence, 'original') };
}

function body(webSocketExchange: WebSocketExchange, bodyId: string, byteLength: number, owner: InspectionPeer) {
  const receiver = owner === 'android' ? 'pc' : 'android';
  for (let offset = 0; offset < byteLength; offset += 32768) {
    const payload = new Uint8Array(Math.min(32768, byteLength - offset));
    webSocketExchange.receiveChunk({ bodyId, offset, payload }, owner);
    webSocketExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: offset + payload.byteLength }, receiver);
  }
  webSocketExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength, trailers: [] }, owner);
  webSocketExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength }, receiver);
}

function original(webSocketExchange: WebSocketExchange, value = message()) {
  webSocketExchange.receive(value, 'android');
  body(webSocketExchange, value.bodyId, value.byteLength, 'android');
  return value;
}

function decide(webSocketExchange: WebSocketExchange, value: Message, decision: InspectionWebSocketDecision = { action: 'bypass' }) {
  const result = { ...envelope, type: 'ws.decision' as const, stageId: value.stageId,
    decisionId: inspectionWebSocketOperationId(envelope.exchangeId, value.direction, value.sequence, 'decision'), decision };
  webSocketExchange.receive(result, 'pc');
  return result;
}

function apply(webSocketExchange: WebSocketExchange, decision: ReturnType<typeof decide>) {
  webSocketExchange.receive({ ...envelope, type: 'ws.applied', stageId: decision.stageId, decisionId: decision.decisionId }, 'android');
}

function finishMessage(webSocketExchange: WebSocketExchange, value: Message, decision: InspectionWebSocketDecision = { action: 'bypass' }) {
  original(webSocketExchange, value);
  apply(webSocketExchange, decide(webSocketExchange, value, decision));
}

function closing(webSocketExchange: WebSocketExchange, direction: Message['direction'], sequence = 0) {
  finishMessage(webSocketExchange, message(direction, sequence, 'close', 0, 1000));
}

describe('WebSocket inspection exchange', () => {
  const create = () => new WebSocketExchange(envelope.sessionId, envelope.exchangeId);

  it('keeps directions independent while one waits for its decision', () => {
    const webSocketExchange = create();
    const client = original(webSocketExchange);
    const server = original(webSocketExchange, message('server-to-client'));
    expect(webSocketExchange.pendingMessageCount).toBe(2);
    apply(webSocketExchange, decide(webSocketExchange, server));
    expect(webSocketExchange.pendingMessageCount).toBe(1);
    apply(webSocketExchange, decide(webSocketExchange, client));
    expect(webSocketExchange.pendingMessageCount).toBe(0);
    expect(webSocketExchange.retainedIdentifierCount).toBe(0);
  });

  it('requires consumed original content before a decision', () => {
    const webSocketExchange = create();
    const value = message();
    webSocketExchange.receive(value, 'android');
    expect(() => decide(webSocketExchange, value)).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it('does not accept the next message in a direction before application', () => {
    const webSocketExchange = create();
    original(webSocketExchange);
    expect(() => webSocketExchange.receive(message('client-to-server', 1), 'android')).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it.each([
    { sequence: 1 }, { stageId: randomUUID() }, { bodyId: randomUUID() }, { sessionId: randomUUID() },
  ])('rejects skipped sequences, arbitrary operation IDs and wrong sessions %j', change => {
    const webSocketExchange = create();
    expect(() => webSocketExchange.receive({ ...message(), ...change }, 'android')).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it('does not reuse identifiers from the confirmed HTTP handshake', () => {
    const value = message();
    const webSocketExchange = new WebSocketExchange(envelope.sessionId, envelope.exchangeId, [value.bodyId]);
    expect(() => webSocketExchange.receive(value, 'android')).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it('enforces one unacknowledged Android chunk across both directions', () => {
    const webSocketExchange = create();
    const client = message();
    const server = message('server-to-client');
    webSocketExchange.receive(client, 'android');
    webSocketExchange.receive(server, 'android');
    webSocketExchange.receiveChunk({ bodyId: client.bodyId, offset: 0, payload: Uint8Array.of(1) }, 'android');
    expect(() => webSocketExchange.receiveChunk({ bodyId: server.bodyId, offset: 0, payload: Uint8Array.of(2) }, 'android')).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it.each(['offset', 'sender', 'identity'] as const)('rejects a wrong chunk acknowledgement %s', fault => {
    const webSocketExchange = create();
    const value = message();
    webSocketExchange.receive(value, 'android');
    webSocketExchange.receiveChunk({ bodyId: value.bodyId, offset: 0, payload: Uint8Array.of(1) }, 'android');
    expect(() => webSocketExchange.receive({ ...envelope, type: 'body.ack',
      bodyId: fault === 'identity' ? randomUUID() : value.bodyId, offset: fault === 'offset' ? 2 : 1,
    }, fault === 'sender' ? 'android' : 'pc')).toThrow();
  });

  it('does not accept a shorter body or HTTP trailers as a complete WS message', () => {
    const cases: Array<{ length: number; trailers: Array<[string, string]> }> = [
      { length: 3, trailers: [] }, { length: 1, trailers: [['X-Trailer', 'value']] },
    ];
    for (const { length, trailers } of cases) {
      const webSocketExchange = create();
      const value = message('client-to-server', 0, 'text', length);
      webSocketExchange.receive(value, 'android');
      webSocketExchange.receiveChunk({ bodyId: value.bodyId, offset: 0, payload: Uint8Array.of(1) }, 'android');
      webSocketExchange.receive({ ...envelope, type: 'body.ack', bodyId: value.bodyId, offset: 1 }, 'pc');
      expect(() => webSocketExchange.receive({ ...envelope, type: 'body.end', bodyId: value.bodyId, byteLength: 1, trailers }, 'android')).toThrow();
    }
  });

  it('requires all replacement bytes and their receipt before application', () => {
    const webSocketExchange = create();
    const value = original(webSocketExchange);
    const decision = decide(webSocketExchange, value, { action: 'replace', closeCode: null,
      body: { bodyId: inspectionWebSocketOperationId(envelope.exchangeId, value.direction, value.sequence, 'replacement'), byteLength: 70001 } });
    expect(() => apply(webSocketExchange, decision)).toThrow();
    expect(webSocketExchange.signal.aborted).toBe(true);
  });

  it('accepts a large replacement through the same bounded chunk window', () => {
    const webSocketExchange = create();
    const value = original(webSocketExchange);
    const bodyId = inspectionWebSocketOperationId(envelope.exchangeId, value.direction, value.sequence, 'replacement');
    const decision = decide(webSocketExchange, value, { action: 'replace', body: { bodyId, byteLength: 70001 }, closeCode: null });
    body(webSocketExchange, bodyId, 70001, 'pc');
    apply(webSocketExchange, decision);
    closing(webSocketExchange, 'client-to-server', 1);
    closing(webSocketExchange, 'server-to-client');
    webSocketExchange.receive({ ...envelope, type: 'exchange.complete', requestBytes: 70001, responseBytes: 0 }, 'android');
    webSocketExchange.receive({ ...envelope, type: 'exchange.completed' }, 'pc');
    expect(webSocketExchange.state).toBe('completed');
  });

  it.each([
    { frame: 'ping', length: 126, code: null },
    { frame: 'close', length: 124, code: 1000 },
    { frame: 'text', length: 0, code: 1000 },
  ] as const)('checks replacement limits against the original $frame kind', ({ frame, length, code }) => {
    const webSocketExchange = create();
    const value = original(webSocketExchange, message('client-to-server', 0, frame, 0, frame === 'close' ? 1000 : null));
    expect(() => decide(webSocketExchange, value, { action: 'replace', closeCode: code,
      body: { bodyId: inspectionWebSocketOperationId(envelope.exchangeId, value.direction, value.sequence, 'replacement'), byteLength: length } })).toThrow();
  });

  it('cannot use an old body ACK to release the next message window', () => {
    const webSocketExchange = create();
    const first = message();
    finishMessage(webSocketExchange, first);
    const second = message('client-to-server', 1);
    webSocketExchange.receive(second, 'android');
    webSocketExchange.receiveChunk({ bodyId: second.bodyId, offset: 0, payload: Uint8Array.of(1) }, 'android');
    expect(() => webSocketExchange.receive({ ...envelope, type: 'body.ack', bodyId: first.bodyId, offset: 1 }, 'pc')).toThrow();
  });

  it('releases completed message identities instead of keeping an ever-growing history', () => {
    const webSocketExchange = create();
    for (let sequence = 0; sequence < 2048; sequence++) {
      finishMessage(webSocketExchange, message('client-to-server', sequence, 'binary', 0));
      expect(webSocketExchange.pendingMessageCount).toBe(0);
      expect(webSocketExchange.retainedIdentifierCount).toBe(0);
    }
    expect(() => webSocketExchange.receive(message(), 'android')).toThrow();
  });

  it('owns the accepted metadata snapshot instead of letting the caller turn a message into close', () => {
    const webSocketExchange = create();
    const value = original(webSocketExchange, message('client-to-server', 0, 'text', 0));
    value.frame = 'close';
    value.closeCode = 1000;
    apply(webSocketExchange, decide(webSocketExchange, value));
    expect(() => original(webSocketExchange, message('client-to-server', 1, 'text', 0))).not.toThrow();
  });

  it('does not let a later caller edit change the confirmed replacement byte count', () => {
    const webSocketExchange = create();
    const value = original(webSocketExchange, message('client-to-server', 0, 'text', 0));
    const bodyId = inspectionWebSocketOperationId(envelope.exchangeId, value.direction, value.sequence, 'replacement');
    const replacement: InspectionWebSocketDecision = { action: 'replace', body: { bodyId, byteLength: 0 }, closeCode: null };
    const decision = decide(webSocketExchange, value, replacement);
    body(webSocketExchange, bodyId, 0, 'pc');
    replacement.body.byteLength = 1;
    apply(webSocketExchange, decision);
    closing(webSocketExchange, 'client-to-server', 1);
    closing(webSocketExchange, 'server-to-client');
    expect(() => webSocketExchange.receive({ ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 }, 'android')).not.toThrow();
  });

  it('requires both applied close directions before a normal completed acknowledgement', () => {
    const webSocketExchange = create();
    closing(webSocketExchange, 'client-to-server');
    expect(() => webSocketExchange.receive({ ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0 }, 'android')).toThrow();
  });

  it('keeps a direction open after dropping close and forbids data after an applied close', () => {
    const webSocketExchange = create();
    finishMessage(webSocketExchange, message('client-to-server', 0, 'close', 0, 1000), { action: 'drop' });
    closing(webSocketExchange, 'client-to-server', 1);
    expect(() => webSocketExchange.receive(message('client-to-server', 2), 'android')).toThrow();
  });

  it.each(['android', 'pc'] as const)('cancels pending decisions and waits for the opposite %s acknowledgement', sender => {
    const webSocketExchange = create();
    original(webSocketExchange);
    const cancel: InspectionWebSocketProtocolMessage = { ...envelope, type: 'exchange.cancel', cancellationId: randomUUID(), reason: 'user' };
    webSocketExchange.receive(cancel, sender);
    webSocketExchange.receive(cancel, sender);
    expect(webSocketExchange.state).toBe('aborted');
    expect(webSocketExchange.signal.aborted).toBe(true);
    expect(webSocketExchange.awaitingCancellationAcknowledgement).toBe(true);
    webSocketExchange.receive({ ...envelope, type: 'exchange.cancelled', cancellationId: cancel.cancellationId }, sender === 'android' ? 'pc' : 'android');
    expect(webSocketExchange.awaitingCancellationAcknowledgement).toBe(false);
    expect(webSocketExchange.retainedIdentifierCount).toBe(1);
  });
});
