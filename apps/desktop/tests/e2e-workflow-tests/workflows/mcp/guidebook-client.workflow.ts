import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import net from 'node:net';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { copyMcpClientConfiguration } from '../../fixtures/ui/mcp-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('mcp guide records native Client setup, real transport queries and App approvals', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  let clientId = '';
  let endpoint = '';
  let portOwner: net.Server | undefined;
  let client: Client | undefined;
  let configuration: Awaited<ReturnType<typeof copyMcpClientConfiguration>> | undefined;
  let pending: ReturnType<Client['callTool']> | undefined;
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'mcp');
  try {
    // 准备与操作：真实App创建凭据，官方Client作为明确标注的本地演示调用方。
    // Arrange and act: the App creates credentials; an official SDK Client is the explicitly identified local demo caller.
    await media.step('01-settings', '打开 Settings / Open Settings', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    });
    await media.step('02-mcp', '找到 MCP Server / Find MCP Server', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.root).scrollIntoViewIfNeeded();
    });
    await media.step('03-enable', '开启本机 MCP Server / Enable the local MCP Server', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    });
    await media.step('04-add-client', '添加独立 Client / Add a separate Client', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.client.dialog)).toBeVisible();
    });
    await media.step('05-name', '输入 Guide local client / Name the Client', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Guide local client');
    });
    await media.step('06-create', '创建 Client / Create the Client', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
      const row = page.locator('[data-automation-id^="mcp.client.row."]');
      await expect(row).toHaveCount(1);
      const id = await row.getAttribute('data-client-id');
      if (!id) throw new Error('Created MCP Client omitted its public identity.');
      clientId = id;
    });
    await media.step('07-copy', '复制配置，不展示凭据 / Copy configuration without displaying credentials', async () => {
      configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
      endpoint = configuration.url;
    });
    await media.step('08-query', '演示客户端连接并查询 / Connect the demo client and query', async () => {
      if (!configuration) throw new Error('Client configuration was not copied.');
      client = new Client({ name: 'guide-local-client', version: '1.0.0' }, {
        supportedProtocolVersions: ['2026-07-28'],
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      });
      await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
        requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
      }));
      expect((await client.listTools()).tools.some(tool => tool.name === 'capture_get_proxy_status')).toBe(true);
      expect((await client.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
    });
    await media.step('09-ask', '发起需要审批的操作 / Request an operation requiring approval', async () => {
      if (!client) throw new Error('The demo client is not connected.');
      pending = client.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toBeVisible();
    });
    await media.step('10-deny', '拒绝一次操作 / Deny the operation', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
      expect((await pending)?.isError).toBe(true);
    });
    await media.step('11-ask-again', '再次请求并检查影响 / Request again and review effects', async () => {
      if (!client) throw new Error('The demo client is not connected.');
      pending = client.callTool({ name: 'capture_stop_recording', arguments: {} });
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toBeVisible();
    });
    await media.step('12-allow', '允许暂停录制 / Allow pausing Recording', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      expect((await pending)?.isError).not.toBe(true);
    });
    await media.step('13-auto', '查看 Client 的 Auto 模式 / Inspect Client Auto mode', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
    });
    await media.step('14-ask-mode', '恢复 Client 的 Ask / Restore Client Ask', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientAsk(clientId)).click();
    });
    await media.step('14a-regenerate-dialog', '检查轮换凭据确认 / Review credential rotation', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientRegenerate(clientId)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.client.regenerateDialog)).toBeVisible();
    });
    await media.step('14b-regenerate', '轮换凭据并验证旧配置失效 / Rotate and verify old configuration is rejected', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.regenerateConfirm).click();
      if (!client) throw new Error('The demo client is not connected.');
      await expect(client.callTool({ name: 'capture_get_proxy_status', arguments: {} })).rejects.toThrow();
    });
    await media.step('14c-update-client', '复制新配置并重新连接 / Copy new configuration and reconnect', async () => {
      await client?.close();
      configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
      client = new Client({ name: 'guide-local-client', version: '1.0.0' }, {
        supportedProtocolVersions: ['2026-07-28'],
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      });
      await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
        requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
      }));
      expect((await client.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
    });
    await media.step('15-revoke-dialog', '查看撤销 Client 的确认 / Review Client revocation', async () => {
      await getByAutomationId(page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeDialog)).toBeVisible();
    });
    await media.step('16-revoke', '撤销演示 Client / Revoke the demo Client', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
      await expect(page.locator('[data-automation-id^="mcp.client.row."]')).toHaveCount(0);
    });
    await media.step('17-disable', '关闭 MCP Server / Disable MCP Server', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    await media.step('18-port-conflict', '观察端口冲突提示 / Observe an endpoint conflict', async () => {
      portOwner = net.createServer(socket => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        portOwner!.once('error', reject);
        portOwner!.listen(Number(new URL(endpoint).port), '127.0.0.1', resolve);
      });
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root).getByRole('alert')).toContainText('EADDRINUSE');
    });
    await media.step('19-release-port', '结束已知占用后重试 / Retry after ending the known port owner', async () => {
      if (!portOwner) throw new Error('The controlled port owner is missing.');
      await new Promise<void>((resolve, reject) => portOwner!.close(error => error ? reject(error) : resolve()));
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint)).toContainText(endpoint);
    });
    await media.step('20-final-disable', '结束演示并关闭 Server / Finish by disabling the Server', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    // 证据：配置凭据只在测试内存中，视频和metadata不包含复制的配置。
    // Evidence: keep credentials only in test memory, never in published video or metadata.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      await client?.close();
      if (portOwner?.listening) await new Promise<void>((resolve, reject) => portOwner!.close(error => error ? reject(error) : resolve()));
      await page.evaluate(() => navigator.clipboard.writeText(''));
    } finally {
      await media.stop({ clientName: 'Guide local client', endpoint, endpointChanged: 'false',
        caller: 'official SDK local demonstration; not a VS Code or cloud-host compatibility claim' });
    }
  }
  // 清理：原driver验证真实App、Core、listener和宿主恢复。
  // Cleanup: the driver verifies App/Core/listener shutdown and host restoration.
});
