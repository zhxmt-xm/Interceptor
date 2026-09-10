import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const ENCODING_SCENARIOS = [
  { id: 'encoding-gzip', encoding: 'gzip', decoded: '{"encoding":"gzip"}' },
  { id: 'encoding-deflate', encoding: 'deflate', decoded: '{"encoding":"deflate"}' },
  { id: 'encoding-br', encoding: 'br', decoded: '{"encoding":"br"}' },
  { id: 'encoding-corrupt-gzip', encoding: 'gzip', decoded: null },
  { id: 'encoding-invalid-image', encoding: null, decoded: null },
] as const;

test('capture.scenarios.encoding decodes compressed bodies and preserves damaged payload evidence', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.encoding' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; encodedBytes: number }> = [];

  // 准备：真实UI开启Recording，使用已有压缩和损坏正文场景，所有字节经产品代理。
  // Arrange: start Recording through UI and use existing compressed and damaged-body scenarios through the product proxy.
  await startRecording(desktopApp);
  for (const expected of ENCODING_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing encoding scenario: ${expected.id}`);
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      if (expected.encoding) expect(result.response?.headers['content-encoding']).toBe(expected.encoding);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody))
        .toContainText(String(result.response!.bodyBytes));
      const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);

      // 业务断言：正常编码显示独立预期JSON；损坏编码保留错误信息及原始字节，不伪造成功预览。
      // Product assertions: valid encodings display independent JSON expectations; damaged bodies retain errors and bytes without fake previews.
      if (expected.decoded) {
        const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
        await raw.click();
        await expect(raw).toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expected.decoded);
      } else if (expected.id === 'encoding-corrupt-gzip') {
        await expect(bodyView).toContainText('gzip');
        const hex = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex);
        await hex.click();
        await expect(hex).toHaveAttribute('aria-checked', 'true');
        await expect(bodyView).toContainText('1f 8b 08 00 01 02 03');
      } else {
        await expect(bodyView.locator('b')).toHaveText('image/png');
        await expect(bodyView.locator('img')).toHaveCount(0);
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default)).toHaveAttribute('aria-checked', 'true');
      }
      evidence.push({ scenarioId: expected.id, encodedBytes: result.response!.bodyBytes });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
  }

    // 解码边界：压缩输入超过5 MiB，Core按明文字节截断，保留边界前的完整字符。
    // Decoded boundary: compressed input exceeds 5 MiB and Core limits decoded bytes without displaying an incomplete final character.
    await test.step('gzip-decoded-utf8-boundary', async () => {
      const previewLimit = 5 * 1024 * 1024;
      const requestPath = '/e2e/encoding/decoded-utf8-boundary';
      const visibleText = randomBytes(previewLimit).toString('base64').slice(0, previewLimit - 2);
      const remainingText = randomBytes(previewLimit / 2).toString('base64');
      const encoded = gzipSync(Buffer.from(`${visibleText}\u4e2d${remainingText}`));
      expect(encoded.byteLength).toBeGreaterThan(previewLimit);
      trafficLab.httpTrafficRunner.respondWith(requestPath, {
        headers: { 'content-type': 'text/javascript; charset=utf-8', 'content-encoding': 'gzip' },
        body: encoded,
      });
      const response = await trafficLab.httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
      expect(response.statusCode).toBe(200);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
      await raw.click();
      await expect(raw).toHaveAttribute('aria-checked', 'true');
      const expectedClipboard = { length: visibleText.length, digest: createHash('sha256').update(visibleText).digest('hex') };
      const clipboardSummary = () => page.evaluate(async () => {
        const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { length: text.length,
          digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+C');
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      evidence.push({ scenarioId: 'gzip-decoded-utf8-boundary', encodedBytes: encoded.byteLength });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });

  // 证据与清理：保存逐场景字节事实；fixture保存trace并完整关闭origin/产品、恢复WinINet与journal。
  // Evidence and cleanup: retain per-scenario byte facts; fixtures save traces, close origins/product processes, and restore WinINet and journal.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('encoding-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});