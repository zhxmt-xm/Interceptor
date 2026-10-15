import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('settings guide records non-destructive proxy, TLS, privacy and storage steps', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings');
  try {
    // 准备与用户操作：保留共享CA，用真实UI逐个展示设置入口和可恢复草稿。
    // Arrange and act: retain the shared CA and show settings through real UI and reversible drafts.
    await media.step('01-open', '打开 Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-certificates', '检查当前 CA 与信任 / Inspect the existing CA and trust', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toBeVisible();
    });
    await media.step('03-proxy', '检查 System proxy / Inspect System proxy', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore)).toBeVisible();
    });
    await media.step('04-upstream', '查看当前上游路线 / Inspect the current upstream route', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.currentRoute)).toBeVisible();
    });
    await media.step('05-manual-draft', '选择 Manual 草稿 / Choose a Manual draft', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.mode.manual).click();
      await getByAutomationId(page, AUTOMATION_IDS.upstream.host).fill('127.0.0.1');
      await getByAutomationId(page, AUTOMATION_IDS.upstream.port).fill('7890');
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.apply)).toBeVisible();
    });
    await media.step('06-discard', 'Discard 不应用示例草稿 / Discard without applying the example', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.discard).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.mode.system)).toBeChecked();
    });
    await media.step('07-pac', '查看 PAC 输入 / Inspect PAC input', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.mode.pac).click();
      await getByAutomationId(page, AUTOMATION_IDS.upstream.pacUrl).fill('https://proxy.example.test/proxy.pac');
    });
    await media.step('08-discard-pac', '放弃未运行的 PAC 示例 / Discard the non-running PAC example', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.discard).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.mode.system)).toBeChecked();
    });
    await media.step('09-passthrough', '打开 TLS passthrough / Open TLS passthrough', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput)).toBeVisible();
    });
    await media.step('10-privacy', '检查导出隐私默认值 / Inspect export privacy defaults', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.privacy.maskAuthorization)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.privacy.maskCookies)).toBeVisible();
    });
    await media.step('11-storage', '查看临时存储 / Inspect temporary storage', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.storage).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.storage.refresh)).toBeVisible();
    });
    await media.step('12-refresh', '刷新用量 / Refresh usage', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.storage.refresh).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.storage.bodyCount)).toBeVisible();
    });
    await media.step('13-clear-confirm', '查看清理确认 / Review Clear confirmation', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.storage.clear).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.storage.clearCancel)).toBeVisible();
    });
    await media.step('14-cancel', '取消清理 / Cancel clearing', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.storage.clearCancel).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.storage.clear)).toBeVisible();
    });
    await media.step('15-updates', '查看版本与更新状态 / Inspect version and update state', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.updates).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.status)).toBeVisible();
    });
    // 业务断言与证据：示例代理并未Apply，不改变日常CA、网络出口或更新源。
    // Assert and evidence: never apply the example proxy or change shared trust, routing or update sources.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ manualHost: '127.0.0.1', manualPort: '7890',
      pacUrl: 'https://proxy.example.test/proxy.pac', exampleApplied: 'false' });
  }
  // 清理：复用真实Close和宿主guard核对完整恢复。
  // Cleanup: reuse actual Close and the host guard for complete restoration.
});
