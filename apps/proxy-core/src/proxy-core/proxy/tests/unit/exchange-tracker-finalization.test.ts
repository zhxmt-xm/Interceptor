import type { AbortedRequest, InitiatedRequest } from 'mockttp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaptureService } from '../../../capture/entry';
import { BodyWriter, type BodyCommit } from '../../../capture/internal/body-writer';
import { CoreDiagnostics } from '../../../core-diagnostics';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { ExchangeTracker } from '../../internal/exchange-tracker';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExchangeTracker body finalization', () => {
  it.each(['completed', 'aborted'] as const)('drains storage work after a %s Exchange leaves the active map', async (ending) => {
    const captureService = new CaptureService();
    await captureService.ensureSession({ id: 'session-1', name: 'Recording', startedAt: 1,
      captureMode: 'explicit-proxy', appVersion: '0.0.0' });
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => { releaseCommit = resolve; });
    let notifyCommitStarted!: () => void;
    const commitStarted = new Promise<void>((resolve) => { notifyCommitStarted = resolve; });
    const bodyWriter = new BodyWriter('', Number.MAX_SAFE_INTEGER, async (hash, size) => {
      notifyCommitStarted();
      await commitGate;
      return { hash, size, deduplicated: false };
    }, async () => Buffer.alloc(0));
    vi.spyOn(captureService, 'createBodyWriter').mockReturnValue(bodyWriter);
    const exchangeTracker = new ExchangeTracker(captureService, new CaptureEventQueue());
    exchangeTracker.setSession('session-1');
    const request = {
      id: 'draining-request', protocol: 'http', httpVersion: '1.1', method: 'POST',
      url: 'http://example.test/draining', path: '/draining',
      remoteIpAddress: '127.0.0.1', remotePort: 50_000,
      destination: { hostname: 'example.test', port: 80 },
      headers: {}, rawHeaders: [], timingEvents: { startTime: Date.now(), startTimestamp: 0 }, tags: [],
    } as unknown as InitiatedRequest;
    exchangeTracker.beginRequest(request);
    const exchangeId = await exchangeTracker.whenExchangeReady(request.id);
    exchangeTracker.appendRequestBody({ id: request.id, content: Buffer.from('pending body'),
      isEnded: ending === 'completed', eventTimestamp: Date.now() });
    if (ending === 'completed') {
      exchangeTracker.beginResponse({ id: request.id, statusCode: 200, statusMessage: 'OK',
        headers: {}, rawHeaders: [], timingEvents: request.timingEvents, tags: [] });
      exchangeTracker.appendResponseBody({ id: request.id, content: Buffer.alloc(0), isEnded: true, eventTimestamp: Date.now() });
    } else {
      exchangeTracker.abortExchange({ ...request,
        timingEvents: { ...request.timingEvents, abortedTimestamp: 1 },
      } as AbortedRequest);
    }
    await commitStarted;
    expect(exchangeTracker.activeCount).toBe(0);
    exchangeTracker.reset();
    let settled = false;
    const settling = exchangeTracker.settle().then(() => { settled = true; });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
    } finally {
      releaseCommit();
      await settling;
    }

    await expect(captureService.getExchangeDetail(exchangeId!)).resolves.toMatchObject({
      summary: { state: ending, durationMs: expect.any(Number) },
      requestBody: { bodyHash: bodyWriter.bodyHash, encodedSize: 12 },
    });
    await expect(bodyWriter.snapshot()).resolves.toMatchObject({ complete: true, available: true });
    await exchangeTracker.settle();
  });

  it.each(['request', 'response', 'both'] as const)(
    'persists the aborted state and the other body when %s commits fail',
    async (failedSide) => {
      const captureService = new CaptureService();
      await captureService.ensureSession({ id: 'session-1', name: 'Recording', startedAt: 1,
        captureMode: 'explicit-proxy', appVersion: '0.0.0' });
      const requestCommit = vi.fn<BodyCommit>().mockImplementation(async (hash, size) => ({ hash, size, deduplicated: false }));
      const responseCommit = vi.fn<BodyCommit>().mockImplementation(async (hash, size) => ({ hash, size, deduplicated: false }));
      if (failedSide !== 'response') requestCommit.mockRejectedValueOnce(new Error('Request commit failed.'));
      if (failedSide !== 'request') responseCommit.mockRejectedValueOnce(new Error('Response commit failed.'));
      const requestBodyWriter = new BodyWriter('', Number.MAX_SAFE_INTEGER, requestCommit, async () => Buffer.alloc(0));
      const responseBodyWriter = new BodyWriter('', Number.MAX_SAFE_INTEGER, responseCommit, async () => Buffer.alloc(0));
      vi.spyOn(captureService, 'createBodyWriter').mockImplementation((_exchangeId, side) =>
        side === 'request' ? requestBodyWriter : responseBodyWriter);
      const captureEventQueue = new CaptureEventQueue();
      const coreDiagnostics = new CoreDiagnostics({ sink: vi.fn() });
      const recordFailure = vi.spyOn(coreDiagnostics, 'error');
      const exchangeTracker = new ExchangeTracker(captureService, captureEventQueue);
      exchangeTracker.attachDiagnostics(coreDiagnostics);
      exchangeTracker.setSession('session-1');
      const request = {
        id: 'request-1', protocol: 'http', httpVersion: '1.1', method: 'POST',
        url: 'http://example.test/items', path: '/items',
        remoteIpAddress: '127.0.0.1', remotePort: 50_000,
        destination: { hostname: 'example.test', port: 80 },
        headers: {}, rawHeaders: [], timingEvents: { startTime: Date.now(), startTimestamp: 0 }, tags: [],
      } as unknown as InitiatedRequest;
      exchangeTracker.beginRequest(request);
      const exchangeId = await exchangeTracker.whenExchangeReady(request.id);
      const requestBody = Buffer.from('partial request');
      const responseBody = Buffer.from('partial response');
      exchangeTracker.appendRequestBody({ id: request.id, content: requestBody, isEnded: false, eventTimestamp: Date.now() });
      exchangeTracker.beginResponse({ id: request.id, statusCode: 200, statusMessage: 'OK',
        headers: {}, rawHeaders: [], timingEvents: request.timingEvents, tags: [] });
      exchangeTracker.appendResponseBody({ id: request.id, content: responseBody, isEnded: false, eventTimestamp: Date.now() });
      exchangeTracker.abortExchange({ ...request,
        timingEvents: { ...request.timingEvents, abortedTimestamp: 1 },
      } as AbortedRequest);
      await new Promise<void>((resolve) => setImmediate(resolve));

      const detail = await captureService.getExchangeDetail(exchangeId!);
      expect(detail?.summary).toMatchObject({ state: 'aborted', durationMs: expect.any(Number),
        statusCode: 200, requestBytes: requestBody.byteLength, responseBytes: responseBody.byteLength });
      expect(requestCommit).toHaveBeenCalledTimes(1);
      expect(responseCommit).toHaveBeenCalledTimes(1);
      expect(detail?.requestBody?.bodyHash).toBe(failedSide === 'response' ? requestBodyWriter.bodyHash : undefined);
      expect(detail?.responseBody?.bodyHash).toBe(failedSide === 'request' ? responseBodyWriter.bodyHash : undefined);
      await expect(requestBodyWriter.snapshot()).resolves.toMatchObject({ complete: true, available: failedSide === 'response' });
      await expect(responseBodyWriter.snapshot()).resolves.toMatchObject({ complete: true, available: failedSide === 'request' });
      expect(recordFailure).toHaveBeenCalledTimes(failedSide === 'both' ? 2 : 1);
      expect(recordFailure).toHaveBeenCalledWith('capture.persist-failed', expect.objectContaining({ errorCode: 'Error' }));
      expect(captureEventQueue.drain(10)).toMatchObject([{ summary: { id: exchangeId, state: 'aborted' } }]);
      expect(exchangeTracker.activeCount).toBe(0);
    },
  );
});