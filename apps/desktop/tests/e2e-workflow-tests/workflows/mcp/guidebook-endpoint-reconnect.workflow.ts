import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import net from 'node:net';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('mcp guide reconnects the actual SDK after changing a conflicting endpoint on restart', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(300_000);
  const initial = desktopApp.page;
  let restarted: LocalElectronApplicationDriver | undefined;
  let portOwner: net.Server | undefined;
  let client: Client | undefined;
  let media: GuidebookMedia | undefined;
  let newEndpoint = '';
  // 准备：真实UI创建Client并保存开启状态，凭据只进内存；第一代正常退出后才占用旧端口。
  // Arrange: create the Client through UI and save enabled state; keep credentials in memory and occupy the old port only after normal exit.
  await openMcpSettings(initial);
  await getByAutomationId(initial, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(initial, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(initial, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(initial, AUTOMATION_IDS.mcp.client.label).fill('Guide endpoint client');
  await getByAutomationId(initial, AUTOMATION_IDS.mcp.client.create).click();
  const clientId = await initial.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
  if (!clientId) throw new Error('The endpoint Client omitted its identity.');
  const original = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  await initial.evaluate(() => navigator.clipboard.writeText(''));
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
  try {
    portOwner = net.createServer(socket => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      portOwner!.once('error', reject);
      portOwner!.listen(Number(new URL(original.url).port), '127.0.0.1', resolve);
    });
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'endpoint-reopened',
    });
    await restarted.waitUntilReady();
    const { page } = restarted;
    media = await GuidebookMedia.start(restarted, testInfo, 'mcp-endpoint-reconnect');
    await media.step('01-settings', '重启后打开MCP设置 / Open MCP settings after restart', async () => { await openMcpSettings(page); });
    await media.step('02-conflict', '核对真实endpoint冲突 / Inspect the actual endpoint conflict', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.root).scrollIntoViewIfNeeded();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'endpoint-conflict');
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint)).toContainText(original.url);
    });
    await media.step('03-change', '显式Change endpoint / Explicitly change the endpoint', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.changeEndpoint).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
      const text = await getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint).textContent();
      const values = text?.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/g);
      if (values?.length !== 1) throw new Error('The new endpoint is not unambiguous.');
      newEndpoint = values[0]!;
      expect(newEndpoint).not.toBe(original.url);
    });
    let configuration: Awaited<ReturnType<typeof copyMcpClientConfiguration>> | undefined;
    await media.step('04-copy-current', '复制当前配置，不展示凭据 / Copy current configuration without showing credentials', async () => {
      configuration = await copyMcpClientConfiguration(restarted!, testInfo, clientId);
      await page.evaluate(() => navigator.clipboard.writeText(''));
      expect(configuration.url).toBe(newEndpoint);
      expect(configuration.token === original.token).toBe(true);
    });
    await media.step('05-reconnect', '让本地SDK使用新地址重新连接 / Reconnect the local SDK using the new address', async () => {
      if (!configuration) throw new Error('Current configuration was not copied.');
      client = new Client({ name: 'guide-endpoint-client', version: '1.0.0' }, {
        supportedProtocolVersions: ['2026-07-28'], versionNegotiation: { mode: { pin: '2026-07-28' } },
      });
      await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
        requestInit: { headers: { Authorization: 'Bearer ' + configuration.token } },
      }));
      expect((await client.listTools()).tools.some(tool => tool.name === 'capture_get_proxy_status')).toBe(true);
    });
    await media.step('06-query-new-endpoint', '在新endpoint执行真实查询 / Execute an actual query at the new endpoint', async () => {
      expect((await client!.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.endpoint)).toContainText(newEndpoint);
    });
    await media.step('07-disable', '关闭新地址上的演示Server / Disable the demo Server at its new address', async () => {
      await client!.close();
      client = undefined;
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      await client?.close();
      if (media) await media.stop({
        oldEndpoint: original.url, newEndpoint, clientName: 'Guide endpoint client',
        caller: 'Actual official local SDK; no commercial Host configuration screen is claimed',
        identity: 'Endpoint changes; the same Client credential remains valid and is never shown',
        evidenceGeneration: 'endpoint-reopened',
      });
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
  // 清理：只释放本轮占用与SDK连接，核对两代App、Core/Worker、代理、CA和8888。
  // Cleanup: release only the owned port holder/SDK and verify both App generations, Core/Worker, proxy/CA and port 8888.
});
