import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';
import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { cancelWindowsFileDialog, submitWindowsFileDialogPath } from '../../fixtures/ui/windows-file-dialog';

const PROMPT = ['Import the selected Rules', 'and preserve the existing tree.'].join(' ');
const ANSWER = ['The Rules import', 'step has finished.'].join(' ');

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toolResult(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => (
      isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
    ));
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing Rules import result: ${callId}`);
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
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Rules import lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('rules-import'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('rules-import-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function createOriginalTree(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  const ruleIds: string[] = [];
  for (const enabled of [true, false]) {
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    const automationId = await row.getAttribute('data-automation-id');
    if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Rule row has no public identity.');
    const ruleId = automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    ruleIds.push(ruleId);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(enabled ? 'Import enabled rule' : 'Import disabled rule');
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill('x-import-proof');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('active');
    if (enabled) await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  }
  await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.createFolder).click();
  const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleFolderRename);
  const folderAutomationId = await rename.getAttribute('data-automation-id');
  if (!folderAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleFolderRename)) throw new Error('Folder has no public identity.');
  const folderId = folderAutomationId.slice(AUTOMATION_ID_PREFIXES.ruleFolderRename.length);
  await rename.fill('Import folder');
  await rename.press('Enter');
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleIds[1]!))
    .dragTo(getByAutomationId(page, AutomationIdFactory.ruleFolderTarget(folderId)));
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleIds[0]!)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '1');
}

async function exportTree(desktopApp: LocalElectronApplicationDriver, filePath: string): Promise<RuleNode[]> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.toolbar.exportRules).click();
  await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), filePath);
  await desktopApp.page.bringToFront();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.exportBusy)).toHaveCount(0);
  return (JSON.parse(await readFile(filePath, 'utf8')) as { nodes: RuleNode[] }).nodes;
}

function flatten(nodes: readonly RuleNode[]): readonly RuleNode[] {
  return nodes.flatMap((node) => node.kind === 'folder' ? [node, ...flatten(node.children)] : [node]);
}

function verifyAppend(original: readonly RuleNode[], current: readonly RuleNode[], copies: number): void {
  const originalIds = flatten(original).map((node) => node.id);
  const allNodes = flatten(current);
  expect(current.slice(0, original.length).map((node) => node.id)).toEqual(original.map((node) => node.id));
  expect(allNodes).toHaveLength(3 * copies);
  expect(new Set(allNodes.map((node) => node.id)).size).toBe(allNodes.length);
  expect(allNodes.filter((node) => node.kind === 'rule').map((node) => node.enabled))
    .toEqual(Array.from({ length: copies }, () => [true, false]).flat());
  for (const importedNode of allNodes.slice(originalIds.length)) expect(originalIds).not.toContain(importedNode.id);
  expect(current.filter((node) => node.kind === 'folder').every((folder) => folder.children.length === 1)).toBe(true);
}

async function beginImport(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string, verdict?: 'allow' | 'deny'): Promise<void> {
  openAiCompatibleLab.enqueueToolCall({ callId, name: 'rules_import', arguments: {} });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await sendMessage(page);
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId)))
      .toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow'
      ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
}

async function selectImport(desktopApp: LocalElectronApplicationDriver, inputPath: string): Promise<void> {
  await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), inputPath);
  await desktopApp.page.bringToFront();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.dialog)).toBeVisible();
  await expect(getByAutomationId(desktopApp.page, 'rules.import.rule-count')).toHaveText('2');
  await expect(getByAutomationId(desktopApp.page, 'rules.import.folder-count')).toHaveText('1');
  await expect(getByAutomationId(desktopApp.page, 'rules.import.enabled-count')).toHaveText('1');
  await expect(getByAutomationId(desktopApp.page, 'rules.import.skipped-count')).toHaveText('0');
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Rules import MCP lab');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client has no public identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    servers: { interceptor: { headers: { Authorization: string }; url: string } };
  };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'rules-import-workflow', version: '1.0.0' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
  return { client, clientId };
}

function mcpValue(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP result omitted text.');
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

test('rules.tools.import appends product-exported Rules through the shared confirmation flow', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.skip(process.platform !== 'win32', '真实文件对话框 workflow 目前只在 Windows 执行。');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'rules.tools.import' });
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-rules-import-tool-'));
  const inputPath = path.join(directory, 'product-rules.json');
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：由真实 Rules UI 创建并 Apply 混合 enabled 树，再经产品 Export 产生唯一导入文件。
    // Arrange: create and Apply a mixed-enabled tree through the real Rules UI, then use product Export to produce the sole import file.
    await createOriginalTree(desktopApp.page);
    const original = await exportTree(desktopApp, inputPath);
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    openAiCompatibleLab.enqueueToolCall({ callId: 'import-discovery', name: 'discover_tools', arguments: { capabilityId: 'rules' } });
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
    await sendMessage(desktopApp.page);
    await waitForTurn(desktopApp.page);
    const discovery = toolResult(openAiCompatibleLab, 'import-discovery');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    expect(matches.some((match) => isRecord(match) && isRecord(match.descriptor) && match.descriptor.name === 'rules_import')).toBe(true);

    // 拒绝与取消：先验证 Tool Deny，再验证真实 Open 取消和共享预览取消，全部不得持久化。
    // Denial and cancellation: verify Tool Deny, native Open cancellation, and shared-preview cancellation without persistence.
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-deny', 'deny');
    await waitForTurn(desktopApp.page);
    expect(toolResult(openAiCompatibleLab, 'import-deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-open-cancel', 'allow');
    await cancelWindowsFileDialog(desktopApp.windowsMainProcessOwner());
    await desktopApp.page.bringToFront();
    await waitForTurn(desktopApp.page);
    expect(toolResult(openAiCompatibleLab, 'import-open-cancel')).toEqual({ ok: true, value: { imported: false } });
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-preview-cancel', 'allow');
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.cancel).click();
    await waitForTurn(desktopApp.page);
    expect(toolResult(openAiCompatibleLab, 'import-preview-cancel')).toEqual({ ok: true, value: { imported: false } });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '1');
    expect(await exportTree(desktopApp, path.join(directory, 'after-cancel.json'))).toEqual(original);

    // 确认：使用同一文件和原确认 Dialog，立即追加并持久化全新身份，完整保留目录与 enabled。
    // Confirmation: use the same file and original confirmation Dialog to append and persist fresh identities, preserving folders and enabled states.
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-allow', 'allow');
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.confirm).click();
    await waitForTurn(desktopApp.page);
    expect(toolResult(openAiCompatibleLab, 'import-allow')).toEqual({
      ok: true, value: { imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 },
    });
    const twice = await exportTree(desktopApp, path.join(directory, 'after-allow.json'));
    verifyAppend(original, twice, 2);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '2');

    // 草稿与 Auto：原本未 Apply 的草稿仍被保留，并与重复导入节点按原 UI 语义一起原子持久化。
    // Drafts and Auto: preserve the unapplied draft and atomically persist it with repeated import nodes under the original UI semantics.
    await getByAutomationId(desktopApp.page, AutomationIdFactory.ruleRow(original[0]!.id)).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.editorName).fill('Preserved import draft');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-auto');
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.confirm).click();
    await waitForTurn(desktopApp.page);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('import-auto'))).toHaveCount(0);
    const threeTimes = await exportTree(desktopApp, path.join(directory, 'after-auto.json'));
    verifyAppend(original, threeTimes, 3);
    expect(threeTimes[0]?.name).toBe('Preserved import draft');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '3');

    // Agent 撤权：旧 Chat 不再执行；随后经产品 UI 创建的 MCP Client 验证独立权限和相同导入确认。
    // Agent revocation: stale Chat calls stop executing; a Client created through product UI then verifies independent MCP permission and the same confirmation flow.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('rules_import');
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch('rules_import')).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await beginImport(desktopApp.page, openAiCompatibleLab, 'import-disabled');
    await waitForTurn(desktopApp.page);
    expect(toolResult(openAiCompatibleLab, 'import-disabled')).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    expect((await client.listTools()).tools.some((tool) => tool.name === 'rules_import')).toBe(true);
    const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    const deniedCall = client.callTool({ name: 'rules_import', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'rules_import');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(deniedCall).resolves.toMatchObject({ isError: true });
    const allowedCall = client.callTool({ name: 'rules_import', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'rules_import');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.confirm).click();
    expect(mcpValue(await allowedCall)).toEqual({ imported: true, revision: 4, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 });
    await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(configuredClient.clientId)).click();
    const canceledCall = client.callTool({ name: 'rules_import', arguments: {} });
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.rules.import.cancel).click();
    expect(mcpValue(await canceledCall)).toEqual({ imported: false });
    await expect(approval).toHaveCount(0);
    await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch('rules_import')).click();
    await expect.poll(async () => (await client!.listTools()).tools.some((tool) => tool.name === 'rules_import')).toBe(false);
    await expect(client.callTool({ name: 'rules_import', arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    const finalTree = await exportTree(desktopApp, path.join(directory, 'final-tree.json'));
    verifyAppend(original, finalTree, 4);
    expect(finalTree[0]?.name).toBe('Preserved import draft');

    // 重启与证据：恢复完整树和两列撤权，不重发 Model 请求；产物只保留哈希与业务结论。
    // Restart and evidence: restore the complete tree and both revoked permissions without new Model requests; retain only hashes and business outcomes.
    for (const request of openAiCompatibleLab.requestsForAssertions()) {
      const serialized = JSON.stringify(request);
      expect(serialized).not.toContain(directory.replaceAll('\\', '\\\\'));
      expect(serialized).not.toContain('x-import-proof');
    }
    const requestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - requestCount).toBe(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.rules.status.revision)).toHaveAttribute('data-revision', '4');
    expect(await exportTree(relaunchedApp, path.join(directory, 'after-restart.json'))).toEqual(finalTree);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('rules_import');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch('rules_import'))).toHaveAttribute('aria-checked', 'false');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch('rules_import'))).toHaveAttribute('aria-checked', 'false');
    const evidencePath = testInfo.outputPath('rules-tools-import.json');
    await writeFile(evidencePath, JSON.stringify({
      originalTreeHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'),
      finalTreeHash: createHash('sha256').update(JSON.stringify(finalTree)).digest('hex'),
      nativeCancelPreservedTree: true, previewCancelPreservedTree: true, appendedCopies: 4,
      freshIdentities: true, draftPreserved: true, finalRevision: 4, mcpVerified: true, restartModelRequests: 0,
    }, null, 2), 'utf8');
    await testInfo.attach('rules-tools-import.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先关闭 MCP 与 Electron 并验证宿主，再删除产品自产文件；失败时不伪造清理成功。
    // Teardown: close MCP and Electron and verify the host before deleting product-generated files; never fabricate cleanup success.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true }).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Rules import workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Rules import cleanup failed.');
});