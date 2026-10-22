import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AbortedRequest, BodyData, InitiatedRequest } from 'mockttp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureService } from '../../../capture/entry';
import { initializeRuntime } from '../../../constants';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { ExchangeTracker } from '../../internal/exchange-tracker';

const request: InitiatedRequest = {
  id: 'aborted-request', protocol: 'http', httpVersion: '2', method: 'POST',
  url: 'https://example.test/aborted', path: '/aborted',
  remoteIpAddress: '127.0.0.1', remotePort: 50_000,
  destination: { hostname: 'example.test', port: 443 },
  headers: {}, rawHeaders: [], timingEvents: { startTime: 1000, startTimestamp: 0 }, tags: [],
};

function body(content: string | Buffer, isEnded = false): BodyData {
  return { id: request.id, content: Buffer.from(content), isEnded, eventTimestamp: 10 };
}

function abort(timestamp = 20): AbortedRequest {
  return { ...request, error: { code: 'ECONNRESET' },
    timingEvents: { ...request.timingEvents, abortedTimestamp: timestamp } };
}

describe('ExchangeTracker aborted body grace period', () => {
  let directory: string;
  let captureService: CaptureService;
  let captureEventQueue: CaptureEventQueue;
  let exchangeTracker: ExchangeTracker;
  let exchangeId: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-abort-grace-'));
    initializeRuntime([`--data-dir=${directory}`]);
    captureService = new CaptureService();
    await captureService.initialize();
    await captureService.ensureSession({
      id: 'session-1', name: 'Recording', startedAt: 1000, captureMode: 'explicit-proxy', appVersion: '0.0.0',
    });
    captureEventQueue = new CaptureEventQueue();
    exchangeTracker = new ExchangeTracker(captureService, captureEventQueue);
    exchangeTracker.setSession('session-1');
    exchangeTracker.beginRequest(request);
    exchangeId = (await exchangeTracker.whenExchangeReady(request.id))!;
    exchangeTracker.beginResponse({
      id: request.id, statusCode: 200, statusMessage: '', headers: {}, rawHeaders: [],
      timingEvents: { ...request.timingEvents, headersSentTimestamp: 1 }, tags: [],
    });
    await exchangeTracker.settle();
    captureEventQueue.drain(10);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'clearImmediate', 'Date'] });
    vi.setSystemTime(1020);
  });

  afterEach(async () => {
    exchangeTracker.reset();
    await exchangeTracker.settle();
    await captureService.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(['request', 'response'] as const)('keeps %s bytes readable until the fixed one-second window closes', async (side) => {
    const append = (data: BodyData) => side === 'request'
      ? exchangeTracker.appendRequestBody(data)
      : exchangeTracker.appendResponseBody(data);
    append(body('first-'));
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(0);

    expect(exchangeTracker.activeCount).toBe(0);
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toMatchObject({
      summary: { state: 'aborted', statusCode: 200, durationMs: 20 },
      errorCode: 'ECONNRESET',
    });
    await expect(captureService.getExchangeBodySnapshot(exchangeId, side)).resolves.toMatchObject({
      complete: false, encodedSize: 6, available: true, bodyHash: undefined,
    });
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    append(body('late'));
    await expect(captureService.readExchangeBodyRange(exchangeId, side, 0, 10))
      .resolves.toEqual(Buffer.from('first-late'));
    await expect(captureService.getExchangeBodySnapshot(exchangeId, side)).resolves.toMatchObject({ complete: false });

    await vi.advanceTimersByTimeAsync(2);
    await exchangeTracker.settle();
    await expect(captureService.getExchangeBodySnapshot(exchangeId, side)).resolves.toMatchObject({
      complete: true, encodedSize: 10, available: true,
      bodyHash: createHash('sha256').update('first-late').digest('hex'),
    });
    append(body('discarded', true));
    await exchangeTracker.settle();
    await expect(captureService.readExchangeBodyRange(exchangeId, side, 0, 100))
      .resolves.toEqual(Buffer.from('first-late'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows the first body batch after abort and keeps an empty side pending until the deadline', async () => {
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(0);
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'response')).resolves.toMatchObject({
      encodedSize: 0, available: false, complete: false,
    });
    await vi.advanceTimersByTimeAsync(700);
    exchangeTracker.appendResponseBody(body('first and last'));
    await expect(captureService.readExchangeBodyRange(exchangeId, 'response', 0, 100))
      .resolves.toEqual(Buffer.from('first and last'));
    await vi.advanceTimersByTimeAsync(301);
    await exchangeTracker.settle();
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'response')).resolves.toMatchObject({
      encodedSize: 14, complete: true, available: true,
    });
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'request')).resolves.toMatchObject({
      encodedSize: 0, available: false, complete: true,
    });
  });

  it('does not restart the timer, alter the abort time or become completed after repeated events', async () => {
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(800);
    exchangeTracker.abortExchange(abort(800));
    exchangeTracker.appendRequestBody(body('request', true));
    exchangeTracker.appendResponseBody(body('response', true));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(201);
    await exchangeTracker.settle();

    const detail = await captureService.getExchangeDetail(exchangeId);
    expect(detail).toMatchObject({
      summary: { state: 'aborted', durationMs: 20, requestBytes: 7, responseBytes: 8 },
      requestBody: { encodedSize: 7 }, responseBody: { encodedSize: 8 },
    });
    expect(captureEventQueue.drain(10)).toMatchObject([{ summary: { state: 'aborted', durationMs: 20 } }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a previously completed body closed while the other side drains', async () => {
    exchangeTracker.appendRequestBody(body('complete request', true));
    await exchangeTracker.settle();
    const complete = (await captureService.getExchangeDetail(exchangeId))!.requestBody;
    exchangeTracker.abortExchange(abort());
    exchangeTracker.appendRequestBody(body('must not append'));
    exchangeTracker.appendResponseBody(body('partial response'));
    await vi.advanceTimersByTimeAsync(1001);
    await exchangeTracker.settle();
    const detail = await captureService.getExchangeDetail(exchangeId);
    expect(detail?.requestBody).toEqual(complete);
    expect(detail?.summary).toMatchObject({ state: 'aborted', requestBytes: 16, responseBytes: 16 });
  });

  it.each(['all', 'session', 'dispose'] as const)('cancels waiting and spill ownership when %s removes an aborted record', async (scope) => {
    exchangeTracker.appendResponseBody(body(Buffer.alloc(4 * 1024 * 1024, 0x61)));
    await captureService.getExchangeBodySnapshot(exchangeId, 'response');
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(0);
    const createWriter = vi.spyOn(captureService, 'createBodyWriter');
    if (scope === 'dispose') await captureService.dispose();
    else await captureService.cleanup(scope === 'all' ? { kind: 'all' } : { kind: 'session', sessionId: 'session-1' });

    expect(vi.getTimerCount()).toBe(0);
    exchangeTracker.appendResponseBody(body('must not recreate'));
    await vi.advanceTimersByTimeAsync(1500);
    await exchangeTracker.settle();
    expect(createWriter).not.toHaveBeenCalled();
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toBeNull();
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'response')).resolves.toMatchObject({
      complete: true, available: false, encodedSize: 0,
    });
  });

  it('keeps grace work in settle and cancels it without waiting when the tracker resets', async () => {
    exchangeTracker.abortExchange(abort());
    let settled = false;
    const settling = exchangeTracker.settle().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    exchangeTracker.reset();
    await settling;
    await exchangeTracker.settle();
    expect(vi.getTimerCount()).toBe(0);
    exchangeTracker.appendResponseBody(body('after reset'));
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'response')).resolves.toMatchObject({
      complete: true, available: false, encodedSize: 0,
    });
  });

  it('lets an existing aborted capture drain while Recording is paused', async () => {
    exchangeTracker.abortExchange(abort());
    captureService.pauseRecording();
    exchangeTracker.beginRequest({ ...request, id: 'not-recorded' });
    exchangeTracker.appendResponseBody(body('late while paused'));
    await vi.advanceTimersByTimeAsync(1001);
    await exchangeTracker.settle();
    await expect(captureService.getExchangeBodySnapshot(exchangeId, 'response')).resolves.toMatchObject({
      complete: true, encodedSize: 17, available: true,
    });
    expect(exchangeTracker.totalCaptured).toBe(1);
  });

  it('cancels a discarded record even when neither writer has been created', async () => {
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    await captureService.cleanup({ kind: 'session', sessionId: 'session-1' });
    expect(vi.getTimerCount()).toBe(0);
    const createWriter = vi.spyOn(captureService, 'createBodyWriter');
    exchangeTracker.appendRequestBody(body('late request'));
    exchangeTracker.appendResponseBody(body('late response'));
    await exchangeTracker.settle();
    expect(createWriter).not.toHaveBeenCalled();
  });

  it('seals pending aborts during listener replacement without changing their terminal time or error', async () => {
    exchangeTracker.abortExchange(abort());
    await vi.advanceTimersByTimeAsync(500);
    exchangeTracker.appendResponseBody(body('before replacement'));
    exchangeTracker.abortInFlight('ERR_LISTENER_REBUILD');
    await exchangeTracker.settle();
    expect(vi.getTimerCount()).toBe(0);
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toMatchObject({
      summary: { state: 'aborted', durationMs: 20, responseBytes: 18 },
      errorCode: 'ECONNRESET', responseBody: { encodedSize: 18 },
    });
    exchangeTracker.appendResponseBody(body('after replacement'));
    await expect(captureService.readExchangeBodyRange(exchangeId, 'response', 0, 100))
      .resolves.toEqual(Buffer.from('before replacement'));
  });

  it('does not delay normal completion or reopen it for a late abort', async () => {
    exchangeTracker.appendRequestBody(body('request', true));
    exchangeTracker.appendResponseBody(body('response', true));
    await exchangeTracker.settle();
    expect(vi.getTimerCount()).toBe(0);
    const completed = await captureService.getExchangeDetail(exchangeId);
    expect(completed).toMatchObject({
      summary: { state: 'completed', requestBytes: 7, responseBytes: 8 },
      requestBody: { encodedSize: 7 }, responseBody: { encodedSize: 8 },
    });
    exchangeTracker.abortExchange(abort());
    exchangeTracker.appendResponseBody(body('late'));
    await exchangeTracker.settle();
    expect(vi.getTimerCount()).toBe(0);
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toEqual(completed);
  });

  it('flushes pending observation callbacks before sealing overdue timers in the same event-loop turn', async () => {
    vi.useRealTimers();
    const delivered = new Promise<void>((resolve) => {
      setTimeout(() => setImmediate(() => {
        exchangeTracker.appendResponseBody(body('already observed'));
        resolve();
      }), 20);
    });
    exchangeTracker.abortExchange(abort());
    // 模拟进程暂停；20ms观测与1000ms封口同时到期，不改变生产超时。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
    await delivered;
    await exchangeTracker.settle();
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toMatchObject({
      summary: { state: 'aborted', durationMs: 20, responseBytes: 16 },
      responseBody: { encodedSize: 16 },
    });
  });
});
