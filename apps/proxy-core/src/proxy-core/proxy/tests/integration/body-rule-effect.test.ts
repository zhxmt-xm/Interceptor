import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BodyData, InitiatedRequest, InitiatedResponse } from 'mockttp';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { CaptureService } from '../../../capture/entry';
import { initializeRuntime } from '../../../constants';
import type { RuleBodyEffect } from '../../../rules/interfaces';
import { ExchangeTracker } from '../../internal/exchange-tracker';
import { CaptureEventQueue } from '../../internal/capture-event-queue';

function request(id: string): InitiatedRequest {
  return {
    id,
    protocol: 'http',
    httpVersion: '1.1',
    method: 'POST',
    url: 'http://example.test/body-effect',
    path: '/body-effect',
    remoteIpAddress: '127.0.0.1',
    remotePort: 50_000,
    destination: { hostname: 'example.test', port: 80 },
    headers: { 'content-type': 'text/plain' },
    rawHeaders: [['content-type', 'text/plain']],
    timingEvents: { startTime: Date.now() },
    tags: [],
  } as unknown as InitiatedRequest;
}

function response(id: string): InitiatedResponse {
  return {
    id,
    statusCode: 200,
    statusMessage: 'OK',
    headers: { 'content-type': 'text/plain' },
    rawHeaders: [['content-type', 'text/plain']],
    timingEvents: { startTime: Date.now(), headersSentTimestamp: Date.now() },
  } as unknown as InitiatedResponse;
}

function bodyData(id: string, content: string): BodyData {
  return {
    id,
    content: Buffer.from(content),
    isEnded: true,
    eventTimestamp: Date.now(),
  };
}

function bodyEffect(
  ruleId: string,
  phase: 'request' | 'response',
): RuleBodyEffect {
  return { ruleId, phase, effect: 'replace', source: 'text' };
}

describe('ExchangeTracker body Rule evidence', () => {
  let directory = '';
  let captureService: CaptureService;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-body-effect-'));
    initializeRuntime([`--data-dir=${directory}`]);
    captureService = new CaptureService();
    await captureService.initialize();
    await captureService.ensureSession({
      id: 'session-1',
      name: 'Recording',
      startedAt: Date.now(),
      captureMode: 'explicit-proxy',
      appVersion: '0.0.0',
    });
  });

  afterEach(async () => {
    await captureService.dispose();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('keeps Request Original beside Final and marks Response Original unavailable', async () => {
    const requestOriginal = 'request original';
    const requestFinal = 'request final';
    const responseFinal = 'response final';
    const exchangeTracker = new ExchangeTracker(captureService, new CaptureEventQueue());
    exchangeTracker.setSession('session-1');
    exchangeTracker.beginRequest(request('request-1'));
    exchangeTracker.recordRuleOutcome('request-1', [], [], {
      effect: bodyEffect('request-writer', 'request'),
      content: Buffer.from(requestFinal),
      mediaType: 'text/plain',
    });
    exchangeTracker.appendRequestBody(bodyData('request-1', requestOriginal));
    exchangeTracker.recordRuleOutcome('request-1', [], [], {
      effect: bodyEffect('response-writer', 'response'),
      content: Buffer.from(responseFinal),
      mediaType: 'text/plain',
    });
    exchangeTracker.beginResponse(response('request-1'));
    exchangeTracker.appendResponseBody(bodyData('request-1', responseFinal));

    let detail: CaptureExchangeDetail | null = null;
    await expect.poll(async () => {
      const page = await captureService.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: {},
      });
      detail = page.items[0]
        ? await captureService.getExchangeDetail(page.items[0].id)
        : null;
      return detail;
    }).toMatchObject({
      requestBodyEffect: {
        ruleId: 'request-writer',
        effect: 'replace',
        source: 'text',
        originalState: 'available',
        originalBody: { encodedSize: Buffer.byteLength(requestOriginal) },
      },
      responseBodyEffect: {
        ruleId: 'response-writer',
        effect: 'replace',
        source: 'text',
        originalState: 'unavailable',
      },
    });

    const requestBody = detail!.requestBody!;
    const requestOriginalBody = detail!.requestBodyEffect!.originalBody!;
    const responseBody = detail!.responseBody!;
    await expect(captureService.readBodyRange(
      requestBody.bodyHash!,
      0,
      requestBody.encodedSize,
    )).resolves.toEqual(Buffer.from(requestFinal));
    await expect(captureService.readBodyRange(
      requestOriginalBody.bodyHash!,
      0,
      requestOriginalBody.encodedSize,
    )).resolves.toEqual(Buffer.from(requestOriginal));
    await expect(captureService.readBodyRange(
      responseBody.bodyHash!,
      0,
      responseBody.encodedSize,
    )).resolves.toEqual(Buffer.from(responseFinal));
  });

  it('preserves an empty Final reference and distinguishes an empty Request Original', async () => {
    const exchangeTracker = new ExchangeTracker(captureService, new CaptureEventQueue());
    exchangeTracker.setSession('session-1');
    exchangeTracker.beginRequest(request('request-empty'));
    exchangeTracker.recordRuleOutcome('request-empty', [], [], {
      effect: bodyEffect('empty-writer', 'request'),
      content: Buffer.alloc(0),
      mediaType: 'text/plain',
    });
    exchangeTracker.appendRequestBody(bodyData('request-empty', ''));
    exchangeTracker.beginResponse(response('request-empty'));
    exchangeTracker.appendResponseBody(bodyData('request-empty', 'response'));

    let detail: CaptureExchangeDetail | null = null;
    await expect.poll(async () => {
      const page = await captureService.querySessions({
        limit: 10,
        sort: 'started_desc',
        filter: {},
      });
      detail = page.items[0]
        ? await captureService.getExchangeDetail(page.items[0].id)
        : null;
      return detail;
    }).toMatchObject({
      requestBody: {
        bodyHash: undefined,
        encodedSize: 0,
      },
      requestBodyEffect: {
        ruleId: 'empty-writer',
        originalState: 'empty',
      },
    });
    const finalPage = await captureService.querySessions({
      limit: 10,
      sort: 'started_desc',
      filter: {},
    });
    const finalDetail = finalPage.items[0]
      ? await captureService.getExchangeDetail(finalPage.items[0].id)
      : null;
    expect(finalDetail?.requestBodyEffect?.originalBody).toBeUndefined();
  });
});
