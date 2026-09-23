import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { HttpTrafficRunner, WebSocketTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { cancelFileDialog, submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { automaticallyExecuteMcpClientTools } from '../../fixtures/ui/settings-workflow';

const TOOL_NAMES = ['capture_export_archive', 'capture_import_archive'] as const;
const PROMPT = ['Perform the selected', 'Archive transfer operation.'].join(' ');
const ANSWER = ['The Archive transfer', 'request is settled.'].join(' ');
const SECRET = ['archive-roundtrip-', 'private-credential'].join('');
const REQUEST_BODY = ['archive-', 'request-payload'].join('');
const RESPONSE_BODY = ['archive-', 'response-payload'].join('');
const WEBSOCKET_BODY = ['archive-', 'websocket-payload'].join('');
const SOURCE_PATH = '/e2e/archive-tools/';

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
  throw new Error(`Missing Archive Tool result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Archive transfer lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('archive-transfer'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('archive-transfer-model');
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

async function connectMcpClient(configuration: McpConfiguration): Promise<Client> {
  const client = new Client({ name: 'archive-transfer', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } }));
  return client;
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver): Promise<{ client: Client; clientId: string; configuration: McpConfiguration }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Archive transfer MCP');
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
  return { client: await connectMcpClient(configuration), clientId, configuration };
}

async function captureSources(desktopApp: LocalElectronApplicationDriver, httpTrafficRunner: HttpTrafficRunner, webSocketTrafficRunner: WebSocketTrafficRunner): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  httpTrafficRunner.respondWith(`${SOURCE_PATH}http`, {
    statusCode: 200,
    headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(RESPONSE_BODY)), 'set-cookie': `session=${SECRET}` },
    body: RESPONSE_BODY,
  });
  const result = await new Promise<Buffer>((resolve, reject) => {
    const outgoing = request({
      hostname: '127.0.0.1', port: desktopApp.capturePort(), path: httpTrafficRunner.url(`${SOURCE_PATH}http`), method: 'POST',
      headers: { host: `127.0.0.1:${httpTrafficRunner.port}`, connection: 'close', authorization: `Bearer ${SECRET}`, cookie: `session=${SECRET}`, 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(REQUEST_BODY)) },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve(Buffer.concat(chunks)));
    });
    outgoing.once('error', reject);
    outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('Archive source request timed out.')));
    outgoing.end(REQUEST_BODY);
  });
  expect(result.toString('utf8')).toBe(RESPONSE_BODY);
  const webSocketClient = await webSocketTrafficRunner.openThroughProxy(desktopApp.capturePort(), `${SOURCE_PATH}websocket`);
  const received = once(webSocketClient, 'message');
  webSocketClient.sendText(WEBSOCKET_BODY);
  const [echo] = await received as [Buffer];
  expect(echo.toString('utf8')).toBe(WEBSOCKET_BODY);
  await webSocketClient.closeGracefully(1000, 'archive-complete');
}

async function captureItems(client: Client): Promise<Record<string, unknown>[]> {
  const value = mcpValue(await test.step('MCP capture_list_exchanges', () =>
    client.callTool({ name: 'capture_list_exchanges', arguments: { search: SOURCE_PATH, limit: 100 } })));
  if (!Array.isArray(value.items) || !value.items.every(isRecord)) throw new Error('Capture omitted query items.');
  return value.items;
}

async function verifyCapturedData(page: Page, client: Client, items: Record<string, unknown>[]): Promise<void> {
  const httpExchange = items.find((entry) => String(entry.path).endsWith('/http'));
  const webSocketExchange = items.find((entry) => String(entry.path).endsWith('/websocket'));
  if (!httpExchange || !webSocketExchange) throw new Error('Archive round trip omitted a protocol.');
  const httpId = String(httpExchange.id);
  const webSocketId = String(webSocketExchange.id);
  const result = mcpValue(await client.callTool({ name: 'capture_get_exchange', arguments: { exchangeId: httpId } }));
  if (!isRecord(result.detail)) throw new Error('Archive round trip omitted HTTP detail.');
  for (const [field, expectedBody] of [['requestBody', REQUEST_BODY], ['responseBody', RESPONSE_BODY]] as const) {
    const reference = result.detail[field];
    if (!isRecord(reference)) throw new Error('Archive round trip omitted a body.');
    expect(reference.encodedSize).toBe(Buffer.byteLength(expectedBody));
    const body = mcpValue(await client.callTool({ name: 'capture_get_exchange_body', arguments: { exchangeId: httpId, bodyId: reference.bodyHash } }));
    expect(body).toMatchObject({ text: expectedBody, bytesRead: Buffer.byteLength(expectedBody), truncated: false });
  }
  const frames = mcpValue(await client.callTool({ name: 'capture_list_websocket_messages', arguments: { exchangeId: webSocketId } }));
  expect(frames.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ direction: 'client-to-server', opcode: 1, payloadSize: Buffer.byteLength(WEBSOCKET_BODY) }),
    expect.objectContaining({ direction: 'server-to-client', opcode: 1, payloadSize: Buffer.byteLength(WEBSOCKET_BODY) }),
  ]));
  await getByAutomationId(page, AutomationIdFactory.captureRequestRow(httpId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(RESPONSE_BODY);
  await getByAutomationId(page, AutomationIdFactory.captureRequestRow(webSocketId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.messages).click();
  const frameRows = page.locator(`[data-automation-id^="capture.websocket.frame.${webSocketId}."]`);
  await expect(frameRows).toHaveCount(2);
  await frameRows.first().click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll)).toContainText(WEBSOCKET_BODY);
}

function startedJob(value: unknown, kind: 'archive-export' | 'archive-import'): string {
  if (!isRecord(value) || value.started !== true || !isRecord(value.job)) throw new Error('Archive transfer omitted its public job.');
  expect(Object.keys(value).sort()).toEqual(['job', 'started']);
  expect(value.job.kind).toBe(kind);
  expect(typeof value.job.id).toBe('string');
  expect(typeof value.job.warningCount).toBe('number');
  for (const field of ['fileName', 'filePath', 'message', 'warnings']) expect(value.job).not.toHaveProperty(field);
  return value.job.id as string;
}

async function waitForCompletedJob(client: Client, jobId: string): Promise<void> {
  await expect.poll(async () => {
    const value = mcpValue(await test.step('MCP capture_get_transfer_job', () =>
      client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId } })));
    return isRecord(value.job) ? value.job.state : null;
  }).toBe('completed');
}

async function readArchiveHash(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  expect(bytes.length).toBeGreaterThan(256);
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  return createHash('sha256').update(bytes).digest('hex');
}

async function mcpNativeCall(desktopApp: LocalElectronApplicationDriver, client: Client, name: string, filePath: string | null, mode: 'ask' | 'auto'): Promise<Record<string, unknown>> {
  const [result] = await Promise.all([
    test.step(`MCP ${name}: ${mode}, native ${filePath === null ? 'cancel' : 'confirm'}`, () =>
      client.callTool({ name, arguments: {} })),
    test.step(`Native dialog for ${name}`, async () => {
      if (mode === 'ask') {
        await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', name);
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
      }
      if (filePath === null) await cancelFileDialog(desktopApp.nativeFileDialogOwner());
      else await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
    }),
  ]);
  await desktopApp.page.bringToFront();
  return mcpValue(result);
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
    await test.step('Normal application Quit', () => desktopApp.closeGracefully());
    await desktopApp.writeEvidence(testInfo);
    expect(errors).toEqual([]);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('capture.tools.archive-transfer exports and imports native archives through Agent and MCP', async ({ desktopApp, httpTrafficRunner, webSocketTrafficRunner, openAiCompatibleLab }, testInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native Archive workflow requires Windows or macOS.');
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.tools.archive-transfer' });
  const { page } = desktopApp;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-archive-tools-'));
  const sensitive = [PROMPT, ANSWER, SECRET, REQUEST_BODY, RESPONSE_BODY, WEBSOCKET_BODY, directory];
  for (const value of sensitive) desktopApp.registerSensitiveTextForEvidenceAudit(value);
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    // 准备与Red：通过真实Settings配置Provider，由正式discovery确认两项Archive Tool。
    // Arrange and Red: configure a Provider through real Settings and require both Archive Tools in formal discovery.
    await configureProvider(page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
    await beginAgentCall(page, openAiCompatibleLab, 'archive-discover', 'discover_tools', { capabilityId: 'capture' });
    const discovery = await finishAgentCall(page, openAiCompatibleLab, 'archive-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    for (const name of TOOL_NAMES) expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name), `Archive Tool must be discoverable: ${name}`).toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    const configured = await createMcpClient(desktopApp);
    client = configured.client;
    await captureSources(desktopApp, httpTrafficRunner, webSocketTrafficRunner);
    await expect.poll(async () => (await captureItems(client!)).length).toBe(2);
    const originalItems = await captureItems(client);
    await verifyCapturedData(page, client, originalItems);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();

    // Agent：两项Deny和原生Cancel不产生文件任务，Allow与Auto仍使用真实Save/Open。
    // Agent: denial and native cancellation create no file job; Allow and Auto retain the real Save/Open dialogs.
    for (const name of TOOL_NAMES) {
      await beginAgentCall(page, openAiCompatibleLab, `deny-${name}`, name, {}, 'deny');
      expect(await finishAgentCall(page, openAiCompatibleLab, `deny-${name}`)).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
      await beginAgentCall(page, openAiCompatibleLab, `cancel-${name}`, name, {}, 'allow');
      await cancelFileDialog(desktopApp.nativeFileDialogOwner());
      await page.bringToFront();
      expect(await finishAgentCall(page, openAiCompatibleLab, `cancel-${name}`)).toEqual({ ok: true, value: { started: false } });
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult(`cancel-${name}`)))
        .toHaveAttribute('data-summary-kind', name === TOOL_NAMES[0] ? 'exportCanceled' : 'importCanceled');
    }
    expect(await readdir(directory)).toEqual([]);
    const completeFile = path.join(directory, 'complete.iarchive');
    await beginAgentCall(page, openAiCompatibleLab, 'archive-export-allow', TOOL_NAMES[0], {}, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    await page.bringToFront();
    const fullJobId = startedJob((await finishAgentCall(page, openAiCompatibleLab, 'archive-export-allow')).value, 'archive-export');
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult('archive-export-allow'))).toHaveAttribute('data-summary-kind', 'transferJob');
    await waitForCompletedJob(client, fullJobId);
    const completeHash = await readArchiveHash(completeFile);
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    const agentAutoFile = path.join(directory, 'agent-auto.iarchive');
    await beginAgentCall(page, openAiCompatibleLab, 'archive-export-auto', TOOL_NAMES[0], {});
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), agentAutoFile);
    await page.bringToFront();
    await waitForCompletedJob(client, startedJob((await finishAgentCall(page, openAiCompatibleLab, 'archive-export-auto')).value, 'archive-export'));
    await readArchiveHash(agentAutoFile);

    // 原生往返：经产品UI Clear后导入同流程归档，核对新身份、完整正文和WebSocket消息。
    // Native round trip: clear through product UI, import the owned archive and verify new identities, complete bodies and WebSocket messages.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
    await expect.poll(async () => (await captureItems(client!)).length).toBe(0);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.ask).click();
    await beginAgentCall(page, openAiCompatibleLab, 'archive-import-allow', TOOL_NAMES[1], {}, 'allow');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    await page.bringToFront();
    await waitForCompletedJob(client, startedJob((await finishAgentCall(page, openAiCompatibleLab, 'archive-import-allow')).value, 'archive-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(2);
    const firstImported = await captureItems(client);
    expect(firstImported.every((entry) => !originalItems.some((original) => original.id === entry.id))).toBe(true);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await verifyCapturedData(page, client, firstImported);
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await beginAgentCall(page, openAiCompatibleLab, 'archive-import-auto', TOOL_NAMES[1], {});
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    await page.bringToFront();
    await waitForCompletedJob(client, startedJob((await finishAgentCall(page, openAiCompatibleLab, 'archive-import-auto')).value, 'archive-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(4);

    // 双列授权与MCP：关闭Agent后，MCP独立验证Ask拒绝/允许、原生取消、Auto与追加导入。
    // Independent permissions and MCP: revoke Agent access, then verify MCP Ask decisions, native cancellation, Auto and append-only imports.
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('archive');
    for (const name of TOOL_NAMES) {
      await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'true');
    }
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const name of TOOL_NAMES) {
      await beginAgentCall(page, openAiCompatibleLab, `disabled-${name}`, name, {});
      expect(await finishAgentCall(page, openAiCompatibleLab, `disabled-${name}`)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(page, AutomationIdFactory.mcpClientAsk(configured.clientId)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(configured.clientId))).toHaveAttribute('data-execution-mode', 'ask');
    for (const name of TOOL_NAMES) {
      const [denied] = await Promise.all([
        test.step(`MCP ${name}: deny`, () => client!.callTool({ name, arguments: {} })),
        (async () => {
          await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', name);
          await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
        })(),
      ]);
      expect(denied).toMatchObject({ isError: true });
      expect(await mcpNativeCall(desktopApp, client, name, null, 'ask')).toEqual({ started: false });
    }
    expect(await readdir(directory)).toHaveLength(2);
    expect(await captureItems(client)).toHaveLength(4);
    const mcpAskFile = path.join(directory, 'mcp-ask.iarchive');
    await waitForCompletedJob(client, startedJob(await mcpNativeCall(desktopApp, client, TOOL_NAMES[0], mcpAskFile, 'ask'), 'archive-export'));
    await readArchiveHash(mcpAskFile);
    await waitForCompletedJob(client, startedJob(await mcpNativeCall(desktopApp, client, TOOL_NAMES[1], completeFile, 'ask'), 'archive-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(6);
    await automaticallyExecuteMcpClientTools(page, configured.clientId);
    await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(configured.clientId))).toHaveAttribute('data-execution-mode', 'auto');
    const mcpAutoFile = path.join(directory, 'mcp-auto.iarchive');
    await waitForCompletedJob(client, startedJob(await mcpNativeCall(desktopApp, client, TOOL_NAMES[0], mcpAutoFile, 'auto'), 'archive-export'));
    await readArchiveHash(mcpAutoFile);
    await waitForCompletedJob(client, startedJob(await mcpNativeCall(desktopApp, client, TOOL_NAMES[1], completeFile, 'auto'), 'archive-import'));
    await expect.poll(async () => (await captureItems(client!)).length).toBe(8);
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);

    // 原IPC入口：菜单导出/导入复用同一Main方法，新增记录通过统一通知出现在已挂载Capture。
    // Original IPC entry: menu export/import use the same Main methods and completion notifications update the mounted Capture view.
    const beforeUiImport = await captureItems(client);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
    const saveArchiveCommand = getByAutomationId(page, AUTOMATION_IDS.capture.saveArchive);
    const menuRowHeight = await page.evaluate(() => 38 + 2 * Math.max(1, Math.floor(window.devicePixelRatio)) / window.devicePixelRatio);
    await expect(saveArchiveCommand).toHaveCSS('display', 'flex');
    await expect.poll(() => saveArchiveCommand.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(menuRowHeight, 1);
    await expect(saveArchiveCommand).toHaveCSS('padding', '9px 10px');
    await expect(saveArchiveCommand).toHaveCSS('line-height', '16px');
    await expect(saveArchiveCommand).toHaveCSS('align-items', 'center');
    await expect(saveArchiveCommand.locator('code')).toHaveText('.iarchive');
    await expect(saveArchiveCommand.locator('code')).toHaveCSS('font-size', '9.5px');
    await expect(saveArchiveCommand.locator('code')).toHaveCSS('padding', '2px 6px');
    await saveArchiveCommand.click();
    const archiveDialog = page.getByRole('dialog');
    const exportWarnings = archiveDialog.locator('header + div > div');
    await expect(exportWarnings).toHaveCount(2);
    for (const warning of await exportWarnings.all()) {
      await expect(warning).toHaveCSS('display', 'flex');
      await expect(warning).toHaveCSS('font-size', '12px');
      await expect(warning).toHaveCSS('padding', '11px 13px');
      await expect(warning).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(warning.locator('svg')).toHaveAttribute('width', '15');
    }
    const warningColors = await exportWarnings.evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
    expect(warningColors[0]).not.toBe(warningColors[1]);
    await archiveDialog.screenshot({ path: testInfo.outputPath('archive-export-warning.png') });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.cancel).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.headerClose)).toBeHidden();
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
    await saveArchiveCommand.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    const uiFile = path.join(directory, 'ui.iarchive');
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), uiFile);
    await page.bringToFront();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.headerClose)).toBeHidden();
    await readArchiveHash(uiFile);
    await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
    const openArchiveCommand = getByAutomationId(page, AUTOMATION_IDS.capture.openArchive);
    await expect(openArchiveCommand).toHaveCSS('display', 'flex');
    await expect.poll(() => openArchiveCommand.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(menuRowHeight, 1);
    await expect(openArchiveCommand).toHaveCSS('align-items', 'center');
    await expect(openArchiveCommand.locator('code')).toHaveText('.iarchive');
    await openArchiveCommand.click();
    const importWarning = archiveDialog.locator('header + div > div');
    await expect(importWarning).toHaveCount(1);
    await expect(importWarning).toHaveCSS('padding', '11px 13px');
    await expect(importWarning).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await archiveDialog.screenshot({ path: testInfo.outputPath('archive-import-warning.png') });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), completeFile);
    await page.bringToFront();
    await expect.poll(async () => (await captureItems(client!)).length).toBe(10);
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.headerClose)).toBeHidden();
    const finalItems = await captureItems(client);
    expect(firstImported.every((entry) => finalItems.some((current) => current.id === entry.id))).toBe(true);
    await verifyCapturedData(page, client, finalItems.filter((entry) => !beforeUiImport.some((previous) => previous.id === entry.id)));
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
    await expect.poll(async () => (await client!.listTools()).tools.filter((entry) => TOOL_NAMES.some((name) => name === entry.name)).length).toBe(0);
    for (const name of TOOL_NAMES) await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    await client.close();
    client = null;

    // 证据与重启：只记录hash与计数，检查双列权限持久化及Model、origin、文件任务零重放。
    // Evidence and restart: retain only hashes and counts, verify permission persistence and zero replay of Model, origin or file operations.
    const fileNames = (await readdir(directory)).sort();
    expect(fileNames).toEqual(['agent-auto.iarchive', 'complete.iarchive', 'mcp-ask.iarchive', 'mcp-auto.iarchive', 'ui.iarchive']);
    const fileHashes = await Promise.all(fileNames.map((name) => readArchiveHash(path.join(directory, name))));
    for (const modelRequest of openAiCompatibleLab.requestsForAssertions()) {
      const text = JSON.stringify(modelRequest);
      for (const value of [SECRET, REQUEST_BODY, RESPONSE_BODY, WEBSOCKET_BODY, ...fileNames]) expect(text).not.toContain(value);
      expect(text).not.toContain(directory.replaceAll('\\', '\\\\'));
    }
    const modelRequests = openAiCompatibleLab.evidence().length;
    const originRequests = httpTrafficRunner.evidence().length;
    const webSocketMessages = webSocketTrafficRunner.evidence().messages.length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const value of [...sensitive, configured.configuration.headers.Authorization.slice('Bearer '.length)]) relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    client = await connectMcpClient(configured.configuration);
    expect(mcpValue(await client.callTool({ name: 'capture_get_transfer_job', arguments: { jobId: fullJobId } }))).toEqual({ job: null });
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    expect(httpTrafficRunner.evidence().length).toBe(originRequests);
    expect(webSocketTrafficRunner.evidence().messages.length).toBe(webSocketMessages);
    expect((await readdir(directory)).sort()).toEqual(fileNames);
    expect(await Promise.all(fileNames.map((name) => readArchiveHash(path.join(directory, name))))).toEqual(fileHashes);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('archive');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    const evidencePath = testInfo.outputPath('archive-transfer.json');
    await writeFile(evidencePath, JSON.stringify({
      sourceCount: 2, firstImportCount: 2, agentAutoImportCount: 4, mcpAskImportCount: 6, mcpAutoImportCount: 8, uiImportCount: 10,
      completeHash, fileHashes, fullBodiesVerified: true, webSocketMessagesVerified: true, sharedImportNotification: true,
      nativeSaveOpenCancellation: true, independentRevocation: true, restartModelRequests: 0, restartOriginRequests: 0, restartFileOperations: 0,
    }, null, 2), 'utf8');
    await testInfo.attach('archive-transfer.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理：保存trace并走产品正常退出，失败时仍核对完整宿主恢复。
    // Cleanup: retain the trace and close through the product, verifying complete host recovery even after failure.
    if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    if (!workflowError && cleanupErrors.length === 0) await rm(directory, { recursive: true, force: true });
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Archive workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Archive cleanup failed.');
});