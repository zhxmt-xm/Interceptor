import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { cancelFileDialog, submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';

const TOOL_NAMES = ['diagnostics_get_trace', 'diagnostics_get_recent', 'diagnostics_export'] as const;
const PROMPT = ['Inspect or export', 'the requested Diagnostics records.'].join(' ');
const ANSWER = ['The requested Diagnostics', 'operation is complete.'].join(' ');
const SECRET = ['diagnostics-transfer-', 'private-query'].join('');
const FILTER = { process: 'core', level: 'info', outcome: 'success' } as const;

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
  throw new Error(`Missing Diagnostics result: ${callId}`);
}

function recordsFromValue(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value.records) || !value.records.every(isRecord)) {
    throw new Error('Diagnostics result omitted records.');
  }
  expect(value.droppedCount).toBe(0);
  const records = value.records;
  expect(records.every((record) => typeof record.sequence === 'number')).toBe(true);
  const sequences = records.map((record) => Number(record.sequence));
  expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
  expect(new Set(sequences).size).toBe(sequences.length);
  expect(JSON.stringify(records)).not.toContain(SECRET);
  return records;
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Diagnostics transfer lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('diagnostics-transfer'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('diagnostics-transfer-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function beginAgentCall(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny',
): Promise<void> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: args });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
}

async function finishAgentCall(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Promise<Record<string, unknown>> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return resultForCall(openAiCompatibleLab, callId);
}

async function createDiagnosticRecords(page: Page, loopbackLab: HttpTrafficRunner): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  for (const index of [1, 2]) {
    const requestPath = `/e2e/diagnostics-transfer/${index}?access_token=${SECRET}`;
    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(requestPath));
    await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
    await expect.poll(() => loopbackLab.observation(requestPath)?.method).toBe('GET');
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.send)).toBeEnabled();
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
  await expect(page.getByRole('button').filter({ hasText: 'composer.send' })).toHaveCount(2);
}

function assertStarted(value: unknown): string {
  if (!isRecord(value) || value.started !== true || !isRecord(value.job)) throw new Error('Export omitted its public job.');
  expect(Object.keys(value).sort()).toEqual(['job', 'started']);
  const job = value.job;
  expect(job.kind).toBe('diagnostics-export');
  expect(['running', 'completed']).toContain(job.state);
  expect(typeof job.id).toBe('string');
  expect(typeof job.processed).toBe('number');
  expect(typeof job.total).toBe('number');
  expect(typeof job.warningCount).toBe('number');
  for (const field of ['filePath', 'fileName', 'message', 'warnings']) expect(job).not.toHaveProperty(field);
  return job.id as string;
}

async function readCompletedExport(filePath: string): Promise<{ count: number; hash: string }> {
  await expect.poll(async () => {
    try { return (await readFile(filePath, 'utf8')).length; } catch { return 0; }
  }).toBeGreaterThan(0);
  const content = await readFile(filePath, 'utf8');
  expect(content).not.toContain(SECRET);
  const records: unknown[] = content.trim().split('\n').map((line) => JSON.parse(line));
  expect(records.length).toBeGreaterThanOrEqual(4);
  for (const record of records) {
    expect(record).toMatchObject(FILTER);
    expect(isRecord(record)).toBe(true);
  }
  const composerRecords = records.filter((record) => isRecord(record) && record.command === 'composer.send');
  expect(composerRecords).toHaveLength(4);
  return { count: records.length, hash: createHash('sha256').update(content).digest('hex') };
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Diagnostics transfer MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: { url: string; headers: { Authorization: string } } } };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'diagnostics-transfer', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
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
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
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

test('diagnostics.tools.queries-export reads current traces and exports redacted persisted records', async ({ desktopApp, httpTrafficRunner: loopbackLab, openAiCompatibleLab }, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native Save workflow requires Windows or macOS.');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'diagnostics.tools.queries-export' });
  for (const value of [PROMPT, ANSWER, SECRET]) desktopApp.registerSensitiveTextForEvidenceAudit(value);
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-diagnostics-tools-'));
  const exportedFiles: { count: number; hash: string }[] = [];
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：真实Settings创建Provider，正式discovery必须包含三条新Tool。
    // Arrange and Red: create a Provider through real Settings and require the three new Tools in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-discover', 'discover_tools', { capabilityId: 'diagnostics' });
    const discovery = await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name)).toBe(true);

    // 自产记录与静默查询：通过Composer产生四条记录，Recent保持内存顺序，Trace只返回指定身份且不自污染。
    // Product-owned records and silent queries: Composer creates four records; Recent preserves memory order and Trace returns only the requested identity without self-generated records.
    await createDiagnosticRecords(page, loopbackLab);
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-recent', TOOL_NAMES[1], { limit: 200 });
    const recentResult = await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-recent');
    expect(recentResult.ok).toBe(true);
    const recentRecords = recordsFromValue(recentResult.value);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-recent'))).toHaveAttribute('data-summary-kind', 'diagnosticsSnapshot');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-recent'))).toHaveAttribute('data-diagnostics-count', String(recentRecords.length));
    const composerRecords = recentRecords.filter((record) => record.command === 'composer.send');
    expect(composerRecords).toHaveLength(4);
    const traceId = composerRecords[0]!.traceId;
    if (typeof traceId !== 'string') throw new Error('Composer record omitted traceId.');
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-trace', TOOL_NAMES[0], { traceId });
    const traceResult = await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-trace');
    expect(traceResult.ok).toBe(true);
    const traceRecords = recordsFromValue(traceResult.value);
    expect(traceRecords).toHaveLength(2);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-trace'))).toHaveAttribute('data-summary-kind', 'diagnosticsSnapshot');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-trace'))).toHaveAttribute('data-diagnostics-count', '2');
    expect(traceRecords.every((record) => record.traceId === traceId)).toBe(true);
    expect(traceRecords.every((record) => record.command === 'composer.send')).toBe(true);
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-recent-again', TOOL_NAMES[1], { limit: 200 });
    const repeated = recordsFromValue((await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-recent-again')).value);
    expect(repeated.filter((record) => record.command === 'composer.send')).toEqual(composerRecords);
    expect(repeated.some((record) => record.command === 'diagnostics.recent')).toBe(false);
    for (const callId of ['diagnostics-recent', 'diagnostics-trace', 'diagnostics-recent-again']) {
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveCount(0);
    }

    // Agent导出：Deny不开文件，真实Cancel不创建任务；Allow/Auto均经Save并只读取产品生成的原子JSONL。
    // Agent export: Deny opens no file, native Cancel creates no job; Allow and Auto both use Save, and assertions only inspect the product-generated atomic JSONL.
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-export-denied', TOOL_NAMES[2], FILTER, 'deny');
    expect(await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-export-denied')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    expect(await readdir(directory)).toEqual([]);
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-export-cancel', TOOL_NAMES[2], FILTER, 'allow');
    await cancelFileDialog(desktopApp.nativeFileDialogOwner());
    await page.bringToFront();
    expect(await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-export-cancel')).toEqual({ ok: true, value: { started: false } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-export-cancel'))).toHaveAttribute('data-summary-kind', 'exportCanceled');
    expect(await readdir(directory)).toEqual([]);
    const agentFile = path.join(directory, 'agent.jsonl');
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-export-allow', TOOL_NAMES[2], FILTER, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), agentFile);
    await page.bringToFront();
    const exportJobId = assertStarted((await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-export-allow')).value);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-export-allow'))).toHaveAttribute('data-summary-kind', 'diagnosticsExport');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-export-allow'))).toHaveAttribute('data-transfer-job-id', exportJobId);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('diagnostics-export-allow'))).toHaveAttribute('data-transfer-job-state', 'running');
    exportedFiles.push(await readCompletedExport(agentFile));
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    const autoFile = path.join(directory, 'auto.jsonl');
    await beginAgentCall(page, openAiCompatibleLab, 'diagnostics-export-auto', TOOL_NAMES[2], FILTER);
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), autoFile);
    await page.bringToFront();
    assertStarted((await finishAgentCall(page, openAiCompatibleLab, 'diagnostics-export-auto')).value);
    exportedFiles.push(await readCompletedExport(autoFile));
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('diagnostics-export-auto'))).toHaveCount(0);

    // 独立授权与MCP：Agent撤权不影响MCP，两项查询静默；导出仍需独立审批和真实Save，撤权立即生效。
    // Independent permissions and MCP: revoking Agent leaves MCP enabled; both queries stay silent and export retains independent approval and native Save until MCP is revoked.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('diagnostics_');
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const [index, name] of TOOL_NAMES.entries()) {
      await beginAgentCall(page, openAiCompatibleLab, `diagnostics-disabled-${index}`, name, index === 0 ? { traceId } : {});
      expect(await finishAgentCall(page, openAiCompatibleLab, `diagnostics-disabled-${index}`)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    const mcpRecent = recordsFromValue(mcpValue(await client.callTool({ name: TOOL_NAMES[1], arguments: { limit: 200 } })));
    expect(mcpRecent.filter((record) => record.command === 'composer.send')).toEqual(composerRecords);
    expect(recordsFromValue(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { traceId } })))).toEqual(traceRecords);
    const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
    await expect(approval).toHaveCount(0);
    const denied = client.callTool({ name: TOOL_NAMES[2], arguments: FILTER });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[2]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(denied).resolves.toMatchObject({ isError: true });
    const canceled = client.callTool({ name: TOOL_NAMES[2], arguments: FILTER });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[2]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    await cancelFileDialog(desktopApp.nativeFileDialogOwner());
    await page.bringToFront();
    expect(mcpValue(await canceled)).toEqual({ started: false });
    const mcpFile = path.join(directory, 'mcp.jsonl');
    const allowed = client.callTool({ name: TOOL_NAMES[2], arguments: FILTER });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[2]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpFile);
    await page.bringToFront();
    assertStarted(mcpValue(await allowed));
    exportedFiles.push(await readCompletedExport(mcpFile));
    await automaticallyExecuteMcpClientTools(page, configuredClient.clientId);
    const mcpAutoFile = path.join(directory, 'mcp-auto.jsonl');
    const automatic = client.callTool({ name: TOOL_NAMES[2], arguments: FILTER });
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpAutoFile);
    await page.bringToFront();
    assertStarted(mcpValue(await automatic));
    exportedFiles.push(await readCompletedExport(mcpAutoFile));
    await expect(approval).toHaveCount(0);
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => (TOOL_NAMES as readonly string[]).includes(tool.name)).length).toBe(0);
    for (const name of TOOL_NAMES) await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;

    // 重启与证据：Model结果无路径/秘密，文件与网络无重放，凭据只在产品中使用，产物仅保留计数和hash。
    // Restart and evidence: Model results contain neither paths nor secrets, files and network operations do not replay, and artifacts retain only counts and hashes.
    for (const request of openAiCompatibleLab.requestsForAssertions()) {
      expect(JSON.stringify(request)).not.toContain(SECRET);
      expect(JSON.stringify(request)).not.toContain(directory.replaceAll('\\', '\\\\'));
    }
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = loopbackLab.evidence().length;
    const fileNames = (await readdir(directory)).sort();
    expect(fileNames).toHaveLength(4);
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const value of [PROMPT, ANSWER, SECRET]) relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(loopbackLab.evidence().length).toBe(originRequests);
    expect((await readdir(directory)).sort()).toEqual(fileNames);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('diagnostics_');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('diagnostics-tools.json');
    await writeFile(evidencePath, JSON.stringify({
      composerRecordCount: 4, traceRecordCount: 2, orderedCurrentRecords: true, queriesSilent: true,
      nativeCancelVerified: true, agentAndMcpAskAutoVerified: true, exportFiltersVerified: true,
      exportJobsRedacted: true, secretsAbsent: true, exportedFiles, originRequests,
      restartModelRequests: 0, restartOriginRequests: 0, restartFileOperations: 0,
    }, null, 2), 'utf8');
    await testInfo.attach('diagnostics-tools.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先关闭MCP与Electron并核实宿主恢复，再删除产品输出；不把紧急清理当作正常验收。
    // Teardown: close MCP and Electron and verify host restoration before deleting product outputs; emergency cleanup never substitutes for graceful acceptance.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Diagnostics workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Diagnostics cleanup failed.');
});