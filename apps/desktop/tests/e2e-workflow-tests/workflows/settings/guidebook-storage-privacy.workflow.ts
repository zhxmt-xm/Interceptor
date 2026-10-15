import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('settings guide records privacy defaults and actual storage cleanup without losing recording intent', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const prefix = '/guide/storage';
  const firstPath = `${prefix}/before-clear`;
  const secondPath = `${prefix}/after-clear`;
  const body = '{"orderId":"guide-storage-001","message":"public example"}';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const storage = AUTOMATION_IDS.settings.storage;
  const privacy = AUTOMATION_IDS.settings.privacy;
  const openStorage = async () => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.storage).click();
  };
  const usage = async () => ({
    exchanges: Number(await getByAutomationId(page, storage.exchangeCount).getAttribute('data-count')),
    bodies: Number(await getByAutomationId(page, storage.bodyCount).getAttribute('data-count')),
    bytes: Number(await getByAutomationId(page, storage.blobBytes).getAttribute('data-bytes')),
  });

  // 准备：只有本轮公开流量，暂停录制后检查完整范围，避免清理个人记录。
  // Arrange: own the public traffic and check its full scope after pausing, before any cleanup.
  await startRecording(desktopApp);
  httpTrafficRunner.respondWith(firstPath, { body, headers: { 'content-type': 'application/json' } });
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), firstPath)).body).toBe(body);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(1);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-storage-privacy');
  try {
    await media.step('01-record', '选择本轮临时记录 / Select this run’s temporary record', async () => {
      await rows.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('guide-storage-001');
    });
    await media.step('02-privacy', '打开隐私默认值 / Open privacy defaults', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
    });
    await media.step('03-cookie-default', '临时更改 Cookie 默认值 / Temporarily change the Cookie default', async () => {
      await getByAutomationId(page, privacy.maskCookies).click();
      await expect(getByAutomationId(page, privacy.maskCookies)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, privacy.maskAuthorization)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('04-new-export', '打开新的 HAR 导出检查继承 / Open a new HAR export and check defaults', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskAuthorization)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('05-filter-scope', '选择当前筛选范围 / Select the current filter scope', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeFilter).click();
    });
    await media.step('06-all-scope', '查看全部记录范围 / Inspect the all-records scope', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeAll).click();
    });
    await media.step('07-one-export-override', '只覆盖本次 Cookie 遮罩 / Override Cookie masking for this export', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('08-cancel-export', '取消本次导出 / Cancel this export', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.cancel).click();
      await expect(rows).toHaveCount(1);
    });
    await media.step('09-default-unchanged', '确认单次覆盖没有改默认值 / Verify the override did not change defaults', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
      await expect(getByAutomationId(page, privacy.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('10-restore-privacy', '恢复 Cookie 遮罩默认值 / Restore the Cookie masking default', async () => {
      await getByAutomationId(page, privacy.maskCookies).click();
      await expect(getByAutomationId(page, privacy.maskCookies)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('11-storage', '查看实际存储用量 / Inspect actual storage usage', async () => {
      await openStorage();
      await expect(getByAutomationId(page, storage.blobBytes)).toHaveAttribute('data-bytes', /^[1-9]\d*$/);
    });
    const before = await usage();
    await media.step('12-refresh', 'Refresh 只刷新统计 / Refresh updates statistics only', async () => {
      await getByAutomationId(page, storage.refresh).click();
      await expect.poll(usage).toEqual(before);
    });
    await media.step('13-clear-dialog', '检查 Clear 影响 / Review Clear effects', async () => {
      await getByAutomationId(page, storage.clear).click();
      await expect(getByAutomationId(page, storage.clearConfirm)).toBeVisible();
    });
    await media.step('14-cancel-clear', '取消 Clear 不删除记录 / Cancel Clear without deleting records', async () => {
      await getByAutomationId(page, storage.clearCancel).click();
      expect(await usage()).toEqual(before);
    });
    await media.step('15-confirm-clear', '确认清理本轮记录和正文 / Confirm clearing this run’s records and bodies', async () => {
      await getByAutomationId(page, storage.clear).click();
      await getByAutomationId(page, storage.clearConfirm).click();
      await expect.poll(usage).toEqual({ exchanges: 0, bodies: 0, bytes: 0 });
    });
    await media.step('16-empty-capture', 'Capture 同步变空且仍暂停 / Capture is empty and remains paused', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(rows).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toHaveCount(0);
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('17-resume-after-clear', 'Clear 后显式恢复录制 / Explicitly resume after Clear', async () => {
      await startRecording(desktopApp);
      await expect(recording).toHaveAttribute('aria-pressed', 'true');
    });
    await media.step('18-new-record', 'Clear 后捕获新请求 / Capture a new request after Clear', async () => {
      httpTrafficRunner.respondWith(secondPath, { body: '{"message":"after-clear"}' });
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), secondPath)).statusCode).toBe(200);
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(secondPath);
    });
    // 证据：统计、正文和录制状态分别核对，未导出未遮罩的个人数据。
    // Evidence: check usage, bodies and recording state independently; no unmasked personal data is exported.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ firstUrl: httpTrafficRunner.url(firstPath), secondUrl: httpTrafficRunner.url(secondPath),
      body, privacyOverride: 'maskCookies true for one cancelled export; saved default remained false then restored true',
      clearedData: 'only this workflow’s temporary records and bodies' });
  }
  // 清理：标准Close与宿主guard恢复原系统设置并释放全部进程及8888。
  // Cleanup: standard Close and the host guard restore settings and release processes and port 8888.
});
