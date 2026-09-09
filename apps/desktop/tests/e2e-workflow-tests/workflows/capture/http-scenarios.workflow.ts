import { createServer, request, type ClientRequest, type ServerResponse } from 'node:http';

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