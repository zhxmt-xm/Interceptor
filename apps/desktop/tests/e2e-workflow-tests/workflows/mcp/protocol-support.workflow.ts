import { once } from 'node:events';
import net from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
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
  await screenshotStep('Server关闭时也可以查看支持的协议 / Inspect supported protocols while the Server is disabled', {
    highlights: [{ target: notice, label: '1' }],
  });
  await desktopApp.page.screenshot({ path: testInfo.outputPath('protocol-support-initial.png') });

  // 用户操作：启用和停用Server，版本说明保持不变。
  // User actions: enable and disable the server while retaining the same protocol notice.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'running');
  await expect(server).toHaveAttribute('aria-busy', 'false');
  for (const version of MCP_PROTOCOL_VERSIONS) await expect(notice).toContainText(version);
  await screenshotStep('Server开启后保留相同协议说明 / Retain the same protocol information after enabling the Server');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'disabled');
  await expect(server).toHaveAttribute('aria-busy', 'false');
  await expect(notice).toBeVisible();
  await screenshotStep('用户操作：启用和停用Server，版本说明保持不变。 / User actions: enable and disable the server while retaining the same protocol notice.');

  // 运行期冲突：只占用本流程保存的端口，Enable失败后释放自有listener并重试。
  // Runtime conflict: occupy only this workflow's saved port, then release the owned listener and retry Enable.
  const savedEndpoint = await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint).getAttribute('data-endpoint');
  if (!savedEndpoint) throw new Error('The stopped MCP Server did not retain its endpoint.');
  const runtimePortOwner = net.createServer(socket => socket.destroy());
  try {
    runtimePortOwner.listen(Number(new URL(savedEndpoint).port), '127.0.0.1');
    await once(runtimePortOwner, 'listening');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(server).toHaveAttribute('aria-busy', 'false');
    await expect(server).toHaveAttribute('data-server-state', 'disabled');
    const error = server.getByRole('alert');
    await expect(error).toContainText('EADDRINUSE');
    await screenshotStep('运行期Enable遇到已占用端口 / Enable reports an occupied port at runtime', {
      highlights: [{ target: error, label: '1' }],
    });
  } finally {
    if (runtimePortOwner.listening) {
      await new Promise<void>((resolve, reject) => runtimePortOwner.close(error => error ? reject(error) : resolve()));
    }
  }
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'running');
  await expect(server).toHaveAttribute('aria-busy', 'false');
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint)).toHaveAttribute('data-endpoint', savedEndpoint);
  await screenshotStep('释放已知占用后在原地址重新Enable / Enable the original endpoint after releasing its known owner', {
    highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint), label: '1' }],
  });
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'disabled');
  await screenshotStep('完成重试后关闭本次Server / Disable the Server after completing the retry');

  // 用户操作：保存真实Client及Server开启状态，正常重启后处理自有端口冲突。
  // User actions: save a real Client and enabled Server, then handle an owned port conflict after normal restart.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(server).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label).fill('Endpoint recovery client');
  await screenshotStep('创建用于保留接入身份的Client / Create a Client whose identity will be retained', {
    highlights: [
      { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label), label: '1' },
      { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create), label: '2' },
    ],
  });
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
  const clientId = await desktopApp.page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
  if (!clientId) throw new Error('The endpoint Client omitted its identity.');
  const original = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  await screenshotStep('保存原endpoint和Client后正常关闭 / Close normally after saving the original endpoint and Client');
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
    await screenshotStep('重启冲突时明确选择Change endpoint / Explicitly choose Change endpoint after a restart conflict', {
      highlights: [{ target: getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.changeEndpoint), label: '1' }],
    });
    await getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.changeEndpoint).click();
    await expect(currentServer).toHaveAttribute('data-server-state', 'running');
    await expect(currentServer).toHaveAttribute('aria-busy', 'false');
    await screenshotStep('读取Change endpoint后的新地址 / Read the new address after Change endpoint', {
      highlights: [{ target: getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.endpoint), label: '1' }],
    });
    await screenshotStep('复制当前配置以更新Host中的地址 / Copy the current configuration to update the Host address', {
      highlights: [{ target: getByAutomationId(restarted.page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)), label: '1' }],
    });
    const current = await copyMcpClientConfiguration(restarted, testInfo, clientId);
    expect(current.url).not.toBe(original.url);
    expect(current.token === original.token).toBe(true);
    await testInfo.attach('mcp-endpoints', {
      body: Buffer.from(JSON.stringify({ original: original.url, current: current.url, credentialRetained: true })),
      contentType: 'application/json',
    });
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
    await screenshotStep('新endpoint验证后停止Server / Stop the Server after verifying the new endpoint', {
      highlights: [{ target: getByAutomationId(restarted.page, AUTOMATION_IDS.mcp.server.enable), label: '1' }],
    });
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
