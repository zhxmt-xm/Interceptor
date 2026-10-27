import { AUTOMATION_IDS, AutomationIdFactory } from '../../../src/shared/automation-ids';
import { getByAutomationId } from '../../e2e-workflow-tests/fixtures/ui/automation';
import { openMcpSettings } from '../../e2e-workflow-tests/fixtures/ui/mcp-workflow';
import { expect, test } from '../fixtures/demo-recorder';

const CHINESE = (process.env.INTERCEPTOR_E2E_LOCALE ?? '').toLowerCase().startsWith('zh');
const CLIENT_LABEL = CHINESE ? '演示 MCP Host' : 'Demo MCP host';

test('demo.mcp enables the server, creates a client and copies its configuration', async ({
  desktopApp,
  demo,
}) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;

  await demo.start();
  demo.caption({
    en: 'Enable the loopback MCP server.',
    zh: '开启仅本机可访问的 MCP Server。',
  });
  await page.waitForTimeout(900);
  await openMcpSettings(page);
  const server = getByAutomationId(page, AUTOMATION_IDS.mcp.server.root);
  await expect(server).toBeVisible();
  if (await server.getAttribute('data-server-state') !== 'running') {
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  }
  await expect(server).toHaveAttribute('data-server-state', 'running');
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Create a separate credential for each host.',
    zh: '为每个 Host 创建独立凭据。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill(CLIENT_LABEL);
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('The MCP client row omitted its identity.');
  await page.waitForTimeout(900);

  demo.caption({
    en: 'Copy the connection configuration.',
    zh: '复制连接配置。',
  });
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  await page.waitForTimeout(1200);

  demo.caption({
    en: 'Paste it into your MCP host.',
    zh: '粘贴到你的 MCP Host。',
  });
  await page.waitForTimeout(1800);
  await demo.stop();
});
