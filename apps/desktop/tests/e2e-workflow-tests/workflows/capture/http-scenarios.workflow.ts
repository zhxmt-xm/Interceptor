import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer, request, type ClientRequest, type IncomingMessage, type ServerResponse } from 'node:http';

import { closeServer, listen } from '../../../../../playground/server/shared/traffic-utils';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const HTTP_SCENARIOS = [
  { id: 'h1-json', method: 'GET', requestBody: '', contentType: 'application/json', responseParts: ['ord_42', 'ready', 'items'] },
  { id: 'h1-upload', method: 'POST', requestBody: '{"part":1,"message":"playground","done":true}', contentType: 'application/json', responseParts: ['receivedBytes', 'playground-upload'] },
  { id: 'h1-stream', method: 'GET', requestBody: '', contentType: 'application/x-ndjson', responseParts: ['{"chunk":1}', '{"chunk":2}', '{"chunk":3}'] },
  { id: 'h1-early-response', method: 'POST', requestBody: '{"request":"continues-after-response"}', contentType: 'application/json', responseParts: ['sent-before-request-completed'] },
] as const;

test('capture.scenarios.http captures JSON uploads streaming early responses and aborts', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.http' });

  // 准备：通过真实产品UI开启Recording，复用现有场景，独立定义产品期望。
  // Arrange: start Recording through product UI, reuse existing scenarios, and define product expectations independently.
  await startRecording(desktopApp);
  const evidence: Array<{ scenarioId: string; row: string | null; requestBytes: number; responseBytes: number }> = [];

  for (const expected of HTTP_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing HTTP scenario: ${expected.id}`);

      // 外部流量：默认Draft经真实8888发出，origin必须收到完整请求，响应必须完整返回。
      // External traffic: send the default Draft through port 8888 and require complete origin request and client response facts.
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({
        state: 'complete', protocol: 'http/1.1',
        request: { method: expected.method, body: expected.requestBody, bodyBytes: Buffer.byteLength(expected.requestBody) },
        response: { statusCode: 200, headers: { 'content-type': expected.contentType } },
      });

      // 业务断言：只出现一个自产Exchange，Headers保留场景身份与响应MIME。
      // Product assertions: one generated Exchange appears and its Headers preserve the scenario identity and response MIME.
      const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      for (const value of ['h1', expected.method, '200']) await expect(row).toContainText(value);
      await row.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      for (const [sectionId, values] of [
        [AUTOMATION_IDS.capture.inspector.section.requestHeaders, ['x-playground-scenario-id', expected.id]],
        [AUTOMATION_IDS.capture.inspector.section.responseHeaders, ['Content-Type', expected.contentType]],
      ] as const) {
        const section = getByAutomationId(desktopApp.page, sectionId);
        if (await section.getAttribute('aria-expanded') === 'false') await section.click();
        const bodyId = await section.getAttribute('aria-controls');
        if (!bodyId) throw new Error(`Missing section body: ${sectionId}`);
        for (const value of values) await expect(desktopApp.page.locator(`[id="${bodyId}"]`)).toContainText(value);
      }

      // 正文断言：真实点击Request/Response与Raw，核对完整上传以及每个响应分块。
      // Body assertions: click Request/Response and Raw to verify the complete upload and every response chunk.
      if (expected.requestBody) {
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.request).click();
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.requestBody))
          .toContainText(String(Buffer.byteLength(expected.requestBody)));
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane))
          .toContainText(expected.requestBody);
      }
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      const responseBody = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane);
      for (const value of expected.responseParts) await expect(responseBody).toContainText(value);
      if (expected.id === 'h1-upload') {
        await expect(responseBody).toContainText(`"receivedBytes": ${Buffer.byteLength(expected.requestBody)}`);
      }
      evidence.push({ scenarioId: expected.id, row: await row.getAttribute('data-automation-id'),
        requestBytes: result.request!.bodyBytes, responseBytes: result.response!.bodyBytes });
    });
  }

  // 进行中：SSE由外部origin逐段释放，Capture必须在响应结束前展示同一行及增长字节。
  // In flight: release SSE events from the external origin and require one Capture row with growing bytes before completion.
  for (const responseEnding of ['complete', 'client-abort', 'origin-reset'] as const) {
    const scenarioId = responseEnding === 'complete' ? 'sse-inflight' : `sse-${responseEnding}`;
    await test.step(scenarioId, async () => {
      const requestPath = `/e2e/http-${scenarioId}`;
      const events = [
        'event: update\ndata: {"sequence":1}\n\n',
        'event: update\ndata: {"sequence":2}\n\n',
        'event: update\ndata: {"sequence":3}\n\n',
      ];
      const responseChunks: Buffer[] = [];
      let originResponse: ServerResponse | undefined;
      let originClosed = false;
      let clientResponse: IncomingMessage | undefined;
      let streamRequest: ClientRequest | undefined;
      let completedResponse: Promise<Buffer> | undefined;
      const origin = createServer((incoming, response) => {
        incoming.resume();
        incoming.on('error', () => undefined);
        originResponse = response;
        response.once('close', () => { originClosed = true; });
      });
      try {
        const port = await listen(origin);
        completedResponse = new Promise<Buffer>((resolve, reject) => {
          streamRequest = request({
            hostname: '127.0.0.1', port: desktopApp.capturePort(), method: 'GET',
            path: `http://127.0.0.1:${port}${requestPath}`,
          }, (response) => {
            clientResponse = response;
            response.on('data', (chunk: Buffer) => responseChunks.push(Buffer.from(chunk)));
            response.once('end', () => resolve(Buffer.concat(responseChunks)));
            response.once('error', reject);
          });
          streamRequest.once('error', reject);
          streamRequest.end();
        });
        void completedResponse.catch(() => undefined);
        await expect.poll(() => originResponse !== undefined).toBe(true);
        const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: requestPath });
        await expect(row).toHaveCount(1);
        expect(originResponse!.headersSent).toBe(false);
        const rowId = await row.getAttribute('data-automation-id');
        const pendingRow = await row.textContent();

        originResponse!.writeHead(200, { 'content-type': 'text/event-stream' });
        const streamingStates = [];
        for (const event of events.slice(0, 2)) {
          originResponse!.write(event);
          const receivedEvents = events.slice(0, streamingStates.length + 1).join('');
          const responseBytes = Buffer.byteLength(receivedEvents);
          await expect.poll(() => Buffer.concat(responseChunks).toString('utf8')).toBe(receivedEvents);
          await expect(row).toHaveCount(1);
          for (const value of ['GET', 'h1', '200', `${responseBytes} B`]) await expect(row).toContainText(value);
          await expect(row).toHaveAttribute('data-automation-id', rowId!);
          expect(originResponse!.writableEnded).toBe(false);
          expect(clientResponse!.complete).toBe(false);
          streamingStates.push({ responseBytes, row: await row.textContent(),
            originEnded: originResponse!.writableEnded, clientComplete: clientResponse!.complete });
          if (streamingStates.length === 1) {
            await row.click();
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
            const section = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.responseHeaders);
            if (await section.getAttribute('aria-expanded') === 'false') await section.click();
            const bodyId = await section.getAttribute('aria-controls');
            if (!bodyId) throw new Error('Missing SSE response headers section body.');
            await expect(desktopApp.page.locator(`[id="${bodyId}"]`)).toContainText('text/event-stream');
          }
        }
        await desktopApp.page.screenshot({ path: testInfo.outputPath(`${scenarioId}.png`) });
        if (responseEnding === 'complete') {
          originResponse!.end(events[2]);
          await expect(completedResponse).resolves.toEqual(Buffer.from(events.join('')));
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
          const textMode = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyMode.default);
          await textMode.click();
          await expect(textMode).toHaveAttribute('aria-checked', 'true');
          const responseBody = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane);
          for (const line of events.join('').split('\n').filter(Boolean)) await expect(responseBody).toContainText(line);
        } else {
          if (responseEnding === 'client-abort') streamRequest!.destroy(new Error('SSE client aborted'));
          else originResponse!.destroy();
          await expect(completedResponse).rejects.toThrow();
          expect(clientResponse!.complete).toBe(false);
        }
        await expect.poll(() => originClosed).toBe(true);
        await expect(row).toHaveAttribute('data-automation-id', rowId!);
        await expect(row).toContainText(`${Buffer.concat(responseChunks).byteLength} B`);
        await expect(row).not.toContainText('\u00b7\u00b7\u00b7');

        const evidencePath = testInfo.outputPath(`${scenarioId}.json`);
        await writeFile(evidencePath, JSON.stringify({ responseEnding, rowId, pendingRow, streamingStates,
          final: { row: await row.textContent(), responseBytes: Buffer.concat(responseChunks).byteLength,
            originClosed, originEnded: originResponse!.writableEnded, clientComplete: clientResponse!.complete } }, null, 2), 'utf8');
        await testInfo.attach(`${scenarioId}.json`, { path: evidencePath, contentType: 'application/json' });
      } finally {
        streamRequest?.destroy();
        originResponse?.end();
        await completedResponse?.catch(() => undefined);
        await closeServer(origin);
      }
    });
  }

  // 长上传：分别验证未知长度、明确长度和100 Continue，源站与Capture在上传结束前看到分块。
  // Long uploads: cover unknown length, declared length, and 100 Continue with origin and Capture progress before completion.
  for (const uploadMode of ['chunked', 'content-length', 'expect-continue', 'client-abort'] as const) {
    await test.step(`upload-${uploadMode}`, async () => {
      const requestPath = `/e2e/http-upload-${uploadMode}`;
      const keywordFilter = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter);
      await keywordFilter.fill(requestPath);
      const uploadChunks = [0x61, 0x62, 0x63].map((value) => Buffer.alloc(2 * 1024 * 1024, value));
      const expectedBytes = uploadChunks.reduce((totalBytes, chunk) => totalBytes + chunk.byteLength, 0);
      const expectedHash = createHash('sha256');
      for (const chunk of uploadChunks) expectedHash.update(chunk);
      const originHash = createHash('sha256');
      let originUpload: IncomingMessage | undefined;
      let originClosed = false;
      let originBytes = 0;
      let originDigest: string | undefined;
      let continueReceived = false;
      let uploadRequest: ClientRequest | undefined;
      let completedResponse: Promise<string> | undefined;
      const origin = createServer((incoming, response) => {
        originUpload = incoming;
        incoming.on('error', () => undefined);
        incoming.once('close', () => { originClosed = true; });
        incoming.on('data', (chunk: Buffer) => {
          originHash.update(chunk);
          originBytes += chunk.byteLength;
        });
        incoming.once('end', () => {
          originDigest = originHash.digest('hex');
          response.writeHead(200, { 'content-type': 'text/plain' });
          response.end('upload-ok');
        });
      });
      try {
        const port = await listen(origin);
        completedResponse = new Promise<string>((resolve, reject) => {
          uploadRequest = request({
            hostname: '127.0.0.1', port: desktopApp.capturePort(), method: 'POST',
            path: `http://127.0.0.1:${port}${requestPath}`,
            headers: { 'content-type': 'text/plain',
              ...(uploadMode === 'content-length' ? { 'content-length': String(expectedBytes) } : {}),
              ...(uploadMode === 'expect-continue' ? { expect: '100-continue' } : {}) },
          }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            response.once('error', reject);
          });
          uploadRequest.once('error', reject);
          uploadRequest.once('continue', () => { continueReceived = true; });
          uploadRequest.flushHeaders();
        });
        void completedResponse.catch(() => undefined);
        await expect.poll(() => originUpload !== undefined).toBe(true);
        if (uploadMode === 'expect-continue') await expect.poll(() => continueReceived).toBe(true);
        expect(originBytes).toBe(0);
        const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: requestPath });
        await expect(row).toHaveCount(1);
        const rowId = await row.getAttribute('data-automation-id');
        const uploadStates = [];
        for (const [chunkIndex, chunk] of uploadChunks.slice(0, 2).entries()) {
          uploadRequest!.write(chunk);
          const sentBytes = (chunkIndex + 1) * chunk.byteLength;
          await expect.poll(() => originBytes).toBe(sentBytes);
          await expect(row).toContainText(`${sentBytes / (1024 * 1024)} MB`);
          expect(uploadRequest!.writableEnded).toBe(false);
          expect(originUpload!.complete).toBe(false);
          uploadStates.push({ sentBytes, originBytes, row: await row.textContent(),
            clientEnded: uploadRequest!.writableEnded, originComplete: originUpload!.complete });
        }
        await row.click();
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
        await desktopApp.page.screenshot({ path: testInfo.outputPath(`upload-${uploadMode}.png`) });
        if (uploadMode === 'client-abort') {
          uploadRequest!.destroy(new Error('Upload client aborted'));
          await expect(completedResponse).rejects.toThrow('Upload client aborted');
          await expect.poll(() => originClosed).toBe(true);
          expect(originUpload!.complete).toBe(false);
          expect(originBytes).toBe(4 * 1024 * 1024);
          await expect(row).toContainText('4 MB');
        } else {
          uploadRequest!.end(uploadChunks[2]);
          await expect(completedResponse).resolves.toBe('upload-ok');
          expect(originBytes).toBe(expectedBytes);
          expect(originDigest).toBe(expectedHash.digest('hex'));
          expect(originUpload!.complete).toBe(true);
          await expect(row).toContainText('200');
          await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
          await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane))
            .toContainText('upload-ok');
        }
        expect(originUpload!.headers[uploadMode === 'content-length' ? 'content-length' : 'transfer-encoding'])
          .toBe(uploadMode === 'content-length' ? String(expectedBytes) : 'chunked');
        await expect(row).toHaveAttribute('data-automation-id', rowId!);
        await expect(row).not.toContainText('\u00b7\u00b7\u00b7');
        const evidencePath = testInfo.outputPath(`upload-${uploadMode}.json`);
        await writeFile(evidencePath, JSON.stringify({ uploadMode, rowId, continueReceived, uploadStates,
          final: { originBytes, originDigest, originClosed, originComplete: originUpload!.complete,
            contentLength: originUpload!.headers['content-length'] ?? null,
            transferEncoding: originUpload!.headers['transfer-encoding'] ?? null,
            row: await row.textContent() } }, null, 2), 'utf8');
        await testInfo.attach(`upload-${uploadMode}.json`, { path: evidencePath, contentType: 'application/json' });
        await keywordFilter.fill('');
      } finally {
        uploadRequest?.destroy();
        await completedResponse?.catch(() => undefined);
        await closeServer(origin);
      }
    });
  }

  // 长下载：真实Pause或Clear发生在首段后，传输完整性与Capture代际分别断言。
  // Long downloads: pause or clear after the first chunk and assert transport integrity separately from the Capture generation.
  for (const captureAction of ['none', 'pause-resume', 'clear'] as const) {
    const scenarioId = `download-${captureAction === 'none' ? 'complete' : captureAction}`;
    await test.step(scenarioId, async () => {
      const requestPath = `/e2e/http-${scenarioId}`;
      const keywordFilter = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter);
      const recording = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle);
      await keywordFilter.fill(requestPath);
      const responseChunks = [0x64, 0x65, 0x66].map((value) => Buffer.alloc(2 * 1024 * 1024, value));
      const expectedHash = createHash('sha256');
      for (const chunk of responseChunks) expectedHash.update(chunk);
      const clientHash = createHash('sha256');
      let receivedBytes = 0;
      let originResponse: ServerResponse | undefined;
      let clientResponse: IncomingMessage | undefined;
      let downloadRequest: ClientRequest | undefined;
      let completedResponse: Promise<string> | undefined;
      const origin = createServer((incoming, response) => {
        incoming.resume();
        originResponse = response;
      });
      try {
        const port = await listen(origin);
        completedResponse = new Promise<string>((resolve, reject) => {
          downloadRequest = request({
            hostname: '127.0.0.1', port: desktopApp.capturePort(), method: 'GET',
            path: `http://127.0.0.1:${port}${requestPath}`,
          }, (response) => {
            clientResponse = response;
            response.on('data', (chunk: Buffer) => {
              clientHash.update(chunk);
              receivedBytes += chunk.byteLength;
            });
            response.once('end', () => resolve(clientHash.digest('hex')));
            response.once('error', reject);
          });
          downloadRequest.once('error', reject);
          downloadRequest.end();
        });
        void completedResponse.catch(() => undefined);
        await expect.poll(() => originResponse !== undefined).toBe(true);
        const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: requestPath });
        await expect(row).toHaveCount(1);
        const rowId = await row.getAttribute('data-automation-id');
        originResponse!.writeHead(200, { 'content-type': 'text/plain' });
        const downloadStates = [];
        for (const [chunkIndex, chunk] of responseChunks.slice(0, 2).entries()) {
          originResponse!.write(chunk);
          const sentBytes = (chunkIndex + 1) * chunk.byteLength;
          await expect.poll(() => receivedBytes).toBe(sentBytes);
          expect(originResponse!.writableEnded).toBe(false);
          expect(clientResponse!.complete).toBe(false);
          const rowRemoved = captureAction === 'clear' && chunkIndex > 0;
          if (rowRemoved) await expect(row).toHaveCount(0);
          else await expect(row).toContainText(`${sentBytes / (1024 * 1024)} MB`);
          downloadStates.push({ receivedBytes, row: rowRemoved ? null : await row.textContent(),
            recording: await recording.getAttribute('aria-pressed'),
            originEnded: originResponse!.writableEnded, clientComplete: clientResponse!.complete });
          if (chunkIndex === 0) {
            await row.click();
            await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
            if (captureAction === 'pause-resume') {
              await recording.click();
              await expect(recording).toHaveAttribute('aria-pressed', 'false');
            } else if (captureAction === 'clear') {
              await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.clear).click();
              await expect(row).toHaveCount(0);
            }
          }
        }
        await desktopApp.page.screenshot({ path: testInfo.outputPath(`${scenarioId}.png`) });
        originResponse!.end(responseChunks[2]);
        const responseDigest = await completedResponse;
        expect(responseDigest).toBe(expectedHash.digest('hex'));
        expect(receivedBytes).toBe(6 * 1024 * 1024);
        expect(clientResponse!.complete).toBe(true);
        if (captureAction === 'clear') {
          await keywordFilter.fill('');
          const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'h1-json');
          if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing HTTP JSON scenario.');
          const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
          expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
          const freshRow = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
            .filter({ hasText: scenario.defaultDraft.path });
          await expect(freshRow).toHaveCount(1);
          await expect(freshRow).toContainText('200');
          await expect(row).toHaveCount(0);
        } else {
          await expect(row).toHaveAttribute('data-automation-id', rowId!);
          await expect(row).toContainText('6 MB');
          await expect(row).not.toContainText('\u00b7\u00b7\u00b7');
          if (captureAction === 'pause-resume') {
            await recording.click();
            await expect(recording).toHaveAttribute('aria-pressed', 'true');
          }
          await keywordFilter.fill('');
        }
        const evidencePath = testInfo.outputPath(`${scenarioId}.json`);
        await writeFile(evidencePath, JSON.stringify({ captureAction, rowId, downloadStates,
          final: { receivedBytes, responseDigest, row: captureAction === 'clear' ? null : await row.textContent(),
            clientComplete: clientResponse!.complete, originEnded: originResponse!.writableEnded,
            recording: await recording.getAttribute('aria-pressed') } }, null, 2), 'utf8');
        await testInfo.attach(`${scenarioId}.json`, { path: evidencePath, contentType: 'application/json' });
      } finally {
        downloadRequest?.destroy();
        originResponse?.end();
        await completedResponse?.catch(() => undefined);
        await closeServer(origin);
      }
    });
  }

  // 拒绝上传：413响应完整结束后即可读取已捕获正文，不让客户端断开来触发收尾。
  // Rejected upload: read captured bodies after the full 413 response without disconnecting the client to trigger finalization.
  await test.step('413-response-completion', async () => {
    const requestPath = '/e2e/http-413-capture';
    const upload = Buffer.from('captured upload before rejection');
    const originChunks: Buffer[] = [];
    let originResponse: ServerResponse | undefined;
    const origin = createServer((incoming, response) => {
      incoming.on('data', (chunk: Buffer) => originChunks.push(Buffer.from(chunk)));
      incoming.on('error', () => undefined);
      incoming.once('data', () => {
        originResponse = response;
        response.writeHead(413, { 'content-type': 'text/plain' });
        response.write('upload ');
      });
    });
    let uploadRequest: ClientRequest | undefined;
    let receivedStatus: number | undefined;
    let completedResponse: Promise<Buffer> | undefined;
    try {
      const port = await listen(origin);
      completedResponse = new Promise<Buffer>((resolve, reject) => {
        uploadRequest = request({
          hostname: '127.0.0.1', port: desktopApp.capturePort(), method: 'POST',
          path: `http://127.0.0.1:${port}${requestPath}`,
          headers: { 'content-type': 'text/plain' },
        }, (response) => {
          receivedStatus = response.statusCode;
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          response.once('end', () => resolve(Buffer.concat(chunks)));
          response.once('error', reject);
        });
        uploadRequest.once('error', reject);
        uploadRequest.write(upload);
      });
      void completedResponse.catch(() => undefined);
      await expect.poll(() => receivedStatus).toBe(413);
      const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      for (const value of ['POST', 'h1', '413']) await expect(row).toContainText(value);
      await row.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.request).click();
      expect(Buffer.concat(originChunks)).toEqual(upload);
      expect(uploadRequest!.writableEnded).toBe(false);
      originResponse!.end('rejected');
      await expect(completedResponse).resolves.toEqual(Buffer.from('upload rejected'));

      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.section.requestBody))
        .toContainText(String(upload.byteLength));
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane))
        .toContainText(upload.toString('utf8'));
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.bodyPane))
        .toContainText('upload rejected');
      expect(uploadRequest!.writableEnded).toBe(false);
      await testInfo.attach('http-413-response-completion.json', {
        body: Buffer.from(JSON.stringify({ statusCode: receivedStatus, uploadEnded: uploadRequest!.writableEnded,
          capturedRequestBytes: upload.byteLength, capturedResponseBytes: Buffer.byteLength('upload rejected'),
          row: await row.getAttribute('data-automation-id') })),
        contentType: 'application/json',
      });
    } finally {
      uploadRequest?.destroy();
      await completedResponse?.catch(() => undefined);
      await closeServer(origin);
    }
  });

  // 中断：origin真实断开连接，Capture仍保留请求且不显示成功或等待状态。
  // Abort: the origin closes the real connection; Capture retains the request without a success or pending status.
  await test.step('h1-abort', async () => {
    const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'h1-abort');
    if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error('Missing HTTP abort scenario.');
    const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
    expect(result).toMatchObject({ state: 'failed', request: { method: 'GET', path: '/playground/h1-abort' } });
    expect(result.response).toBeUndefined();
    const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: '/playground/h1-abort' });
    await expect(row).toHaveCount(1);
    for (const value of ['GET', 'h1', '\u2014']) await expect(row).toContainText(value);
    await expect(row).not.toContainText('200');
    await expect(row).not.toContainText('\u00b7\u00b7\u00b7');
    await row.click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    evidence.push({ scenarioId: scenario.id, row: await row.getAttribute('data-automation-id'),
      requestBytes: result.request!.bodyBytes, responseBytes: 0 });
  });

  // 证据：保存逐场景身份与实际字节数，Renderer必须没有page error。
  // Evidence: retain each scenario identity and observed byte counts and require zero Renderer page errors.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('http-scenarios.json', {
    body: Buffer.from(JSON.stringify(evidence)),
    contentType: 'application/json',
  });

  // 清理：现有fixtures关闭origin和真实Electron，并核验Main/Core/Worker、8888、WinINet及journal。
  // Cleanup: existing fixtures close the origin and Electron and verify Main/Core/Worker, port 8888, WinINet, and journal.
});