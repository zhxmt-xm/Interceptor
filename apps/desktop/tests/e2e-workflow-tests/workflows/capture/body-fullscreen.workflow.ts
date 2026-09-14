import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const REQUEST_BODY = '{"source":"fullscreen-request"}';
const COPY_HEADER = 'x-copy-wrap';
const COPY_HEADER_VALUE = 'private, max-age=60, s-maxage=60, stale-while-revalidate=300';
const RESPONSES = [
  { path: '/e2e/fullscreen-json', mediaType: 'application/json', body: '{"source":"fullscreen-response","values":[1,2,3]}' },
  { path: '/e2e/fullscreen-html', mediaType: 'text/html', body: '<!doctype html><html><body><p>fullscreen content</p></body></html>' },
] as const;

test('capture.body.fullscreen keeps captured content and mode through open copy and close', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.body.fullscreen' });
  const { page } = desktopApp;
  const evidence: Array<{ path: string; side: string; bodyBytes: number; copyVerified: boolean; urlCopyVerified: boolean; methodCopyVerified: boolean; modePreserved: boolean }> = [];

  // 准备：从真实录制UI开始，所有正文均由本轮客户端和origin经代理产生。
  // Arrange: begin with real Recording UI and produce every body through this client's proxied origin traffic.
  await startRecording(desktopApp);
  for (const response of RESPONSES) {
    httpTrafficRunner.respondWith(response.path, { body: response.body,
      headers: { 'content-type': response.mediaType, [COPY_HEADER]: COPY_HEADER_VALUE } });
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), response.path, {
      method: 'POST', body: REQUEST_BODY, headers: { 'content-type': 'application/json' },
    })).resolves.toMatchObject({ statusCode: 200, body: response.body });
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: response.path });
    await expect(row).toHaveCount(1);
    await row.click();
    const inspectorHead = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).locator('..');
    await expect(inspectorHead).toContainText(`127.0.0.1${response.path}`);
    await inspectorHead.hover();
    const inspectorButtons = inspectorHead.getByRole('button');
    await expect(inspectorButtons).toHaveCount(2);
    await inspectorButtons.first().click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(httpTrafficRunner.url(response.path));
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    const headerRow = page.getByText(COPY_HEADER, { exact: true }).locator('..');
    const headerCopy = headerRow.getByRole('button');
    await expect(headerCopy).toHaveCount(1);
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).hover();
    await expect(headerCopy).toHaveCSS('opacity', '0');
    await page.getByText(COPY_HEADER, { exact: true }).hover();
    await expect(headerCopy).toHaveCSS('opacity', '1');
    const headerLayout = await headerRow.evaluate((row) => {
      const value = row.children[1]!;
      const copy = value.querySelector('button')!;
      const line = copy.parentElement!;
      const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest('button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const textNodes: Node[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      const lastText = textNodes.at(-1)!;
      const range = document.createRange();
      range.setStart(textNodes[0]!, 0);
      range.setEnd(lastText, lastText.textContent!.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const selectedText = selection.toString();
      selection.removeAllRanges();
      const previous = copy.previousSibling!;
      range.selectNodeContents(previous);
      const previousBox = previous instanceof HTMLElement ? previous.getBoundingClientRect() : range.getBoundingClientRect();
      return { valueHeight: value.getBoundingClientRect().height, lineHeight: line.getBoundingClientRect().height,
        display: getComputedStyle(line).display, alignItems: getComputedStyle(line).alignItems,
        gap: copy.getBoundingClientRect().left - previousBox.right, selectedText,
        lineText: line.textContent, buttonWidth: copy.getBoundingClientRect().width };
    });
    const format = response.mediaType === 'text/html' ? 'html' : 'json';
    const headerEvidencePath = testInfo.outputPath(`header-copy-last-line-${format}.json`);
    await writeFile(headerEvidencePath, JSON.stringify(headerLayout, null, 2), 'utf8');
    await testInfo.attach('header-copy-last-line', { path: headerEvidencePath, contentType: 'application/json' });
    await headerRow.screenshot({ path: testInfo.outputPath(`header-copy-last-line-${format}.png`) });
    expect(headerLayout.valueHeight).toBeGreaterThan(18);
    expect(headerLayout.lineHeight).toBe(18);
    expect(['inline-flex', 'flex']).toContain(headerLayout.display);
    expect(headerLayout.alignItems).toBe('center');
    expect(headerLayout.gap).toBeCloseTo(4, 1);
    expect(headerLayout.buttonWidth).toBe(18);
    expect(headerLayout.selectedText).toBe(COPY_HEADER_VALUE);
    expect(COPY_HEADER_VALUE.endsWith(headerLayout.lineText!)).toBe(true);
    await headerCopy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(COPY_HEADER_VALUE);
    const generalContentId = await getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.section.general,
    ).getAttribute('aria-controls');
    expect(generalContentId).not.toBeNull();
    const methodValue = page.locator(`[id="${generalContentId}"]`).getByText('POST', { exact: true });
    await expect(methodValue).toHaveCount(1);
    await expect(methodValue).toHaveCSS('font-size', '11.5px');
    await expect(methodValue).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const methodCopy = methodValue.locator('..').getByRole('button');
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).hover();
    await expect(methodCopy).toHaveCSS('opacity', '0');
    await methodValue.hover();
    await expect(methodCopy).toHaveCSS('opacity', '1');
    const copyLayout = await methodCopy.evaluate((button) => {
      const icon = button.querySelector('svg')!;
      const buttonBox = button.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { buttonWidth: buttonBox.width, buttonHeight: buttonBox.height,
        iconWidth: iconBox.width, iconHeight: iconBox.height, padding: style.padding,
        display: style.display, alignItems: style.alignItems, justifyContent: style.justifyContent };
    });
    const copyEvidencePath = testInfo.outputPath(`header-copy-${response.mediaType === 'text/html' ? 'html' : 'json'}.json`);
    await writeFile(copyEvidencePath, JSON.stringify(copyLayout, null, 2), 'utf8');
    await testInfo.attach('header-copy-layout', { path: copyEvidencePath, contentType: 'application/json' });
    await methodValue.locator('../..').screenshot({ path: testInfo.outputPath(`header-copy-${response.mediaType === 'text/html' ? 'html' : 'json'}.png`) });
    expect(copyLayout).toMatchObject({ buttonWidth: 18, buttonHeight: 18, iconWidth: 14, iconHeight: 14,
      padding: '0px', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    await methodCopy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('POST');
    const bodies = response.mediaType === 'application/json'
      ? [{ side: 'request', body: REQUEST_BODY, mediaType: 'application/json' }, { side: 'response', body: response.body, mediaType: response.mediaType }] as const
      : [{ side: 'response', body: response.body, mediaType: response.mediaType }] as const;

    for (const expected of bodies) {
      await test.step(`${response.path}:${expected.side}`, async () => {
        // 用户操作：选定正文并切到Raw，再由正式Fullscreen按钮打开共享弹层。
        // User actions: select the body in Raw mode, then open the shared dialog through the real Fullscreen button.
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab[expected.side]).click();
        const sectionId = expected.side === 'request'
          ? AUTOMATION_IDS.capture.inspector.section.requestBody : AUTOMATION_IDS.capture.inspector.section.responseBody;
        await expect(getByAutomationId(page, sectionId)).toContainText(String(Buffer.byteLength(expected.body)));
        await expect(getByAutomationId(page, sectionId)).toHaveCSS('line-height', 'normal');
        const bodyMetadata = getByAutomationId(page, sectionId).locator(':scope > span').last();
        await expect(bodyMetadata).toHaveCSS('letter-spacing', 'normal');
        await expect(bodyMetadata).toHaveCSS('text-transform', 'none');
        if (expected.side === 'request') {
          const queryContentId = await getByAutomationId(
            page,
            AUTOMATION_IDS.capture.inspector.section.queryParameters,
          ).getAttribute('aria-controls');
          expect(queryContentId).not.toBeNull();
          const queryTypography = await page.locator(`[id="${queryContentId}"] > div`).evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              fontSize: Number.parseFloat(style.fontSize),
              lineHeight: Number.parseFloat(style.lineHeight),
              tokenLineHeight: Number.parseFloat(style.getPropertyValue('--interceptor-line-height')),
            };
          });
          expect(queryTypography.tokenLineHeight).toBeGreaterThan(0);
          expect(queryTypography.lineHeight).toBeCloseTo(
            queryTypography.fontSize * queryTypography.tokenLineHeight,
            2,
          );
        }
        const rawMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
        await rawMode.click();
        await expect(rawMode).toHaveAttribute('aria-checked', 'true');
        const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
        await expect(bodyPane).toContainText(expected.body);
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveCount(1);
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(expected.mediaType);
        await expect(bodyPane).toHaveCount(1);
        await expect(dialog.locator(`[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyPane}"]`)).toContainText(expected.body);
        await expect(dialog.locator(`[data-automation-id="${AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen}"]`)).toHaveCount(0);

        // 内容断言：弹层Header仅保留Copy与Close，复制原文，关闭后仍保持Raw且正文不变。
        // Content assertions: the dialog header keeps Copy and Close, copies the original body, and preserves Raw content on closing.
        const headerButtons = dialog.locator('header').getByRole('button');
        await expect(headerButtons).toHaveCount(2);
        await headerButtons.nth(0).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected.body);
        await expect.poll(async () => {
          const bounds = await dialog.boundingBox();
          return bounds ? { width: Math.round(bounds.width), height: Math.round(bounds.height) } : null;
        }).toEqual({ width: 1060, height: 660 });
        const screenshotPath = testInfo.outputPath(`fullscreen-${expected.side}-${response.mediaType === 'text/html' ? 'html' : 'json'}.png`);
        await dialog.screenshot({ path: screenshotPath });
        await testInfo.attach(`fullscreen-${expected.side}-${response.mediaType}`, { path: screenshotPath, contentType: 'image/png' });
        await headerButtons.nth(1).click();
        await expect(dialog).toHaveCount(0);
        await expect(rawMode).toHaveAttribute('aria-checked', 'true');
        await expect(bodyPane).toHaveCount(1);
        await expect(bodyPane).toContainText(expected.body);

        // 模式与生命周期：再次打开切到Hex，用Escape关闭后保留Hex，再回Raw复制同一份正文。
        // Mode and lifecycle: reopen in Hex, preserve Hex after Escape, then return to Raw and copy the same captured body.
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
        await expect(dialog).toBeVisible();
        const hexMode = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex);
        await hexMode.click();
        await expect(hexMode).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(hexMode).toHaveAttribute('aria-checked', 'true');
        await rawMode.click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected.body);
        evidence.push({ path: response.path, side: expected.side, bodyBytes: Buffer.byteLength(expected.body), copyVerified: true, urlCopyVerified: true, methodCopyVerified: true, modePreserved: true });
      });
    }
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
  }

  // 证据与清理：不注入正文或Store，保存真实Copy/模式结论，fixture负责正常退出及宿主恢复。
  // Evidence and cleanup: no body or Store injection; retain real Copy/mode results and let fixtures verify graceful host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  await testInfo.attach('body-fullscreen.json', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
});