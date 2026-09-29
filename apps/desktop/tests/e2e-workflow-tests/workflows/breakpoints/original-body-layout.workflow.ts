import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';

test('breakpoints.original-body keeps captured content bounded while preserving the request', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'breakpoints.original-body' });
  const { page } = desktopApp;
  const path = '/e2e/retained-original-body';
  const body = JSON.stringify({ data: 'a'.repeat(3 * 1024 * 1024), end: 'original-complete-end' });
  let response: ReturnType<typeof httpTrafficRunner.requestThroughProxy> | null = null;
  try {
    // 准备：真实UI创建请求断点，客户端发送完整且可见的原正文。
    // Arrange: create a request breakpoint through UI and send its original body over the real proxy.
    await startRecording(desktopApp);
    await createRequestBreakpointRule(page, 'Original body layout', 'POST');
    response = httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), path, {
      method: 'POST', body,
    });
    void response.catch(() => undefined);
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: path });
    await row.click();

    // 用户操作与断言：原正文只读可拖拽，保留完整Copy；未编辑Continue不能改变字节。
    // User actions and assertions: the original preview is readonly and resizable; Continue keeps the original bytes.
    const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(pane).toBeVisible();
    const geometry = await pane.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      resize: getComputedStyle(element).resize,
    }));
    await writeFile(testInfo.outputPath('original-layout.json'), JSON.stringify(geometry, null, 2), 'utf8');
    await page.screenshot({ path: testInfo.outputPath('original-layout.png') });
    expect(geometry.resize).toBe('vertical');
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.format)).toBeDisabled();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
    await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).length)).toBe(2 * 1024 * 1024);
  } finally {
    // 清理：真实Continue释放挂起请求，fixture按正常退出恢复宿主。
    // Cleanup: release the pending request through Continue and let the fixture restore the host on normal exit.
    if (response) {
      const continueButton = getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified);
      if (await continueButton.isVisible()) await continueButton.click();
      expect((await response).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(path)?.body.equals(Buffer.from(body))).toBe(true);
    }
  }
});
