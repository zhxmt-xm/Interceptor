import { once } from 'node:events';
import net from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';

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
  await screenshotStep('准备：保持应用语言，通过真实导航进入MCP设置。 / Arrange: retain the application language and navigate to MCP settings through the real UI.');

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
  await screenshotStep('用户操作：启用和停用Server，版本说明保持不变。 / User actions: enable and disable the server while retaining the same protocol notice.');

  // 用户操作：保存真实Client及Server开启状态，正常重启后处理自有端口冲突。
  // User actions: save a real Client and enabled Server, then handle an owned port conflict after normal restart.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label).fill('Endpoint recovery client');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
  const clientId = await desktopApp.page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
  if (!clientId) throw new Error('The endpoint Client omitted its identity.');
  const original = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  const portOwner = net.createServer(socket => socket.destroy());
  let restarted: LocalElectronApplicationDriver | undefined;
  let client: Client | undefined;
  try {
    portOwner.listen(Number(new URL(original.url).port), '127.0.0.1');
    await once(portOwner, 'listening');
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'endpoint-reopened',
    });
    await restarted.waitUntilReady();
    await openMcpSettings(restarted.page);
    const currentServer = getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.root);
    const currentNotice = getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.protocolSupport);
    await expect(currentServer).toHaveAttribute('data-server-state', 'endpoint-conflict');
    for (const version of MCP_PROTOCOL_VERSIONS) await expect(currentNotice).toContainText(version);
    await screenshotStep('端口冲突时保留协议说明与原地址 / Retain protocol information and the original address during a port conflict');
    await getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.changeEndpoint).click();
    await expect(currentServer).toHaveAttribute('data-server-state', 'running');
    const current = await copyMcpClientConfiguration(restarted, testInfo, clientId);
    expect(current.url).not.toBe(original.url);
    expect(current.token === original.token).toBe(true);
    client = new Client({ name: 'endpoint-recovery', version: '1.0.0' }, {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(current.url), {
      requestInit: { headers: { Authorization: `Bearer ${current.token}` } },
    }));
    expect((await client.listTools()).tools.some(tool => tool.name === 'capture_get_proxy_status')).toBe(true);
    expect((await client.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
    await expect(getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    await screenshotStep('Change endpoint后用同一Client重新查询 / Reconnect and query with the same Client after changing the endpoint');
    await client.close();
    client = undefined;
    await getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(currentServer).toHaveAttribute('data-server-state', 'disabled');
    for (const version of MCP_PROTOCOL_VERSIONS) await expect(currentNotice).toContainText(version);
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    // 清理：释放本轮端口与SDK，两代App均走正常Close及同一宿主guard。
    // Cleanup: release the owned port/SDK and close both generations under the same host guard.
    try {
      await client?.close();
    } finally {
      if (portOwner.listening) {
        await new Promise<void>((resolve, reject) => portOwner.close(error => error ? reject(error) : resolve()));
      }
      if (restarted) {
        await restarted.stopTrace(testInfo);
        try { await restarted.closeGracefully(); }
        finally {
          await restarted.writeEvidence(testInfo);
          await restarted.forceCleanup();
        }
      }
    }
  }

  // 证据与清理：fixture保存截图和trace，并验证真实App退出与宿主恢复。
  // Evidence and cleanup: the fixture saves screenshots and trace, then verifies real App exit and host restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});
