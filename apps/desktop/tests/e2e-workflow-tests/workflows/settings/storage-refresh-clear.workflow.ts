import { writeFile } from 'node:fs/promises';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

test('settings.storage.refresh-clear presents one usage measure and shares Capture cleanup', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.storage.refresh-clear' });
  const { page } = desktopApp;
  const controls = AUTOMATION_IDS.settings.storage;
  const requestPath = '/e2e/storage/first';
  const nextPath = '/e2e/storage/after-clear';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const openStorage = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.storage).click();
  };
  const usage = async (): Promise<{ exchanges: number; bodies: number; bytes: number }> => ({
    exchanges: Number(await getByAutomationId(page, controls.exchangeCount).getAttribute('data-count')),
    bodies: Number(await getByAutomationId(page, controls.bodyCount).getAttribute('data-count')),
    bytes: Number(await getByAutomationId(page, controls.blobBytes).getAttribute('data-bytes')),
  });

  // 准备：真实POST经代理进入Capture，暂停新录制使统计不受系统背景流量影响。
  // Arrange: proxy a real POST into Capture and pause new recording to keep background traffic out of the measurement.
  await startRecording(desktopApp);
  const response = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath, {
    method: 'POST', body: 'storage-original-body',
  });
  expect(response.statusCode).toBe(200);
  const firstRow = rows.filter({ hasText: requestPath });
  await expect(firstRow).toHaveCount(1);
  await expect(firstRow).not.toContainText('\u00b7\u00b7\u00b7');
  await firstRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toBeVisible();
  const firstRowId = await firstRow.getAttribute('data-automation-id');
  await expect(recording).toHaveAttribute('aria-busy', 'false');
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await openStorage();
  const refresh = getByAutomationId(page, controls.refresh);
  await expect(refresh).toBeEnabled();
  await expect(getByAutomationId(page, controls.blobBytes)).toHaveAttribute('data-bytes', /^[1-9]\d*$/);
  const beforeClear = await usage();
  expect(beforeClear.exchanges).toBeGreaterThan(0);
  expect(beforeClear.bodies).toBeGreaterThan(0);
  await screenshotStep('准备：真实POST经代理进入Capture，暂停新录制使统计不受系统背景流量影响。 / Arrange: proxy a real POST into Capture and pause new recording to keep background traffic out of the measurement.');

  // 布局：Refresh归属于标题，单项用量保留真实Core值，不用新增API或文案选择器。
  // Layout: Refresh belongs to the heading and the single usage measure retains Core values without extra APIs or translated selectors.
  const refreshLayout = await refresh.evaluate((button) => {
    const parent = button.parentElement!;
    const parentRect = parent.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return { parentTag: parent.tagName, headingCount: parent.querySelectorAll('h2').length,
      width: buttonRect.width, height: buttonRect.height,
      rightDelta: parentRect.right - buttonRect.right,
      centerDelta: parentRect.y + parentRect.height / 2 - buttonRect.y - buttonRect.height / 2 };
  });
  const beforePath = testInfo.outputPath('storage-before.json');
  await writeFile(beforePath, JSON.stringify({ requestPath, firstRowId, beforeClear, refreshLayout }, null, 2), 'utf8');
  await testInfo.attach('storage-before', { path: beforePath, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('storage-before.png') });
  expect(refreshLayout.parentTag).toBe('HEADER');
  expect(refreshLayout.headingCount).toBe(1);
  expect(refreshLayout.width).toBe(30);
  expect(refreshLayout.height).toBe(30);
  expect(Math.abs(refreshLayout.rightDelta)).toBeLessThan(1);
  expect(Math.abs(refreshLayout.centerDelta)).toBeLessThan(1);
  await expect(getByAutomationId(page, controls.blobBytes)).toHaveCount(1);
  await expect(getByAutomationId(page, controls.sessionCount)).toHaveAttribute('data-count', '1');
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect.poll(usage).toEqual(beforeClear);
  await screenshotStep('布局：Refresh归属于标题，单项用量保留真实Core值，不用新增API或文案选择器。 / Layout: Refresh belongs to the heading and the single usage measure retains Core values without extra APIs or translated selectors.');

  // 用户操作：Cancel不清理；确认后清理记录和正文，列表与Inspector收到同一reset通知。
  // User actions: Cancel preserves data; confirmation clears records and bodies and resets both the list and Inspector.
  await getByAutomationId(page, controls.clear).click();
  await expect(getByAutomationId(page, controls.clearConfirm)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('storage-confirm.png') });
  await getByAutomationId(page, controls.clearCancel).click();
  expect(await usage()).toEqual(beforeClear);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(firstRow).toHaveAttribute('data-automation-id', firstRowId!);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toBeVisible();
  await openStorage();
  await getByAutomationId(page, controls.clear).click();
  await getByAutomationId(page, controls.clearConfirm).click();
  await expect.poll(usage).toEqual({ exchanges: 0, bodies: 0, bytes: 0 });
  await expect(getByAutomationId(page, controls.sessionCount)).toHaveAttribute('data-count', '1');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(rows).toHaveCount(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toHaveCount(0);
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await screenshotStep('用户操作：Cancel不清理；确认后清理记录和正文，列表与Inspector收到同一reset通知。 / User actions: Cancel preserves data; confirmation clears records and bodies and resets both the list and Inspector.');

  // 再录制与反向清理：新请求可见，Capture列表Clear后Storage刷新得到相同的空状态。
  // Record again and clear from the other entry: new traffic is captured and list Clear produces the same empty Storage state.
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
  await expect(recording).toHaveAttribute('aria-busy', 'false');
  await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), nextPath, {
    method: 'POST', body: 'storage-new-body',
  })).resolves.toMatchObject({ statusCode: 200 });
  const nextRow = rows.filter({ hasText: nextPath });
  await expect(nextRow).toHaveCount(1);
  await expect(nextRow).not.toContainText('\u00b7\u00b7\u00b7');
  const nextRowId = await nextRow.getAttribute('data-automation-id');
  expect(nextRowId).not.toBe(firstRowId);
  await expect(recording).toHaveAttribute('aria-busy', 'false');
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
  await expect(rows).toHaveCount(0);
  await openStorage();
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect.poll(usage).toEqual({ exchanges: 0, bodies: 0, bytes: 0 });
  await screenshotStep('再录制与反向清理：新请求可见，Capture列表Clear后Storage刷新得到相同的空状态。 / Record again and clear from the other entry: new traffic is captured and list Clear produces the same empty Storage state.');

  // 证据与清理：只保存本轮统计及身份，fixture正常Close并核验进程、8888和系统代理恢复。
  // Evidence and cleanup: save this workflow's measurements and identities; the fixture verifies normal exit and host restoration.
  const evidencePath = testInfo.outputPath('storage-refresh-clear.json');
  await writeFile(evidencePath, JSON.stringify({ beforeClear, refreshLayout, firstRowId, nextRowId,
    afterSettingsClear: { exchanges: 0, bodies: 0, bytes: 0 }, afterListClear: await usage(), recordingPreserved: true }, null, 2), 'utf8');
  await testInfo.attach('storage-refresh-clear', { path: evidencePath, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('storage-cleared.png') });
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});