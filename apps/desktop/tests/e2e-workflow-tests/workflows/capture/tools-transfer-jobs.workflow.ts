import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/local-electron-driver';
import type { LoopbackLab } from '../../fixtures/loopback-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/openai-compatible-lab';
import { submitWindowsFileDialogPath } from '../../fixtures/windows-file-dialog';

const TOOL_NAMES = ['capture_get_transfer_job', 'capture_cancel_transfer_job'] as const;
const PROMPT = ['Inspect or cancel', 'the selected file transfer job.'].join(' ');
const ANSWER = ['The requested transfer', 'operation is complete.'].join(' ');
const BODY_BYTES = 128 * 1024 * 1024;

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
  throw new Error(`Missing Transfer job result: ${callId}`);
}

function mcpValue(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('MCP result omitted content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('MCP result omitted text.');
  return JSON.parse(content.text);
}

function publicJob(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.job)) throw new Error('Tool result omitted its job.');
  const job = value.job;
  expect(Object.keys(value)).toEqual(['job']);
  expect(typeof job.id).toBe('string');
  expect(['running', 'completed', 'failed', 'cancelled']).toContain(job.state);
  expect(typeof job.processed).toBe('number');
  expect(typeof job.total).toBe('number');
  expect(typeof job.warningCount).toBe('number');
  for (const field of ['fileName', 'filePath', 'message', 'warnings']) expect(job).not.toHaveProperty(field);
  return job;
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Transfer jobs lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('transfer-jobs'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('transfer-jobs-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function callAgent(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny',
): Promise<Record<string, unknown>> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: args });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return resultForCall(openAiCompatibleLab, callId);
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Transfer jobs MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const configuration = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: { url: string; headers: { Authorization: string } } } };
  const server = configuration.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(server.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'transfer-jobs', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
  return { client, clientId };
}

async function captureArchiveSource(desktopApp: LocalElectronApplicationDriver, loopbackLab: LoopbackLab, client: Client): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  const requestPath = '/e2e/transfer-jobs/large-source';
  loopbackLab.respondWith(requestPath, { headers: { 'content-type': 'application/octet-stream' }, body: randomBytes(BODY_BYTES) });
  const bytes = await new Promise<number>((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1', port: desktopApp.capturePort(), path: loopbackLab.url(requestPath),
      headers: { host: `127.0.0.1:${loopbackLab.port}`, connection: 'close' },
    }, (response) => {
      let received = 0;
      response.on('data', (chunk: Buffer) => { received += chunk.length; });
      response.once('error', reject);
      response.once('end', () => resolve(received));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
  expect(bytes).toBe(BODY_BYTES);
  await expect.poll(async () => {
    const value = mcpValue(await client.callTool({ name: 'capture_get_storage_status', arguments: {} }));
    return isRecord(value) ? Number(value.blobBytes) : 0;
  }, { timeout: 30_000 }).toBeGreaterThanOrEqual(BODY_BYTES);
}

async function startArchiveFromUi(desktopApp: LocalElectronApplicationDriver, destination: string): Promise<string> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.saveArchive).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), destination);
  await page.bringToFront();
  const progress = getByAutomationId(page, 'capture.transfer.progress');
  await expect(progress).toHaveAttribute('data-transfer-job-state', 'running');
  const jobId = await progress.getAttribute('data-transfer-job-id');
  if (!jobId) throw new Error('Product progress omitted jobId.');
  return jobId;
}

async function verifyCanceledArchive(page: Page, client: Client, jobId: string, directory: string): Promise<void> {
  await expect.poll(async () => publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId } }))).state).toBe('cancelled');
  await expect(getByAutomationId(page, 'capture.transfer.progress')).toHaveAttribute('data-transfer-job-state', 'cancelled');
  await expect.poll(async () => (await readdir(directory)).sort(), { timeout: 30_000 }).toEqual(['completed.jsonl']);
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close).click();
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  const errors = desktopApp.rendererPageErrors();
  try {
    if (!desktopApp.page.isClosed()) {
      const cancelTransfer = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.cancel);
      if (await cancelTransfer.isVisible()) await cancelTransfer.click();
      const closeTransfer = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.transfer.close);
      if (await closeTransfer.isVisible()) await closeTransfer.click();
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

test('capture.tools.transfer-jobs queries and cancels real file jobs without exposing paths', async ({ desktopApp, loopbackLab, openAiCompatibleLab }, testInfo) => {
  test.skip(process.platform !== 'win32', '原生文件Dialog目前在Windows验证。');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.tools.transfer-jobs' });
  for (const value of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(value);
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-transfer-jobs-'));
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：真实Settings配置Provider，正式discovery必须披露Get/Cancel两项。
    // Arrange and Red: configure the Provider through real Settings and require Get/Cancel in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    const discovery = await callAgent(page, openAiCompatibleLab, 'transfer-discover', 'discover_tools', { capabilityId: 'capture' });
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name)).toBe(true);

    // 真实完成任务：MCP调用正式Diagnostics Export，原生Save产生文件；Get取得同一Core任务的终态。
    // Real completed job: MCP invokes the product Diagnostics export, native Save creates the file, and Get observes its Core-owned terminal state.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const configuredClient = await createMcpClient(desktopApp);
    client = configuredClient.client;
    const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
    const exporting = client.callTool({ name: 'diagnostics_export', arguments: { process: 'core' } });
    await expect(approval).toHaveAttribute('data-tool-name', 'diagnostics_export');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    const completedFile = path.join(directory, 'completed.jsonl');
    await submitWindowsFileDialogPath(desktopApp.windowsMainProcessOwner(), completedFile);
    await page.bringToFront();
    const exportResult = mcpValue(await exporting);
    if (!isRecord(exportResult) || !isRecord(exportResult.job) || typeof exportResult.job.id !== 'string') throw new Error('Diagnostics export omitted its job identity.');
    const completedJobId = exportResult.job.id;
    await expect.poll(async () => publicJob(mcpValue(await client!.callTool({ name: TOOL_NAMES[0], arguments: { jobId: completedJobId } }))).state).toBe('completed');
    const completed = publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId: completedJobId } })));
    const fileHash = createHash('sha256').update(await readFile(completedFile)).digest('hex');

    // Agent边界：查询无需审批，Deny不更改任务，Allow与Auto对终态取消幂等，未知任务保持null。
    // Agent boundaries: Get needs no approval; Deny changes nothing, Allow/Auto cancellation is idempotent for terminal jobs, and unknown jobs stay null.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    const queried = await callAgent(page, openAiCompatibleLab, 'transfer-query', TOOL_NAMES[0], { jobId: completedJobId });
    expect(queried).toEqual({ ok: true, value: { job: completed } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('transfer-query'))).toHaveAttribute('data-summary-kind', 'transferJob');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('transfer-query'))).toHaveAttribute('data-transfer-job-id', completedJobId);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('transfer-query'))).toHaveAttribute('data-transfer-job-state', 'completed');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('transfer-query'))).toHaveCount(0);
    expect(await callAgent(page, openAiCompatibleLab, 'transfer-deny', TOOL_NAMES[1], { jobId: completedJobId }, 'deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    expect(await callAgent(page, openAiCompatibleLab, 'transfer-allow', TOOL_NAMES[1], { jobId: completedJobId }, 'allow')).toEqual({ ok: true, value: { job: completed } });
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    expect(await callAgent(page, openAiCompatibleLab, 'transfer-auto', TOOL_NAMES[1], { jobId: completedJobId })).toEqual({ ok: true, value: { job: completed } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('transfer-auto'))).toHaveAttribute('data-summary-kind', 'transferJob');
    expect(await callAgent(page, openAiCompatibleLab, 'transfer-missing', TOOL_NAMES[0], { jobId: `missing-${completedJobId}` })).toEqual({ ok: true, value: { job: null } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('transfer-missing'))).toHaveAttribute('data-summary-kind', 'transferJobMissing');
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();

    // 运行中取消：真实大响应经代理录制，由UI导出Archive；MCP Ask先Deny再Allow，只取消目标并清理文件。
    // Active cancellation: capture a real large response through the proxy and export an Archive through UI; MCP Ask first denies then allows cancellation and verifies target-only cleanup.
    await captureArchiveSource(desktopApp, loopbackLab, client);
    const archiveJobId = await startArchiveFromUi(desktopApp, path.join(directory, 'cancel-ask.iarchive'));
    expect(publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId: archiveJobId } })))).toMatchObject({ state: 'running', kind: 'archive-export' });
    const denied = client.callTool({ name: TOOL_NAMES[1], arguments: { jobId: archiveJobId } });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[1]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(denied).resolves.toMatchObject({ isError: true });
    expect(publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId: archiveJobId } })))).toMatchObject({ state: 'running' });
    const canceled = client.callTool({ name: TOOL_NAMES[1], arguments: { jobId: archiveJobId } });
    await expect(approval).toHaveAttribute('data-tool-name', TOOL_NAMES[1]);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    expect(publicJob(mcpValue(await canceled))).toMatchObject({ state: 'cancelled', id: archiveJobId });
    await verifyCanceledArchive(page, client, archiveJobId, directory);

    // Auto与隔离：第二个真实Archive使用Auto取消，已完成文件/任务不变，未留下临时输出或后台worker。
    // Auto and isolation: cancel a second real Archive in Auto mode, keeping the completed job/file unchanged and leaving no temporary output or background worker.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(configuredClient.clientId)).click();
    const automaticJobId = await startArchiveFromUi(desktopApp, path.join(directory, 'cancel-auto.iarchive'));
    expect(publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[1], arguments: { jobId: automaticJobId } })))).toMatchObject({ id: automaticJobId, state: 'cancelled' });
    await expect(approval).toHaveCount(0);
    await verifyCanceledArchive(page, client, automaticJobId, directory);
    expect(publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId: completedJobId } })))).toEqual(completed);
    expect(createHash('sha256').update(await readFile(completedFile)).digest('hex')).toBe(fileHash);

    // 独立撤权：Agent与MCP各自关闭两项，旧Chat和旧连接均拒绝后续调用而不产生文件操作。
    // Independent revocation: disable both Tools separately for Agent and MCP; existing chats/connections reject later calls without file operations.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('transfer_job');
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const [index, name] of TOOL_NAMES.entries()) {
      expect(await callAgent(page, openAiCompatibleLab, `transfer-disabled-${index}`, name, { jobId: completedJobId })).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    expect(publicJob(mcpValue(await client.callTool({ name: TOOL_NAMES[0], arguments: { jobId: completedJobId } })))).toEqual(completed);
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => (TOOL_NAMES as readonly string[]).includes(tool.name)).length).toBe(0);
    for (const name of TOOL_NAMES) await expect(client.callTool({ name, arguments: { jobId: completedJobId } })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;

    // 重启与证据：状态仅保留授权，旧Core任务不复活，Model/流量/文件无重放；归档计数、状态和hash。
    // Restart and evidence: permissions persist but old Core jobs do not return; Model, traffic and files never replay, and artifacts retain counts, states and hashes only.
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = loopbackLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const value of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(loopbackLab.evidence().length).toBe(originRequests);
    expect((await readdir(directory)).sort()).toEqual(['completed.jsonl']);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('transfer_job');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    await getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(TOOL_NAMES[0])).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await callAgent(relaunchedApp.page, openAiCompatibleLab, 'transfer-restart-discover', 'discover_tools', { capabilityId: 'capture' });
    expect(await callAgent(relaunchedApp.page, openAiCompatibleLab, 'transfer-old-generation', TOOL_NAMES[0], { jobId: completedJobId })).toEqual({ ok: true, value: { job: null } });
    const evidencePath = testInfo.outputPath('transfer-jobs.json');
    await writeFile(evidencePath, JSON.stringify({
      capturedBytes: BODY_BYTES, completedFileHash: fileHash, activeArchivesCanceled: 2,
      getWithoutApproval: true, terminalCancelIdempotent: true, unknownJobNull: true,
      nativeSaveVerified: true, mcpAskAutoVerified: true, otherJobUnchanged: true, temporaryOutputsRemoved: true,
      independentRevocation: true, restartModelRequests: 0, restartOriginRequests: 0, oldGenerationJobNull: true,
    }, null, 2), 'utf8');
    await testInfo.attach('transfer-jobs.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：关闭外部Client，再验证Electron/Core/Worker与宿主恢复，最后清理产品自产文件。
    // Teardown: close external clients, verify Electron/Core/Worker and host restoration, then remove product-generated files.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Transfer jobs and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Transfer job cleanup failed.');
});