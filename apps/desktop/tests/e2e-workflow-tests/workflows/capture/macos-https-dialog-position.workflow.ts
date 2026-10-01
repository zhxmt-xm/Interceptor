import { writeFile } from 'node:fs/promises';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';

test.skip(process.platform !== 'darwin', 'macOS HTTPS dialog positioning only');

test('capture.https-setup keeps the dialog centered while opening and taking evidence', async ({ desktopApp }, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.https-setup-position' });
  const { page } = desktopApp;

  // 准备：只读逐帧采样公开弹窗，不注入产品状态或生成证书。
  // Arrange: observe the public dialog each frame without injecting application state or creating certificates.
  const measurements = page.evaluate(async (cancelId) => {
    const frames: Array<{ elapsed: number; x: number; y: number; width: number; height: number; centerX: number; centerY: number; screenX: number; screenY: number }> = [];
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const observe = () => {
        const dialog = document.querySelector(`[data-automation-id="${cancelId}"]`)?.closest('[role="dialog"]');
        if (dialog) {
          const bounds = dialog.getBoundingClientRect();
          frames.push({ elapsed: performance.now() - started, x: bounds.x, y: bounds.y,
            width: bounds.width, height: bounds.height,
            centerX: bounds.x + bounds.width / 2 - innerWidth / 2,
            centerY: bounds.y + bounds.height / 2 - innerHeight / 2, screenX, screenY });
        }
        if (performance.now() - started >= 2_000) resolve();
        else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    return frames;
  }, AUTOMATION_IDS.capture.httpsSetup.cancel);

  // 用户操作与证据：真实点击打开，按既有方式截图，再核对定位和主窗口稳定性。
  // User actions and evidence: open through the real control, capture existing evidence, then verify dialog and window positions.
  await getByAutomationId(page, AUTOMATION_IDS.capture.enableMitm).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.generate)).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.install)).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.startDecrypting)).toBeEnabled();
  await dialog.screenshot({ path: testInfo.outputPath('https-setup-position.png') });
  const frames = await measurements;
  await writeFile(testInfo.outputPath('https-setup-position.json'), JSON.stringify(frames, null, 2), 'utf8');
  const settled = frames.filter((frame) => frame.width > 1 && frame.height > 1);
  expect(settled.length).toBeGreaterThan(2);
  expect(Math.max(...settled.map((frame) => Math.abs(frame.centerX)))).toBeLessThanOrEqual(1);
  expect(Math.max(...settled.map((frame) => Math.abs(frame.centerY)))).toBeLessThanOrEqual(1);
  expect(new Set(settled.map((frame) => `${frame.screenX},${frame.screenY}`)).size).toBe(1);

  // 清理：只关闭弹窗；fixture 完成产品退出与系统代理恢复。
  // Cleanup: close only the dialog; the fixture performs product shutdown and system proxy restoration.
  await getByAutomationId(page, AUTOMATION_IDS.capture.httpsSetup.cancel).click();
  await expect(dialog).toHaveCount(0);
});