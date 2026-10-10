import { promises as fs } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AbortedRequest, BodyData, InitiatedRequest, InitiatedResponse } from 'mockttp';

import { CaptureService } from '../../../capture/entry';
import { initializeRuntime } from '../../../constants';
import { CaptureEventQueue } from '../../internal/capture-event-queue';
import { ExchangeTracker } from '../../internal/exchange-tracker';

function request(): InitiatedRequest {
  return {
    id: 'early-response', protocol: 'http', httpVersion: '1.1', method: 'POST',
    url: 'http://example.test/early-response', path: '/early-response',
    remoteIpAddress: '127.0.0.1', remotePort: 50_000,
    destination: { hostname: 'example.test', port: 80 },
    headers: { 'content-type': 'text/plain' }, rawHeaders: [['content-type', 'text/plain']],
    timingEvents: { startTime: Date.now() }, tags: [],
  } as unknown as InitiatedRequest;
}

function response(statusCode = 200): InitiatedResponse {
  return {
    id: 'early-response', statusCode, statusMessage: STATUS_CODES[statusCode],
    headers: { 'content-type': 'text/plain' }, rawHeaders: [['content-type', 'text/plain']],
    timingEvents: { startTime: Date.now(), headersSentTimestamp: Date.now() },
  } as unknown as InitiatedResponse;
}

function bodyData(content: string, isEnded: boolean): BodyData {
  return { id: 'early-response', content: Buffer.from(content), isEnded, eventTimestamp: Date.now() };
}

describe('ExchangeTracker early response capture', () => {
  let directory = '';
  let captureService: CaptureService;
  let exchangeTracker: ExchangeTracker;
  let exchangeId: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-early-response-'));
    initializeRuntime([`--data-dir=${directory}`]);
    captureService = new CaptureService();
    await captureService.initialize();
    await captureService.ensureSession({
      id: 'session-1', name: 'Recording', startedAt: Date.now(), captureMode: 'explicit-proxy', appVersion: '0.0.0',
    });
    exchangeTracker = new ExchangeTracker(captureService, new CaptureEventQueue());
    exchangeTracker.setSession('session-1');
    exchangeTracker.beginRequest(request());
    exchangeId = exchangeTracker.exchangeIdFor('early-response')!;
  });

  afterEach(async () => {
    await exchangeTracker.settle();
    await captureService.dispose();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each([
    { statusCode: 200, firstChunk: '' },
    { statusCode: 200, firstChunk: 'first-' },
    { statusCode: 401, firstChunk: 'first-' },
    { statusCode: 500, firstChunk: 'first-' },
  ])('keeps a $statusCode early response readable while the upload after "$firstChunk" is active', async ({ statusCode, firstChunk }) => {
    if (firstChunk) exchangeTracker.appendRequestBody(bodyData(firstChunk, false));
    exchangeTracker.beginResponse(response(statusCode));
    exchangeTracker.appendResponseBody(bodyData('early response', true));

    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { statusCode, responseBytes: 14 }, responseBody: { encodedSize: 14 },
    });
    expect(exchangeTracker.activeCount).toBe(1);
    const pending = await captureService.getExchangeDetail(exchangeId);
    expect(pending?.summary.state).not.toBe('completed');
    await expect(captureService.readBodyRange(pending!.responseBody!.bodyHash!, 0, 14))
      .resolves.toEqual(Buffer.from('early response'));

    exchangeTracker.appendRequestBody(bodyData('remaining upload', true));
    const expectedBody = Buffer.from(`${firstChunk}remaining upload`);
    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { state: 'completed', requestBytes: expectedBody.byteLength },
      requestBody: { encodedSize: expectedBody.byteLength }, responseBody: pending?.responseBody,
    });
    const complete = await captureService.getExchangeDetail(exchangeId);
    await expect(captureService.readBodyRange(complete!.requestBody!.bodyHash!, 0, expectedBody.byteLength))
      .resolves.toEqual(expectedBody);
    expect(exchangeTracker.activeCount).toBe(0);
    expect(exchangeTracker.totalCaptured).toBe(1);
  });

  it('finishes a 413 capture only after the response ends and retains the observed upload', async () => {
    exchangeTracker.appendRequestBody(bodyData('partial upload', false));
    exchangeTracker.beginResponse(response(413));
    exchangeTracker.appendResponseBody(bodyData('too ', false));

    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { statusCode: 413, state: 'response-streaming', requestBytes: 14, responseBytes: 4 },
    });
    expect(exchangeTracker.activeCount).toBe(1);

    exchangeTracker.appendRequestBody(bodyData(' received', false));
    exchangeTracker.appendResponseBody(bodyData('large', true));
    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { statusCode: 413, state: 'completed', requestBytes: 23, responseBytes: 9 },
      requestBody: { encodedSize: 23 }, responseBody: { encodedSize: 9 },
    });
    const completed = await captureService.getExchangeDetail(exchangeId);
    await expect(captureService.readBodyRange(completed!.requestBody!.bodyHash!, 0, 23))
      .resolves.toEqual(Buffer.from('partial upload received'));
    await expect(captureService.readBodyRange(completed!.responseBody!.bodyHash!, 0, 9))
      .resolves.toEqual(Buffer.from('too large'));
    expect(exchangeTracker.activeCount).toBe(0);

    exchangeTracker.appendRequestBody(bodyData('late upload', true));
    exchangeTracker.abortExchange({
      ...request(), error: { code: 'ECONNRESET' },
      timingEvents: { startTime: Date.now(), abortedTimestamp: Date.now() },
    } as unknown as AbortedRequest);
    await exchangeTracker.settle();
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toEqual(completed);
    expect(exchangeTracker.totalCaptured).toBe(1);
  });

  it('preserves a completed upload when its response is 413', async () => {
    exchangeTracker.appendRequestBody(bodyData('complete upload', true));
    exchangeTracker.beginResponse(response(413));
    exchangeTracker.appendResponseBody(bodyData('too large', true));

    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { statusCode: 413, state: 'completed', requestBytes: 15, responseBytes: 9 },
      requestBody: { encodedSize: 15 }, responseBody: { encodedSize: 9 },
    });
    const completed = await captureService.getExchangeDetail(exchangeId);
    await expect(captureService.readBodyRange(completed!.requestBody!.bodyHash!, 0, 15))
      .resolves.toEqual(Buffer.from('complete upload'));
    expect(exchangeTracker.activeCount).toBe(0);
  });

  it('retains the completed response and partial upload when the client aborts', async () => {
    exchangeTracker.beginResponse(response());
    exchangeTracker.appendResponseBody(bodyData('early response', true));
    exchangeTracker.appendRequestBody(bodyData('partial upload', false));
    exchangeTracker.abortExchange({
      ...request(), error: { code: 'ECONNRESET' },
      timingEvents: { startTime: Date.now(), abortedTimestamp: Date.now() },
    } as unknown as AbortedRequest);

    await expect.poll(() => captureService.getExchangeDetail(exchangeId)).toMatchObject({
      summary: { state: 'aborted', requestBytes: 14, responseBytes: 14 },
    });
    await exchangeTracker.settle();
    await expect(captureService.getExchangeDetail(exchangeId)).resolves.toMatchObject({
      summary: { state: 'aborted', requestBytes: 14, responseBytes: 14 },
      requestBody: { encodedSize: 14 }, responseBody: { encodedSize: 14 },
    });
    const detail = await captureService.getExchangeDetail(exchangeId);
    await expect(captureService.readBodyRange(detail!.requestBody!.bodyHash!, 0, 14))
      .resolves.toEqual(Buffer.from('partial upload'));
    await expect(captureService.readBodyRange(detail!.responseBody!.bodyHash!, 0, 14))
      .resolves.toEqual(Buffer.from('early response'));
    expect(exchangeTracker.activeCount).toBe(0);
  });
});