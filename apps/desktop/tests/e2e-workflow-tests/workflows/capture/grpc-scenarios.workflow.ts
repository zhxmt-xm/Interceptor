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