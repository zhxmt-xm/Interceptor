import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cancelFileDialog, submitFileDialogPath } from '../../fixtures/ui/file-dialog';

const TOOL_NAME = 'capture_export_body';
const PROMPT = ['Export only', 'the selected captured body.'].join(' ');
const ANSWER = ['The selected body', 'export request is settled.'].join(' ');
const SECRET = ['body-export-', 'private-authorization'].join('');

interface BodyProof {
  readonly bodyId: string;
  readonly bytes: number;
  readonly hash: string;
}

interface CapturedSource {
  readonly exchangeId: string;
  readonly request: BodyProof;
  readonly response: BodyProof;
  readonly url: string;
}

interface McpConfiguration {
  readonly url: string;
  readonly headers: { readonly Authorization: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(lab: OpenAiCompatibleLab, callId: string): Record<string, unknown> {
  for (const modelRequest of [...lab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(modelRequest.messages)) continue;
    const message = modelRequest.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing body export result: ${callId}`);
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

async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Body export lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(lab.baseUrl('body-export'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('body-export-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function beginAgentCall(
  page: Page,
  lab: OpenAiCompatibleLab,
  callId: string,
  name: string,
  args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny',
): Promise<void> {
  lab.enqueueToolCall({ callId, name, arguments: args });
  lab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    const approval = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
    await expect(approval).toHaveAttribute('data-approval-status', 'pending');
    expect(await approval.textContent()).not.toContain(SECRET);
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
}

async function finishAgentCall(page: Page, lab: OpenAiCompatibleLab, callId: string): Promise<Record<string, unknown>> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return resultForCall(lab, callId);
}

async function connectMcpClient(configuration: McpConfiguration): Promise<Client> {
  const client = new Client({ name: 'body-export', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } }));
  return client;
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{
  client: Client;
  clientId: string;
  configuration: McpConfiguration;
}> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Body export MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('MCP Client omitted identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: McpConfiguration } };
  const configuration = copied.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
  return { client: await connectMcpClient(configuration), clientId, configuration };
}

function bodyProof(detail: Record<string, unknown>, side: 'requestBody' | 'responseBody', bytes: Buffer): BodyProof {
  const body = detail[side];
  if (!isRecord(body) || typeof body.bodyHash !== 'string') throw new Error('Captured body omitted its identity.');
  expect(body.encodedSize).toBe(bytes.length);
  return { bodyId: body.bodyHash, bytes: bytes.length, hash: createHash('sha256').update(bytes).digest('hex') };
}

async function captureSource(
  desktopApp: LocalElectronApplicationDriver,
  lab: HttpTrafficRunner,
  client: Client,
  requestPath: string,
  requestBytes: Buffer,
  responseBytes: Buffer,
  encoding?: string,
): Promise<CapturedSource> {
  lab.respondWith(requestPath, {
    headers: {
      'content-type': 'application/octet-stream', 'content-length': String(responseBytes.length),
      ...(encoding === undefined ? {} : { 'content-encoding': encoding }),
    },
    body: responseBytes,
  });
  const url = lab.url(requestPath);
  const received = await new Promise<Buffer>((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1', port: desktopApp.capturePort(), method: 'POST', path: url,
      headers: {
        host: `127.0.0.1:${lab.port}`, connection: 'close', authorization: `Bearer ${SECRET}`,
        'content-type': 'application/octet-stream', 'content-length': String(requestBytes.length),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve(Buffer.concat(chunks)));
    });
    outgoing.once('error', reject);
    outgoing.setTimeout(30_000, () => outgoing.destroy(new Error('Body source request timed out.')));
    outgoing.end(requestBytes);
  });
  expect(received.equals(responseBytes)).toBe(true);
  const row = getByAutomationIdPrefix(desktopApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath }).last();
  await expect(row).toBeVisible();
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) throw new Error('Capture row omitted identity.');
  const exchangeId = automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
  let detail: Record<string, unknown> | undefined;
  await expect.poll(async () => {
    const value = mcpValue(await client.callTool({ name: 'capture_get_exchange', arguments: { exchangeId } }));
    detail = isRecord(value.detail) ? value.detail : undefined;
    return isRecord(detail?.responseBody) ? detail.responseBody.encodedSize : 0;
  }).toBe(responseBytes.length);
  if (!detail) throw new Error('Capture detail was not available.');
  return {
    exchangeId, url,
    request: bodyProof(detail, 'requestBody', requestBytes),
    response: bodyProof(detail, 'responseBody', responseBytes),
  };
}

function startedJob(value: unknown): string {
  if (!isRecord(value) || value.started !== true || !isRecord(value.job)) throw new Error('Body export omitted its public job.');
  expect(Object.keys(value).sort()).toEqual(['job', 'started']);
  const job = value.job;
  expect(job.kind).toBe('body-export');
  expect(['running', 'completed']).toContain(job.state);
  expect(typeof job.id).toBe('string');
  expect(typeof job.warningCount).toBe('number');
  for (const field of ['filePath', 'fileName', 'message', 'warnings']) expect(job).not.toHaveProperty(field);
  return job.id as string;
}

async function verifyExport(client: Client, jobId: string, destination: string, proof: BodyProof): Promise<void> {
  await expect.poll(async () => {
    const value = mcpValue(await client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId } }));
    return isRecord(value.job) ? value.job.state : null;
  }).toBe('completed');
  const bytes = await readFile(destination);
  expect(bytes.length).toBe(proof.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(proof.hash);
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

test('capture.tools.body-export saves captured bytes through native Agent and MCP flows', async ({ desktopApp, httpTrafficRunner, openAiCompatibleLab }, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native Save workflow requires Windows or macOS.');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.tools.body-export' });
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-body-export-'));
  for (const value of [PROMPT, ANSWER, SECRET, directory]) desktopApp.registerSensitiveTextForEvidenceAudit(value);
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：经真实Settings创建Provider，正式discovery必须披露Body导出Tool。
    // Arrange and Red: create a Provider through real Settings and require the body export Tool in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    await beginAgentCall(page, openAiCompatibleLab, 'body-discover', 'discover_tools', { capabilityId: 'capture' });
    const discovery = await finishAgentCall(page, openAiCompatibleLab, 'body-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === TOOL_NAME), 'Body export must be available in Capture discovery').toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const configured = await createMcpClient(desktopApp);
    client = configured.client;
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(TOOL_NAME);

    // 自产正文：通过真实代理录制大gzip响应、请求正文和独立Exchange，再从正式Tool读取正文身份。
    // Product-owned bodies: capture a large gzip response, a request body, and another exchange through the real proxy, then read identities through a formal Tool.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const encodedBody = gzipSync(randomBytes(2 * 1024 * 1024));
    const source = await captureSource(desktopApp, httpTrafficRunner, client, '/e2e/body-export/encoded', randomBytes(256), encodedBody, 'gzip');
    const otherSource = await captureSource(desktopApp, httpTrafficRunner, client, '/e2e/body-export/other', randomBytes(64), randomBytes(32 * 1024));
    const responseArgs = { exchangeId: source.exchangeId, bodyId: source.response.bodyId };
    const requestArgs = { exchangeId: source.exchangeId, bodyId: source.request.bodyId };
    const otherArgs = { exchangeId: otherSource.exchangeId, bodyId: otherSource.response.bodyId };
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();

    // Agent Ask：Deny不产生文件，原生Cancel无任务，Allow保存完整编码正文并只展示安全摘要。
    // Agent Ask: Deny creates no file, native Cancel creates no job, and Allow saves the complete encoded body with only a safe summary.
    await beginAgentCall(page, openAiCompatibleLab, 'body-deny', TOOL_NAME, responseArgs, 'deny');
    expect(await finishAgentCall(page, openAiCompatibleLab, 'body-deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
    expect(await readdir(directory)).toEqual([]);
    await beginAgentCall(page, openAiCompatibleLab, 'body-native-cancel', TOOL_NAME, responseArgs, 'allow');
    await cancelFileDialog(desktopApp.nativeFileDialogOwner());
    await page.bringToFront();
    expect(await finishAgentCall(page, openAiCompatibleLab, 'body-native-cancel')).toEqual({ ok: true, value: { started: false } });
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('body-native-cancel'))).toHaveAttribute('data-summary-kind', 'exportCanceled');
    expect(await readdir(directory)).toEqual([]);
    const agentResponseFile = path.join(directory, 'agent-response.bin');
    await beginAgentCall(page, openAiCompatibleLab, 'body-allow', TOOL_NAME, responseArgs, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), agentResponseFile);
    await page.bringToFront();
    const responseJobId = startedJob((await finishAgentCall(page, openAiCompatibleLab, 'body-allow')).value);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('body-allow'))).toHaveAttribute('data-summary-kind', 'transferJob');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('body-allow'))).toHaveAttribute('data-transfer-job-id', responseJobId);
    await verifyExport(client, responseJobId, agentResponseFile, source.response);

    // Agent Auto：无审批但仍经原生Save，另一侧请求正文保持原始字节，不读取有限预览冒充导出。
    // Agent Auto: native Save is still required without approval, and the request-side body preserves its original bytes rather than a limited preview.
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    const agentRequestFile = path.join(directory, 'agent-request.bin');
    await beginAgentCall(page, openAiCompatibleLab, 'body-auto', TOOL_NAME, requestArgs);
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), agentRequestFile);
    await page.bringToFront();
    const requestJobId = startedJob((await finishAgentCall(page, openAiCompatibleLab, 'body-auto')).value);
    await verifyExport(client, requestJobId, agentRequestFile, source.request);
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval('body-auto'))).toHaveCount(0);

    // 独立授权与MCP Auto：Agent撤权立即生效，MCP仍能经真实Cancel和Save操作另一正文。
    // Independent permissions and MCP Auto: Agent revocation takes effect immediately while MCP still uses real Cancel and Save for another body.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill(TOOL_NAME);
    await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(TOOL_NAME)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(TOOL_NAME))).toHaveAttribute('aria-checked', 'true');
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await beginAgentCall(page, openAiCompatibleLab, 'body-disabled', TOOL_NAME, responseArgs);
    expect(await finishAgentCall(page, openAiCompatibleLab, 'body-disabled')).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(configured.clientId)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(configured.clientId)))
      .toHaveAttribute('data-execution-mode', 'auto');
    const [canceled] = await Promise.all([
      client.callTool({ name: TOOL_NAME, arguments: otherArgs }),
      cancelFileDialog(desktopApp.nativeFileDialogOwner()),
    ]);
    await page.bringToFront();
    expect(mcpValue(canceled)).toEqual({ started: false });
    const mcpFile = path.join(directory, 'mcp-response.bin');
    const [exporting] = await Promise.all([
      client.callTool({ name: TOOL_NAME, arguments: otherArgs }),
      submitFileDialogPath(desktopApp.nativeFileDialogOwner(), mcpFile),
    ]);
    await page.bringToFront();
    const mcpJobId = startedJob(mcpValue(exporting));
    await verifyExport(client, mcpJobId, mcpFile, otherSource.response);
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);

    // 原入口与身份隔离：Capture保存按钮仍可用，错配正文或Clear后的旧身份均不得启动文件任务。
    // Original entry and identity isolation: the Capture save button still works, while mismatched bodies or identities invalidated by Clear cannot start file jobs.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AutomationIdFactory.captureRequestRow(source.exchangeId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    const uiFile = path.join(directory, 'ui-response.bin');
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), uiFile);
    await page.bringToFront();
    await expect.poll(async () => {
      try { return createHash('sha256').update(await readFile(uiFile)).digest('hex'); } catch { return null; }
    }).toBe(source.response.hash);
    await expect(client.callTool({ name: TOOL_NAME, arguments: { exchangeId: source.exchangeId, bodyId: otherSource.response.bodyId } }))
      .resolves.toMatchObject({ isError: true });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(configured.clientId)).click();
    const clearResult = await client.callTool({ name: 'capture_clear', arguments: {} });
    expect(mcpValue(clearResult)).toBeDefined();
    await expect(client.callTool({ name: TOOL_NAME, arguments: responseArgs })).resolves.toMatchObject({ isError: true });
    await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(TOOL_NAME)).click();
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain(TOOL_NAME);
    await expect(client.callTool({ name: TOOL_NAME, arguments: otherArgs })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;

    // 脱敏与重启：仅保存长度/hash，模型无正文与文件信息，两代之间不重放请求、任务或保存文件。
    // Redaction and restart: retain only lengths and hashes, keep body and file information out of the model, and never replay requests, jobs, or file saves across generations.
    const fileNames = (await readdir(directory)).sort();
    expect(fileNames).toEqual(['agent-request.bin', 'agent-response.bin', 'mcp-response.bin', 'ui-response.bin']);
    for (const modelRequest of openAiCompatibleLab.requestsForAssertions()) {
      const text = JSON.stringify(modelRequest);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(directory.replaceAll('\\', '\\\\'));
      expect(text).not.toContain(encodedBody.subarray(0, 64).toString('base64'));
      for (const fileName of fileNames) expect(text).not.toContain(fileName);
    }
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = httpTrafficRunner.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const value of [PROMPT, ANSWER, SECRET, directory, configured.configuration.headers.Authorization.slice('Bearer '.length)]) {
      relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
    }
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    client = await connectMcpClient(configured.configuration);
    expect(mcpValue(await client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId: responseJobId } }))).toEqual({ job: null });
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(httpTrafficRunner.evidence().length).toBe(originRequests);
    expect((await readdir(directory)).sort()).toEqual(fileNames);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill(TOOL_NAME);
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(TOOL_NAME))).toHaveAttribute('aria-checked', 'false');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(TOOL_NAME))).toHaveAttribute('aria-checked', 'false');
    const evidencePath = testInfo.outputPath('body-export.json');
    await writeFile(evidencePath, JSON.stringify({
      response: { bytes: source.response.bytes, hash: source.response.hash },
      request: { bytes: source.request.bytes, hash: source.request.hash },
      otherResponse: { bytes: otherSource.response.bytes, hash: otherSource.response.hash },
      nativeCancelVerified: true, encodedBytesPreserved: true, existingUiSaveVerified: true,
      mismatchedBodyRejected: true, clearedBodyRejected: true, independentRevocation: true,
      exportCount: fileNames.length, restartModelRequests: 0, restartOriginRequests: 0, restartFileOperations: 0,
    }, null, 2), 'utf8');
    await testInfo.attach('body-export.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：先关闭MCP与两代应用并验证宿主恢复，再删除本流程输出，不把强制清理记为通过。
    // Teardown: close MCP and both application generations, verify host recovery, and then remove owned outputs; forced cleanup never counts as acceptance.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Body export workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Body export cleanup failed.');
});