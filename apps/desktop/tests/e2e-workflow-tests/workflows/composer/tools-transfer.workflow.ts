import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { CollectionNode, CollectionRequest } from '@interceptor/core-protocol';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AUTOMATION_ID_PREFIXES, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { cancelFileDialog, submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';

const EXPORT_TOOL = 'composer_export_collection';
const IMPORT_TOOL = 'composer_import_collection';
const PROMPT = ['Transfer the selected', 'Composer Collection through the product.'].join(' ');
const ANSWER = ['The Collection transfer', 'step is complete.'].join(' ');
const SECRET = ['collection-transfer-', 'private-token'].join('');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Record<string, unknown> {
  for (const request of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing Collection transfer result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Collection transfer lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('collection-transfer'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('transfer-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function createCollection(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  for (const index of [1, 2]) {
    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`https://collection.example.test/${index}?token=${SECRET}`);
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('Authorization');
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(`Bearer ${SECRET}`);
    await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('tag');
    await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill(`transfer-${index}`);
    await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
    if (index === 1) {
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.body).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText(JSON.stringify({ marker: 'transfer', token: SECRET }));
    } else {
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyFormType).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.name).fill('token');
      await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.value).fill(SECRET);
      await getByAutomationId(page, AUTOMATION_IDS.composer.addForm).click();
    }
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.authType).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(SECRET);
  }
  const secondRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
  const rename = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionFolderRename);
  const automationId = await rename.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename)) throw new Error('Collection folder omitted its identity.');
  await rename.fill('Transfer folder');
  await rename.press('Enter');
  await secondRow.dragTo(getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(automationId.slice(AUTOMATION_ID_PREFIXES.composerCollectionFolderRename.length))));
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
}

async function exportFromUi(desktopApp: LocalElectronApplicationDriver, filePath: string): Promise<CollectionNode[]> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.composer).click();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.exportCollection).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.exportBusy)).toHaveCount(0);
  return readTree(filePath);
}

async function readTree(filePath: string): Promise<CollectionNode[]> {
  return (JSON.parse(await readFile(filePath, 'utf8')) as { nodes: CollectionNode[] }).nodes;
}

function flatten(nodes: readonly CollectionNode[]): CollectionNode[] {
  return nodes.flatMap((node) => node.kind === 'folder' ? [node, ...flatten(node.children)] : [node]);
}

function withoutIdentities(nodes: readonly CollectionNode[]): CollectionNode[] {
  return nodes.map((node) => node.kind === 'folder'
    ? { ...node, id: '', children: withoutIdentities(node.children) }
    : {
      ...node, id: '',
      headers: node.headers.map((row) => ({ ...row, id: '' })),
      query: node.query.map((row) => ({ ...row, id: '' })),
      bodyForm: node.bodyForm.map((row) => ({ ...row, id: '' })),
    });
}

function verifyCopies(original: CollectionNode[], current: CollectionNode[], copies: number): void {
  const allNodes = flatten(current);
  expect(allNodes).toHaveLength(3 * copies);
  expect(new Set(allNodes.map((node) => node.id)).size).toBe(allNodes.length);
  expect(current.slice(0, original.length)).toEqual(original);
  const requests = allNodes.filter((node): node is CollectionRequest => node.kind === 'request');
  const rows = requests.flatMap((request) => [...request.headers, ...request.query, ...request.bodyForm]);
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  for (let index = 0; index < copies; index += 1) {
    expect(withoutIdentities(current.slice(index * original.length, (index + 1) * original.length))).toEqual(withoutIdentities(original));
  }
  for (const request of requests) {
    expect(request.auth.token).toBe(SECRET);
    expect(request.url).toContain(SECRET);
    expect(request.headers.some((row) => row.name === 'Authorization' && row.value === `Bearer ${SECRET}`)).toBe(true);
  }
}

async function beginCall(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string, name: string, verdict?: 'allow' | 'deny'): Promise<void> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: name === 'discover_tools' ? { capabilityId: 'composer' } : {} });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
}

async function finishCall(page: Page): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
}

async function selectImport(desktopApp: LocalElectronApplicationDriver, inputPath: string): Promise<void> {
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), inputPath);
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.dialog)).toBeVisible();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.requestCount)).toHaveText('2');
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.folderCount)).toHaveText('1');
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.skippedCount)).toHaveText('0');
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Collection transfer MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: { url: string; headers: { Authorization: string } } } };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'collection-transfer', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
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
  const errors = desktopApp.rendererPageErrors();
  try {
    if (!desktopApp.page.isClosed()) {
      const closePanel = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await closePanel.isVisible()) await closePanel.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await desktopApp.startTrace(testInfo);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
    expect(errors).toEqual([]);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('composer.tools.transfer exports and imports Collections through native dialogs and confirmation', async ({ desktopApp, openAiCompatibleLab }, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native file dialog workflow requires Windows or macOS.');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'composer.tools.transfer' });
  for (const text of [PROMPT, ANSWER, SECRET]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-collection-transfer-'));
  const inputPath = path.join(directory, 'product-collection.json');
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：真实Settings配置Provider，两项文件Tool必须经正式discovery披露。
    // Arrange and Red: configure the Provider through real Settings and require both file Tools in formal discovery.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await beginCall(desktopApp.page, openAiCompatibleLab, 'transfer-discover', 'discover_tools');
    await finishCall(desktopApp.page);
    const discovery = resultForCall(openAiCompatibleLab, 'transfer-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name)).toBe(true);

    // 自产输入：UI创建请求与目录并自动保存，再由产品UI导出唯一导入文件，测试只读解析。
    // Product-owned input: create requests and a folder, await autosave, then export the sole import file through product UI and inspect it read-only.
    await createCollection(desktopApp.page);
    const original = await exportFromUi(desktopApp, inputPath);
    const originalRequests = flatten(original).filter((node): node is CollectionRequest => node.kind === 'request');
    expect(originalRequests[0]?.bodyType).toBe('json');
    expect(JSON.parse(originalRequests[0]!.bodyText)).toEqual({ marker: 'transfer', token: SECRET });
    expect(originalRequests[1]?.bodyType).toBe('form');
    expect(originalRequests[1]?.bodyForm).toEqual([expect.objectContaining({ name: 'token', value: SECRET, enabled: true })]);
    expect(originalRequests.every((request) => request.query.some((row) => row.name === 'tag'))).toBe(true);
    const initialRevision = Number(await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.collection).getAttribute('data-revision'));
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    for (const [index, name] of [EXPORT_TOOL, IMPORT_TOOL].entries()) {
      await beginCall(desktopApp.page, openAiCompatibleLab, `deny-${index}`, name, 'deny');
      await finishCall(desktopApp.page);
      expect(resultForCall(openAiCompatibleLab, `deny-${index}`)).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
      await beginCall(desktopApp.page, openAiCompatibleLab, `native-cancel-${index}`, name, 'allow');
      await cancelFileDialog(desktopApp.nativeFileDialogOwner());
      await finishCall(desktopApp.page);
      expect(resultForCall(openAiCompatibleLab, `native-cancel-${index}`)).toEqual({ ok: true, value: index === 0 ? { exported: false } : { imported: false } });
    }
    expect(await readdir(directory)).toEqual(['product-collection.json']);

    // Ask保存与确认：导出保持完整树，导入预览取消不写，确认后立即追加且重新生成所有身份。
    // Ask saving and confirmation: export preserves the tree, preview cancellation writes nothing, and confirmation appends with fresh identities immediately.
    const exportedPath = path.join(directory, 'tool-export.json');
    await beginCall(desktopApp.page, openAiCompatibleLab, 'export-allow', EXPORT_TOOL, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), exportedPath);
    await finishCall(desktopApp.page);
    expect(await readTree(exportedPath)).toEqual(original);
    expect(resultForCall(openAiCompatibleLab, 'export-allow')).toEqual({ ok: true, value: { exported: true } });
    await beginCall(desktopApp.page, openAiCompatibleLab, 'preview-cancel', IMPORT_TOOL, 'allow');
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.cancel).click();
    await finishCall(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'preview-cancel')).toEqual({ ok: true, value: { imported: false } });
    await beginCall(desktopApp.page, openAiCompatibleLab, 'import-allow', IMPORT_TOOL, 'allow');
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.confirm).click();
    await finishCall(desktopApp.page);
    expect(resultForCall(openAiCompatibleLab, 'import-allow')).toEqual({ ok: true, value: { imported: true, revision: initialRevision + 1, requestCount: 2, folderCount: 1, skippedCount: 0 } });
    verifyCopies(original, await exportFromUi(desktopApp, path.join(directory, 'after-allow.json')), 2);

    // Auto仍保留原生选择与确认，重复导入只追加，不自动发送任何请求。
    // Auto still requires native selection and confirmation; repeated imports only append and never send requests.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await beginCall(desktopApp.page, openAiCompatibleLab, 'import-auto', IMPORT_TOOL);
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.confirm).click();
    await finishCall(desktopApp.page);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolApproval('import-auto'))).toHaveCount(0);
    expect(resultForCall(openAiCompatibleLab, 'import-auto')).toEqual({ ok: true, value: {
      imported: true, revision: initialRevision + 2, requestCount: 2, folderCount: 1, skippedCount: 0,
    } });
    await beginCall(desktopApp.page, openAiCompatibleLab, 'export-auto', EXPORT_TOOL);
    const autoPath = path.join(directory, 'after-auto.json');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), autoPath);
    await finishCall(desktopApp.page);
    verifyCopies(original, await readTree(autoPath), 3);

    // 双授权：Agent撤权后旧Chat无效，MCP仍使用同一导入/导出命令，随后MCP撤权立即生效。
    // Independent permissions: revoke Agent calls, exercise the same import and export commands through MCP, then revoke MCP immediately.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('collection');
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const [index, name] of [EXPORT_TOOL, IMPORT_TOOL].entries()) {
      await beginCall(desktopApp.page, openAiCompatibleLab, `disabled-${index}`, name);
      await finishCall(desktopApp.page);
      expect(resultForCall(openAiCompatibleLab, `disabled-${index}`)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) {
      const denied = client.callTool({ name, arguments: {} });
      await expect(approval).toHaveAttribute('data-tool-name', name);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
      await expect(denied).resolves.toMatchObject({ isError: true });
    }
    const imported = client.callTool({ name: IMPORT_TOOL, arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', IMPORT_TOOL);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    await selectImport(desktopApp, inputPath);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.confirm).click();
    expect(mcpValue(await imported)).toEqual({ imported: true, revision: initialRevision + 3, requestCount: 2, folderCount: 1, skippedCount: 0 });
    await automaticallyExecuteMcpClientTools(desktopApp.page, configuredClient.clientId);
    const canceledImport = client.callTool({ name: IMPORT_TOOL, arguments: {} });
    await selectImport(desktopApp, inputPath);
    await expect(approval).toHaveCount(0);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.composer.import.cancel).click();
    expect(mcpValue(await canceledImport)).toEqual({ imported: false });
    const exported = client.callTool({ name: EXPORT_TOOL, arguments: {} });
    const mcpPath = path.join(directory, 'mcp-export.json');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpPath);
    expect(mcpValue(await exported)).toEqual({ exported: true });
    const finalTree = await readTree(mcpPath);
    verifyCopies(original, finalTree, 4);
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => [EXPORT_TOOL, IMPORT_TOOL].includes(tool.name)).length).toBe(0);
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;

    // 重启与证据：保存态/双授权保持，旧文件操作和Model请求不重放，归档只有哈希与协议结论。
    // Restart and evidence: preserve data and permissions without replaying file operations or Model requests; retain hashes and protocol outcomes only.
    for (const request of openAiCompatibleLab.requestsForAssertions()) {
      expect(JSON.stringify(request)).not.toContain(SECRET);
      expect(JSON.stringify(request)).not.toContain(directory.replaceAll('\\', '\\\\'));
    }
    const requestCount = openAiCompatibleLab.evidence().length;
    const fileCount = (await readdir(directory)).length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const text of [PROMPT, ANSWER, SECRET]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - requestCount).toBe(0);
    expect((await readdir(directory)).length).toBe(fileCount);
    expect(await exportFromUi(relaunchedApp, path.join(directory, 'restart.json'))).toEqual(finalTree);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('collection');
    for (const name of [EXPORT_TOOL, IMPORT_TOOL]) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('composer-tools-transfer.json');
    await writeFile(evidencePath, JSON.stringify({
      inputHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'),
      finalHash: createHash('sha256').update(JSON.stringify(finalTree)).digest('hex'),
      initialRevision, finalRevision: initialRevision + 3, copies: 4, freshFieldIdentities: true,
      credentialsPreserved: true, nativeCancelVerified: true, previewCancelVerified: true, restartModelRequests: 0,
      bodyAndFormPreserved: true, queryPreserved: true, mcpAutoPreviewCancelVerified: true,
    }, null, 2), 'utf8');
    await testInfo.attach('composer-tools-transfer.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先关闭MCP/Electron并验证宿主，再删除产品自产文件，不以紧急恢复冒充正常退出。
    // Teardown: close MCP and Electron and verify the host before deleting product-created files; never treat emergency recovery as graceful shutdown.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Collection transfer and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Collection transfer cleanup failed.');
});