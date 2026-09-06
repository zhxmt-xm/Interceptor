import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';
import type { RuleNode } from '@interceptor/core-protocol';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';
import { cancelWindowsFileDialog, submitWindowsFileDialogPath } from '../../fixtures/windows-file-dialog';

const PROMPT = ['Export the saved Rules', 'using the selected destination.'].join(' ');
const ANSWER = ['The Rules export', 'step has finished.'].join(' ');

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => (
      isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
    ));
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing Rules export result: ${callId}`);
}

async function sendMessage(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

async function waitForTurn(page: Page): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Rules export lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('rules-export'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('rules-export-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function identityFromRow(row: Locator, prefix: string): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) throw new Error('Rule row omitted its public identity.');
  return automationId.slice(prefix.length);
}

async function createRules(page: Page): Promise<readonly string[]> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  const ruleIds: string[] = [];
  for (const enabled of [true, false]) {
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    const ruleId = await identityFromRow(row, AUTOMATION_ID_PREFIXES.ruleRow);
    ruleIds.push(ruleId);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName)
      .fill(enabled ? 'Export enabled rule' : 'Export disabled rule');
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name'))
      .fill(enabled ? 'x-export-enabled' : 'x-export-disabled');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('active');
    if (enabled) await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  }
  await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.createFolder).click();
  const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  const folderId = await identityFromRow(rename, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  await rename.fill('Export folder');
  await rename.press('Enter');
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleIds[1]!))
    .dragTo(getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(folderId)));
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleIds[0]!)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '1');
  return [ruleIds[0]!, folderId, ruleIds[1]!];
}

function flatten(nodes: readonly RuleNode[]): readonly RuleNode[] {
  return nodes.flatMap((node) => node.kind === 'folder' ? [node, ...flatten(node.children)] : [node]);
}

async function readExport(filePath: string): Promise<{ nodes: RuleNode[] }> {
  return JSON.parse(await readFile(filePath, 'utf8')) as { nodes: RuleNode[] };
}

async function beginExport(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Promise<void> {
  openAiCompatibleLab.enqueueToolCall({ callId, name: 'rules_export', arguments: {} });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await sendMessage(page);
}

async function approveExport(page: Page, callId: string, verdict: 'allow' | 'deny'): Promise<void> {
  const approval = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
  await expect(approval).toHaveAttribute('data-approval-status', 'pending');
  expect(JSON.parse((await approval.getAttribute('data-effect-metadata')) ?? 'null'))
    .toEqual({ ruleCount: 2, folderCount: 1 });
  await getByAutomationId(page, verdict === 'allow'
    ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Rules export MCP lab');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-execution-mode', 'ask');
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client row has no public identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    servers: { interceptor: { headers: { Authorization: string }; url: string } };
  };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client(
    { name: 'rules-export-workflow', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: server.headers },
  }));
  return { client, clientId };
}

function readMcpToolValue(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP Tool Result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP Tool Result omitted text.');
  return JSON.parse(content.text);
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  try {
    if (!desktopApp.page.isClosed()) {
      const closePanel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await closePanel.isVisible()) await closePanel.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      expect(desktopApp.rendererPageErrors()).toEqual([]);
      await desktopApp.startTrace(testInfo);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('rules.tools.export saves persisted Rules through native dialogs without modifying drafts', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.skip(process.platform !== 'win32', '真实文件对话框 workflow 目前只在 Windows 执行。');
  test.setTimeout(240_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'rules.tools.export' });
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-rules-export-'));
  const savedPath = path.join(directory, 'saved-rules.json');
  const autoPath = path.join(directory, 'auto-rules.json');
  const dirtyPath = path.join(directory, 'persisted-with-draft.json');
  const uiPath = path.join(directory, 'ui-draft.json');
  const mcpPath = path.join(directory, 'mcp-saved-rules.json');
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let client: Client | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：只通过 Rules UI 创建/保存规则与目录，然后配置真实本地 Provider。
    // Arrange: create and save Rules and a folder only through the UI, then configure the real local Provider.
    const expectedIds = await createRules(desktopApp.page);
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    openAiCompatibleLab.enqueueToolCall({
      callId: 'export-discovery', name: 'discover_tools', arguments: { capabilityId: 'rules' },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
    await sendMessage(desktopApp.page);
    await waitForTurn(desktopApp.page);
    const discovery = resultForCall(openAiCompatibleLab, 'export-discovery');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    expect(matches.some((match) => isRecord(match) && isRecord(match.descriptor) && match.descriptor.name === 'rules_export')).toBe(true);

    // 拒绝与取消：Ask Deny 不进入文件操作，Allow 后真实点击 Save Dialog 的 Cancel 也不写文件。
    // Denial and cancellation: Ask Deny avoids file operations; the real Save Dialog Cancel also writes no file.
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-deny');
    await approveExport(desktopApp.page, 'export-deny', 'deny');
    await waitForTurn(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'export-deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    expect(await readdir(directory)).toEqual([]);
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-cancel');
    await approveExport(desktopApp.page, 'export-cancel', 'allow');
    await cancelWindowsFileDialog(desktopApp.windowsMainProcessOwner());
    await desktopApp.page.bringToFront();
    await waitForTurn(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'export-cancel')).toEqual({ ok: true, value: { exported: false } });
    expect(await readdir(directory)).toEqual([]);

    // 保存与断言：Ask Allow 和 Auto 都经真实 Save Dialog 导出 Core 已保存树，保留身份/层级/enabled。
    // Saving and assertions: Ask Allow and Auto both export the persisted Core tree through real Save Dialogs, preserving IDs, hierarchy, and enabled states.
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-allow');
    await approveExport(desktopApp.page, 'export-allow', 'allow');
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), savedPath);
    await desktopApp.page.bringToFront();
    await waitForTurn(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'export-allow')).toEqual({ ok: true, value: { exported: true } });
    const saved = await readExport(savedPath);
    expect(Object.keys(saved)).toEqual(['nodes']);
    expect(flatten(saved.nodes).map((node) => node.id)).toEqual(expectedIds);
    expect(flatten(saved.nodes).filter((node) => node.kind === 'rule').map((node) => node.enabled)).toEqual([true, false]);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-auto');
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), autoPath);
    await desktopApp.page.bringToFront();
    await waitForTurn(desktopApp.page);
    expect(await readExport(autoPath)).toEqual(saved);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('export-auto'))).toHaveCount(0);

    // 草稿隔离：未 Apply 的 UI 编辑不被 Tool 导出或覆盖；UI 自身导出仍保存当前草稿。
    // Draft isolation: unapplied UI edits are neither exported nor overwritten by the Tool; UI export still saves the current draft.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(desktopApp.page, AutomationIdFactory.ruleRow(expectedIds[0]!)).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).fill('Unapplied export draft');
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-draft-isolation');
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), dirtyPath);
    await desktopApp.page.bringToFront();
    await waitForTurn(desktopApp.page);
    expect(await readExport(dirtyPath)).toEqual(saved);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName)).toHaveValue('Unapplied export draft');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '1');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.toolbar.exportRules).click();
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), uiPath);
    await desktopApp.page.bringToFront();
    await expect(getByAutomationId(desktopApp.page, 'rules.export.busy')).toHaveCount(0);
    expect((await readExport(uiPath)).nodes[0]?.name).toBe('Unapplied export draft');
    for (const request of openAiCompatibleLab.requestsForAssertions()) {
      const serialized = JSON.stringify(request);
      expect(serialized).not.toContain(directory.replaceAll('\\', '\\\\'));
      expect(serialized).not.toContain('x-export-enabled');
    }

    // 撤权与重启：关闭 Agent 导出后旧 Chat 被拒绝；重启恢复历史但不发新 Model 请求或再次导出。
    // Revocation and restart: disabling Agent export rejects stale Chat calls; restarting restores history without new Model requests or exports.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('rules_export');
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch('rules_export')).click();
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('rules_export'))).toHaveAttribute('aria-checked', 'true');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await beginExport(desktopApp.page, openAiCompatibleLab, 'export-disabled');
    await waitForTurn(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'export-disabled')).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    expect((await readdir(directory)).length).toBe(4);

    // MCP 交互：Agent 撤权后，独立 Ask Client 仍可导出；拒绝、允许保存和 Auto 原生取消共用正式命令。
    // MCP interaction: after Agent revocation, the independent Ask Client can still export; denial, allowed saving, and Auto native cancellation share the formal command.
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    expect((await client.listTools()).tools.some((tool) => tool.name === 'rules_export')).toBe(true);
    const deniedCall = client.callTool({ name: 'rules_export', arguments: {} });
    const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    await expect(approval).toHaveAttribute('data-tool-name', 'rules_export');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(deniedCall).resolves.toMatchObject({ isError: true });
    expect((await readdir(directory)).length).toBe(4);
    const allowedCall = client.callTool({ name: 'rules_export', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'rules_export');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), mcpPath);
    await desktopApp.page.bringToFront();
    expect(readMcpToolValue(await allowedCall)).toEqual({ exported: true });
    expect(await readExport(mcpPath)).toEqual(saved);
    await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(configuredClient.clientId)).click();
    const canceledCall = client.callTool({ name: 'rules_export', arguments: {} });
    await cancelWindowsFileDialog(desktopApp.windowsMainProcessOwner());
    await desktopApp.page.bringToFront();
    expect(readMcpToolValue(await canceledCall)).toEqual({ exported: false });
    await expect(approval).toHaveCount(0);

    // MCP 撤权：现有连接不再披露或执行导出；没有新增文件，关闭客户端后再销毁 Electron。
    // MCP revocation: the existing connection can no longer discover or execute export; no new files appear, and the Client closes before Electron teardown.
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('rules_export')).click();
    await expect.poll(async () => (await client!.listTools()).tools.some((tool) => tool.name === 'rules_export')).toBe(false);
    await expect(client.callTool({ name: 'rules_export', arguments: {} })).rejects.toMatchObject({ code: -32602 });
    expect((await readdir(directory)).length).toBe(5);
    await client.close();
    client = null;
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - modelRequestCount).toBe(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('rules_export');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch('rules_export'))).toHaveAttribute('aria-checked', 'false');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch('rules_export'))).toHaveAttribute('aria-checked', 'false');
    expect((await readdir(directory)).length).toBe(5);

    // 证据：只保留输出哈希和协议结论；两代 driver/guard 验证 trace、进程、8888 与完整系统恢复。
    // Evidence: retain output hashes and protocol outcomes only; both drivers and the guard verify traces, processes, port 8888, and host restoration.
    const evidencePath = testInfo.outputPath('rules-tools-export.json');
    await writeFile(evidencePath, JSON.stringify({
      ruleCount: 2, folderCount: 1, denialPreservedFiles: true, nativeCancelPreservedFiles: true,
      persistedExportVerified: true, autoExportVerified: true, uiDraftPreserved: true,
      restartModelRequestCount: 0, revoked: true,
      mcpDenyPreservedFiles: true, mcpSavedTreeVerified: true, mcpAutoCanceled: true, mcpRevoked: true,
      savedTreeHash: createHash('sha256').update(JSON.stringify(saved)).digest('hex'),
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('rules-tools-export.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先退出当前 Electron 代际并验证宿主，再删除本 workflow 经产品导出的文件。
    // Teardown: close the current Electron generation and verify the host before removing files exported by this workflow.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) {
      await rm(directory, { recursive: true, force: true }).catch((error: unknown) => cleanupErrors.push(error));
    }
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Rules export workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Rules export cleanup failed.');
});