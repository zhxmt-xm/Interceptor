import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const execFileAsync = promisify(execFile);
const TOOL_NAMES = ['settings_enable_system_proxy', 'settings_restore_system_proxy'] as const;
const PROMPT = ['Verify system proxy', 'control through approved Tools.'].join(' ');
const ANSWER = ['System proxy', 'step completed.'].join(' ');

interface ProxyState {
  readonly current: unknown;
  readonly journal: { original: unknown; owned: unknown } | null;
}

async function readProxyState(desktopDirectory: string): Promise<ProxyState> {
  const { stdout } = await execFileAsync(path.join(
    desktopDirectory, 'dist', 'system-proxy', 'wininet-proxy-helper.exe',
  ), ['get'], { encoding: 'utf8', windowsHide: true });
  let journal: ProxyState['journal'];
  try {
    journal = JSON.parse(await readFile(path.join(
      process.env.LOCALAPPDATA!, 'Interceptor', 'system-proxy', 'journal.json',
    ), 'utf8')) as ProxyState['journal'];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not read proxy journal evidence.');
    journal = null;
  }
  return { current: JSON.parse(stdout), journal };
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

async function expectRestored(desktopDirectory: string, original: unknown): Promise<void> {
  const state = await readProxyState(desktopDirectory);
  expect(digest(state.current)).toBe(digest(original));
  expect(state.journal).toBeNull();
}

async function expectOwned(desktopDirectory: string, original: unknown): Promise<void> {
  const state = await readProxyState(desktopDirectory);
  expect(state.journal !== null).toBe(true);
  expect(digest(state.journal!.original)).toBe(digest(original));
  expect(digest(state.current)).toBe(digest(state.journal!.owned));
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
    const initial = await readProxyState(desktopApp.desktopDirectory);
    expect(initial.journal !== null).toBe(true);
    const original = initial.journal!.original;
    await expectOwned(desktopApp.desktopDirectory, original);
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
    expect(digest(await readProxyState(desktopApp.desktopDirectory))).toBe(digest(initial));
    const restored = await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-allow', 'settings_restore_system_proxy', {
      verdict: 'allow', owned: true,
    });
    expect(restored).toMatchObject({ ok: true, value: { restored: true, status: { owned: false } } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('restore-allow')))
      .toHaveAttribute('data-summary-kind', 'systemProxyRestore');
    await expectRestored(desktopApp.desktopDirectory, original);

    // 用户操作与断言：Enable Deny 不写 OS；Allow 重新接管且 journal original 不被自身代理覆盖。
    // User actions and assertions: Enable Deny does not write the OS; Allow retakes ownership without replacing the journal original with itself.
    await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-deny', 'settings_enable_system_proxy', {
      verdict: 'deny', owned: false,
    });
    await expectRestored(desktopApp.desktopDirectory, original);
    const enabled = await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-allow', 'settings_enable_system_proxy', {
      verdict: 'allow', owned: false,
    });
    expect(enabled).toMatchObject({ ok: true, value: { owned: true, enabled: true } });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('enable-allow')))
      .toHaveAttribute('data-summary-kind', 'systemProxy');
    await expectOwned(desktopApp.desktopDirectory, original);

    // 用户操作与断言：Auto 只省略审批，重复 Restore 返回 not-owned，然后沿正式路径重新接管。
    // User actions and assertions: Auto skips approval only; repeated Restore reports not-owned before the formal Enable path retakes ownership.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.executionMode.auto).click();
    await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-auto', 'settings_restore_system_proxy');
    await expectRestored(desktopApp.desktopDirectory, original);
    const skipped = await completeChange(desktopApp.page, openAiCompatibleLab, 'restore-skipped', 'settings_restore_system_proxy');
    expect(skipped).toMatchObject({ ok: true, value: { restored: false, reason: 'not-owned' } });
    await expectRestored(desktopApp.desktopDirectory, original);
    await completeChange(desktopApp.page, openAiCompatibleLab, 'enable-auto', 'settings_enable_system_proxy');
    await expectOwned(desktopApp.desktopDirectory, original);

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
    const beforeRevokedCalls = await readProxyState(desktopApp.desktopDirectory);
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
    expect(digest(await readProxyState(desktopApp.desktopDirectory))).toBe(digest(beforeRevokedCalls));

    // 重启：第一代正常退出恢复宿主；同 profile 第二代仍自动接管，但 Model 和 Tool 不重放。
    // Restart: generation one restores the host on exit; generation two still takes ownership automatically without replaying Model or Tool calls.
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    await expectRestored(desktopApp.desktopDirectory, original);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - modelRequestCount).toBe(0);
    await expectOwned(relaunchedApp.desktopDirectory, original);
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