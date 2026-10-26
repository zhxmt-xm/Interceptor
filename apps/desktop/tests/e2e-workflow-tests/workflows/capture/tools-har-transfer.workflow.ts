import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { connectWorkflowMcpClient, type WorkflowMcpClient } from '../../fixtures/runtime/workflow-mcp-client';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cancelFileDialog, submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';

const TOOL_NAMES = ['capture_export_har', 'capture_import_har'] as const;
const PROMPT = ['Perform the selected', 'HAR transfer operation.'].join(' ');
const ANSWER = ['The HAR transfer', 'request is settled.'].join(' ');
const SECRET = ['har-roundtrip-', 'private-credential'].join('');
const SOURCE_PATH = '/e2e/har-tools/';
const FULL_REDACTION = { authorization: false, cookies: false, bodies: false };

interface McpConfiguration {
  readonly url: string;
  readonly headers: { readonly Authorization: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mcpValue(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP result omitted text.');
  const value: unknown = JSON.parse(content.text);
  if (!isRecord(value)) throw new Error('MCP result was not an object.');
  return value;
}

function agentResult(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Record<string, unknown> {
  for (const modelRequest of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(modelRequest.messages)) continue;
    const message = modelRequest.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing HAR Tool result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('HAR transfer lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('har-transfer'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('har-transfer-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function beginAgentCall(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string, name: string, args: Readonly<Record<string, unknown>>, verdict?: 'allow' | 'deny'): Promise<void> {
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
  return agentResult(openAiCompatibleLab, callId);
}

async function connectMcpClient(
  configuration: McpConfiguration,
  testInfo: TestInfo,
): Promise<WorkflowMcpClient> {
  return connectWorkflowMcpClient(configuration, 'har-transfer', testInfo);
}

async function createMcpClient(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<{ client: WorkflowMcpClient; configuration: McpConfiguration }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('HAR transfer MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await automaticallyExecuteMcpClientTools(page, clientId);
  await expect(row).toHaveAttribute('data-execution-mode', 'auto');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: McpConfiguration } };
  const configuration = copied.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
  return { client: await connectMcpClient(configuration, testInfo), configuration };
}

async function captureSources(desktopApp: LocalElectronApplicationDriver, httpTrafficRunner: HttpTrafficRunner): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  // 画面隔离：只显示自产路径，正常折叠全量facet；后续All仍由暂停/Clear/Import与实际文件验证。
  // Visual isolation: show the owned path and collapse global facets; later All assertions still rely on pause/Clear/Import and real files.
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill(SOURCE_PATH);
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  for (const suffix of ['text', 'binary']) {
    const requestPath = `${SOURCE_PATH}${suffix}`;
    const bytes = suffix === 'text' ? Buffer.from('HAR response body') : Buffer.from([0, 1, 127, 128, 254, 255]);
    httpTrafficRunner.respondWith(requestPath, {
      statusCode: 200,
      headers: { 'content-type': suffix === 'text' ? 'text/plain' : 'application/octet-stream', 'content-length': String(bytes.length), 'set-cookie': `session=${SECRET}` },
      body: bytes,
    });
    const result = await new Promise<Buffer>((resolve, reject) => {
      const outgoing = request({
        hostname: '127.0.0.1', port: desktopApp.capturePort(), path: httpTrafficRunner.url(requestPath), method: 'POST',
        headers: { host: `127.0.0.1:${httpTrafficRunner.port}`, connection: 'close', authorization: `Bearer ${SECRET}`, cookie: `session=${SECRET}`, 'content-type': 'text/plain', 'content-length': '16' },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('error', reject);
        response.once('end', () => resolve(Buffer.concat(chunks)));
      });
      outgoing.once('error', reject);
      outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('HAR source request timed out.')));
      outgoing.end('HAR request body');
    });
    expect(result.equals(bytes)).toBe(true);
  }
}

async function captureItems(client: WorkflowMcpClient): Promise<Record<string, unknown>[]> {
  const value = mcpValue(await client.callTool({ name: 'capture_list_exchanges', arguments: { search: SOURCE_PATH, limit: 100 } }));
  if (!Array.isArray(value.items) || !value.items.every(isRecord)) throw new Error('Capture omitted query items.');
  return value.items;
}

function startedJob(value: unknown, kind: 'har-export' | 'har-import'): string {
  if (!isRecord(value) || value.started !== true || !isRecord(value.job)) throw new Error('HAR transfer omitted its public job.');
  expect(Object.keys(value).sort()).toEqual(['job', 'started']);
  expect(value.job.kind).toBe(kind);
  expect(typeof value.job.id).toBe('string');
  expect(typeof value.job.warningCount).toBe('number');
  for (const field of ['fileName', 'filePath', 'message', 'warnings']) expect(value.job).not.toHaveProperty(field);
  return value.job.id as string;
}

async function waitForCompletedJob(client: WorkflowMcpClient, jobId: string): Promise<void> {
  await expect.poll(async () => {
    const value = mcpValue(await client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId } }));
    return isRecord(value.job) ? value.job.state : null;
  }).toBe('completed');
}

async function readHar(filePath: string): Promise<{ text: string; entries: Record<string, unknown>[]; hash: string }> {
  const bytes = await readFile(filePath);
  const text = bytes.toString('utf8');
  const document: unknown = JSON.parse(text);
  if (!isRecord(document) || !isRecord(document.log) || !Array.isArray(document.log.entries) || !document.log.entries.every(isRecord)) throw new Error('Product export is not a HAR document.');
  expect(document.log.version).toBe('1.2');
  return { text, entries: document.log.entries, hash: createHash('sha256').update(bytes).digest('hex') };
}

async function saveHarFromDialog(desktopApp: LocalElectronApplicationDriver, file: string): Promise<Awaited<ReturnType<typeof readHar>>> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), file);
  await expect.poll(async () => {
    try { return (await readHar(file)).entries.length; }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return -1;
      throw error;
    }
  }).toBeGreaterThanOrEqual(0);
  const close = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.close);
  if (await close.isVisible()) await close.click();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.dialog)).toBeHidden();
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.exportMenu)).toBeEnabled();
  return readHar(file);
}

function verifyFullHar(entries: Record<string, unknown>[]): void {
  expect(entries).toHaveLength(2);
  for (const entry of entries) {
    expect(entry.request).toMatchObject({ method: 'POST', postData: { text: 'HAR request body' } });
    expect(entry.response).toMatchObject({ status: 200 });
    if (!isRecord(entry.request) || !isRecord(entry.response) || !isRecord(entry.response.content)) throw new Error('HAR entry omitted message fields.');
    expect(JSON.stringify(entry.request.headers)).toContain(SECRET);
    const content = entry.response.content;
    const expected = String(entry.request.url).endsWith('/text') ? Buffer.from('HAR response body') : Buffer.from([0, 1, 127, 128, 254, 255]);
    const actual = Buffer.from(String(content.text), content.encoding === 'base64' ? 'base64' : 'utf8');
    expect(actual.equals(expected)).toBe(true);
  }
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  const errors = desktopApp.rendererPageErrors();
  try {
    if (!desktopApp.page.isClosed()) {
      // 失败可能留下HAR弹窗，先正常取消或关闭，不能等待被遮罩的Settings入口。
      // A failure can leave HAR open; cancel or close it before targeting Settings behind its modal.
      const transferDialog = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.dialog);
      if (await transferDialog.isVisible()) {
        const cancelTransfer = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.cancel);
        if (await cancelTransfer.isVisible()) await cancelTransfer.click();
        else await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.close).click();
        await expect(transferDialog).toBeHidden();
      }
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

test('capture.tools.har-transfer exports and imports real HAR files through Agent and MCP', async ({ desktopApp, httpTrafficRunner, openAiCompatibleLab }, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native HAR workflow requires Windows or macOS.');
  test.setTimeout(420_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.tools.har-transfer' });
  const { page } = desktopApp;
  const directory = testInfo.outputPath('har-transfer-files');
  await mkdir(directory, { recursive: true });
  for (const value of [PROMPT, ANSWER, SECRET, directory]) desktopApp.registerSensitiveTextForEvidenceAudit(value);
  let client: WorkflowMcpClient | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：从真实Settings创建Provider，正式discovery必须披露两项HAR Tool。
    // Arrange and Red: configure a Provider through real Settings and require both HAR Tools in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    await beginAgentCall(page, openAiCompatibleLab, 'har-discover', 'discover_tools', { capabilityId: 'capture' });
    const discovery = await finishAgentCall(page, openAiCompatibleLab, 'har-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name), `HAR Tool must be discoverable: ${name}`).toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const configured = await createMcpClient(desktopApp, testInfo);
    client = configured.client;
    await captureSources(desktopApp, httpTrafficRunner);
    await expect.poll(async () => (await captureItems(client!)).length).toBe(2);
    const originalIds = (await captureItems(client)).map((entry) => String(entry.id));
    const exportArgs = { scope: { kind: 'selected', exchangeIds: originalIds }, redaction: FULL_REDACTION };
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();

    // Agent Export：Deny与原生Cancel无任务，Allow保存完整HAR，Auto筛选导出保留明确脱敏选择。
    // Agent Export: Deny and native Cancel create no job; Allow saves a complete HAR and Auto preserves explicit filtering and redaction.
    await beginAgentCall(page, openAiCompatibleLab, 'har-export-deny', TOOL_NAMES[0], exportArgs, 'deny');
    expect(await finishAgentCall(page, openAiCompatibleLab, 'har-export-deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    await beginAgentCall(page, openAiCompatibleLab, 'har-export-cancel', TOOL_NAMES[0], exportArgs, 'allow');
    await cancelFileDialog(desktopApp.nativeFileDialogOwner());
    expect(await finishAgentCall(page, openAiCompatibleLab, 'har-export-cancel')).toEqual({ ok: true, value: { started: false } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('har-export-cancel'))).toHaveAttribute('data-summary-kind', 'exportCanceled');
    expect(await readdir(directory)).toEqual([]);
    const completeFile = path.join(directory, 'complete.har');
    await beginAgentCall(page, openAiCompatibleLab, 'har-export-full', TOOL_NAMES[0], exportArgs, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    const fullJobId = startedJob((await finishAgentCall(page, openAiCompatibleLab, 'har-export-full')).value, 'har-export');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('har-export-full'))).toHaveAttribute('data-summary-kind', 'transferJob');
    await waitForCompletedJob(client, fullJobId);
    const fullHar = await readHar(completeFile);
    verifyFullHar(fullHar.entries);
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    const redactedFile = path.join(directory, 'redacted.har');
    await beginAgentCall(page, openAiCompatibleLab, 'har-export-filtered', TOOL_NAMES[0], {
      scope: { kind: 'filter', filter: { search: `${SOURCE_PATH}binary`, method: 'POST' } },
      redaction: { authorization: true, cookies: true, bodies: true },
    });
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), redactedFile);
    await waitForCompletedJob(client, startedJob((await finishAgentCall(page, openAiCompatibleLab, 'har-export-filtered')).value, 'har-export'));
    const redactedHar = await readHar(redactedFile);
    expect(redactedHar.entries).toHaveLength(1);
    expect(redactedHar.text).not.toContain(SECRET);
    expect(redactedHar.text).not.toContain('HAR request body');
    expect(redactedHar.entries[0]).toMatchObject({ request: { url: httpTrafficRunner.url(`${SOURCE_PATH}binary`) } });
    const redactedResponse = redactedHar.entries[0]!.response;
    if (!isRecord(redactedResponse) || !isRecord(redactedResponse.content)) throw new Error('Redacted HAR omitted content metadata.');
    expect(redactedResponse.content).not.toHaveProperty('text');
    await screenshotStep('Agent Export：Deny与原生Cancel无任务，Allow保存完整HAR，Auto筛选导出保留明确脱敏选择。 / Agent Export: Deny and native Cancel create no job; Allow saves a complete HAR and Auto preserves explicit filtering and redaction.');

    // Agent Import：拒绝/原生取消不改变Capture，Clear后仅选择本流程真实导出的HAR恢复数据。
    // Agent Import: denial and native cancellation leave Capture unchanged; after Clear, import only the HAR exported by this same workflow.
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.ask).click();
    await beginAgentCall(page, openAiCompatibleLab, 'har-import-deny', TOOL_NAMES[1], {}, 'deny');
    expect(await finishAgentCall(page, openAiCompatibleLab, 'har-import-deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    await beginAgentCall(page, openAiCompatibleLab, 'har-import-cancel', TOOL_NAMES[1], {}, 'allow');
    await cancelFileDialog(desktopApp.nativeFileDialogOwner());
    expect(await finishAgentCall(page, openAiCompatibleLab, 'har-import-cancel')).toEqual({ ok: true, value: { started: false } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('har-import-cancel'))).toHaveAttribute('data-summary-kind', 'importCanceled');
    expect((await captureItems(client)).map((entry) => String(entry.id)).sort()).toEqual([...originalIds].sort());
    await screenshotStep('Agent Import：拒绝/原生取消不改变Capture，Clear后仅选择本流程真实导出的HAR恢复数据。 / Agent Import: denial and native cancellation leave Capture unchanged; after Clear, import only the HAR exported by this same workflow.');

    // 暂停真实录制后再Clear/Import，避免系统背景流量混入后续all范围验证。
    // Pause recording before Clear/Import so system traffic cannot enter later all-scope assertions.
    const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    mcpValue(await client.callTool({ name: 'capture_clear', arguments: {} }));
    expect(await captureItems(client)).toEqual([]);
    await beginAgentCall(page, openAiCompatibleLab, 'har-import-allow', TOOL_NAMES[1], {}, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    await waitForCompletedJob(client, startedJob((await finishAgentCall(page, openAiCompatibleLab, 'har-import-allow')).value, 'har-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(2);
    const importedIds = (await captureItems(client)).map((entry) => String(entry.id));
    expect(importedIds.every((id) => !originalIds.includes(id))).toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(getByAutomationId(page, AutomationIdFactory.captureRequestRow(importedIds[0]!))).toBeVisible();
    await screenshotStep('暂停真实录制后再Clear/Import，避免系统背景流量混入后续all范围验证。 / Pause recording before Clear/Import so system traffic cannot enter later all-scope assertions.');

    // 独立权限与MCP：Agent撤权不影响MCP，Auto仍经原生Save/Open；再次导入追加记录而非清空。
    // Independent permissions and MCP: Agent revocation leaves MCP enabled; Auto still uses native Save/Open and another import appends without clearing.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('har');
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const name of TOOL_NAMES) {
      const callId = `har-disabled-${name}`;
      await beginAgentCall(page, openAiCompatibleLab, callId, name, name === TOOL_NAMES[0] ? exportArgs : {});
      expect(await finishAgentCall(page, openAiCompatibleLab, callId)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const mcpFile = path.join(directory, 'mcp.har');
    const [mcpExport] = await Promise.all([
      client.callTool({ name: TOOL_NAMES[0], arguments: { scope: { kind: 'all' }, redaction: FULL_REDACTION } }),
      submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpFile),
    ]);
    await waitForCompletedJob(client, startedJob(mcpValue(mcpExport), 'har-export'));
    verifyFullHar((await readHar(mcpFile)).entries);
    const [mcpImport] = await Promise.all([
      client.callTool({ name: TOOL_NAMES[1], arguments: {} }),
      submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpFile),
    ]);
    await waitForCompletedJob(client, startedJob(mcpValue(mcpImport), 'har-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(4);
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    await screenshotStep('独立权限与MCP：Agent撤权不影响MCP，Auto仍经原生Save/Open；再次导入追加记录而非清空。 / Independent permissions and MCP: Agent revocation leaves MCP enabled; Auto still uses native Save/Open and another import appends without clearing.');

    // IPC原入口：从Capture菜单导出，再导入同流程文件；完成后由统一通知更新列表。
    // Original IPC entry: export from Capture, import a file from this workflow, and refresh through the shared completion notice.
    const beforeUiImportIds = (await captureItems(client)).map((entry) => String(entry.id));
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
    const exportHarCommand = getByAutomationId(page, AUTOMATION_IDS.capture.exportHar);
    await expect(exportHarCommand).toHaveCSS('display', 'flex');
    await expect(exportHarCommand).toHaveCSS('align-items', 'center');
    await expect(exportHarCommand.locator('code')).toHaveText('.har');
    await expect(exportHarCommand.locator('code')).toHaveCSS('font-size', '9.5px');
    await screenshotStep('从Capture Export菜单选择HAR / Choose HAR from the Capture Export menu', {
      highlights: [{ target: exportHarCommand, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
    const harWarning = page.getByRole('dialog').locator('header + div > div:first-child');
    await expect(harWarning).toHaveCSS('display', 'flex');
    await expect(harWarning).toHaveCSS('font-size', '12px');
    await expect(harWarning).toHaveCSS('padding', '11px 13px');
    await expect(harWarning).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeAll).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeAll).locator(':scope > span').last()).toHaveText('4');
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskAuthorization)).toBeChecked();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies)).toBeChecked();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.stripBodies)).not.toBeChecked();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeEnabled();
    await screenshotStep('HAR选择All并保留默认遮罩和正文，再Export / Choose All with default masking and retained bodies, then Export', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeAll), label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start), label: '2' },
      ],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    const uiFile = path.join(directory, 'ui.har');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), uiFile);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeHidden();
    await expect.poll(async () => {
      try { return (await readHar(uiFile)).entries.length; } catch { return 0; }
    }).toBe(4);
    const uiHar = await readHar(uiFile);
    expect(uiHar.text).not.toContain(SECRET);

    // UI范围：已有四条记录中筛出两条并选中一条，分别核对真实文件而不是仅看选项。
    // UI scopes: filter two of the four records and select one, verifying actual files rather than option appearance.
    const closeProgress = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close);
    if (await closeProgress.isVisible()) await closeProgress.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.dialog)).toBeHidden();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu)).toBeEnabled();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await screenshotStep('四条HAR导出完成后返回Capture，保持暂停 / Return to Capture after exporting four HAR entries, still paused', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu), label: '1' },
        { target: recording, label: '2' },
      ],
    });
    const openUiExport = async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
    };
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${SOURCE_PATH}text`);
    const textRows = page.locator('[data-automation-id^="capture.request-row."]').filter({ hasText: `${SOURCE_PATH}text` });
    await expect(textRows).toHaveCount(2);
    await textRows.first().click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('HAR response body');
    await screenshotStep('筛选两条自产文本记录并选中一条 / Filter the two owned text records and select one', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter), label: '1' },
        { target: textRows.first(), label: '2' },
      ],
    });
    for (const [scope, count] of [['filter', 2], ['selected', 1]] as const) {
      await openUiExport();
      const scopeOption = getByAutomationId(page, scope === 'filter'
        ? AUTOMATION_IDS.capture.transfer.scopeFilter : AUTOMATION_IDS.capture.transfer.scopeSelected);
      await scopeOption.click();
      await expect(scopeOption.locator(':scope > span').last()).toHaveText(String(count));
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeEnabled();
      await screenshotStep(`选择HAR ${scope}范围并Export / Select the HAR ${scope} scope and Export`, {
        highlights: [
          { target: scopeOption, label: '1' },
          { target: getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start), label: '2' },
        ],
      });
      const exported = await saveHarFromDialog(desktopApp, path.join(directory, `ui-${scope}.har`));
      expect(exported.entries).toHaveLength(count);
      for (const entry of exported.entries) expect(entry.request).toMatchObject({ url: httpTrafficRunner.url(`${SOURCE_PATH}text`) });
      await screenshotStep(`HAR ${scope}范围实际导出${count}条后返回Capture / Return to Capture after HAR ${scope} exports ${count} entries`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu), label: '1' }],
      });
    }

    // 隐私：全局默认和单次覆盖相互独立；仅使用本轮自产的测试凭据。
    // Privacy: global defaults and per-export overrides stay independent; use only this workflow's own test credentials.
    const privacy = AUTOMATION_IDS.settings.privacy;
    const openPrivacy = async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
    };
    await openPrivacy();
    for (const id of [privacy.maskAuthorization, privacy.maskCookies, privacy.warnUnmasked]) {
      await expect(getByAutomationId(page, id)).toHaveAttribute('aria-checked', 'true');
      await getByAutomationId(page, id).click();
    }
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const uiPrivacyHashes: string[] = [];
    for (const mode of ['override', 'plain', 'stripped'] as const) {
      await openUiExport();
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeSelected).click();
      const authorization = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskAuthorization);
      const cookies = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies);
      const stripBodies = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.stripBodies);
      await expect(authorization).not.toBeChecked();
      await expect(cookies).not.toBeChecked();
      await expect(stripBodies).not.toBeChecked();
      if (mode !== 'plain') await authorization.click();
      if (mode === 'stripped') {
        await cookies.click();
        await stripBodies.click();
      }
      await expect(authorization).toBeChecked({ checked: mode !== 'plain' });
      await expect(cookies).toBeChecked({ checked: mode === 'stripped' });
      await expect(stripBodies).toBeChecked({ checked: mode === 'stripped' });
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeEnabled();
      await screenshotStep(`确认${mode}的HAR隐私与正文选项后Export / Confirm ${mode} HAR privacy and body options, then Export`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start), label: '1' }],
      });
      const exported = await saveHarFromDialog(desktopApp, path.join(directory, `ui-${mode}.har`));
      expect(exported.entries).toHaveLength(1);
      const message = exported.entries[0]?.request;
      const response = exported.entries[0]?.response;
      if (!isRecord(message) || !Array.isArray(message.headers) || !isRecord(response) || !isRecord(response.content)) {
        throw new Error('The privacy export omitted request Headers or response content.');
      }
      const headers = new Map(message.headers.map((header: unknown) => {
        if (!isRecord(header) || typeof header.name !== 'string' || typeof header.value !== 'string') {
          throw new Error('The privacy export included an invalid Header.');
        }
        return [header.name.toLowerCase(), header.value];
      }));
      if (mode === 'plain') {
        expect(headers.get('authorization')).toContain(SECRET);
        expect(headers.get('cookie')).toContain(SECRET);
      } else {
        expect(headers.get('authorization')).toBe('[REDACTED]');
        if (mode === 'stripped') {
          expect(exported.text).not.toContain(SECRET);
          expect(exported.text).not.toContain('HAR request body');
          expect(response.content).not.toHaveProperty('text');
        } else expect(headers.get('cookie')).toContain(SECRET);
      }
      if (mode !== 'stripped') {
        expect(message).toMatchObject({ postData: { text: 'HAR request body' } });
        const exportedBody = Buffer.from(String(response.content.text),
          response.content.encoding === 'base64' ? 'base64' : 'utf8');
        expect(exportedBody).toEqual(Buffer.from('HAR response body'));
      }
      uiPrivacyHashes.push(exported.hash);
      await screenshotStep(`${mode}的实际隐私结果验证后返回Capture / Return to Capture after verifying the ${mode} export privacy result`, {
        highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu), label: '1' }],
      });
    }
    expect((await readHar(path.join(directory, 'ui-override.har'))).hash).toBe(uiPrivacyHashes[0]);
    await openPrivacy();
    for (const id of [privacy.maskAuthorization, privacy.maskCookies, privacy.warnUnmasked]) {
      await expect(getByAutomationId(page, id)).toHaveAttribute('aria-checked', 'false');
      await getByAutomationId(page, id).click();
      await expect(getByAutomationId(page, id)).toHaveAttribute('aria-checked', 'true');
    }
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.clearSearch).click();
    expect((await captureItems(client)).map(entry => String(entry.id)).sort()).toEqual([...beforeUiImportIds].sort());
    expect((await readHar(uiFile)).hash).toBe(uiHar.hash);
    await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.importHar)).toBeVisible();
    await screenshotStep('从Capture Import菜单选择HAR / Choose HAR from the Capture Import menu', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.importHar), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeEnabled();
    await screenshotStep('启动HAR Import，选择刚才GUI导出的四条记录文件 / Start HAR Import and choose the four-record file just exported through the GUI', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), uiFile);
    await expect.poll(async () => (await captureItems(client!)).length).toBe(8);
    const afterUiImport = await captureItems(client);
    const afterUiImportIds = afterUiImport.map(entry => String(entry.id));
    expect(new Set(afterUiImportIds).size).toBe(8);
    expect(beforeUiImportIds.every(id => afterUiImportIds.includes(id))).toBe(true);
    const uiImportedItems = afterUiImport.filter(entry => !beforeUiImportIds.includes(String(entry.id)));
    expect(uiImportedItems).toHaveLength(4);
    const uiImported = uiImportedItems[0];
    if (uiImported === undefined) throw new Error('IPC import did not create new Capture identities.');
    await expect(page.locator('[data-automation-id^="capture.request-row."]')).toHaveCount(8);
    for (const id of beforeUiImportIds) {
      await expect(getByAutomationId(page, AutomationIdFactory.captureRequestRow(id))).toBeVisible();
    }
    const firstImportedRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(String(uiImported.id)));
    await expect(firstImportedRow).toBeVisible();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.dialog)).toBeHidden();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    expect((await readHar(uiFile)).hash).toBe(uiHar.hash);
    await screenshotStep('同一GUI HAR追加四条到八条，原记录身份保留 / The same GUI HAR appends four records to eight while preserving the original identities', {
      highlights: [{ target: firstImportedRow, label: '1' }],
    });

    // 正文往返：逐条选择新记录检查两侧完整字节，不用旧记录的正文代替导入结果。
    // Body roundtrip: select each new record and verify both complete bodies instead of reusing an old record's content.
    const readCopiedText = async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    const uiImportedBodyChecks: Array<{ exchangeId: string; kind: 'text' | 'binary'; requestBytes: number; responseBytes: number; responseSha256: string }> = [];
    const picturedKinds = new Set<'text' | 'binary'>();
    for (const item of uiImportedItems) {
      const id = String(item.id);
      const importedRow = getByAutomationId(page, AutomationIdFactory.captureRequestRow(id));
      const rowText = await importedRow.textContent();
      const kind = rowText?.includes(`${SOURCE_PATH}text`) ? 'text' : 'binary';
      await expect(importedRow).toContainText(`${SOURCE_PATH}${kind}`);
      await importedRow.click();
      await expect(importedRow).toHaveAttribute('aria-pressed', 'true');
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('HAR request body');
      const copy = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
      await copy.click();
      await expect.poll(readCopiedText).toBe('HAR request body');
      if (!picturedKinds.has(kind)) {
        await screenshotStep(`导入${kind}记录的Request仍是16字节Text / The imported ${kind} record Request remains 16-byte Text`, {
          highlights: [{ target: copy, label: '1' }],
        });
      }
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      const responseBytes = kind === 'text' ? Buffer.from('HAR response body') : Buffer.from([0, 1, 127, 128, 254, 255]);
      if (kind === 'text') {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText('HAR response body');
        await copy.click();
        await expect.poll(readCopiedText).toBe('HAR response body');
      } else {
        await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex).click();
        await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView)).toContainText('00 01 7f 80 fe ff');
        await copy.click();
        await expect.poll(readCopiedText).toBe(`00000000  ${'00 01 7f 80 fe ff'.padEnd(47, ' ')}  ......`);
      }
      if (!picturedKinds.has(kind)) {
        await screenshotStep(`检查导入${kind}记录的完整Response并Copy / Inspect and copy the imported ${kind} record's complete Response`, {
          highlights: [{ target: copy, label: '1' }],
        });
        picturedKinds.add(kind);
      }
      uiImportedBodyChecks.push({
        exchangeId: id, kind, requestBytes: 16, responseBytes: responseBytes.length,
        responseSha256: createHash('sha256').update(responseBytes).digest('hex'),
      });
    }
    expect(uiImportedBodyChecks.filter(item => item.kind === 'text')).toHaveLength(2);
    expect(uiImportedBodyChecks.filter(item => item.kind === 'binary')).toHaveLength(2);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();

    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    const missingToolError = process.env.INTERCEPTOR_E2E_MCP_CLIENT === 'current-host'
      ? { code: -32603, message: expect.stringContaining('MCP tool not found') }
      : { code: -32602 };
    for (const name of TOOL_NAMES) {
      await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject(missingToolError);
    }
    await client.close();
    client = null;
    await screenshotStep('IPC原入口：从Capture菜单导出，再导入同流程文件；完成后由统一通知更新列表。 / Original IPC entry: export from Capture, import a file from this workflow, and refresh through the shared completion notice.');

    // 证据与重启：模型结果无文件信息或敏感头，保存文件hash，确认请求和导入导出不会跨代重放。
    // Evidence and restart: model results contain no file information or sensitive headers; retain file hashes and prove transfers never replay across generations.
    const fileNames = (await readdir(directory)).sort();
    expect(fileNames).toEqual([
      'complete.har', 'mcp.har', 'redacted.har', 'ui-filter.har', 'ui-override.har',
      'ui-plain.har', 'ui-selected.har', 'ui-stripped.har', 'ui.har',
    ]);
    for (const modelRequest of openAiCompatibleLab.requestsForAssertions()) {
      const text = JSON.stringify(modelRequest);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(directory.replaceAll('\\', '\\\\'));
      expect(text).not.toContain('HAR response body');
      for (const fileName of fileNames) expect(text).not.toContain(fileName);
    }
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = httpTrafficRunner.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const value of [PROMPT, ANSWER, SECRET, directory, configured.configuration.headers.Authorization.slice('Bearer '.length)]) relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    client = await connectMcpClient(configured.configuration, testInfo);
    expect(mcpValue(await client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId: fullJobId } }))).toEqual({ job: null });
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(httpTrafficRunner.evidence().length).toBe(originRequests);
    expect((await readdir(directory)).sort()).toEqual(fileNames);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('har');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('har-transfer.json');
    await writeFile(evidencePath, JSON.stringify({
      sourceCount: 2, firstImportCount: 2, appendedImportCount: 4, fullHarHash: fullHar.hash, redactedHarHash: redactedHar.hash,
      uiExportCount: 4, uiImportCount: 8, uiHarHash: uiHar.hash, sharedImportNotification: true,
      uiImportUsesUiExport: true, uiOriginalRecordsPreserved: true, uiImportedBodyChecks,
      allFilterSelectedScopes: true, nativeSaveOpenCancellation: true, fullBodiesVerified: true, redactionVerified: true,
      uiFilterCount: 2, uiSelectedCount: 1, uiPrivacyHashes, perExportOverridePreservesDefaults: true,
      uiBodyOptionsVerified: true, uiTransferDialogsClosed: true, sourceKeyword: SOURCE_PATH,
      independentRevocation: true, restartModelRequests: 0, restartOriginRequests: 0, restartFileOperations: 0,
    }, null, 2), 'utf8');
    await testInfo.attach('har-transfer.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：关闭MCP和Electron，验证完整宿主恢复后清理本流程文件，不把紧急退出冒充正常销毁。
    // Cleanup: close MCP and Electron, verify complete host recovery, then remove owned files; emergency shutdown never counts as graceful teardown.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (!workflowError && cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'HAR workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'HAR cleanup failed.');
});
