import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

for (const scenario of ['manual', 'truncated'] as const) {
  test(`capture.body-preview-limits ${scenario} uses the approved read and format budget`, async ({
    desktopApp, httpTrafficRunner,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.body-preview-limits' });
    const { page } = desktopApp;
    const path = `/e2e/body-limits/${scenario}`;
    const source = JSON.stringify({ begin: 'body-preview-start', data: 'x'.repeat(
      (scenario === 'manual' ? 1.25 : 3) * 1024 * 1024,
    ), end: 'body-preview-end' });

    // 准备：真实origin返回完整JSON，经过产品8888录制，不注入正文或Store。
    // Arrange: a real origin returns complete JSON through port 8888 without injecting body or Store state.
    await startRecording(desktopApp);
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(path);
    // 截图准备：只显示自产正文，侧栏不展开完整录制中的应用和Host。
    // Screenshot preparation: show the owned body without exposing applications or hosts from the full recording.
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
    httpTrafficRunner.respondWith(path, { headers: { 'content-type': 'application/json' }, body: Buffer.from(source) });
    const response = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), path);
    expect(response.body).toBe(source);

    // 用户操作：打开自产响应并复制当前默认正文，验证1MiB以上不自动格式化。
    // User actions: open the captured response and copy its default body; above 1 MiB it remains unformatted.
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: path });
    await expect(row).toHaveCount(1);
    await row.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(pane).toContainText('body-preview-start');
    await screenshotStep(`打开${scenario}响应并查看Format入口 / Open the ${scenario} response and inspect the Format control`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.format), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
    const clipboard = await page.evaluate(async () => {
      const text = await navigator.clipboard.readText();
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { length: text.length, sha256: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    });
    const expected = scenario === 'manual' ? source : source.slice(0, 2 * 1024 * 1024);
    await page.screenshot({ path: testInfo.outputPath(`${scenario}-body.png`) });
    await writeFile(testInfo.outputPath(`${scenario}-bytes.json`), JSON.stringify({
      wireBytes: Buffer.byteLength(source), previewBytes: clipboard.length, expectedBytes: expected.length,
      previewSha256: clipboard.sha256,
    }, null, 2), 'utf8');
    // 业务断言：复制与预览上限一致，完整网络正文不截断；清理由真实App退出执行。
    // Assertions: Copy obeys the preview limit while the network body stays complete; real App exit owns cleanup.
    expect(clipboard.length).toBe(expected.length);
    expect(clipboard.sha256)
      .toBe(createHash('sha256').update(expected).digest('hex'));
    await screenshotStep(`复制${scenario}当前预览并核对长度 / Copy the ${scenario} preview and verify its length`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy), label: '1' }],
    });
    const formatButton = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.format);
    if (scenario === 'manual') {
      await expect(formatButton).toBeEnabled();
      await formatButton.click();
      await screenshotStep('手动点击Format / Click Format manually', {
        highlights: [{ target: formatButton, label: '1' }],
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      const formatted = JSON.stringify(JSON.parse(source), null, 2);
      await expect.poll(async () => {
        const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
        return { length: text.length, sha256: createHash('sha256').update(text).digest('hex') };
      }).toEqual({ length: formatted.length, sha256: createHash('sha256').update(formatted).digest('hex') });
      await screenshotStep('Copy核对格式化后的显示文本 / Copy and verify the formatted display text', {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy), label: '1' }],
      });
    } else {
      await expect(formatButton).toBeDisabled();
      await screenshotStep('截断预览禁用Format / A truncated preview disables Format', {
        highlights: [{ target: formatButton, label: '1' }],
      });
    }
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await screenshotStep('业务断言：复制与预览上限一致，完整网络正文不截断；清理由真实App退出执行。 / Assertions: Copy obeys the preview limit while the network body stays complete; real App exit owns cleanup.');
  });
}
