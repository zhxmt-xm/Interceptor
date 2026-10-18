import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { copyMcpClientConfiguration, openMcpSettings } from '../../fixtures/ui/mcp-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toolPayload(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || result.isError === true || !Array.isArray(result.content)) throw new Error('The actual MCP Tool did not return a successful result.');
  const text = result.content.find(item => isRecord(item) && item.type === 'text');
  if (!isRecord(text) || typeof text.text !== 'string') throw new Error('The MCP Tool omitted its result text.');
  const value: unknown = JSON.parse(text.text);
  if (!isRecord(value)) throw new Error('The MCP Tool returned a non-object payload.');
  return value;
}

test('rules guide records an approved second writer, retained draft and explicit Reload recovery', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/rules-conflict';
  const header = 'x-guide-conflict';
  const reload = getByAutomationId(page, AUTOMATION_IDS.rules.editorName).locator('..')
    .locator(`[data-automation-id="${AUTOMATION_IDS.rules.reload}"]`);
  let ruleId = '';
  let media: GuidebookMedia | undefined;
  let client: Client | undefined;
  let pending: ReturnType<Client['callTool']> | undefined;
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };
  try {
    // 准备：凭据只复制到本机SDK内存，录制前完成；不是商业Host或Store注入。
    // Arrange: copy credentials into local SDK memory before filming, never a commercial Host or injected Store.
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
    await startRecording(desktopApp);
    await openMcpSettings(page);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Guide rules writer');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const row = page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(row).toHaveCount(1);
    const clientId = await row.getAttribute('data-client-id');
    if (!clientId) throw new Error('The created MCP Client omitted its identity.');
    const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    client = new Client({ name: 'guide-rules-writer', version: '1.0.0' }, {
      supportedProtocolVersions: ['2026-07-28'], versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
      requestInit: { headers: { Authorization: 'Bearer ' + configuration.token } },
    }));
    media = await GuidebookMedia.start(desktopApp, testInfo, 'rules-conflict');
    await media.step('01-rules', '打开Rules / Open Rules', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click(); });
    await media.step('02-create', '创建初始规则 / Create the initial Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
      const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
      if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('The initial Rule omitted its identity.');
      ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    });
    await media.step('03-name', '命名Guide initial / Name it Guide initial', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide initial'); });
    await media.step('04-host', '限定127.0.0.1 / Restrict to 127.0.0.1', async () => { await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1'); });
    await media.step('05-add-path', '添加Path条件 / Add a Path condition', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
      await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
    });
    await media.step('06-path', '限定冲突演示路径 / Restrict the conflict example paths', async () => { await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix); });
    await media.step('07-header', '填写x-guide-conflict / Enter x-guide-conflict', async () => { await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill(header); });
    await media.step('08-value', '填写initial / Enter initial', async () => { await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('initial'); });
    await media.step('09-enable', '启用初始规则 / Enable the initial Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('10-apply', 'Apply初始版本 / Apply the initial revision', apply);
    const initialPayload = toolPayload(await client.callTool({ name: 'rules_get_tree', arguments: {} }));
    const ruleSet = initialPayload.ruleSet;
    if (!isRecord(ruleSet) || typeof ruleSet.revision !== 'number' || !Array.isArray(ruleSet.nodes)
      || ruleSet.nodes.length !== 1 || !isRecord(ruleSet.nodes[0])) throw new Error('The actual Rules query omitted the initial tree.');
    const initialRevision = ruleSet.revision;
    const initialRule = ruleSet.nodes[0];
    if (initialRule.kind !== 'rule' || initialRule.id !== ruleId || !Array.isArray(initialRule.actions)) throw new Error('The queried Rule differs from the UI-created Rule.');
    const actions = initialRule.actions.map((action: unknown) => {
      if (!isRecord(action) || action.type !== 'header' || action.name !== header) throw new Error('The queried Rule has an unexpected action.');
      return { ...action, value: 'remote' };
    });
    const remoteNodes = [{ ...initialRule, name: 'Guide remote', actions }];
    await media.step('11-local-name', '留下本地名称草稿 / Leave a local name draft', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide local draft'); });
    await media.step('12-local-value', '留下未Apply的local值 / Leave an unapplied local value', async () => {
      await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('local');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'dirty');
    });
    await media.step('13-second-writer', '检查第二写入者的实际Ask审批 / Inspect the second writer’s actual Ask approval', async () => {
      pending = client!.callTool({ name: 'rules_replace_tree', arguments: { baseRevision: initialRevision, nodes: remoteNodes } });
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', 'rules_replace_tree');
    });
    await media.step('14-allow', '允许第二写入者保存remote / Allow the second writer to save remote', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
      expect(toolPayload(await pending)).toEqual({ revision: initialRevision + 1 });
      pending = undefined;
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'conflict');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Guide local draft');
    });
    await media.step('15-draft-retained', '核对本地草稿没有被静默覆盖 / Verify the local draft was not silently overwritten', async () => {
      await expect(getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value'))).toHaveValue('local');
      await expect(reload).toBeEnabled();
    });
    await media.step('16-core-remote', '核对新请求实际使用remote / Verify new traffic actually uses remote', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/remote`)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(`${prefix}/remote`)?.headers[header]).toBe('remote');
    });
    await media.step('17-reload', '明确Reload放弃本地草稿 / Explicitly Reload and discard the local draft', async () => {
      await reload.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Guide remote');
      await expect(getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value'))).toHaveValue('remote');
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', String(initialRevision + 1));
    });
    await media.step('18-merged-name', '基于新版本填写Guide merged / Enter Guide merged based on the new revision', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('Guide merged'); });
    await media.step('19-merged-value', '填写merged值 / Enter the merged value', async () => { await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('merged'); });
    await media.step('20-apply-merged', 'Apply新的编辑 / Apply the new edits', async () => {
      await apply();
      await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', String(initialRevision + 2));
    });
    await media.step('21-merged-request', '核对新请求使用merged / Verify a new request uses merged', async () => {
      expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/merged`)).statusCode).toBe(200);
      expect(httpTrafficRunner.observation(`${prefix}/merged`)?.headers[header]).toBe('merged');
    });
    await media.step('22-disable', '停用演示规则 / Disable the example Rule', async () => { await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click(); });
    await media.step('23-apply-disabled', 'Apply停用状态 / Apply the disabled state', apply);
    await media.step('24-mcp-settings', '返回MCP设置收尾 / Return to MCP settings for cleanup', async () => { await openMcpSettings(page); });
    await media.step('25-stop-server', '关闭本轮MCP Server / Stop this run’s MCP Server', async () => {
      await client!.close();
      client = undefined;
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'disabled');
    });
    // 证据：UI草稿、Core生效树和修订版分别核对；第二写入来自真正获准的MCP命令。
    // Evidence: verify UI draft, active Core tree and revisions independently; the second write is an actual approved MCP command.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    try {
      if (pending && await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).isVisible()) {
        await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
        await pending;
      }
      await client?.close();
    } finally {
      if (media) await media.stop({
        path: prefix, header, initial: 'Guide initial / initial', localDraft: 'Guide local draft / local',
        externalSaved: 'Guide remote / remote', afterReloadEdit: 'Guide merged / merged',
        writer: 'Official SDK on localhost, named Guide rules writer; not a commercial Host',
        conflict: 'Local draft is retained; Reload deliberately discards it before editing the latest revision',
      });
    }
  }
  // 清理：正常Close恢复代理、CA、Main/Core/Worker与8888；不保留演示Client连接。
  // Cleanup: normal Close restores proxy/CA and Main/Core/Worker/8888; no demo Client connection remains.
});
