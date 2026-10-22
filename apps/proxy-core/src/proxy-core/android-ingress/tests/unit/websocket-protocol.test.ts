import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { InspectionWebSocketMessage } from '../../interfaces/websocket';
import { InspectionProtocolError } from '../../internal/errors';
import { parseInspectionWebSocketMessage } from '../../utils/websocket-protocol';

const envelope = { protocolVersion: 2 as const, sessionId: randomUUID(), exchangeId: randomUUID() };
const message: Extract<InspectionWebSocketMessage, { type: 'ws.message' }> = {
  ...envelope, type: 'ws.message', stageId: randomUUID(), direction: 'client-to-server', sequence: 0,
  frame: 'text', bodyId: randomUUID(), byteLength: 7, closeCode: null,
};
const parse = (value: unknown) => parseInspectionWebSocketMessage(JSON.stringify(value), envelope.sessionId);

describe('WebSocket inspection metadata', () => {
  it('bounds original and replacement declarations by the actual 100MiB message limit', () => {
    const maximum = 100 * 1024 * 1024;
    expect(parse({ ...message, byteLength: maximum })).toMatchObject({ byteLength: maximum });
    expect(() => parse({ ...message, byteLength: maximum + 1 })).toThrow(InspectionProtocolError);
    const replacement = { ...envelope, type: 'ws.decision', stageId: message.stageId, decisionId: randomUUID(),
      decision: { action: 'replace', body: { bodyId: randomUUID(), byteLength: maximum }, closeCode: null } };
    expect(parse(replacement)).toEqual(replacement);
    replacement.decision.body.byteLength++;
    expect(() => parse(replacement)).toThrow(InspectionProtocolError);
  });

  it.each(['text', 'binary', 'ping', 'pong', 'close'] as const)('accepts explicit %s messages without inline content', frame => {
    const value = { ...message, frame, closeCode: frame === 'close' ? 1000 : null };
    expect(parse(value)).toEqual(value);
  });

  it.each(['client-to-server', 'server-to-client'] as const)('preserves %s sequence and a canonical body identity', direction => {
    const value = { ...message, direction, sequence: Number.MAX_SAFE_INTEGER, byteLength: 70_001 };
    expect(parse(value)).toEqual(value);
  });

  it.each(['bypass', 'drop'] as const)('accepts the explicit %s decision', action => {
    const value = { ...envelope, type: 'ws.decision', stageId: message.stageId,
      decisionId: randomUUID(), decision: { action } };
    expect(parse(value)).toEqual(value);
  });

  it('keeps replacement bytes out of the decision and accepts explicit empty content', () => {
    const value = { ...envelope, type: 'ws.decision', stageId: message.stageId, decisionId: randomUUID(),
      decision: { action: 'replace', body: { bodyId: randomUUID(), byteLength: 0 }, closeCode: null } };
    expect(parse(value)).toEqual(value);
  });

  it('accepts a complete-frame application acknowledgement', () => {
    const value = { ...envelope, type: 'ws.applied', stageId: message.stageId, decisionId: randomUUID() };
    expect(parse(value)).toEqual(value);
  });

  it.each([
    { frame: 'ping', byteLength: 125, closeCode: null },
    { frame: 'pong', byteLength: 125, closeCode: null },
    { frame: 'close', byteLength: 123, closeCode: 1000 },
    { frame: 'close', byteLength: 0, closeCode: null },
  ] as const)('accepts the exact $frame control limit ($byteLength)', value => {
    expect(parse({ ...message, ...value })).toEqual({ ...message, ...value });
  });

  it.each([
    { frame: 'ping', byteLength: 126, closeCode: null },
    { frame: 'pong', byteLength: 126, closeCode: null },
    { frame: 'close', byteLength: 124, closeCode: 1000 },
    { frame: 'close', byteLength: 1, closeCode: null },
    { frame: 'text', closeCode: 1000 },
    { frame: 'binary', closeCode: 1000 },
    { frame: 'ping', closeCode: 1000 },
  ])('rejects invalid control semantics %j', value => {
    expect(() => parse({ ...message, ...value })).toThrow(InspectionProtocolError);
  });

  it.each([1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 3000, 4999])(
    'accepts wire close code %s', closeCode => {
      expect(parse({ ...message, frame: 'close', closeCode })).toMatchObject({ closeCode });
    },
  );

  it.each([0, 999, 1004, 1005, 1006, 1015, 1016, 2999, 5000, 1000.5, '1000'])(
    'rejects local, reserved or malformed close code %s', closeCode => {
      expect(() => parse({ ...message, frame: 'close', closeCode })).toThrow(InspectionProtocolError);
    },
  );

  it.each([
    { protocolVersion: 1 }, { sessionId: randomUUID() }, { exchangeId: 'not-a-uuid' },
    { stageId: '00000000-0000-4000-A000-000000000000' }, { bodyId: 'body-1' },
    { direction: 'both' }, { frame: 'continuation' }, { sequence: -1 }, { sequence: 0.5 },
    { sequence: Number.MAX_SAFE_INTEGER + 1 }, { byteLength: -1 }, { byteLength: null },
    { byteLength: Number.MAX_SAFE_INTEGER + 1 }, { content: 'must-not-inline' },
  ])('rejects malformed or cross-session metadata %j', value => {
    expect(() => parse({ ...message, ...value })).toThrow(InspectionProtocolError);
  });

  it.each(Object.keys(message))('requires the %s field even when its value can be empty', key => {
    const value: Record<string, unknown> = { ...message };
    delete value[key];
    expect(() => parse(value)).toThrow(InspectionProtocolError);
  });

  it.each([
    { action: 'bypass', body: {} },
    { action: 'drop', closeCode: null },
    { action: 'replace', body: { bodyId: randomUUID(), byteLength: 0 } },
    { action: 'replace', body: { bodyId: randomUUID(), byteLength: -1 }, closeCode: null },
    { action: 'replace', body: { bodyId: randomUUID(), byteLength: 0, content: '' }, closeCode: null },
    { action: 'replace', body: { bodyId: randomUUID(), byteLength: 124 }, closeCode: 1000 },
    { action: 'replace', body: { bodyId: randomUUID(), byteLength: 0 }, closeCode: 1006 },
    { action: 'abort' },
  ])('rejects malformed decisions %j', decision => {
    expect(() => parse({ ...envelope, type: 'ws.decision', stageId: message.stageId,
      decisionId: randomUUID(), decision })).toThrow(InspectionProtocolError);
  });

  it('checks the exact UTF-8 JSON envelope limit rather than object size', () => {
    const text = JSON.stringify(message);
    const padded = text + ' '.repeat(65536 - Buffer.byteLength(text, 'utf8'));
    expect(parseInspectionWebSocketMessage(padded, envelope.sessionId)).toEqual(message);
    expect(() => parseInspectionWebSocketMessage(padded + ' ', envelope.sessionId)).toThrow(InspectionProtocolError);
  });

  it.each(['null', '[]', '{}', '{"type":', '{"type":"ws.message"} trailing', '/*comment*/{}'])(
    'rejects invalid JSON/envelopes without echoing input: %s', text => {
      expect(() => parseInspectionWebSocketMessage(text, envelope.sessionId)).toThrow(InspectionProtocolError);
    },
  );
});
