import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('permissions guide disables every change Tool in both channels and verifies actual rejection and restart', async ({
  desktopApp, httpTrafficRunner, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(720_000);
  const { page } = desktopApp;
  const prefix = '/guide/readonly';
  const changeToolNames: string[] = [];
  const queryToolNames: string[] = [];
  let client: Client | undefined;
  let restarted: LocalElectronApplicationDriver | undefined;
  let after: GuidebookMedia | undefined;
  const connect = async (url: string, token: string): Promise<Client> => {
    const connected = new Client({ name: 'guide-readonly-client', version: '1.0.0' }, {
      supportedProtocolVersions: ['2026-07-28'], versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
    await connected.connect(new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    }));
    return connected;
  };
  // 准备：本地无Key模型与官方SDK只用测试数据；复制Client凭据时不录制、不进入trace。
  // Arrange: use a keyless local model and official SDK; copying Client credentials is outside recording and trace.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/retained`)).statusCode).toBe(200);
  await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
  await openMcpSettings(page);
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Guide permission demo');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('guide-readonly'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('guide-readonly-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Guide readonly client');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const clientId = await page.locator('[data-automation-id^="mcp.client.row."]').getAttribute('data-client-id');
  if (!clientId) throw new Error('The readonly MCP Client has no identity.');
  const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  client = await connect(configuration.url, configuration.token);
  const before = await GuidebookMedia.start(desktopApp, testInfo, 'tool-permissions-readonly');
  try {
    await before.step('01-search', '查找capture_clear / Find capture_clear', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('capture_clear');
    });
    await before.step('02-disable-agent-clear', '关闭Agent清理权限 / Disable Agent clear access', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_clear')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch('capture_clear'))).toHaveAttribute('aria-checked', 'false');
    });
    await before.step('03-disable-mcp-clear', '独立关闭MCP清理权限 / Independently disable MCP clear access', async () => {
      await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch('capture_clear')).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch('capture_clear'))).toHaveAttribute('aria-checked', 'false');
    });
    await before.step('04-mcp-rejection', '核对真实MCP调用被拒绝 / Verify the actual MCP call is rejected', async () => {
      expect((await client!.listTools()).tools.some(tool => tool.name === 'capture_clear')).toBe(false);
      await expect(client!.callTool({ name: 'capture_clear', arguments: {} })).rejects.toThrow('Tool capture_clear not found');
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    });
    await before.step('05-agent', '打开本地演示Agent / Open the local demo Agent', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    });
    await before.step('06-agent-rejection', '核对Agent也不能执行禁用动作 / Verify Agent also cannot execute the disabled action', async () => {
      openAiCompatibleLab.enqueueToolCall({ callId: 'guide-readonly-clear', name: 'capture_clear', arguments: {} });
      openAiCompatibleLab.enqueueTurn({ textChunks: ['Demo: capture_clear is unavailable; the recorded request was not cleared.'] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill('For this local demonstration, request the disabled capture_clear Tool.');
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      expect(JSON.stringify(openAiCompatibleLab.requestsForAssertions().at(-1)?.messages)).toContain('unknown_tool');
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('guide-readonly-clear'))).toHaveCount(0);
    });
    await before.step('07-retained-record', '实际记录仍保留 / Verify the actual record remains', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
      await expect(getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: `${prefix}/retained` })).toHaveCount(1);
    });
    await before.step('08-close-agent', '关闭面板返回授权表 / Close the panel and return to capabilities', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      await openMcpSettings(page);
    });
    await before.step('09-clear-search', '清空搜索显示全部分组 / Clear search to show every group', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('');
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.tools.search)).toHaveValue('');
    });
    const capabilities = getByAutomationId(page, AUTOMATION_IDS.agent.tools.capabilities);
    const tools = await capabilities.locator('[data-automation-id^="agent.tools.row."]').evaluateAll(elements => elements.map(element => ({
      name: element.getAttribute('data-automation-id')?.slice('agent.tools.row.'.length),
      kind: element.querySelector('[data-kind]')?.getAttribute('data-kind'),
    })));
    for (const tool of tools) {
      if (!tool.name || (tool.kind !== 'change' && tool.kind !== 'query')) throw new Error('The actual Tool row omitted its name or kind.');
      if (tool.kind === 'query') { queryToolNames.push(tool.name); continue; }
      changeToolNames.push(tool.name);
      for (const channel of ['agent', 'mcp'] as const) {
        const toggle = getByAutomationId(page, channel === 'agent'
          ? AutomationIdFactory.agentToolAgentSwitch(tool.name) : AutomationIdFactory.agentToolMcpSwitch(tool.name));
        if (await toggle.getAttribute('aria-checked') === 'false') continue;
        await before.step(`disable-${channel}-${tool.name}`, `关闭${channel}的${tool.name} / Disable ${channel} ${tool.name}`, async () => {
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-checked', 'false');
          await expect(capabilities).toHaveAttribute('aria-busy', 'false');
        });
      }
    }
    expect(changeToolNames.length).toBeGreaterThan(1);
    expect(queryToolNames.length).toBeGreaterThan(1);
    for (const group of ['capture', 'rules', 'composer', 'breakpoints', 'diagnostics', 'settings']) {
      await before.step(`review-${group}`, `滚动复核${group}分组 / Scroll to review the ${group} group`, async () => {
        const section = getByAutomationId(page, AutomationIdFactory.agentToolGroup(group));
        await section.locator('header').scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
      });
    }
    await before.step('10-readonly-list', '核对MCP只发现query / Verify MCP discovers query Tools only', async () => {
      const listed = (await client!.listTools()).tools;
      expect(listed.map(tool => tool.name).sort()).toEqual([...queryToolNames].sort());
      for (const toolName of queryToolNames) {
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(toolName))).toHaveAttribute('aria-checked', 'true');
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(toolName))).toHaveAttribute('aria-checked', 'true');
      }
      expect((await client!.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
    });
    await before.step('11-before-close', '保留完整只读配置后正常关闭 / Retain the complete read-only setup before normal Close', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.window.close).hover();
    });
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await client?.close();
    client = undefined;
    await before.stop({
      client: 'Guide readonly client', model: 'Guide permission demo (keyless local endpoint)',
      blockedOperation: 'capture_clear rejected by both Agent and MCP without clearing the real record',
      changeToolCount: String(changeToolNames.length), queryToolCount: String(queryToolNames.length),
      disabledChanges: changeToolNames.join(', '), closeImage: 'Before actual Close; real shutdown is separately verified',
    });
  }
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
  try {
    // 重启：回载真实保存的双列权限，再通过SDK核对发现列表与禁止调用，不重新设置开关。
    // Restart: reload the saved two-column permissions and verify discovery/rejection without setting switches again.
    restarted = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'readonly-reopened',
    });
    await restarted.waitUntilReady();
    const current = restarted.page;
    await openMcpSettings(current);
    await expect(getByAutomationId(current, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    client = await connect(configuration.url, configuration.token);
    after = await GuidebookMedia.start(restarted, testInfo, 'tool-permissions-restart');
    await after.step('01-saved-permissions', '读取重启后的实际双列权限 / Read the actual two-column permissions after restart', async () => {
      for (const toolName of changeToolNames) {
        await expect(getByAutomationId(current, AutomationIdFactory.agentToolAgentSwitch(toolName))).toHaveAttribute('aria-checked', 'false');
        await expect(getByAutomationId(current, AutomationIdFactory.agentToolMcpSwitch(toolName))).toHaveAttribute('aria-checked', 'false');
      }
      await getByAutomationId(current, AUTOMATION_IDS.agent.tools.search).fill('capture_clear');
    });
    await after.step('02-query-only', '新连接仍只发现query / Verify a new connection still discovers queries only', async () => {
      expect((await client!.listTools()).tools.map(tool => tool.name).sort()).toEqual([...queryToolNames].sort());
      await expect(client!.callTool({ name: 'capture_clear', arguments: {} })).rejects.toThrow('Tool capture_clear not found');
    });
    await after.step('03-query-enabled', '已保留的只读查询仍可用 / Verify retained read-only queries still work', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.agent.tools.search).fill('capture_get_proxy_status');
      expect((await client!.callTool({ name: 'capture_get_proxy_status', arguments: {} })).isError).not.toBe(true);
      await expect(getByAutomationId(current, AutomationIdFactory.agentToolMcpSwitch('capture_get_proxy_status'))).toHaveAttribute('aria-checked', 'true');
    });
    await after.step('04-clear-search', '清空搜索保留完整只读状态 / Clear search while retaining the complete read-only state', async () => {
      await getByAutomationId(current, AUTOMATION_IDS.agent.tools.search).fill('');
    });
    await after.step('05-stop-server', '关闭本轮Server而不恢复change授权 / Stop the Server without re-enabling changes', async () => {
      await client!.close();
      client = undefined;
      await getByAutomationId(current, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(current, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    expect(restarted.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      await client?.close();
      if (after) await after.stop({
        client: 'Guide readonly client', disabledChanges: changeToolNames.join(', '), queryTools: queryToolNames.join(', '),
        persisted: 'Every change Tool remains disabled for both Agent and MCP after actual App restart',
        evidenceGeneration: 'readonly-reopened',
      });
    } finally {
      if (restarted) {
        await restarted.captureFinalScreenshot(testInfo);
        await restarted.stopTrace(testInfo);
        await restarted.closeGracefully();
        await restarted.writeEvidence(testInfo);
        await restarted.forceCleanup();
      }
    }
  }
  // 清理：两代App、SDK连接、Core/Worker与8888完整退出，日常代理与CA保持。
  // Cleanup: both App generations, SDK connections and Core/Worker/8888 exit, preserving host proxy settings and CA.
});
