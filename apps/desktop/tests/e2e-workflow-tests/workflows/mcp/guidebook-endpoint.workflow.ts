import net from 'node:net';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('mcp endpoint guide records the actual restart-conflict recovery entry', async ({ desktopApp }, testInfo) => {
  test.setTimeout(240_000);
  const initial = desktopApp.page;
  let restarted: LocalElectronApplicationDriver | undefined;
  let portOwner: net.Server | undefined;
  let media: GuidebookMedia | undefined;
  let oldEndpoint = '';
  let newEndpoint = '';

  // 准备：通过真实UI保存开启状态，正常关闭首代，再由明确的测试进程占用原端口。
  // Arrange: save enabled state through UI, quit normally, then let an owned test process occupy the old port.
  await getByAutomationId(initial, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(initial, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(initial, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(initial, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  const text = await getByAutomationId(initial, AUTOMATION_IDS.mcp.server.endpoint).textContent();
  const urls = text?.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/g);
  if (urls?.length !== 1) throw new Error('The initial endpoint is not unambiguous.');
  oldEndpoint = urls[0]!;
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
  try {
    portOwner = net.createServer(socket => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      portOwner!.once('error', reject);
      portOwner!.listen(Number(new URL(oldEndpoint).port), '127.0.0.1', resolve);
    });
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'restarted-',
    });
    await restarted.waitUntilReady();
    const { page } = restarted;
    media = await GuidebookMedia.start(restarted, testInfo, 'mcp-endpoint');

    // 用户操作：重启后才有的冲突入口，用真实Change endpoint恢复。
    // User actions: use the restart-specific conflict entry and the real Change endpoint action.
    await media.step('01-settings', '重启后打开 Settings / Open Settings after restart', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-conflict', '检查已保存 endpoint 冲突 / Inspect the saved endpoint conflict', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.root).scrollIntoViewIfNeeded();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'endpoint-conflict');
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint)).toContainText(oldEndpoint);
    });
    await media.step('03-change', '显式更换 endpoint / Explicitly change the endpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.changeEndpoint).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
      const value = await getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint).textContent();
      const next = value?.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/g);
      if (next?.length !== 1) throw new Error('The replacement endpoint is not unambiguous.');
      newEndpoint = next[0]!;
      expect(newEndpoint).not.toBe(oldEndpoint);
    });
    await media.step('04-note-new-address', '核对需要更新的地址 / Inspect the address that hosts must update', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint)).toContainText(newEndpoint);
    });
    await media.step('05-disable', '关闭演示 Server / Disable the demonstration Server', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    // 证据：明确区分运行期启用失败与启动时的endpoint-conflict，不伪造入口。
    // Evidence: distinguish runtime enable failure from startup endpoint-conflict without inventing a button.
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (media) await media.stop({ oldEndpoint, newEndpoint, prerequisite: 'MCP was enabled before normal App restart; its saved port was occupied by an owned demo process' });
    } finally {
      if (portOwner?.listening) await new Promise<void>((resolve, reject) => portOwner!.close(error => error ? reject(error) : resolve()));
      if (restarted) {
        await restarted.captureFinalScreenshot(testInfo);
        await restarted.stopTrace(testInfo);
        await restarted.closeGracefully();
        await restarted.writeEvidence(testInfo);
        await restarted.forceCleanup();
      }
    }
  }
  // 清理：原fixture核对两代App、全部listener与系统恢复，再移除同一测试profile。
  // Cleanup: the outer fixture verifies both App generations, all listeners and host recovery.
});
