import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('transfer guide records product-created HAR and native archive round trips', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  const requestPath = '/guide/transfer/order';
  const body = '{"orderId":"guide-001","message":"Hello Interceptor"}';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-'));
  const harPath = path.join(directory, 'guide-recording.har');
  const archivePath = path.join(directory, 'guide-recording.iarchive');
  const bodyPath = path.join(directory, 'guide-response.json');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const owner = desktopApp.nativeFileDialogOwner();
  let completed = false;

  // 准备：所有导入文件必须由本轮产品Export产生，正文来自真实loopback流量。
  // Arrange: all imports originate from this run's product Export and actual loopback traffic.
  httpTrafficRunner.respondWith(requestPath, { body, headers: { 'content-type': 'application/json' } });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/transfer');
  await startRecording(desktopApp);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).body).toBe(body);
  await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'false');
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('');
  await expect(rows).toHaveCount(1);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/transfer');
  await rows.filter({ hasText: requestPath }).click();
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'transfer');
  const finishDialog = async (): Promise<void> => {
    const progress = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.progress);
    await expect.poll(async () => !await progress.isVisible()
      || await progress.getAttribute('data-transfer-job-state') === 'completed').toBe(true);
    const close = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close);
    if (await close.isVisible()) await close.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toHaveCount(0);
  };
  try {
    // 用户操作：每个选项、原生面板和完成后的数据都记录实际步骤图。
    // User actions: capture the real options, native panels and completed data after each step.
    await media.step('01-export-menu', '打开 Export / Open Export', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
    });
    await media.step('02-har-options', '选择 HAR / Choose HAR', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeVisible();
    });
    await media.step('03-scope', '选择当前请求 / Select the current request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeSelected).click();
    });
    await media.step('04-privacy', '核对隐私选项 / Review privacy options', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskAuthorization)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies)).toBeVisible();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(owner, harPath, () => media.nativeDialogStep(
      '05-har-save-dialog', '保存为 guide-recording.har / Save as guide-recording.har',
    ));
    await media.step('06-har-complete', '确认 HAR 保存完成 / Verify HAR completion', async () => {
      await finishDialog();
      const har: unknown = JSON.parse(await readFile(harPath, 'utf8'));
      expect(har).toMatchObject({ log: { entries: [
        { request: { url: httpTrafficRunner.url(requestPath) } },
      ] } });
    });
    await media.step('07-import-menu', '打开 Import / Open Import', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
    });
    await media.step('08-import-har', '选择 HAR 导入 / Choose HAR import', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(owner, harPath, () => media.nativeDialogStep(
      '09-har-open-dialog', '打开同一个 HAR / Open the same exported HAR',
    ));
    await media.step('10-har-appended', '核对记录追加 / Verify appended records', async () => {
      await finishDialog();
      await expect(rows).toHaveCount(2);
    });
    await media.step('11-archive-options', '选择 Native Archive / Choose Native Archive', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.saveArchive).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeVisible();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(owner, archivePath, () => media.nativeDialogStep(
      '12-archive-save-dialog', '保存 guide-recording.iarchive / Save the native archive',
    ));
    await media.step('13-archive-complete', '核对归档保存 / Verify archive completion', async () => {
      await finishDialog();
      expect((await stat(archivePath)).size).toBeGreaterThan(0);
    });
    await media.step('14-clear', '清空已导出的演示记录 / Clear the exported example records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
      await expect(rows).toHaveCount(0);
    });
    await media.step('15-archive-import', '选择打开 Native Archive / Open Native Archive', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.openArchive).click();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(owner, archivePath, () => media.nativeDialogStep(
      '16-archive-open-dialog', '选择刚保存的归档 / Select the product-created archive',
    ));
    await media.step('17-restored', '核对恢复的请求和正文 / Verify restored requests and body', async () => {
      await finishDialog();
      await expect(rows).toHaveCount(2);
      await rows.first().click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('guide-001');
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(owner, bodyPath, () => media.nativeDialogStep(
      '18-body-save-dialog', '保存单独正文 / Save the individual body',
    ));
    await media.step('19-body-complete', '核对完整正文 / Verify the complete body', async () => {
      await expect.poll(async () => readFile(bodyPath, 'utf8')).toBe(body);
    });
    // 业务断言与证据：导入没有重新发送请求，文件只读核对，不预造业务输入。
    // Assert and evidence: imports do not resend requests; exported files are inspected, never seeded.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({ url: httpTrafficRunner.url(requestPath), har: path.basename(harPath),
      archive: path.basename(archivePath), bodyFile: path.basename(bodyPath), body });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：原driver验证正式退出、文件任务和系统设置恢复。
  // Cleanup: the driver verifies normal shutdown, file task cleanup and restored system settings.
});
