import { readFile } from 'node:fs/promises';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('system proxy guide distinguishes routing ownership, listener availability and Recording pause', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  const { page } = desktopApp;
  const requestPath = '/guide/system-proxy/explicit-client';
  const proxyJournal = async (): Promise<{ original: unknown; owned: unknown }> => {
    const value: unknown = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8'));
    if (typeof value !== 'object' || value === null || !('original' in value) || !('owned' in value)) {
      throw new Error('The real proxy ownership journal is invalid.');
    }
    return { original: value.original, owned: value.owned };
  };
  const openProxy = async () => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  };
  // 准备：通过正式Recording就绪入口完成接管，原设置只读保存在内存。
  // Arrange: use the actual Recording readiness flow; keep original host settings only in memory.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/system-proxy');
  await startRecording(desktopApp);
  const initial = await proxyJournal();
  expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), initial.owned)).toBe(true);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-proxy-routing');
  try {
    await media.step('01-owned', '查看系统代理接管状态 / Inspect system proxy ownership', async () => {
      await openProxy();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore)).toBeVisible();
    });
    await media.step('02-restore', 'Restore 恢复原路由 / Restore the original system routing', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeVisible();
      await expect.poll(async () =>
        desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), initial.original)).toBe(true);
    });
    await media.step('03-listener', '确认监听器没有因此停止 / Confirm the listener is still available', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
      await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText('127.0.0.1:8888');
    });
    await media.step('04-enable', '通过 Settings 重新 Enable / Enable again through Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore)).toBeVisible();
      const current = await proxyJournal();
      expect(current.original).toEqual(initial.original);
      expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), current.owned)).toBe(true);
    });
    await media.step('05-recording', '返回 Capture 确认录制开启 / Return to Capture and ensure Recording is on', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await startRecording(desktopApp);
    });
    await media.step('06-pause', '暂停 Recording / Pause Recording', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('07-still-owned', '暂停不等于 Restore / Pausing is not Restore', async () => {
      await openProxy();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore)).toBeVisible();
      const current = await proxyJournal();
      expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), current.owned)).toBe(true);
    });
    await media.step('08-final-restore', '结束演示前恢复原路由 / Restore routing before finishing', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeVisible();
      await expect.poll(async () =>
        desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), initial.original)).toBe(true);
    });
    // 证据：真实系统快照只做内存比较，不进入公开媒体或原设置清单。
    // Evidence: compare actual host snapshots only in memory, never publish the user's original settings.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ listener: '127.0.0.1:8888', explicitClientUrl: httpTrafficRunner.url(requestPath),
      purpose: 'System proxy routing and Recording are separate; Restore retains the listener',
      authorizationScope: 'existing authorized helper; this is not first-time OS authorization footage' });
  }
  // 清理：正式Close与宿主guard继续核对原代理、CA及所有进程和8888。
  // Cleanup: normal Close and the host guard verify original proxy/CA, all processes and port 8888.
});
