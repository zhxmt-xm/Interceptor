import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

for (const fileKind of ['large', 'short'] as const) {
test(`breakpoints.body-preview ${fileKind} previews a product-saved file but forwards its complete bytes`, async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'breakpoints.body-preview' });
  const { page } = desktopApp;
  const filePath = testInfo.outputPath('exported-body.json');
  const source = fileKind === 'large'
    ? JSON.stringify({ begin: 'file-preview-start', data: 'a'.repeat(3 * 1024 * 1024), end: 'complete-file-end' })
    : JSON.stringify({ begin: 'file-preview-start', cartId: 'cart-123', end: 'complete-file-end' }, null, 2);
  let pendingRequest: ReturnType<typeof httpTrafficRunner.requestThroughProxy> | null = null;
  try {
    // 准备：替换文件由同一workflow通过产品Save body生成，不能在测试中写业务输入。
    // Arrange: create the replacement file through this workflow's product Save body, not a seeded file.
    await startRecording(desktopApp);
    const sourcePath = '/e2e/body-file/source';
    httpTrafficRunner.respondWith(sourcePath, { headers: { 'content-type': 'application/json' }, body: Buffer.from(source) });
    await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), sourcePath);
    const sourceRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: sourcePath });
    await sourceRow.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
    await expect.poll(async () => {
      try { return (await readFile(filePath)).length; } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return 0;
        throw error;
      }
    }).toBe(Buffer.byteLength(source));

    // 用户操作：创建POST断点，使用真实Open Dialog选择刚保存的文件。
    // User actions: create a POST breakpoint and choose the exported file through the real Open dialog.
    await createRequestBreakpointRule(page, 'Body preview complete file', 'POST');
    const targetPath = '/e2e/body-file/target';
    const original = fileKind === 'large' ? '{"original":true}'
      : JSON.stringify({ entries: Array.from({ length: 30 }, (_, index) => ({ index, value: 'original' })) }, null, 2);
    pendingRequest = httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), targetPath, {
      method: 'POST', body: original,
    });
    void pendingRequest.catch(() => undefined);
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: targetPath });
    await row.click();
    let originalContentId: string | null = null;
    if (fileKind === 'short') {
      const originalPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
      await expect(originalPane).toBeVisible();
      originalContentId = await originalPane.locator('xpath=ancestor::div[@id][1]').getAttribute('id');
      if (!originalContentId) throw new Error('Original body has no public section relationship.');
      await page.locator(`[aria-controls="${originalContentId}"]`).click();
    }
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.file).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
    const selected = getByAutomationId(page, AUTOMATION_IDS.breakpoints.selectedFile);
    await expect(selected).toHaveAttribute('data-file-name', 'exported-body.json');
    await expect(selected).toHaveAttribute('data-file-size', String(Buffer.byteLength(source)));
    await page.screenshot({ path: testInfo.outputPath('file-preview.png') });

    // 业务断言：大JSON有有限预览，Forward edited仍发送完整原文件。
    // Assertions: large JSON has a bounded preview while Forward edited sends the entire original file.
    await expect(selected).toContainText('file-preview-start');
    const preview = getByAutomationId(page, AUTOMATION_IDS.breakpoints.filePreview);
    await expect(preview).toBeVisible();
    expect(await preview.evaluate(element => getComputedStyle(element).resize)).toBe('vertical');
    if (fileKind === 'large') await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.fileFormat)).toBeDisabled();
    if (originalContentId) {
      // 布局联动：展开前面的Original后，File必须立即按新剩余空间重算。
      // Layout dependency: expanding the preceding Original must immediately update the File height.
      await page.locator(`[aria-controls="${originalContentId}"]`).click();
      const measure = () => preview.evaluate(element => {
        let scroll = element.parentElement;
        while (scroll && !/auto|scroll/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
        if (!scroll) throw new Error('File preview has no scroll container.');
        const available = scroll.clientHeight - scroll.scrollTop - element.getBoundingClientRect().top + scroll.getBoundingClientRect().top;
        return { height: element.getBoundingClientRect().height, available, minimum: parseFloat(getComputedStyle(element).minHeight) };
      });
      await page.screenshot({ path: testInfo.outputPath('short-file-expanded-original.png') });
      await expect.poll(async () => {
        const current = await measure();
        await writeFile(testInfo.outputPath('short-file-clamp.json'), JSON.stringify(current), 'utf8');
        return current.height - Math.max(current.minimum, current.available);
      }).toBeLessThanOrEqual(1);
      await page.locator(`[aria-controls="${originalContentId}"]`).click();
    }
    const box = await preview.boundingBox();
    if (!box) throw new Error('File preview is not visible.');
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 53, { steps: 10 });
    await page.mouse.up();
    await preview.click({ position: { x: 90, y: 30 } });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    const expectedPreview = source.slice(0, 2 * 1024 * 1024).replace(/\r\n/g, '\n');
    await expect.poll(async () => {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      const text = clipboard.replace(/\r\n/g, '\n');
      const actual = { length: text.length, sha256: createHash('sha256').update(text).digest('hex') };
      await writeFile(testInfo.outputPath('clipboard-preview.json'), JSON.stringify({
        rawLength: clipboard.length, crlfCount: clipboard.split('\r\n').length - 1, ...actual,
      }), 'utf8');
      return actual;
    }).toEqual({
      length: expectedPreview.length, sha256: createHash('sha256').update(expectedPreview).digest('hex'),
    });
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    const forwardedResponse = await pendingRequest;
    pendingRequest = null;
    await writeFile(testInfo.outputPath('forward-response.json'), JSON.stringify({
      statusCode: forwardedResponse.statusCode,
      error: forwardedResponse.statusCode === 200 ? undefined : forwardedResponse.body.slice(0, 1000),
    }, null, 2), 'utf8');
    expect(forwardedResponse.statusCode).toBe(200);
    const observation = httpTrafficRunner.observation(targetPath);
    const forwarded = source;
    expect(observation?.body.length).toBe(Buffer.byteLength(forwarded));
    expect(observation?.body.equals(Buffer.from(forwarded))).toBe(true);
    await writeFile(testInfo.outputPath('file-preview-evidence.json'), JSON.stringify({
      fileBytes: Buffer.byteLength(source),
      fileSha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
      previewVisible: true,
    }, null, 2), 'utf8');

    // 完整编辑：Text输入不受只读预览上限影响，末尾追加仍完整到达origin。
    // Complete editing: Text input is not capped by readonly preview limits and its appended suffix reaches the origin.
    if (fileKind === 'large') {
    const textPath = '/e2e/body-file/complete-text';
    const edited = `${source}\ncomplete-text-end`;
    pendingRequest = httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), textPath, { method: 'POST', body: 'original' });
    void pendingRequest.catch(() => undefined);
    await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: textPath }).click();
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
    const textInput = getByAutomationId(page, AUTOMATION_IDS.breakpoints.body);
    await textInput.fill(edited);
    expect(await textInput.evaluate(element => (element as HTMLTextAreaElement).value.length)).toBe(edited.length);
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    await pendingRequest;
    pendingRequest = null;
    const textObserved = httpTrafficRunner.observation(textPath)?.body;
    expect(textObserved?.byteLength).toBe(Buffer.byteLength(edited));
    expect(textObserved?.equals(Buffer.from(edited))).toBe(true);
    }
  } finally {
    // 清理：失败时经Continue结束请求，fixture验证正常退出和完整宿主恢复。
    // Cleanup: settle failures through Continue; the fixture verifies normal exit and complete host restoration.
    if (pendingRequest && !page.isClosed()) {
      const continueButton = getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified);
      if (await continueButton.isVisible()) await continueButton.click();
      await pendingRequest;
    }
    await rm(filePath, { force: true });
  }
});
}
