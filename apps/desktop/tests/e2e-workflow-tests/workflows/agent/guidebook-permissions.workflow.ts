import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('tool permissions guide records independent Agent and MCP switches without a model', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(180_000);
  const { page } = desktopApp;
  const tool = 'capture_clear';
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'tool-permissions');
  try {
    // 准备与操作：不配置模型，使用真实Settings的独立授权控件。
    // Arrange and act: use independent Settings capability controls without configuring a model.
    await media.step('01-settings', '打开 Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-agent', '打开 Tool capabilities / Open Tool capabilities', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).scrollIntoViewIfNeeded();
    });
    await media.step('03-search', '查找 capture_clear / Find capture_clear', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill(tool);
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolRow(tool))).toBeVisible();
    });
    await media.step('04-disable-agent', '只关闭 Agent 清理权限 / Disable only Agent clear access', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(tool)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(tool))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(tool))).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('05-disable-mcp', '再关闭 MCP 清理权限 / Disable MCP clear access separately', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(tool)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(tool))).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('06-restore-agent', '显式恢复 Agent 权限 / Explicitly restore Agent access', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(tool)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(tool))).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('07-restore-mcp', '显式恢复 MCP 权限 / Explicitly restore MCP access', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(tool)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(tool))).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('08-query', '查找只读查询 Tool / Find a read-only query Tool', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('capture_get_proxy_status');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolRow('capture_get_proxy_status'))).toBeVisible();
    });
    // 证据：单项开关不等于整个入口只读，也没有实际执行Clear。
    // Evidence: one disabled Tool is not a global read-only mode; no Clear operation was executed.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ changeTool: tool, queryTool: 'capture_get_proxy_status', operationExecuted: 'none' });
  }
  // 清理：fixture关闭App并核对系统设置、Core和8888。
  // Cleanup: the fixture closes the App and verifies host, Core and port restoration.
});
