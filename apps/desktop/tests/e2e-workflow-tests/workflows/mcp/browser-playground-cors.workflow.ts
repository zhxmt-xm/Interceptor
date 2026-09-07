import { chromium, type Browser, type Page, type TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import {
  expect,
  type LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';

const CURRENT_MCP_PROTOCOL = '2026-07-28';

interface BrowserMcpConfiguration {
  readonly token: string;
  readonly url: string;
}

interface BrowserMcpResponse {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

/** Navigate through public UI to the MCP Server settings. */
async function openMcpSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toBeVisible();
}

/** Read the product-generated configuration while keeping the credential out of trace. */
async function copyConfiguration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  clientId: string,
): Promise<BrowserMcpConfiguration> {
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

/** Send one current-protocol JSON-RPC request from a real Browser origin. */
async function sendBrowserMcpRequest(
  page: Page,
  configuration: BrowserMcpConfiguration,
  id: number,
  method: string,
  params: Readonly<Record<string, unknown>> = {},
  toolName?: string,
): Promise<BrowserMcpResponse> {
  return page.evaluate(async ({ config, requestId, requestMethod, requestParams, requestToolName }) => {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'MCP-Method': requestMethod,
      'MCP-Protocol-Version': '2026-07-28',
    };
    if (requestToolName !== undefined) headers['MCP-Name'] = requestToolName;
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: requestMethod,
        params: {
          ...requestParams,
          _meta: {
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': {
              name: 'interceptor-browser-e2e',
              version: '1.0.0',
            },
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          },
        },
      }),
    });
    return {
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    };
  }, {
    config: configuration,
    requestId: id,
    requestMethod: method,
    requestParams: params,
    requestToolName: toolName,
  });
}

/** Restore Recording through the formal product UI when a Tool stopped it. */
async function resumeRecording(desktopApp: LocalElectronApplicationDriver): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  const recording = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') return;
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
}

test('mcp.browser-playground-cors connects a current-protocol Browser client', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  test.setTimeout(150_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'mcp.browser-playground-cors',
  });

  let browser: Browser | null = null;
  try {
    // 准备：通过真实产品UI开启MCP，并创建一个默认Ask的Browser Client。
    // Arrange: enable MCP and create a default-Ask Browser Client through real product UI.
    await openMcpSettings(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root))
      .toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.label)
      .fill('Browser Playground E2E');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.create).click();
    const clientRow = desktopApp.page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(clientRow).toHaveCount(1);
    const clientId = (await clientRow.getAttribute('data-client-id')) ?? '';
    await expect(clientRow).toHaveAttribute('data-execution-mode', 'ask');
    const configuration = await copyConfiguration(desktopApp, testInfo, clientId);

    // 外部交互：系统Edge加载独立loopback origin，并从真实Browser发出CORS请求。
    // External interaction: system Edge loads a separate loopback origin and sends real Browser CORS requests.
    browser = await chromium.launch({ channel: 'msedge' });
    const browserPage = await browser.newPage();
    await browserPage.goto(loopbackLab.url('/browser-playground-host'));
    const discovery = await sendBrowserMcpRequest(
      browserPage,
      configuration,
      1,
      'server/discover',
    );
    expect(discovery.status).toBe(200);
    expect(discovery.body).toContain(CURRENT_MCP_PROTOCOL);
    const toolList = await sendBrowserMcpRequest(browserPage, configuration, 2, 'tools/list');
    const toolNames = JSON.parse(toolList.body).result.tools
      .map((tool: { name: string }) => tool.name) as string[];
    expect(toolNames).toHaveLength(55);
    expect(toolNames).toContain('capture_get_proxy_status');
    expect(toolNames).toContain('capture_get_transfer_job');
    expect(toolNames).toContain('capture_cancel_transfer_job');
    expect(toolNames).toContain('capture_export_body');
    expect(toolNames).toContain('capture_export_har');
    expect(toolNames).toContain('capture_import_har');
    expect(toolNames).toContain('capture_export_archive');
    expect(toolNames).toContain('capture_import_archive');

    // 业务断言：query直接读取Core；change在Ask下分别由Developer拒绝和允许。
    // Business assertion: query reads Core directly; Ask-mode change is rejected and approved by the Developer.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const proxyStatus = await sendBrowserMcpRequest(
      browserPage,
      configuration,
      3,
      'tools/call',
      { name: 'capture_get_proxy_status', arguments: {} },
      'capture_get_proxy_status',
    );
    expect(proxyStatus.status).toBe(200);
    expect(proxyStatus.body).toContain('recording');

    const approval = getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.root);
    const deniedCall = sendBrowserMcpRequest(
      browserPage,
      configuration,
      4,
      'tools/call',
      { name: 'capture_stop_recording', arguments: {} },
      'capture_stop_recording',
    );
    await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.deny).click();
    const deniedResult = JSON.parse((await deniedCall).body).result as {
      content: Array<{ text?: string }>;
      isError?: boolean;
    };
    expect(deniedResult.isError).toBe(true);
    expect(deniedResult.content[0]?.text).toContain('rejected');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'true');

    const allowedCall = sendBrowserMcpRequest(
      browserPage,
      configuration,
      5,
      'tools/call',
      { name: 'capture_stop_recording', arguments: {} },
      'capture_stop_recording',
    );
    await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.approval.allow).click();
    expect((await allowedCall).status).toBe(200);
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle))
      .toHaveAttribute('aria-pressed', 'false');

    // 清理：恢复Recording，撤销Client并关闭MCP；fixture继续验证完整销毁与系统副作用恢复。
    // Cleanup: restore Recording, revoke the Client, and disable MCP; the fixture verifies full teardown and side-effect recovery.
    await resumeRecording(desktopApp);
    await openMcpSettings(desktopApp.page);
    await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.mcp.server.root))
      .toHaveAttribute('data-server-state', 'disabled');
  } finally {
    await browser?.close();
  }
});