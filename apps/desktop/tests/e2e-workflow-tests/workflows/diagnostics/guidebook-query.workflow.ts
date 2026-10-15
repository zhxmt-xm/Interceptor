import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('diagnostics guide records querying actual App operations and their details', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  const { page } = desktopApp;
  const main = getByAutomationId(page, AUTOMATION_IDS.app.main);
  const command = main.getByRole('button').filter({ hasText: 'composer.send' }).first();
  const directory = await mkdtemp('/tmp/interceptor-guidebook-diagnostics-');
  const exportPath = path.join(directory, 'guide-diagnostics.jsonl');
  let completed = false;
  // 准备：通过Composer真实Send产生可查询记录，不写日志数据库或注入记录。
  // Arrange: create records with a real Composer send, never seed the log database.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url('/guide/diagnostics'));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => httpTrafficRunner.observation('/guide/diagnostics')?.method).toBe('GET');
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'diagnostics');
  try {
    // 用户操作：实际选择记录、切换过滤并阅读详情，每步保存同一窗口。
    // User actions: select records, change filters and read details in the same real window.
    await media.step('01-open', '打开 Diagnostics / Open Diagnostics', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
      await expect(command).toBeVisible();
    });
    await media.step('02-record', '选择实际记录 / Select an actual record', async () => {
      await command.click();
    });
    await media.step('03-process', '按 Process 筛选 / Filter by Process', async () => {
      await main.getByRole('button').nth(0).click();
      await expect(main.getByRole('button').nth(0)).toContainText('core');
    });
    await media.step('04-level', '按 Level 筛选 / Filter by Level', async () => {
      await main.getByRole('button').nth(1).click();
      await expect(main.getByRole('button').nth(1)).toContainText('error');
    });
    await media.step('05-info', '切换到 info / Select the info level', async () => {
      await main.getByRole('button').nth(1).click();
      await main.getByRole('button').nth(1).click();
      await expect(main.getByRole('button').nth(1)).toContainText('info');
    });
    await media.step('06-outcome', '只查看成功操作 / Inspect successful operations', async () => {
      await main.getByRole('button').nth(2).click();
      await expect(command).toBeVisible();
      await command.click();
      await expect(main).toContainText('success');
    });
    await main.getByRole('button').nth(3).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), exportPath, () =>
      media.nativeDialogStep('07-export', '保存 guide-diagnostics.jsonl / Save guide-diagnostics.jsonl'));
    await media.step('08-exported', '核对真实 JSONL 导出 / Verify the actual JSONL export', async () => {
      await expect.poll(async () => (await readFile(exportPath, 'utf8')).trim().length).toBeGreaterThan(0);
      const records: unknown[] = (await readFile(exportPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ command: 'composer.send' })]));
    });
    // 证据：只有自产测试目标，没有真实凭据或个人流量。
    // Evidence: use only the owned target, without real credentials or personal traffic.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({ requestUrl: httpTrafficRunner.url('/guide/diagnostics'), method: 'GET',
      command: 'composer.send', process: 'core', level: 'info', outcome: 'success', fileName: 'guide-diagnostics.jsonl' });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：正常退出和进程、端口、宿主恢复仍由原driver负责。
  // Cleanup: the existing driver verifies normal exit and process, port and host restoration.
});
