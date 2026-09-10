import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

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
  test.setTimeout(180_000);
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
      const previewLimit = 5 * 1024 * 1024;
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
          await expect.poll(clipboardSummary).toEqual(expectedClipboard);
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).click();
          await page.keyboard.press('ControlOrMeta+A');
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