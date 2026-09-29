import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';

import { grpcMessages } from '../../../../../playground/server/tls/traffic';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cleanHttpsCapture, prepareHttpsCapture, rootCertificateThumbprints } from '../../fixtures/ui/https-capture';

const GRPC_SCENARIOS = [
  { id: 'grpc-unary-proto', request: ['proto-request'], response: ['proto-response'], json: false, compressed: false, truncated: false, status: '0' },
  { id: 'grpc-unary-json', request: ['{"message":"hello"}'], response: ['{"message":"world"}'], json: true, compressed: false, truncated: false, status: '0' },
  { id: 'grpc-trailers-error', request: ['request'], response: [], json: false, compressed: false, truncated: false, status: '13' },
  { id: 'grpc-compressed', request: ['compressed request'], response: ['compressed response'], json: false, compressed: true, truncated: false, status: '0' },
  { id: 'grpc-malformed', request: ['request'], response: ['truncated'], json: false, compressed: false, truncated: true, status: '0' },
] as const;

test('capture.scenarios.grpc preserves envelope payloads compression and error trailers', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.grpc' });
  const { page } = desktopApp;
  const rootsBefore = await rootCertificateThumbprints();
  const evidence: Array<{ scenarioId: string; exchangeId: string; status: string; truncated: boolean }> = [];
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：正式Certificates UI准备本轮CA和localhost源站例外，再经UI开启Recording。
    // Arrange: prepare this CA and localhost exception through Certificates UI, then start Recording through UI.
    await prepareHttpsCapture(desktopApp);
    await startRecording(desktopApp);

    // 在途消息：用共享TLS origin逐段发送envelope，完成HTTP响应前读取并复制已收齐的消息。
    // Streaming messages: send envelope fragments from the shared TLS origin and read/copy complete messages before the HTTP response ends.
    await test.step('grpc-streaming', async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'grpc-unary-json');
      if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing streaming gRPC scenario.');
      const requestPath = '/e2e/grpc/streaming';
      const payloads = ['{"message":"stream-first"}', '{"message":"stream-second"}'];
      const envelopes = payloads.map((data) => grpcMessages([{ data, encoding: 'utf8', compressed: false }], 'valid'));
      const responseStream = new PassThrough();
      const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
      let clientFinished = false;
      const completedResponse = tlsTrafficRunner.runGrpc({ ...scenario.defaultDraft,
        path: requestPath, responseMessages: [], responseTrailers: { 'grpc-status': '0' },
      }, desktopApp.capturePort(), responseStream).then((result) => {
        clientFinished = true;
        return result;
      });
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      let exchangeId: string | undefined;
      let expectedMessages = 0;
      try {
        responseStream.write(envelopes[0]!.subarray(0, 3));
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('3 B');
        await expect(row).toContainText('200');
        const rowId = await row.getAttribute('data-automation-id');
        if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing streaming gRPC exchange identity.');
        exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
        await row.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
        const responseSide = getByAutomationId(page, AUTOMATION_IDS.capture.grpc.responseSide);
        await responseSide.click();
        await expect(responseSide).toHaveAttribute('aria-checked', 'true');
        const messages = getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.response.`);
        await expect(messages).toHaveCount(0);

        responseStream.write(envelopes[0]!.subarray(3));
        await expect(row).toContainText(`${envelopes[0]!.byteLength} B`);
        expect(clientFinished).toBe(false);
        expect(responseStream.writableEnded).toBe(false);
        expectedMessages = 1;
        await expect(messages).toHaveCount(1, { timeout: 5_000 });
        await page.screenshot({ path: testInfo.outputPath('grpc-streaming-first-message.png') });
        const firstMessage = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, 'response', 0));
        await firstMessage.click();
        await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, 'response', 0)).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payloads[0]);
        await firstMessage.click();

        responseStream.write(envelopes[1]!.subarray(0, envelopes[1]!.byteLength - 2));
        const totalBytes = envelopes[0]!.byteLength + envelopes[1]!.byteLength;
        await expect(row).toContainText(`${totalBytes - 2} B`);
        await getByAutomationId(page, AUTOMATION_IDS.capture.grpc.requestSide).click();
        await responseSide.click();
        await expect(messages).toHaveCount(1);
        responseStream.write(envelopes[1]!.subarray(-2));
        await expect(row).toContainText(`${totalBytes} B`);
        expectedMessages = 2;
        await expect(messages).toHaveCount(2);
        expect(clientFinished).toBe(false);
        expect(responseStream.writableEnded).toBe(false);
        const secondMessage = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, 'response', 1));
        await secondMessage.click();
        await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, 'response', 1)).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payloads[1]);
        await page.screenshot({ path: testInfo.outputPath('grpc-streaming.png') });
        const evidencePath = testInfo.outputPath('grpc-streaming.json');
        await writeFile(evidencePath, JSON.stringify({ exchangeId, expectedMessages,
          observedMessages: await messages.count(), clientFinished, originEnded: responseStream.writableEnded,
          row: await row.textContent(), copiedPayloads: payloads }, null, 2), 'utf8');
        await testInfo.attach('grpc-streaming.json', { path: evidencePath, contentType: 'application/json' });
        responseStream.end();
        await expect(completedResponse).resolves.toMatchObject({ state: 'complete', protocol: 'grpc', tls: { alpn: 'h2' },
          response: { statusCode: 200, trailers: { 'grpc-status': '0' } } });
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toContainText('grpc-status: 0');
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      } catch (error) {
        await page.screenshot({ path: testInfo.outputPath('grpc-streaming.png') });
        await writeFile(testInfo.outputPath('grpc-streaming.json'), JSON.stringify({ exchangeId, expectedMessages,
          observedMessages: exchangeId === undefined ? null : await getByAutomationIdPrefix(page,
            `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.response.`).count(),
          clientFinished, originEnded: responseStream.writableEnded, row: await row.textContent() }, null, 2), 'utf8');
        throw error;
      } finally {
        responseStream.end();
        await completedResponse;
      }
    });

    // 录制代际：H2流跨Pause/Resume继续捕获，Clear只移除旧代数据而不中断实际响应。
    // Capture generation: keep capturing an H2 stream across Pause/Resume; Clear drops old data without interrupting its response.
    for (const captureAction of ['pause-resume', 'clear'] as const) {
      await test.step(`grpc-streaming-${captureAction}`, async () => {
        const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'grpc-unary-json');
        if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing gRPC lifecycle scenario.');
        const requestPath = `/e2e/grpc/streaming-${captureAction}`;
        const keywordFilter = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
        const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
        await keywordFilter.fill(requestPath);
        const payloads = ['{"message":"before-action"}', '{"message":"after-action"}'];
        const envelopes = payloads.map((data) => grpcMessages([{ data, encoding: 'utf8', compressed: false }], 'valid'));
        const responseStream = new PassThrough();
        const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
        let clientFinished = false;
        const completedResponse = tlsTrafficRunner.runGrpc({ ...scenario.defaultDraft, path: requestPath,
          responseMessages: [], responseTrailers: { 'grpc-status': '0' },
        }, desktopApp.capturePort(), responseStream).then((result) => {
          clientFinished = true;
          return result;
        });
        try {
          responseStream.write(envelopes[0]!);
          const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
          await expect(row).toHaveCount(1);
          await expect(row).toContainText(`${envelopes[0]!.byteLength} B`);
          const rowId = await row.getAttribute('data-automation-id');
          if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing gRPC lifecycle identity.');
          const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
          await row.click();
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
          await getByAutomationId(page, AUTOMATION_IDS.capture.grpc.responseSide).click();
          const messages = getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.response.`);
          await expect(messages).toHaveCount(1);
          if (captureAction === 'pause-resume') {
            await recording.click();
            await expect(recording).toHaveAttribute('aria-pressed', 'false');
          } else {
            await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
            await expect(row).toHaveCount(0);
          }
          responseStream.write(envelopes[1]!);
          if (captureAction === 'pause-resume') {
            await expect(row).toContainText(`${envelopes[0]!.byteLength + envelopes[1]!.byteLength} B`);
            await expect(messages).toHaveCount(2);
            const message = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, 'response', 1));
            await message.click();
            await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, 'response', 1)).click();
            await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payloads[1]);
          }
          if (clientFinished) {
            await testInfo.attach(`grpc-streaming-${captureAction}-premature-end.json`, {
              body: Buffer.from(JSON.stringify({ captureAction, originEnded: responseStream.writableEnded,
                result: await completedResponse })),
              contentType: 'application/json',
            });
          }
          expect(clientFinished).toBe(false);
          expect(responseStream.writableEnded).toBe(false);
          const inFlight = { observedMessages: await messages.count(), rowCount: await row.count(),
            recording: await recording.getAttribute('aria-pressed'), clientFinished, originEnded: responseStream.writableEnded };
          await page.screenshot({ path: testInfo.outputPath(`grpc-streaming-${captureAction}.png`) });
          responseStream.end();
          const result = await completedResponse;
          expect(result).toMatchObject({ state: 'complete', protocol: 'grpc', tls: { alpn: 'h2' },
            response: { statusCode: 200, trailers: { 'grpc-status': '0' },
              bodyBytes: envelopes[0]!.byteLength + envelopes[1]!.byteLength } });
          if (captureAction === 'pause-resume') {
            await expect(row).not.toContainText('\u00b7\u00b7\u00b7');
            await recording.click();
            await expect(recording).toHaveAttribute('aria-pressed', 'true');
            await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
          } else {
            await expect(row).toHaveCount(0);
          }
          await keywordFilter.fill('');
          const evidencePath = testInfo.outputPath(`grpc-streaming-${captureAction}.json`);
          await writeFile(evidencePath, JSON.stringify({ captureAction, exchangeId, inFlight,
            final: { clientFinished, originEnded: responseStream.writableEnded,
              responseBytes: result.response?.bodyBytes, rowCount: await row.count(),
              recording: await recording.getAttribute('aria-pressed') } }, null, 2), 'utf8');
          await testInfo.attach(`grpc-streaming-${captureAction}.json`, { path: evidencePath, contentType: 'application/json' });
        } finally {
          responseStream.end();
          await completedResponse;
        }
      });
    }

    // 双向消息：Request和Response同时保持在途，逐侧复制完整消息并拒绝半条payload。
    // Bidirectional messages: keep both sides in flight, copy complete messages on each side, and exclude incomplete payloads.
    await test.step('grpc-bidirectional-streaming', async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'grpc-unary-json');
      if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing gRPC bidirectional scenario.');
      const requestPath = '/e2e/grpc/bidirectional-streaming';
      const keywordFilter = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
      await keywordFilter.fill(requestPath);
      const payloads = { request: ['{"request":1}', '{"request":2}'], response: ['{"response":1}', '{"response":2}'] };
      const envelopes = Object.fromEntries(Object.entries(payloads).map(([side, messages]) => [side,
        messages.map((data) => grpcMessages([{ data, encoding: 'utf8', compressed: false }], 'valid')),
      ])) as Record<'request' | 'response', Buffer[]>;
      const streams = { request: new PassThrough(), response: new PassThrough() };
      const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
      let clientFinished = false;
      const completedResponse = tlsTrafficRunner.runGrpc({ ...scenario.defaultDraft, path: requestPath,
        requestMessages: [], responseMessages: [], responseTrailers: { 'grpc-status': '0' },
      }, desktopApp.capturePort(), streams.response, streams.request).then((result) => {
        clientFinished = true;
        return result;
      });
      try {
        streams.request.write(envelopes.request[0]!);
        streams.response.write(envelopes.response[0]!);
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('200');
        const rowId = await row.getAttribute('data-automation-id');
        if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing bidirectional gRPC identity.');
        const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
        await row.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
        const streamingSides = [];
        for (const side of ['request', 'response'] as const) {
          await getByAutomationId(page, side === 'request'
            ? AUTOMATION_IDS.capture.grpc.requestSide : AUTOMATION_IDS.capture.grpc.responseSide).click();
          const messages = getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.${side}.`);
          await expect(messages).toHaveCount(1);
          streams[side].write(envelopes[side][1]!.subarray(0, -2));
          const firstMessage = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, side, 0));
          await firstMessage.click();
          await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, side, 0)).click();
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payloads[side][0]);
          await expect(messages).toHaveCount(1);
          await firstMessage.click();
          streams[side].write(envelopes[side][1]!.subarray(-2));
          await expect(messages).toHaveCount(2);
          const secondMessage = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, side, 1));
          await secondMessage.click();
          await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, side, 1)).click();
          await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(payloads[side][1]);
          expect(clientFinished).toBe(false);
          expect(streams.request.writableEnded).toBe(false);
          expect(streams.response.writableEnded).toBe(false);
          streamingSides.push({ side, messageCount: await messages.count(), copiedPayloads: payloads[side],
            clientFinished, requestEnded: streams.request.writableEnded, responseEnded: streams.response.writableEnded });
          await secondMessage.click();
        }
        await page.screenshot({ path: testInfo.outputPath('grpc-bidirectional-streaming.png') });
        streams.request.end();
        streams.response.end();
        const result = await completedResponse;
        expect(result).toMatchObject({ state: 'complete', protocol: 'grpc', tls: { alpn: 'h2' },
          request: { bodyBytes: Buffer.concat(envelopes.request).byteLength },
          response: { statusCode: 200, bodyBytes: Buffer.concat(envelopes.response).byteLength, trailers: { 'grpc-status': '0' } } });
        const evidencePath = testInfo.outputPath('grpc-bidirectional-streaming.json');
        await writeFile(evidencePath, JSON.stringify({ exchangeId, streamingSides, clientFinished,
          requestBytes: result.request?.bodyBytes, responseBytes: result.response?.bodyBytes }, null, 2), 'utf8');
        await testInfo.attach('grpc-bidirectional-streaming.json', { path: evidencePath, contentType: 'application/json' });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
        await keywordFilter.fill('');
      } finally {
        streams.request.end();
        streams.response.end();
        await completedResponse;
      }
    });

    for (const expected of GRPC_SCENARIOS) {
      await test.step(expected.id, async () => {
        const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
        if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error(`Missing gRPC scenario: ${expected.id}`);
        const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
        expect(result).toMatchObject({ state: 'complete', protocol: 'grpc', tls: { alpn: 'h2' },
          response: { statusCode: 200, trailers: { 'grpc-status': expected.status } },
        });

        // 产品操作：选择独立Capture请求，进入gRPC并逐侧检查，不调用消息查询API代替界面。
        // Product actions: select the Capture request and inspect both gRPC sides without calling message query APIs directly.
        const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: scenario.defaultDraft.path });
        await expect(row).toHaveCount(1);
        for (const value of ['POST', 'h2', '200']) await expect(row).toContainText(value);
        const rowId = await row.getAttribute('data-automation-id');
        if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing gRPC exchange identity.');
        const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
        await row.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toContainText(`grpc-status: ${expected.status}`);
        if (expected.status === '13') {
          await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toContainText('grpc-message: Playground failure');
        }

        for (const side of ['request', 'response'] as const) {
          const sideControl = getByAutomationId(page, side === 'request' ? AUTOMATION_IDS.capture.grpc.requestSide : AUTOMATION_IDS.capture.grpc.responseSide);
          await sideControl.click();
          await expect(sideControl).toHaveAttribute('aria-checked', 'true');
          const messages = getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.${side}.`);
          await expect(messages).toHaveCount(expected[side].length);
          for (const [index, text] of expected[side].entries()) {
            const declared = expected.compressed ? gzipSync(text) : Buffer.from(text);
            const captured = expected.truncated && side === 'response' ? declared.subarray(0, declared.length - 2) : declared;
            const clipboard = expected.json ? captured.toString('utf8') : [...captured].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
            const message = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, side, index));

            // 业务断言：声明长度与envelope offset保留，真实Copy得到实际载荷；损坏消息不补造缺失字节。
            // Product assertions: retain declared length and envelope offset; actual Copy returns stored payload without inventing truncated bytes.
            await expect(message).toContainText(`${declared.length} B`);
            await expect(message).toContainText('@ 0x0005');
            await message.click();
            await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, side, index)).click();
            await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(clipboard);
            await message.click();
          }
        }
        evidence.push({ scenarioId: expected.id, exchangeId, status: expected.status, truncated: expected.truncated });
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      });
    }

    // 消息边界：同一HTTP body中的多条JSON消息分别限长，不能把相邻envelope或消息混入预览。
    // Message boundary: limit each JSON payload independently without reading bytes from adjacent envelopes or messages.
    await test.step('grpc-json-utf8-preview-boundary', async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === 'grpc-unary-json');
      if (!scenario || scenario.defaultDraft.kind !== 'grpc') throw new Error('Missing gRPC JSON scenario.');
      const previewLimit = 2 * 1024 * 1024;
      const prefix = '{"message":"';
      const requestPreview = prefix + 'q'.repeat(previewLimit - 2 - prefix.length);
      const responsePreview = prefix + 'r'.repeat(previewLimit - 3 - prefix.length);
      const requestMessages = ['{"message":"before-\u00e9"}', `${requestPreview}\u4e2dafter-preview"}`];
      const responseMessages = [`${responsePreview}\ud83d\ude42after-preview"}`, '{"message":"after-\u4e2d"}'];
      const previews = { request: [requestMessages[0]!, requestPreview], response: [responsePreview, responseMessages[1]!] };
      const requestPath = '/e2e/grpc/json-utf8-preview-boundary';
      const result = await trafficLab.run(scenario.id, {
        ...scenario.defaultDraft,
        path: requestPath,
        requestMessages: requestMessages.map((data) => ({ data, encoding: 'utf8', compressed: false })),
        responseMessages: responseMessages.map((data) => ({ data, encoding: 'utf8', compressed: false })),
      }, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', protocol: 'grpc', tls: { alpn: 'h2' },
        response: { statusCode: 200, trailers: { 'grpc-status': '0' } } });
      expect(result.request?.bodyBytes).toBe(requestMessages.reduce((bytes, text) => bytes + 5 + Buffer.byteLength(text), 0));
      expect(result.response?.bodyBytes).toBe(responseMessages.reduce((bytes, text) => bytes + 5 + Buffer.byteLength(text), 0));
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      const rowId = await row.getAttribute('data-automation-id');
      if (!rowId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Missing UTF-8 gRPC identity.');
      const exchangeId = rowId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.grpc).click();
      const clipboardSummary = () => page.evaluate(async () => {
        const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { length: text.length,
          digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      });
      for (const side of ['request', 'response'] as const) {
        const sideControl = getByAutomationId(page, side === 'request' ? AUTOMATION_IDS.capture.grpc.requestSide : AUTOMATION_IDS.capture.grpc.responseSide);
        await sideControl.click();
        await expect(sideControl).toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationIdPrefix(page, `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.${side}.`)).toHaveCount(2);
        for (const [index, preview] of previews[side].entries()) {
          const message = getByAutomationId(page, AutomationIdFactory.grpcMessage(exchangeId, side, index));
          await message.click();
          const expectedClipboard = { length: preview.length, digest: createHash('sha256').update(preview).digest('hex') };
          await getByAutomationId(page, AutomationIdFactory.grpcPayloadCopy(exchangeId, side, index)).click();
          await expect.poll(clipboardSummary).toEqual(expectedClipboard);
          const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
          await raw.click();
          await expect(raw).toHaveAttribute('aria-checked', 'true');
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
          try {
            await expect.poll(clipboardSummary).toEqual(expectedClipboard);
          } catch (error) {
            await testInfo.attach('grpc-copy-boundary.json', {
              body: Buffer.from(JSON.stringify({
                side, index, expected: expectedClipboard, actual: await clipboardSummary(),
                bodyViewCount: await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView).count(),
                rawSelected: await raw.getAttribute('aria-checked'),
                bodyPane: await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).evaluate((element) => ({
                  textLength: element.textContent?.length ?? 0,
                  visible: element.getClientRects().length > 0,
                })),
              })), contentType: 'application/json',
            });
            throw error;
          }
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).click();
          await page.keyboard.press('ControlOrMeta+A');
          const keyboardState = await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).evaluate((element) => {
            const active = document.activeElement;
            const bounds = element.getBoundingClientRect();
            return {
              focusWithinPane: active !== null && element.contains(active),
              activeTag: active?.tagName,
              activeRole: active?.getAttribute('role'),
              activeContentEditable: active instanceof HTMLElement ? active.isContentEditable : false,
              selectionLength: document.getSelection()?.toString().length ?? 0,
              inputSelectionLength: active instanceof HTMLTextAreaElement
                ? (active.selectionEnd ?? 0) - (active.selectionStart ?? 0) : null,
              paneWidth: bounds.width, paneHeight: bounds.height,
            };
          });
          await testInfo.attach(`grpc-keyboard-${side}-${index}.json`, {
            body: Buffer.from(JSON.stringify({ side, index, expected: expectedClipboard, keyboardState })),
            contentType: 'application/json',
          });
          expect(keyboardState.focusWithinPane, 'Keyboard Copy must target the selected message editor').toBe(true);
          await page.keyboard.press('ControlOrMeta+C');
          await expect.poll(clipboardSummary).toEqual(expectedClipboard);
          await message.click();
        }
      }
      evidence.push({ scenarioId: 'grpc-json-utf8-preview-boundary', exchangeId, status: '0', truncated: false });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });

    // 证据：记录公开消息与状态事实，Renderer不得因压缩或损坏envelope崩溃。
    // Evidence: retain public message/status facts and require no Renderer errors for compressed or damaged envelopes.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await testInfo.attach('grpc-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：真实UI清除本轮CA/解密设置，完整Root集合恢复；fixture验证进程、8888及WinINet/journal。
    // Cleanup: remove this CA/decryption configuration through UI and restore Root stores; fixtures verify processes, port 8888, WinINet, and journal.
    await cleanHttpsCapture(desktopApp).catch((error: unknown) => cleanupErrors.push(error));
    try { expect(await rootCertificateThumbprints()).toEqual(rootsBefore); } catch (error) { cleanupErrors.push(error); }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'gRPC Capture and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'gRPC Capture cleanup failed.');
});