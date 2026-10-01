import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';

const execFileAsync = promisify(execFile);
const TOOL_NAMES = [
  'settings_enable_app_container', 'settings_disable_app_container',
  'settings_enable_all_app_containers', 'settings_disable_all_app_containers',
] as const;
const PROMPT = ['Verify the requested', 'AppContainer access change.'].join(' ');
const ANSWER = ['The AppContainer access', 'step completed.'].join(' ');

interface SystemSnapshot {
  readonly containers: readonly { appContainerSid: string }[];
  readonly exemptSids: readonly string[];
}

async function readSystemSnapshot(desktopDirectory: string): Promise<SystemSnapshot> {
  const { stdout } = await execFileAsync(path.join(desktopDirectory, '../../packages/platform-capabilities/dist', 'app-container', 'app-container-helper.exe'), ['list'], {
    encoding: 'utf8', windowsHide: true,
  });
  return JSON.parse(stdout) as SystemSnapshot;
}

function sidKeys(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))].sort();
}

function setHash(values: readonly string[]): string {
  return createHash('sha256').update(sidKeys(values).join('\n')).digest('hex');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agentResult(lab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  for (const request of [...lab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const value: unknown = JSON.parse(message.content);
    if (isRecord(value)) return value;
  }
  throw new Error(`Missing AppContainer Tool result: ${callId}`);
}

async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('AppContainer Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(lab.baseUrl('app-container-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('app-container-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function callAgentTool(
  page: Page, lab: OpenAiCompatibleLab, callId: string, name: string, args: Readonly<Record<string, unknown>>,
  verdict?: 'allow' | 'deny', expectedError?: string,
): Promise<Readonly<Record<string, unknown>>> {
  lab.enqueueToolCall({ callId, name, arguments: args });
  lab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  const result = agentResult(lab, callId);
  if (verdict === 'deny' || expectedError) expect(result).toMatchObject({ ok: false, error: { code: expectedError ?? 'tool_denied' } });
  else expect(result.ok).toBe(true);
  if (result.ok === true && TOOL_NAMES.some((toolName) => toolName === name)) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult(callId))).toHaveAttribute('data-summary-kind', 'appContainers');
  }
  expect(/\b[A-Za-z]:[\\/]|"(?:path|workingDirectory|binaries|exemptSids)"/.test(JSON.stringify(result))).toBe(false);
  return result;
}

async function openAppContainers(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.appContainers).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.search)).toBeVisible();
}

async function expectState(page: Page, desktopDirectory: string, expected: readonly string[], currentSids: readonly string[]): Promise<void> {
  expect(setHash((await readSystemSnapshot(desktopDirectory)).exemptSids)).toBe(setHash(expected));
  const expectedSids = new Set(sidKeys(expected));
  for (const appContainerSid of currentSids) {
    await expect(getByAutomationId(page, AutomationIdFactory.appContainerRow(appContainerSid)))
      .toHaveAttribute('data-exempt', String(expectedSids.has(appContainerSid.toLowerCase())));
  }
}

async function restoreInitialState(page: Page, desktopDirectory: string, initial: SystemSnapshot): Promise<void> {
  const current = await readSystemSnapshot(desktopDirectory);
  if (setHash(current.exemptSids) === setHash(initial.exemptSids)) return;
  await page.keyboard.press('Escape');
  await openAppContainers(page);
  await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.search).fill('');
  const currentSids = new Set(sidKeys(initial.containers.map((container) => container.appContainerSid)));
  const initialEnabled = new Set(sidKeys(initial.exemptSids));
  const unwanted = current.exemptSids.filter((sid) => currentSids.has(sid.toLowerCase()) && !initialEnabled.has(sid.toLowerCase()));
  if (unwanted.length > 0) {
    await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.disableAll).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.disableAllConfirm).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.bulkDialog)).toBeHidden({ timeout: 30_000 });
  }
  for (const appContainerSid of initial.exemptSids.filter((sid) => currentSids.has(sid.toLowerCase()))) {
    const row = getByAutomationId(page, AutomationIdFactory.appContainerRow(appContainerSid));
    if (await row.getAttribute('data-exempt') === 'true') continue;
    await getByAutomationId(page, AutomationIdFactory.appContainerToggle(appContainerSid)).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.changeConfirm).click();
    await expect(row).toHaveAttribute('data-exempt', 'true');
  }
  expect(setHash((await readSystemSnapshot(desktopDirectory)).exemptSids)).toBe(setHash(initial.exemptSids));
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver) {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('AppContainer MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('Missing AppContainer MCP identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    servers: { interceptor: { url: string; headers: { Authorization: string } } };
  };
  const configuration = copied.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'app-container-workflow', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } }));
  return { client, clientId };
}

async function callMcpTool(client: Client, page: Page, name: string, args: Readonly<Record<string, unknown>>, verdict?: 'allow' | 'deny') {
  const [result] = await Promise.all([
    client.callTool({ name, arguments: args }),
    (async () => {
      if (!verdict) return;
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', name);
      await getByAutomationId(page, verdict === 'allow' ? AUTOMATION_IDS.mcp.approval.allow : AUTOMATION_IDS.mcp.approval.deny).click();
    })(),
  ]);
  if (verdict === 'deny') expect(result.isError).toBe(true);
  else {
    expect(result.isError).not.toBe(true);
    expect(/\b[A-Za-z]:[\\/]|"(?:workingDirectory|binaries|exemptSids|path)"/.test(JSON.stringify(result))).toBe(false);
  }
}

async function closeGeneration(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo): Promise<void> {
  try {
    if (!desktopApp.page.isClosed()) {
      const close = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close);
      if (await close.isVisible()) await close.click();
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
      await desktopApp.startTrace(testInfo);
      expect(desktopApp.rendererPageErrors()).toEqual([]);
      await desktopApp.captureFinalScreenshot(testInfo);
    }
    await desktopApp.stopTrace(testInfo);
    await desktopApp.closeGracefully();
    await desktopApp.writeEvidence(testInfo);
  } finally {
    await desktopApp.forceCleanup();
  }
}

test('settings.tools.app-containers shares single and bulk changes with exact system restoration', async ({ desktopApp, openAiCompatibleLab }, testInfo) => {
  test.setTimeout(420_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.app-containers' });
  desktopApp.preserveUserDataOnFailure();
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const initial = await readSystemSnapshot(desktopApp.desktopDirectory);
  const currentSids = initial.containers.map((container) => container.appContainerSid);
  const currentSidKeys = new Set(sidKeys(currentSids));
  const outside = initial.exemptSids.filter((sid) => !currentSidKeys.has(sid.toLowerCase()));
  const targetSid = currentSids[0];
  if (!targetSid) throw new Error('No real AppContainers are available for this workflow.');
  const argsFor = (name: string) => name.includes('_all_') ? {} : { appContainerSid: targetSid };
  let client: Client | null = null;
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：经真实UI配置Provider，四项discovery必须存在；任何写入前先取得缺失Tool的Red。
    // Arrange: configure the Provider through UI and require all four discovered Tools before any system mutation.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const discovery = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'access-discover', 'discover_tools', { capabilityId: 'settings' });
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    const names = matches.flatMap((entry) => isRecord(entry) && isRecord(entry.descriptor) && typeof entry.descriptor.name === 'string' ? [entry.descriptor.name] : [])
      .filter((name) => TOOL_NAMES.some((expected) => name === expected));
    expect(names).toEqual(TOOL_NAMES);
    await openAppContainers(desktopApp.page);

    // Agent：Ask逐项拒绝及允许，Auto重复四项，OS完整集合与已挂载的行状态必须同步。
    // Agent: deny and allow each Ask action, then repeat in Auto and compare the complete OS set with mounted rows.
    for (const name of TOOL_NAMES) {
      await callAgentTool(desktopApp.page, openAiCompatibleLab, `deny-${name}`, name, argsFor(name), 'deny');
      await expectState(desktopApp.page, desktopApp.desktopDirectory, initial.exemptSids, currentSids);
    }
    for (const mode of ['ask', 'auto'] as const) {
      if (mode === 'auto') {
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
        await callAgentTool(desktopApp.page, openAiCompatibleLab, 'auto-access-discover', 'discover_tools', { capabilityId: 'settings' });
      }
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode[mode]).click();
      await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-tool-execution-mode', mode);
      for (const name of TOOL_NAMES) {
        const before = await readSystemSnapshot(desktopApp.desktopDirectory);
        await callAgentTool(desktopApp.page, openAiCompatibleLab, `${mode}-${name}`, name, argsFor(name), mode === 'ask' ? 'allow' : undefined);
        const expected = name === TOOL_NAMES[0] ? [...before.exemptSids, targetSid]
          : name === TOOL_NAMES[1] ? before.exemptSids.filter((sid) => sid.toLowerCase() !== targetSid.toLowerCase())
            : name === TOOL_NAMES[2] ? [...outside, ...currentSids] : outside;
        await expectState(desktopApp.page, desktopApp.desktopDirectory, expected, currentSids);
      }
    }

    // MCP：正式UI创建独立Client，沿同一四项owner验证Ask/Auto及完整目标范围。
    // MCP: create a real Client through UI and verify the same owners, Ask/Auto, and exact mutation scope.
    const configured = await createMcpClient(desktopApp);
    client = configured.client;
    await openAppContainers(desktopApp.page);
    for (const name of TOOL_NAMES) {
      await callMcpTool(client, desktopApp.page, name, argsFor(name), 'deny');
      await expectState(desktopApp.page, desktopApp.desktopDirectory, outside, currentSids);
    }
    for (const mode of ['ask', 'auto'] as const) {
      if (mode === 'auto') {
        await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
        await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(configured.clientId)).click();
        await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientRow(configured.clientId))).toHaveAttribute('data-execution-mode', 'auto');
        await openAppContainers(desktopApp.page);
      }
      for (const name of TOOL_NAMES) {
        const before = await readSystemSnapshot(desktopApp.desktopDirectory);
        await callMcpTool(client, desktopApp.page, name, argsFor(name), mode === 'ask' ? 'allow' : undefined);
        const expected = name === TOOL_NAMES[0] ? [...before.exemptSids, targetSid]
          : name === TOOL_NAMES[1] ? before.exemptSids.filter((sid) => sid.toLowerCase() !== targetSid.toLowerCase())
            : name === TOOL_NAMES[2] ? [...outside, ...currentSids] : outside;
        await expectState(desktopApp.page, desktopApp.desktopDirectory, expected, currentSids);
      }
    }

    // 撤权：Agent与MCP开关独立生效，旧会话与Client不得再次写入系统。
    // Revocation: independent Agent and MCP switches stop old sessions and Clients from mutating the system.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await callAgentTool(desktopApp.page, openAiCompatibleLab, `revoked-${name}`, name, argsFor(name), undefined, 'unknown_tool');
    }
    expect((await client.listTools()).tools.filter((tool) => TOOL_NAMES.some((name) => name === tool.name))).toHaveLength(4);
    for (const name of TOOL_NAMES) {
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(client.callTool({ name, arguments: argsFor(name) })).rejects.toMatchObject({ code: -32602 });
    }
    await client.close();
    client = null;
    expect(setHash((await readSystemSnapshot(desktopApp.desktopDirectory)).exemptSids)).toBe(setHash(outside));

    // 重启：第一代通过正式UI恢复完整初始集合，再验证下一代不重放且授权保持关闭。
    // Restart: restore the complete initial set through UI before closing, then verify no replay and persisted revocations.
    await restoreInitialState(desktopApp.page, desktopApp.desktopDirectory, initial);
    const modelRequests = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
    await openAppContainers(relaunchedApp.page);
    await expectState(relaunchedApp.page, relaunchedApp.desktopDirectory, initial.exemptSids, currentSids);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    await testInfo.attach('app-container-tools.json', {
      body: Buffer.from(JSON.stringify({ agentCalls: 4, mcpCalls: 4, askDenials: 8, initialHash: setHash(initial.exemptSids),
        initialExemptCount: initial.exemptSids.length, enumeratedCount: currentSids.length, outsideCount: outside.length, restartRequests: 0 })),
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理和证据：不论断言结果都经正式UI恢复系统集合，再由driver验证完整退出。
    // Cleanup and evidence: always restore exemptions through UI and then let the driver verify complete shutdown.
    if (client) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    const activeApp = relaunchedApp ?? desktopApp;
    try {
      if (!activeApp.page.isClosed()) await restoreInitialState(activeApp.page, activeApp.desktopDirectory, initial);
      expect(setHash((await readSystemSnapshot(activeApp.desktopDirectory)).exemptSids)).toBe(setHash(initial.exemptSids));
      await testInfo.attach('app-container-cleanup.json', { body: Buffer.from(JSON.stringify({ restoredExactly: true, finalHash: setHash(initial.exemptSids) })), contentType: 'application/json' });
    } catch (error) { cleanupErrors.push(error); }
    await closeGeneration(activeApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'AppContainer workflow and restoration failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'AppContainer restoration failed.');
});