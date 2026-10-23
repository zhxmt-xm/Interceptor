import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import {
  connectWorkflowMcpClient,
  type WorkflowMcpClient,
} from '../../fixtures/runtime/workflow-mcp-client';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const TOOL_NAMES = ['settings_enable_system_proxy', 'settings_restore_system_proxy'] as const;
const PROMPT = ['Verify system proxy', 'control through approved Tools.'].join(' ');
const ANSWER = ['System proxy', 'step completed.'].join(' ');

interface ProxyState {
  readonly current: unknown;
  readonly journal: { original: unknown; owned: unknown } | null;
}

async function readProxyState(desktopApp: LocalElectronApplicationDriver): Promise<ProxyState> {
  const current = await desktopApp.readSystemProxySettings();
  let journal: ProxyState['journal'];
  try {
    journal = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8')) as ProxyState['journal'];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not read proxy journal evidence.');
    journal = null;
  }
  return { current, journal };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('System proxy Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('system-proxy-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('system-proxy-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

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
  throw new Error(`Missing proxy Tool Result: ${callId}`);
}

async function sendMessage(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

async function finishTurn(page: Page): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
  const cancelReadiness = getByAutomationId(page, AUTOMATION_IDS.capture.readiness.cancel);
  if (await cancelReadiness.isVisible()) await cancelReadiness.click();
}

async function completeChange(
  page: Page,
  openAiCompatibleLab: OpenAiCompatibleLab,
  callId: string,
  name: typeof TOOL_NAMES[number],
  approval?: { verdict: 'allow' | 'deny'; owned: boolean },
): Promise<Readonly<Record<string, unknown>>> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: {} });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await sendMessage(page);
  const approvalCard = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
  if (approval !== undefined) {
    await expect(approvalCard).toHaveAttribute('data-approval-status', 'pending');
    const metadata = JSON.parse((await approvalCard.getAttribute('data-effect-metadata')) ?? 'null');
    expect(metadata).toMatchObject({ supported: true, owned: approval.owned });
    const verdictId = approval.verdict === 'allow'
      ? AutomationIdFactory.agentToolAllow(callId)
      : AutomationIdFactory.agentToolDeny(callId);
    await getByAutomationId(page, verdictId).click();
  }
  await finishTurn(page);
  if (approval === undefined) await expect(approvalCard).toHaveCount(0);
  const result = toolResult(openAiCompatibleLab, callId);
  if (approval?.verdict === 'deny') {
    expect(result).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
  } else {
    expect(result.ok).toBe(true);
    expect(/[A-Za-z]:[\\/]|"(?:proxyServer|bypassList|pacUrl|original|path)"/.test(JSON.stringify(result)))
      .toBe(false);
  }
  return result;
}

async function expectRestored(desktopApp: LocalElectronApplicationDriver, original: unknown): Promise<void> {
  const state = await readProxyState(desktopApp);
  expect(desktopApp.matchesSystemProxyEvidence(state.current, original)).toBe(true);
  expect(state.journal).toBeNull();
}

async function expectOwned(desktopApp: LocalElectronApplicationDriver, original: unknown): Promise<void> {
  const state = await readProxyState(desktopApp);
  expect(state.journal !== null).toBe(true);
  expect(desktopApp.matchesSystemProxyEvidence(state.journal!.original, original)).toBe(true);
  expect(desktopApp.matchesSystemProxyEvidence(state.current, state.journal!.owned)).toBe(true);
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

test('settings.tools.system-proxy rejects overlapping Enable calls without a queue', async ({ desktopApp, httpTrafficRunner }, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.system-proxy' });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  let client: WorkflowMcpClient | null = null;
  try {
    // 准备：经真实UI创建Auto MCP Client，保留当前完整proxy/journal状态。
    // Arrange: create an Auto MCP Client through product UI and retain the current proxy/journal state.
    const initial = await readProxyState(desktopApp);
    expect(initial.journal).not.toBeNull();
    const original = initial.journal!.original;
    const explicitPath = '/e2e/system-proxy/ui/explicit-client';
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(explicitPath);
    const facetToggles = page.locator('[data-automation-id^="capture.filter.toggle."]');
    for (let index = 0; index < await facetToggles.count(); index += 1) {
      const toggle = facetToggles.nth(index);
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    }
    await startRecording(desktopApp);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await screenshotStep('检查已接管的系统代理及Restore入口 / Inspect owned system proxy and Restore', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
    await expectRestored(desktopApp, original);
    await screenshotStep('Restore后系统路由恢复，监听器继续运行 / Restore the system route while keeping the listener available');
    await expect(httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), explicitPath))
      .resolves.toMatchObject({ statusCode: 200 });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const explicitRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: explicitPath }).last();
    await expect(explicitRow).toBeVisible();
    if (await explicitRow.getAttribute('aria-pressed') !== 'true') await explicitRow.click();
    await expect(explicitRow).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep('显式代理客户端在Restore后仍通过监听器 / An explicit proxy client still uses the listener after Restore', {
      highlights: [{ target: explicitRow, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await screenshotStep('通过Enable重新接管系统代理 / Take ownership again through Enable', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore)).toBeEnabled();
    await expectOwned(desktopApp, original);
    await screenshotStep('Enable后确认接管状态 / Confirm ownership after Enable');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const recordingToggle = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
    await expect(recordingToggle).toHaveAttribute('aria-busy', 'false');
    await screenshotStep('确认Recording已开启后再暂停 / Confirm Recording is active before pausing', {
      highlights: [{ target: recordingToggle, label: '1' }],
    });
    await recordingToggle.click();
    await expect(recordingToggle).toHaveAttribute('aria-pressed', 'false');
    await screenshotStep('单独暂停Recording / Pause Recording separately', {
      highlights: [{ target: recordingToggle, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await expectOwned(desktopApp, original);
    await screenshotStep('暂停Recording不恢复系统代理 / Pausing Recording does not restore the system proxy');

    const before = await readProxyState(desktopApp);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('System Proxy conflict');
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    const row = page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(row).toHaveCount(1);
    const clientId = await row.getAttribute('data-client-id');
    if (!clientId) throw new Error('Missing product-created MCP Client.');
    await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
      servers: { interceptor: { url: string; headers: { Authorization: string } } };
    };
    const configuration = copied.servers.interceptor;
    desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
    client = await connectWorkflowMcpClient(configuration, 'system-proxy-conflict', testInfo);
    await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
    await expect(row).toHaveAttribute('data-execution-mode', 'auto');
    await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('aria-busy', 'false');
    await desktopApp.startTrace(testInfo);

    // 用户操作：同一真实Main并发接收两个Enable，冲突请求必须立即结束而不是排队。
    // User actions: send two concurrent Enable calls to the same real Main; a conflicting call must finish without queuing.
    const results = await Promise.all([
      client.callTool({ name: TOOL_NAMES[0], arguments: {} }, { timeout: 15_000 }),
      client.callTool({ name: TOOL_NAMES[0], arguments: {} }, { timeout: 15_000 }),
    ]);
    expect(results.filter(result => result.isError !== true)).toHaveLength(1);
    const conflicts = results.filter(result => result.isError === true);
    expect(conflicts).toHaveLength(1);
    const error = conflicts[0]!.content.find(entry => entry.type === 'text')?.text ?? '';
    expect(error).toContain('operation_in_progress');
    expect(error).toContain('system-proxy.enable');
    await expect(getByAutomationId(page, AUTOMATION_IDS.platform.operationConflict))
      .toHaveAttribute('data-operation', 'system-proxy.enable');
    await screenshotStep('用户操作：同一真实Main并发接收两个Enable，冲突请求必须立即结束而不是排队。 / User actions: send two concurrent Enable calls to the same real Main; a conflicting call must finish without queuing.');

    // 业务断言与证据：先前original/owned不变，旧冲突不重放，新显式调用可以正常执行。
    // Business assertions and evidence: preserve original/owned, never replay the conflict, and allow a new explicit call.
    expect(desktopApp.matchesSystemProxyEvidence(await readProxyState(desktopApp), before)).toBe(true);
    expect((await client.callTool({ name: TOOL_NAMES[0], arguments: {} })).isError).not.toBe(true);
    expect(desktopApp.matchesSystemProxyEvidence(await readProxyState(desktopApp), before)).toBe(true);
    expect((await client.callTool({ name: TOOL_NAMES[1], arguments: {} })).isError).not.toBe(true);
    await expectRestored(desktopApp, original);
    expect((await client.callTool({ name: TOOL_NAMES[0], arguments: {} })).isError).not.toBe(true);
    await expectOwned(desktopApp, original);
    await testInfo.attach('system-proxy-conflict.json', {
      body: Buffer.from(JSON.stringify({
        successfulCalls: 3,
        rejectedConflicts: 1,
        originalPreserved: true,
        explicitRetryPassed: true,
        restoreAndEnablePassed: true,
      })),
      contentType: 'application/json',
    });
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
    await expectRestored(desktopApp, original);
    await screenshotStep('结束前通过Restore恢复原系统路由 / Restore the original system route at the end');
    desktopApp.releasePreservedUserData();
  } finally {
    // 清理：关闭MCP连接，fixture经正式Quit恢复OS代理并验证进程和端口。
    // Cleanup: close MCP transport; the fixture restores the OS proxy through normal Quit and verifies process/port release.
    await client?.close();
  }
});

test('settings.tools.system-proxy preserves ownership across Ask Auto and restart', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.system-proxy' });
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;

  try {
    // 准备：验证真实冷启动已接管，保留首次 original 的内存副本并经 UI 配置 Provider。
    // Arrange: verify real cold-start ownership, retain the first original snapshot in memory, and configure the Provider through UI.
    const initial = await readProxyState(desktopApp);
    expect(initial.journal !== null).toBe(true);
    const original = initial.journal!.original;
    await expectOwned(desktopApp, original);
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    openAiCompatibleLab.enqueueToolCall({
      callId: 'proxy-discover', name: 'discover_tools', arguments: { capabilityId: 'settings' },
    });
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
    await sendMessage(desktopApp.page);
    await finishTurn(desktopApp.page);
    const discovery = toolResult(openAiCompatibleLab, 'proxy-discover');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches)
      ? discovery.value.matches
      : [];
    const names = matches.flatMap((match) => (
      isRecord(match) && isRecord(match.descriptor) && typeof match.descriptor.name === 'string'
        ? [match.descriptor.name] : []
    )).filter((name) => TOOL_NAMES.some((expected) => expected === name));
    expect(names).toEqual(TOOL_NAMES);

    // 用户操作与断言：Restore Deny 保持全部状态；Allow 精确恢复首次 original 并清除 journal。
    // User actions and assertions: Restore Deny preserves all state; Allow restores the first original exactly and removes the journal.
    await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-deny', 'settings_restore_system_proxy', {
      verdict: 'deny', owned: true,
    });
    expect(desktopApp.matchesSystemProxyEvidence(await readProxyState(desktopApp), initial)).toBe(true);
    const restored = await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-allow', 'settings_restore_system_proxy', {
      verdict: 'allow', owned: true,
    });
    expect(restored).toMatchObject({ ok: true, value: { restored: true, status: { owned: false } } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('restore-allow')))
      .toHaveAttribute('data-summary-kind', 'systemProxyRestore');
    await expectRestored(desktopApp, original);
    await screenshotStep('用户操作与断言：Restore Deny 保持全部状态；Allow 精确恢复首次 original 并清除 journal。 / User actions and assertions: Restore Deny preserves all state; Allow restores the first original exactly and removes the journal.');

    // 用户操作与断言：Enable Deny 不写 OS；Allow 重新接管且 journal original 不被自身代理覆盖。
    // User actions and assertions: Enable Deny does not write the OS; Allow retakes ownership without replacing the journal original with itself.
    await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-deny', 'settings_enable_system_proxy', {
      verdict: 'deny', owned: false,
    });
    await expectRestored(desktopApp, original);
    const enabled = await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-allow', 'settings_enable_system_proxy', {
      verdict: 'allow', owned: false,
    });
    expect(enabled).toMatchObject({ ok: true, value: { owned: true, enabled: true } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('enable-allow')))
      .toHaveAttribute('data-summary-kind', 'systemProxy');
    await expectOwned(desktopApp, original);
    await screenshotStep('用户操作与断言：Enable Deny 不写 OS；Allow 重新接管且 journal original 不被自身代理覆盖。 / User actions and assertions: Enable Deny does not write the OS; Allow retakes ownership without replacing the journal original with itself.');

    // 用户操作与断言：Auto 只省略审批，重复 Restore 返回 not-owned，然后沿正式路径重新接管。
    // User actions and assertions: Auto skips approval only; repeated Restore reports not-owned before the formal Enable path retakes ownership.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-auto', 'settings_restore_system_proxy');
    await expectRestored(desktopApp, original);
    const skipped = await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-skipped', 'settings_restore_system_proxy');
    expect(skipped).toMatchObject({ ok: true, value: { restored: false, reason: 'not-owned' } });
    await expectRestored(desktopApp, original);
    await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-auto', 'settings_enable_system_proxy');
    await expectOwned(desktopApp, original);
    await screenshotStep('用户操作与断言：Auto 只省略审批，重复 Restore 返回 not-owned，然后沿正式路径重新接管。 / User actions and assertions: Auto skips approval only; repeated Restore reports not-owned before the formal Enable path retakes ownership.');

    // 撤权：关闭两项 Agent/MCP 开关，旧 Chat 直接调用被拒绝，OS 和 journal 不变。
    // Revocation: disable both Agent and MCP switches; stale Chat calls are rejected without changing the OS or journal.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.close).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill('system_proxy');
    for (const name of TOOL_NAMES) {
      const agentSwitch = getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name));
      const mcpSwitch = getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name));
      await agentSwitch.click();
      await expect(agentSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(mcpSwitch).toHaveAttribute('aria-checked', 'true');
      await mcpSwitch.click();
      await expect(mcpSwitch).toHaveAttribute('aria-checked', 'false');
    }
    const beforeRevokedCalls = await readProxyState(desktopApp);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    for (const name of TOOL_NAMES) {
      openAiCompatibleLab.enqueueToolCall({ callId: `disabled-${name}`, name, arguments: {} });
    }
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
    await sendMessage(desktopApp.page);
    await finishTurn(desktopApp.page);
    for (const name of TOOL_NAMES) {
      expect(toolResult(openAiCompatibleLab, `disabled-${name}`))
        .toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    expect(desktopApp.matchesSystemProxyEvidence(await readProxyState(desktopApp), beforeRevokedCalls)).toBe(true);
    await screenshotStep('撤权：关闭两项 Agent/MCP 开关，旧 Chat 直接调用被拒绝，OS 和 journal 不变。 / Revocation: disable both Agent and MCP switches; stale Chat calls are rejected without changing the OS or journal.');

    // 重启：第一代正常退出恢复宿主；同 profile 第二代仍自动接管，但 Model 和 Tool 不重放。
    // Restart: generation one restores the host on exit; generation two still takes ownership automatically without replaying Model or Tool calls.
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    await expectRestored(desktopApp, original);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - modelRequestCount).toBe(0);
    await expectOwned(relaunchedApp, original);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('system_proxy');
    for (const name of TOOL_NAMES) {
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name)))
        .toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name)))
        .toHaveAttribute('aria-checked', 'false');
    }

    // 证据：只保存哈希、协议结果和计数，不记录原始代理快照或 Model 文本。
    // Evidence: retain hashes, protocol results, and counts only, excluding raw proxy snapshots and Model text.
    const evidencePath = testInfo.outputPath('settings-tools-system-proxy.json');
    await writeFile(evidencePath, JSON.stringify({
      names, originalHash: digest(original), deniedCount: 2, allowedCount: 2, autoCount: 3,
      repeatRestoreReason: 'not-owned', disabledCount: 2, restartModelRequestCount: 0,
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('settings-tools-system-proxy.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：无论业务成功或失败，都由当前代际及外层 guard 完成全部进程、8888 和宿主恢复检查。
    // Teardown: on success or failure, the current generation and outer guard verify all processes, port 8888, and host restoration.
    try {
      await closeGeneration(relaunchedApp ?? desktopApp, testInfo);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (workflowError && cleanupError) throw new AggregateError([workflowError, cleanupError], 'System proxy workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});