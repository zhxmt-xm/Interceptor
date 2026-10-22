import { describe, expect, it } from 'vitest';
import type { InspectionHttpMessage } from '../../interfaces/inspection';
import { HttpExchange } from '../../internal/http-exchange';
import { InspectionProtocolError } from '../../internal/errors';

const sessionId = '00000000-0000-4000-8000-000000000001';
const exchangeId = '00000000-0000-4000-8000-000000000002';
const requestStageId = '00000000-0000-4000-8000-000000000003';
const responseStageId = '00000000-0000-4000-8000-000000000004';
const requestDecisionId = '00000000-0000-4000-8000-000000000005';
const responseDecisionId = '00000000-0000-4000-8000-000000000006';
const bodyId = '00000000-0000-4000-8000-000000000007';
const cancellationId = '00000000-0000-4000-8000-000000000008';
const envelope = { protocolVersion: 2 as const, sessionId, exchangeId };
const request: InspectionHttpMessage = {
  ...envelope, type: 'http.request', stageId: requestStageId,
  request: { method: 'POST', url: 'https://api.test/', httpVersion: '2', headers: [] },
};
const response: InspectionHttpMessage = {
  ...envelope, type: 'http.response', stageId: responseStageId, response: { statusCode: 200, headers: [] },
};
const requestDecision: InspectionHttpMessage = {
  ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId,
  decisionId: requestDecisionId, decision: { action: 'bypass' },
};
const responseDecision: InspectionHttpMessage = {
  ...envelope, type: 'http.decision', phase: 'response', stageId: responseStageId,
  decisionId: responseDecisionId, decision: { action: 'bypass' },
};
const requestApplied: InspectionHttpMessage = {
  ...envelope, type: 'http.applied', stageId: requestStageId, decisionId: requestDecisionId,
};
const responseApplied: InspectionHttpMessage = {
  ...envelope, type: 'http.applied', stageId: responseStageId, decisionId: responseDecisionId,
};
const upgraded: InspectionHttpMessage = { ...responseApplied, type: 'http.upgraded' };
const upgradeReady: InspectionHttpMessage = { ...responseApplied, type: 'http.upgrade-ready' };
const complete: InspectionHttpMessage = {
  ...envelope, type: 'exchange.complete', requestBytes: 0, responseBytes: 0,
};
const completed: InspectionHttpMessage = { ...envelope, type: 'exchange.completed' };
const cancel: InspectionHttpMessage = {
  ...envelope, type: 'exchange.cancel', cancellationId, reason: 'user',
};

function setup() {
  const httpExchange = new HttpExchange(sessionId, exchangeId);
  httpExchange.receive(request, 'android');
  return httpExchange;
}

function appliedRequest() {
  const httpExchange = setup();
  httpExchange.receive(requestDecision, 'pc');
  httpExchange.receive(requestApplied, 'android');
  return httpExchange;
}

describe('HTTP exchange decision and cancellation state', () => {
  it('settles an explicitly stopped upload prefix without cancelling the successful response', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 70001 }, 'android');
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1, 2]) }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 2 }, 'pc');
    httpExchange.receive(response, 'android');
    httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId, byteLength: 2, reason: 'early-response' }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 2 }, 'pc');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive({ ...complete, requestBytes: 2 }, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
    expect(httpExchange.signal.aborted).toBe(false);
  });

  it('still rejects a short complete end even after receiving an early response', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 70001 }, 'android');
    httpExchange.receive(response, 'android');
    expect(() => httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android'))
      .toThrow(InspectionProtocolError);
  });

  it('discards a request replacement with an in-flight chunk and ignores its late ack', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId, decisionId: requestDecisionId,
      decision: { action: 'intercept', method: 'POST', url: 'https://api.test/', headers: [], editedHeaderNames: [],
        body: { action: 'replace', bodyId, byteLength: 70001 }, delayMs: 0 },
    }, 'pc');
    httpExchange.receive(requestApplied, 'android');
    httpExchange.receive(response, 'android');
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1, 2]) }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.discard', bodyId }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 2 }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId, byteLength: 2, reason: 'early-response' }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 2 }, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(complete, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
  });

  it('records a stopped original upload after a synthetic request decision', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId, decisionId: requestDecisionId,
      decision: { action: 'respond', statusCode: 204, headers: [], body: { action: 'replace', bodyId, byteLength: 0 } },
    }, 'pc');
    httpExchange.receive(requestApplied, 'android');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 0 }, 'android');
    const originalId = '00000000-0000-4000-8000-000000000009';
    httpExchange.receive({ ...envelope, type: 'body.open', bodyId: originalId,
      phase: 'request', role: 'original', byteLength: 100 }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId: originalId,
      byteLength: 0, reason: 'synthetic-response' }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId: originalId, byteLength: 0 }, 'pc');
    httpExchange.receive(complete, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
  });

  it('rejects stops before a final response, on response bodies, or while a request chunk still owes ack', () => {
    for (const invalid of ['before-response', 'response-body', 'pending-ack', 'wrong-reason']) {
      const httpExchange = appliedRequest();
      if (invalid !== 'before-response') {
        httpExchange.receive(response, 'android');
        httpExchange.receive(responseDecision, 'pc');
        httpExchange.receive(responseApplied, 'android');
      }
      httpExchange.receive({ ...envelope, type: 'body.open', bodyId,
        phase: invalid === 'response-body' ? 'response' : 'request', role: 'original', byteLength: 100 }, 'android');
      if (invalid === 'pending-ack') {
        httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android');
      }
      expect(() => httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId,
        byteLength: invalid === 'pending-ack' ? 1 : 0,
        reason: invalid === 'wrong-reason' ? 'synthetic-response' : 'early-response' }, 'android'))
        .toThrow(InspectionProtocolError);
    }
  });

  it('accepts discard crossing an already-sent complete replacement end without another termination', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId, decisionId: requestDecisionId,
      decision: { action: 'intercept', method: 'POST', url: 'https://api.test/', headers: [], editedHeaderNames: [],
        body: { action: 'replace', bodyId, byteLength: 0 }, delayMs: 0 },
    }, 'pc');
    httpExchange.receive(requestApplied, 'android');
    httpExchange.receive(response, 'android');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.discard', bodyId }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 0 }, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(complete, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
  });

  it('does not allow PC to truncate a replacement without an Android discard request', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId, decisionId: requestDecisionId,
      decision: { action: 'intercept', method: 'POST', url: 'https://api.test/', headers: [], editedHeaderNames: [],
        body: { action: 'replace', bodyId, byteLength: 100 }, delayMs: 0 },
    }, 'pc');
    httpExchange.receive(requestApplied, 'android');
    httpExchange.receive(response, 'android');
    expect(() => httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId, byteLength: 0, reason: 'early-response' }, 'pc'))
      .toThrow(InspectionProtocolError);
  });

  it('requires stopped prefix receipt before normal exchange completion', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive(response, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 100 }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.stopped', bodyId, byteLength: 0, reason: 'early-response' }, 'android');
    expect(() => httpExchange.receive(complete, 'android')).toThrow(InspectionProtocolError);
  });

  it('requires a separate response decision after request bypass', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive(response, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(complete, 'android');
    expect(httpExchange.state).toBe('completing');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
    expect(httpExchange.signal.aborted).toBe(false);
  });

  it('does not treat a decision as applied until Android confirms its exact identity', () => {
    const httpExchange = setup();
    httpExchange.receive(requestDecision, 'pc');
    expect(() => httpExchange.receive(response, 'android')).toThrow(InspectionProtocolError);
    expect(httpExchange.signal.aborted).toBe(true);
    expect(httpExchange.state).toBe('failed');
  });

  it('allows a synthetic response without reporting a source response', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId,
      decisionId: requestDecisionId,
      decision: { action: 'respond', statusCode: 204, headers: [], body: { action: 'replace', bodyId, byteLength: 0 } },
    }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 0 }, 'android');
    httpExchange.receive(requestApplied, 'android');
    httpExchange.receive(complete, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
  });

  it('treats applying an abort as termination rather than normal completion', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId,
      decisionId: requestDecisionId, decision: { action: 'abort', mode: 'reset' },
    }, 'pc');
    httpExchange.receive(requestApplied, 'android');
    expect(httpExchange.state).toBe('aborted');
    expect(httpExchange.signal.aborted).toBe(true);
    expect(() => httpExchange.receive(complete, 'android')).toThrow(InspectionProtocolError);
  });

  it('rejects undeclared trailers on a PC-constructed replacement instead of discarding them', () => {
    const httpExchange = setup();
    httpExchange.receive({
      ...envelope, type: 'http.decision', phase: 'request', stageId: requestStageId,
      decisionId: requestDecisionId,
      decision: { action: 'respond', statusCode: 200, headers: [], body: { action: 'replace', bodyId, byteLength: 0 } },
    }, 'pc');
    expect(() => httpExchange.receive({
      ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [['X-Original-Digest', 'stale']],
    }, 'pc')).toThrow(InspectionProtocolError);
    expect(httpExchange.state).toBe('failed');
  });

  it.each(['android', 'pc'] as const)('cancels from %s and acknowledges without restarting any work', sender => {
    const httpExchange = setup();
    httpExchange.receive(cancel, sender);
    httpExchange.receive(cancel, sender);
    expect(httpExchange.signal.aborted).toBe(true);
    expect(httpExchange.state).toBe('aborted');
    expect(httpExchange.awaitingCancellationAcknowledgement).toBe(true);
    httpExchange.receive({ ...envelope, type: 'exchange.cancelled', cancellationId }, sender === 'pc' ? 'android' : 'pc');
    expect(httpExchange.state).toBe('aborted');
    expect(httpExchange.awaitingCancellationAcknowledgement).toBe(false);
    expect(() => httpExchange.receive(requestDecision, 'pc')).toThrow(InspectionProtocolError);
  });

  it('handles crossing cancellation without waiting for the other side first', () => {
    const httpExchange = setup();
    httpExchange.receive(cancel, 'android');
    httpExchange.receive({ ...cancel, cancellationId: bodyId }, 'pc');
    httpExchange.receive({ ...envelope, type: 'exchange.cancelled', cancellationId }, 'pc');
    expect(httpExchange.awaitingCancellationAcknowledgement).toBe(true);
    httpExchange.receive({ ...envelope, type: 'exchange.cancelled', cancellationId: bodyId }, 'android');
    expect(httpExchange.state).toBe('aborted');
    expect(httpExchange.awaitingCancellationAcknowledgement).toBe(false);
  });

  it('cancels locally on a lost transport without requiring an unreachable acknowledgement', () => {
    const httpExchange = setup();
    httpExchange.disconnect();
    expect(httpExchange.signal.aborted).toBe(true);
    expect(httpExchange.state).toBe('failed');
    httpExchange.disconnect();
    expect(httpExchange.state).toBe('failed');
  });

  it.each([
    { ...request, sessionId: exchangeId },
    { ...request, exchangeId: sessionId },
    request,
    requestApplied,
    response,
    responseApplied,
    complete,
    completed,
    { ...envelope, type: 'exchange.cancelled', cancellationId },
  ] satisfies InspectionHttpMessage[])('rejects out-of-order or mismatched Android message $type', message => {
    const httpExchange = setup();
    expect(() => httpExchange.receive(message, 'android')).toThrow(InspectionProtocolError);
    expect(httpExchange.signal.aborted).toBe(true);
  });

  it.each([
    request,
    response,
    requestApplied,
    { ...requestDecision, stageId: responseStageId },
    responseDecision,
    complete,
    completed,
  ])('rejects unauthorized PC message $type', message => {
    const httpExchange = setup();
    expect(() => httpExchange.receive(message, 'pc')).toThrow(InspectionProtocolError);
  });

  it('rejects applying a different decision or applying the same decision twice', () => {
    const wrong = setup();
    wrong.receive(requestDecision, 'pc');
    expect(() => wrong.receive({ ...requestApplied, decisionId: responseDecisionId }, 'android'))
      .toThrow(InspectionProtocolError);
    const duplicate = appliedRequest();
    expect(() => duplicate.receive(requestApplied, 'android')).toThrow(InspectionProtocolError);
  });

  it('does not allow PC to replace a decision while waiting for its acknowledgement', () => {
    const httpExchange = setup();
    httpExchange.receive(requestDecision, 'pc');
    expect(() => httpExchange.receive({ ...requestDecision, decisionId: responseDecisionId }, 'pc'))
      .toThrow(InspectionProtocolError);
  });

  it('does not treat WS upgrade as a completed HTTP response', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...response, response: { statusCode: 101, headers: [] } }, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    expect(() => httpExchange.receive(complete, 'android')).toThrow(InspectionProtocolError);
  });

  it.each([200, 403])('completes HTTP when PC changes an origin 101 to %i', statusCode => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...response, response: { statusCode: 101, headers: [] } }, 'android');
    httpExchange.receive({
      ...responseDecision,
      decision: { action: 'intercept', statusCode, headers: [], editedHeaderNames: [],
        body: { action: 'keep' }, delayMs: 0 },
    }, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(complete, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
    expect(httpExchange.signal.aborted).toBe(false);
  });

  it.each([200, 204])('rejects manufacturing an upgrade from an origin %i', statusCode => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...response, response: { statusCode, headers: [] } }, 'android');
    expect(() => httpExchange.receive({
      ...responseDecision,
      decision: { action: 'intercept', statusCode: 101, headers: [], editedHeaderNames: [],
        body: { action: 'keep' }, delayMs: 0 },
    }, 'pc')).toThrow(InspectionProtocolError);
    expect(httpExchange.signal.aborted).toBe(true);
  });

  it('keeps a real upgrade pending when PC edits headers but preserves 101', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...response, response: { statusCode: 101, headers: [] } }, 'android');
    httpExchange.receive({
      ...responseDecision,
      decision: { action: 'intercept', statusCode: 101, headers: [['x-verified', 'true']],
        editedHeaderNames: ['x-verified'], body: { action: 'keep' }, delayMs: 0 },
    }, 'pc');
    httpExchange.receive(responseApplied, 'android');
    expect(() => httpExchange.receive(complete, 'android')).toThrow(InspectionProtocolError);
  });

  it('requires an explicit upgrade acknowledgement and retains bounded handshake identities', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive({ ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'applied', byteLength: 0 }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 0 }, 'pc');
    httpExchange.receive({ ...response, response: { statusCode: 101, headers: [] } }, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(upgraded, 'android');
    expect(httpExchange.state).toBe('upgrading');
    httpExchange.receive(upgradeReady, 'pc');
    expect(httpExchange.state).toBe('upgraded');
    expect(httpExchange.webSocketHandshakeIds).toEqual(expect.arrayContaining([
      requestStageId, responseStageId, requestDecisionId, responseDecisionId, bodyId,
    ]));
    expect(new Set(httpExchange.webSocketHandshakeIds).size).toBe(5);
    expect(httpExchange.signal.aborted).toBe(false);
  });

  it.each(['not-applied', 'body-not-consumed', 'ordinary-status', 'wrong-decision', 'wrong-peer'] as const)(
    'rejects an unsafe upgrade boundary: %s', scenario => {
      const httpExchange = appliedRequest();
      httpExchange.receive({ ...response, response: { statusCode: scenario === 'ordinary-status' ? 200 : 101, headers: [] } }, 'android');
      httpExchange.receive(responseDecision, 'pc');
      if (scenario !== 'not-applied') httpExchange.receive(responseApplied, 'android');
      if (scenario === 'body-not-consumed') {
        httpExchange.receive({ ...envelope, type: 'body.open', bodyId, phase: 'response', role: 'applied', byteLength: 0 }, 'android');
        httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android');
      }
      expect(() => httpExchange.receive(
        scenario === 'wrong-decision' ? { ...upgraded, decisionId: requestDecisionId } : upgraded,
        scenario === 'wrong-peer' ? 'pc' : 'android',
      )).toThrow(InspectionProtocolError);
    },
  );

  it('does not accept an unsolicited upgrade acknowledgement', () => {
    const httpExchange = appliedRequest();
    expect(() => httpExchange.receive(upgradeReady, 'pc')).toThrow(InspectionProtocolError);
  });

  it('can cancel or disconnect while the upgrade acknowledgement is pending', () => {
    for (const disconnect of [false, true]) {
      const httpExchange = appliedRequest();
      httpExchange.receive({ ...response, response: { statusCode: 101, headers: [] } }, 'android');
      httpExchange.receive(responseDecision, 'pc');
      httpExchange.receive(responseApplied, 'android');
      httpExchange.receive(upgraded, 'android');
      expect(httpExchange.state).toBe('upgrading');
      if (disconnect) {
        httpExchange.disconnect();
        expect(httpExchange.state).toBe('failed');
      } else {
        httpExchange.receive(cancel, 'pc');
        httpExchange.receive({ ...envelope, type: 'exchange.cancelled', cancellationId }, 'android');
        expect(httpExchange.state).toBe('aborted');
        expect(httpExchange.awaitingCancellationAcknowledgement).toBe(false);
      }
      expect(httpExchange.signal.aborted).toBe(true);
    }
  });

  it('does not report completion until PC confirms processing the terminal report', () => {
    const httpExchange = appliedRequest();
    httpExchange.receive(response, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    httpExchange.receive(complete, 'android');
    expect(httpExchange.state).toBe('completing');
    httpExchange.disconnect();
    expect(httpExchange.state).toBe('failed');
  });
});

describe('HTTP content window and independent directions', () => {
  function openedBody(byteLength: number | null = null) {
    const httpExchange = appliedRequest();
    httpExchange.receive({
      ...envelope, type: 'body.open', bodyId, phase: 'request', role: 'original', byteLength,
    }, 'android');
    return httpExchange;
  }

  it('allows an early response while upload content remains open', () => {
    const httpExchange = openedBody();
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1, 2]) }, 'android');
    httpExchange.receive(response, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    expect(httpExchange.state).toBe('active');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 2 }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 2, trailers: [] }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 2 }, 'pc');
    httpExchange.receive({ ...complete, requestBytes: 2 }, 'android');
    httpExchange.receive(completed, 'pc');
    expect(httpExchange.state).toBe('completed');
  });

  it('does not allow a second content block before the first has been consumed', () => {
    const httpExchange = openedBody();
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android');
    expect(() => httpExchange.receiveChunk({ bodyId, offset: 1, payload: new Uint8Array([2]) }, 'android'))
      .toThrow(InspectionProtocolError);
  });

  it('advances the window only on an exact opposite-direction acknowledgement', () => {
    const httpExchange = openedBody(2);
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 1 }, 'pc');
    httpExchange.receiveChunk({ bodyId, offset: 1, payload: new Uint8Array([2]) }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 2 }, 'pc');
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 2, trailers: [] }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 2 }, 'pc');
    expect(httpExchange.state).toBe('active');
  });

  it.each([
    { ...envelope, type: 'body.ack', bodyId, offset: 0 },
    { ...envelope, type: 'body.ack', bodyId: cancellationId, offset: 1 },
    { ...envelope, type: 'body.end', bodyId, byteLength: 1, trailers: [] },
    { ...envelope, type: 'body.received', bodyId, byteLength: 1 },
  ] satisfies InspectionHttpMessage[])('rejects an invalid or premature content message $type', message => {
    const httpExchange = openedBody(2);
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android');
    expect(() => httpExchange.receive(message, message.type === 'body.end' ? 'android' : 'pc'))
      .toThrow(InspectionProtocolError);
  });

  it.each([
    { bodyId: cancellationId, offset: 0, payload: new Uint8Array([1]) },
    { bodyId, offset: 1, payload: new Uint8Array([1]) },
    { bodyId, offset: 0, payload: new Uint8Array([1, 2, 3]) },
    { bodyId, offset: 0, payload: new Uint8Array() },
  ])('rejects undeclared, out-of-order or oversized content', chunk => {
    const httpExchange = openedBody(2);
    expect(() => httpExchange.receiveChunk(chunk, 'android')).toThrow(InspectionProtocolError);
  });

  it('rejects original content from PC instead of treating it as a new request', () => {
    const httpExchange = openedBody();
    expect(() => httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'pc'))
      .toThrow(InspectionProtocolError);
  });

  it('rejects completion while a content stream has not been confirmed', () => {
    const httpExchange = openedBody(0);
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android');
    httpExchange.receive(response, 'android');
    httpExchange.receive(responseDecision, 'pc');
    httpExchange.receive(responseApplied, 'android');
    expect(() => httpExchange.receive(complete, 'android')).toThrow(InspectionProtocolError);
  });

  it('does not reopen an ended body or allow the same phase/role under another ID', () => {
    const httpExchange = openedBody(0);
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android');
    expect(() => httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android'))
      .toThrow(InspectionProtocolError);
    const duplicate = openedBody();
    expect(() => duplicate.receive({
      ...envelope, type: 'body.open', bodyId: cancellationId, phase: 'request', role: 'original', byteLength: null,
    }, 'android')).toThrow(InspectionProtocolError);
  });

  it('does not confirm consumption from the sending peer', () => {
    const httpExchange = openedBody(0);
    httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 0, trailers: [] }, 'android');
    expect(() => httpExchange.receive({ ...envelope, type: 'body.received', bodyId, byteLength: 0 }, 'android'))
      .toThrow(InspectionProtocolError);
  });

  it('rejects a declared length that disagrees with the end message', () => {
    const httpExchange = openedBody(2);
    httpExchange.receiveChunk({ bodyId, offset: 0, payload: new Uint8Array([1]) }, 'android');
    httpExchange.receive({ ...envelope, type: 'body.ack', bodyId, offset: 1 }, 'pc');
    expect(() => httpExchange.receive({ ...envelope, type: 'body.end', bodyId, byteLength: 1, trailers: [] }, 'android'))
      .toThrow(InspectionProtocolError);
  });
});
