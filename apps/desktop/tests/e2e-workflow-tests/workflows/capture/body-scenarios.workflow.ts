import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

const TEXT_SCENARIOS = [
  { id: 'body-json', mode: 'raw', body: '{"ready":true,"items":[1,2,3]}' },
  { id: 'body-text', mode: 'default', body: 'Interceptor plain text body.' },
  { id: 'body-html', mode: 'raw', body: '<!doctype html><html><body><h1>Interceptor</h1></body></html>' },
  { id: 'body-css', mode: 'raw', body: 'body { color: #2570e0; }' },
  { id: 'body-javascript', mode: 'raw', body: 'const captured = true;\nconsole.log(captured);' },
  { id: 'body-xml', mode: 'raw', body: '<?xml version="1.0"?><capture ready="true"/>' },
  { id: 'body-yaml', mode: 'raw', body: 'capture:\n  ready: true\n  count: 3\n' },
  { id: 'body-svg', mode: 'raw', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#2570e0"/></svg>' },
  { id: 'body-markdown', mode: 'default', body: '# Capture Lab\n\n- request\n- response\n' },
  { id: 'body-form', mode: 'raw', body: 'name=Interceptor&ready=true' },
  { id: 'body-unknown-text', mode: 'default', body: 'Unknown MIME, valid UTF-8 text.' },
] as const;

test('capture.scenarios.bodies displays the captured text document and form bodies', async ({
  desktopApp, trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.scenarios.bodies' });
  const { page } = desktopApp;
  const evidence: Array<{ scenarioId: string; row: string | null; bytes: number }> = [];

  // 准备：经产品UI开启Recording，场景只负责向真实代理发送流量。
  // Arrange: start Recording through product UI; scenarios only send traffic to the real proxy.
  await startRecording(desktopApp);
  for (const expected of TEXT_SCENARIOS) {
    await test.step(expected.id, async () => {
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario || scenario.defaultDraft.kind !== 'http') throw new Error(`Missing body scenario: ${expected.id}`);
      const result = await trafficLab.run(scenario.id, scenario.defaultDraft, desktopApp.capturePort());
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });

      // 产品操作：选择自产Capture行，检查Request正文，再切换Response正文的既有模式。
      // Product actions: select the generated Capture row, inspect its Request body, and select the existing Response mode.
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
        .filter({ hasText: scenario.defaultDraft.path });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('200');
      await row.click();
      if (scenario.defaultDraft.body) {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
        const mode = expected.id === 'body-text' ? 'default' : 'raw';
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane))
          .toContainText(scenario.defaultDraft.body, { useInnerText: true });
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseBody))
        .toContainText(String(Buffer.byteLength(expected.body)));
      const responseMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[expected.mode]);
      await responseMode.click();
      await expect(responseMode).toHaveAttribute('aria-checked', 'true');
      await screenshotStep('产品操作：选择自产Capture行，检查Request正文，再切换Response正文的既有模式。 / Product actions: select the generated Capture row, inspect its Request body, and select the existing Response mode.');

      // 业务断言：固定正文独立于流量库定义；HTML/SVG不执行，Markdown按真实Preview渲染。
      // Product assertions: body expectations are independent of the traffic library; HTML/SVG stay inert and Markdown renders in Preview.
      if (expected.id === 'body-markdown') {
        const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
        await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Capture Lab');
        await expect(bodyView.getByRole('listitem')).toHaveText(['request', 'response']);
      } else {
        const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await bodyPane.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('ControlOrMeta+C');
        await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
          .toBe(expected.body);
        if (expected.id === 'body-html' || expected.id === 'body-svg') {
          await expect(bodyPane.locator('iframe, img, script')).toHaveCount(0);
        }
      }
      evidence.push({ scenarioId: expected.id, row: await row.getAttribute('data-automation-id'), bytes: Buffer.byteLength(expected.body) });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      await screenshotStep('业务断言：固定正文独立于流量库定义；HTML/SVG不执行，Markdown按真实Preview渲染。 / Product assertions: body expectations are independent of the traffic library; HTML/SVG stay inert and Markdown renders in Preview.');
    });
  }
  await screenshotStep('准备：经产品UI开启Recording，场景只负责向真实代理发送流量。 / Arrange: start Recording through product UI; scenarios only send traffic to the real proxy.');

  // 截断边界：真实响应使2 MiB落在多字节字符内，只比较剪贴板摘要，不向trace返回完整大正文。
  // Truncation boundary: real responses split UTF-8 characters at 2 MiB; compare clipboard digests without returning large bodies to the trace.
  const previewLimit = 2 * 1024 * 1024;
  for (const boundary of [
    { id: 'two-byte', character: '\u00e9', partialBytes: 1, mime: 'text/plain; charset=utf-8', mode: 'default' },
    { id: 'three-byte', character: '\u4e2d', partialBytes: 2, mime: 'application/x-interceptor-text', mode: 'default' },
    { id: 'four-byte', character: '\ud83d\ude42', partialBytes: 3, mime: 'text/javascript; charset=utf-8', mode: 'raw' },
  ] as const) {
    await test.step(`utf8-preview-${boundary.id}`, async () => {
      const requestPath = `/e2e/body-preview/${boundary.id}`;
      const visibleText = 'a'.repeat(previewLimit - boundary.partialBytes);
      const body = Buffer.from(`${visibleText}${boundary.character}after-preview`);
      trafficLab.httpTrafficRunner.respondWith(requestPath, { headers: { 'content-type': boundary.mime }, body });
      const response = await trafficLab.httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
      expect(response.statusCode).toBe(200);
      expect(Buffer.byteLength(response.body)).toBe(body.byteLength);
      const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: requestPath });
      await expect(row).toHaveCount(1);
      await row.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const mode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[boundary.mode]);
      await mode.click();
      await expect(mode).toHaveAttribute('aria-checked', 'true');
      const previewNote = page.locator(
        `[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyView}"] > div:has(> svg)`,
      ).first();
      await expect(previewNote).toBeVisible();
      const noteLayout = await previewNote.evaluate((note) => {
        const style = getComputedStyle(note);
        const box = note.getBoundingClientRect();
        const iconBox = note.querySelector('svg')!.getBoundingClientRect();
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          bodyLineHeight: style.getPropertyValue('--interceptor-line-height'),
          padding: style.padding,
          gap: style.gap,
          iconCenterDelta: iconBox.y + iconBox.height / 2 - box.y - box.height / 2,
          pixelRatio: devicePixelRatio,
        };
      });
      expect(noteLayout).toMatchObject({ fontSize: '11.5px', padding: '9px 11px', gap: '8px' });
      expect(Number.parseFloat(noteLayout.lineHeight)).toBeCloseTo(11.5 * Number.parseFloat(noteLayout.bodyLineHeight), 2);
      expect(Math.abs(noteLayout.iconCenterDelta)).toBeLessThanOrEqual(1 / noteLayout.pixelRatio);
      await testInfo.attach(`${boundary.id}-preview-note-layout`, { body: Buffer.from(JSON.stringify(noteLayout)), contentType: 'application/json' });
      await testInfo.attach(`${boundary.id}-preview-note`, { body: await previewNote.screenshot(), contentType: 'image/png' });
      const expectedClipboard = {
        length: visibleText.length,
        tail: 'a'.repeat(12),
        digest: createHash('sha256').update(visibleText).digest('hex'),
      };
      const clipboardSummary = () => page.evaluate(async () => {
        const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { length: text.length, tail: text.slice(-12),
          digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
      await bodyPane.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('ControlOrMeta+C');
      await expect.poll(clipboardSummary).toEqual(expectedClipboard);
      evidence.push({ scenarioId: `utf8-preview-${boundary.id}`, row: await row.getAttribute('data-automation-id'), bytes: body.byteLength });

      // 原始保存：文件由产品Save产生，包含完整尾字符和预览范围以外的字节。
      // Raw export: the product Save action must retain the complete character and bytes beyond the preview limit.
      if (boundary.id === 'four-byte' && ['win32', 'darwin'].includes(process.platform)) {
        const destination = testInfo.outputPath('utf8-full-body.txt');
        try {
          await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
          await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), destination);
          await expect.poll(async () => {
            try { return createHash('sha256').update(await readFile(destination)).digest('hex'); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
              throw error;
            }
          }).toBe(createHash('sha256').update(body).digest('hex'));
        } finally {
          await rm(destination, { force: true });
        }
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
      await screenshotStep('原始保存：文件由产品Save产生，包含完整尾字符和预览范围以外的字节。 / Raw export: the product Save action must retain the complete character and bytes beyond the preview limit.');
    });
  }
  await screenshotStep('截断边界：真实响应使2 MiB落在多字节字符内，只比较剪贴板摘要，不向trace返回完整大正文。 / Truncation boundary: real responses split UTF-8 characters at 2 MiB; compare clipboard digests without returning large bodies to the trace.');

  // 证据与清理：保存逐场景公开身份；fixture保存trace并关闭origin、Main/Core/Worker及恢复宿主。
  // Evidence and cleanup: retain public scenario identities; fixtures save traces, close origins and product processes, and restore the host.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('body-scenarios.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});