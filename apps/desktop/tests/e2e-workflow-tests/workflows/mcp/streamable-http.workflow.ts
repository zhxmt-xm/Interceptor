import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';

interface McpHostConfiguration {
  readonly token: string;
  readonly url: string;
}

interface McpWorkflowEvidence {
  readonly endpoint: string;
  readonly originalTokenHash: string;
  readonly regeneratedTokenHash: string;
  readonly protocolVersion: string | null;
  readonly oldTokenStatus: number;
}

/** Navigate through public UI to the MCP Server settings. */
async function openMcpSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toBeVisible();
}

/** Read the secret-bearing config only from the real clipboard while trace is paused. */
async function copyConfiguration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  clientId: string,
): Promise<McpHostConfiguration> {
  await desktopApp.stopTrace(testInfo);
  await getByAutomationId(
    desktopApp.page,
    AutomationIdFactory.mcpClientCopyConfiguration(clientId),
  ).click();
  const text = await desktopApp.page.evaluate(async () => navigator.clipboard.readText());
  const parsed = JSON.parse(text) as {
    servers: { interceptor: { headers: { Authorization: string }; url: string } };
  };
  const authorization = parsed.servers.interceptor.headers.Authorization;
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Copied MCP configuration has no Bearer credential.');
  }
  const configuration = {
    token: authorization.slice('Bearer '.length),
    url: parsed.servers.interceptor.url,
  };
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.token);
  await desktopApp.startTrace(testInfo);
  return configuration;
}

/** Connect one real official MCP Client over the product's HTTP listener. */
async function connectClient(
  configuration: McpHostConfiguration,
): Promise<Client> {
  const client = new Client(
    { name: 'interceptor-e2e-host', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), {
    requestInit: { headers: { Authorization: `Bearer ${configuration.token}` } },
  }));
  return client;
}

/** Resume Capture through the formal public recording flow. */
async function resumeRecording(desktopApp: LocalElectronApplicationDriver): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  const recording = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') return;
  await recording.click();
  const readinessEnable = getByAutomationId(
    desktopApp.page,
    AUTOMATION_IDS.capture.readiness.enable,
  );
  await readinessEnable.waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => readinessEnable.click())
    .catch(() => undefined);
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
}

/** Close one application generation while preserving lifecycle evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  sensitiveTexts: readonly string[] = [],
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  for (const sensitiveText of sensitiveTexts) {
    await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
  }
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

test('mcp.desktop.streamable-http connects external Hosts with stable manual credentials', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'mcp.desktop.streamable-http',
  });

  const clients: Client[] = [];
  let activeApp: LocalElectronApplicationDriver | null = desktopApp;
  let workflowError: unknown;
  let cleanupError: unknown;
  let endpoint = '';
  let originalTokenHash = '';
  let regeneratedTokenHash = '';
  let protocolVersion: string | null = null;
  let oldTokenStatus = -1;
  let activeSensitiveTexts: string[] = [];

  try {
    // 准备：从fresh profile进入Agent Settings，MCP必须默认关闭且没有伪造Client。
    // Arrange: enter Agent Settings from a fresh profile; MCP starts off with no fabricated Client.
    await openMcpSettings(desktopApp.page);
    const serverRoot = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root);
    await expect(serverRoot).toHaveAttribute('data-server-state', 'disabled');
    await expect(serverRoot).toHaveAttribute('data-client-count', '0');

    // 用户操作：显式开启listener并通过产品Dialog创建默认Ask的VS Code Client。
    // User actions: explicitly enable the listener and create a default-Ask VS Code Client in the product dialog.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(serverRoot).toHaveAttribute('data-server-state', 'running');
    endpoint = await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.endpoint)
      .getAttribute('data-endpoint') ?? '';
    expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(new URL(endpoint).port).not.toBe('8888');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label).fill('VS Code E2E');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
    const clientRow = desktopApp.page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(clientRow).toHaveCount(1);
    const clientId = (await clientRow.getAttribute('data-client-id')) ?? '';
    expect(clientId.length).toBeGreaterThan(0);
    await expect(clientRow).toHaveAttribute('data-execution-mode', 'ask');

    // 外部交互：复制一次配置，用固定当前协议的官方Client连接endpoint。
    // External interaction: copy the configuration once and connect an official Client pinned to the current protocol.
    const original = await copyConfiguration(desktopApp, testInfo, clientId);
    activeSensitiveTexts = [original.token];
    expect(original.url).toBe(endpoint);
    originalTokenHash = createHash('sha256').update(original.token).digest('hex');
    const client = await connectClient(original);
    clients.push(client);
    protocolVersion = client.getNegotiatedProtocolVersion() ?? null;
    expect(protocolVersion).toBe('2026-07-28');
    expect((await client.listTools()).tools.map((tool) => tool.name))
      .toContain('get_proxy_status');

    // 业务断言：MCP列关闭项即时不可发现；重新开启后query直接读取真实Core状态。
    // Business assertion: an MCP-column disable hides the Tool; re-enable lets a query read real Core state directly.
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolMcpSwitch('get_proxy_status'),
    ).click();
    const filteredClient = await connectClient(original);
    clients.push(filteredClient);
    expect((await filteredClient.listTools()).tools.map((tool) => tool.name))
      .not.toContain('get_proxy_status');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolMcpSwitch('get_proxy_status'),
    ).click();
    const queryClient = await connectClient(original);
    clients.push(queryClient);
    await expect(queryClient.callTool({ name: 'get_proxy_status', arguments: {} }))
      .resolves.not.toMatchObject({ isError: true });

    // 用户操作：Host断开先取消Ask；重连后的Deny/Allow分别保持/停止Recording。
    // User actions: a Host disconnect first cancels Ask; Deny and Allow after reconnect retain/stop Recording.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    const disconnectedCall = queryClient.callTool({ name: 'stop_recording', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'stop_recording');
    await queryClient.close();
    clients.splice(clients.indexOf(queryClient), 1);
    await Promise.allSettled([disconnectedCall]);
    await expect(approval).toHaveCount(0);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');

    const actionClient = await connectClient(original);
    clients.push(actionClient);
    const deniedCall = actionClient.callTool({ name: 'stop_recording', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'stop_recording');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(deniedCall).resolves.toMatchObject({ isError: true });
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');
    const allowedCall = actionClient.callTool({ name: 'stop_recording', arguments: {} });
    await expect(approval).toHaveAttribute('data-tool-name', 'stop_recording');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    await expect(allowedCall).resolves.not.toMatchObject({ isError: true });
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');
    await resumeRecording(desktopApp);
    await openMcpSettings(desktopApp.page);
    await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(clientId)).click();
    await expect(clientRow).toHaveAttribute('data-execution-mode', 'auto');
    await actionClient.callTool({ name: 'stop_recording', arguments: {} });
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');
    await resumeRecording(desktopApp);

    // 重启：关闭所有外部Client与第一代App，同一profile必须复用URL、Token和Auto模式。
    // Restart: close external Clients and generation one; the same profile reuses URL, token, and Auto mode.
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await closeGeneration(desktopApp, testInfo, activeSensitiveTexts);
    activeApp = null;
    activeSensitiveTexts = [];
    const relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    activeApp = relaunchedApp;
    await relaunchedApp.waitUntilReady();
    await openMcpSettings(relaunchedApp.page);
    const relaunchedServer = getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.root);
    await expect(relaunchedServer).toHaveAttribute('data-server-state', 'running');
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.endpoint))
      .toHaveAttribute('data-endpoint', endpoint);
    const relaunchedRow = getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.mcpClientRow(clientId),
    );
    await expect(relaunchedRow).toHaveAttribute('data-execution-mode', 'auto');
    const restoredClient = await connectClient(original);
    clients.push(restoredClient);
    await expect(restoredClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });

    // 用户操作：只有显式Regenerate才使旧Token失效，新配置保持同一URL并可立即连接。
    // User action: only explicit Regenerate invalidates the old token; the new config keeps the URL and connects.
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.mcpClientRegenerate(clientId),
    ).click();
    await getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.mcp.client.regenerateConfirm,
    ).click();
    oldTokenStatus = (await fetch(original.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${original.token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })).status;
    expect(oldTokenStatus).toBe(401);
    const regenerated = await copyConfiguration(relaunchedApp, testInfo, clientId);
    activeSensitiveTexts = [regenerated.token];
    regeneratedTokenHash = createHash('sha256').update(regenerated.token).digest('hex');
    expect(regenerated.url).toBe(endpoint);
    expect(regeneratedTokenHash).not.toBe(originalTokenHash);
    const regeneratedClient = await connectClient(regenerated);
    clients.push(regeneratedClient);
    await expect(regeneratedClient.listTools()).resolves.toMatchObject({ tools: expect.any(Array) });

    // 清理与证据：恢复Ask与Recording，撤销Client并关闭MCP；只保存Token hash。
    // Cleanup and evidence: restore Ask and Recording, revoke the Client, disable MCP, and save token hashes only.
    await getByAutomationId(relaunchedApp.page, AutomationIdFactory.mcpClientAsk(clientId)).click();
    await getByAutomationId(relaunchedApp.page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(relaunchedServer).toHaveAttribute('data-server-state', 'disabled');
    await resumeRecording(relaunchedApp);
    const evidence: McpWorkflowEvidence = {
      endpoint,
      originalTokenHash,
      regeneratedTokenHash,
      protocolVersion,
      oldTokenStatus,
    };
    const evidencePath = testInfo.outputPath('mcp-streamable-http.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('mcp-streamable-http.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    if (activeApp !== null) {
      try {
        await closeGeneration(activeApp, testInfo, activeSensitiveTexts);
      } catch (error) {
        cleanupError = error;
        await activeApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'MCP workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});