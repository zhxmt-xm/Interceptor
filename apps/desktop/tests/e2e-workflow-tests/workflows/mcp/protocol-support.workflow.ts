import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';

const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-11-25', '2026-07-28'] as const;

test('mcp.settings.protocol-support remains visible when the server is off or running', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'mcp.settings.protocol-support',
  });

  // 准备：保持应用语言，通过真实导航进入MCP设置。
  // Arrange: retain the application language and navigate to MCP settings through the real UI.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
  const server = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root);
  const notice = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.protocolSupport);

  // 业务断言：未监听时也能看到三版协议说明，不依赖Client或模型配置。
  // Business assertion: all three revisions are visible without a listener, Client, or model configuration.
  await expect(server).toHaveAttribute('data-server-state', 'disabled');
  await expect(notice).toBeVisible();
  for (const version of MCP_PROTOCOL_VERSIONS) await expect(notice).toContainText(version);
  await desktopApp.page.screenshot({ path: testInfo.outputPath('protocol-support-initial.png') });

  // 用户操作：启用和停用Server，版本说明保持不变。
  // User actions: enable and disable the server while retaining the same protocol notice.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'running');
  for (const version of MCP_PROTOCOL_VERSIONS) await expect(notice).toContainText(version);
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'disabled');
  await expect(notice).toBeVisible();

  // 证据与清理：fixture保存截图和trace，并验证真实App退出与宿主恢复。
  // Evidence and cleanup: the fixture saves screenshots and trace, then verifies real App exit and host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});
