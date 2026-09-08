import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';

const execFileAsync = promisify(execFile);
const TOOL_NAMES = [
  'settings_replace_tls_insecure_hosts', 'settings_replace_tls_passthrough',
  'settings_enable_https_decryption', 'settings_disable_https_decryption',
] as const;
const INSECURE_HOST = 'tls-tool-origin.example.test';
const PASSTHROUGH_HOST = '*.tls-tool.example.test';
const CONTROL_HOSTS = ['api.enterprise.githubcopilot.com', 'telemetry.enterprise.githubcopilot.com'];
const PROMPT = ['Verify the requested', 'TLS configuration step.'].join(' ');
const ANSWER = ['The TLS configuration', 'step completed.'].join(' ');

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultForCall(lab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  for (const request of [...lab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(request.messages)) continue;
    const message = request.messages.find((entry) => (
      isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId
    ));
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing TLS Tool Result: ${callId}`);
}

function successfulValue(lab: OpenAiCompatibleLab, callId: string): Readonly<Record<string, unknown>> {
  const result = resultForCall(lab, callId);
  expect(result.ok).toBe(true);
  if (!isRecord(result.value)) throw new Error('TLS Tool did not return structured state.');
  return result.value;
}

async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('TLS Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(lab.baseUrl('tls-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('tls-tools-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function openCertificates(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate)).toBeVisible();
}

async function sendMessage(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
}

async function waitForTurn(page: Page): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', 'completed');
}

async function callTool(
  page: Page, lab: OpenAiCompatibleLab, callId: string, name: string,
  args: Readonly<Record<string, unknown>> = {}, verdict?: 'allow' | 'deny',
): Promise<Readonly<Record<string, unknown>>> {
  lab.enqueueToolCall({ callId, name, arguments: args });
  lab.enqueueTurn({ textChunks: [ANSWER] });
  await sendMessage(page);
  const approval = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
  if (verdict !== undefined) {
    await expect(approval).toHaveAttribute('data-approval-status', 'pending');
    const verdictId = verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId);
    await getByAutomationId(page, verdictId).click();
  }
  await waitForTurn(page);
  if (verdict === undefined) await expect(approval).toHaveCount(0);
  const result = resultForCall(lab, callId);
  if (verdict === 'deny') expect(result).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
  else expect(result.ok).toBe(true);
  expect(/\b[A-Za-z]:[\\/]|"(?:privateKey|path)"/.test(JSON.stringify(result))).toBe(false);
  return result;
}

async function setMode(page: Page, mode: 'ask' | 'auto'): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode[mode]).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-tool-execution-mode', mode);
}

async function certificateThumbprint(desktopApp: LocalElectronApplicationDriver): Promise<string> {
  const certificate = new X509Certificate(await readFile(path.join(
    desktopApp.userDataDirectory, 'certificates', 'root-cert.pem',
  )));
  return certificate.fingerprint.replaceAll(':', '');
}

async function isTrusted(thumbprint: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('certutil.exe', ['-verifystore', 'Root', thumbprint], {
      encoding: 'utf8', windowsHide: true,
    });
    return stdout.toUpperCase().includes(thumbprint.toUpperCase());
  } catch {
    return false;
  }
}

async function cleanTlsThroughUi(page: Page, thumbprint: string | null): Promise<void> {
  await openCertificates(page);
  const generate = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.generate);
  const toggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-checked') === 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  }
  await expect(generate).toBeVisible();
  const insecureRemove = getByAutomationId(page, AutomationIdFactory.insecureHostRemove(INSECURE_HOST));
  if (await insecureRemove.isVisible()) {
    await insecureRemove.click();
    await expect(generate).toBeVisible();
    await expect(getByAutomationId(page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toHaveCount(0);
  }
  const uninstall = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall);
  if (thumbprint !== null && await isTrusted(thumbprint)) {
    await expect(uninstall).toBeEnabled();
    await uninstall.click();
    await expect.poll(() => isTrusted(thumbprint)).toBe(false);
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete)).toBeVisible();
  }
  const remove = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.delete);
  if (thumbprint !== null) {
    await expect(remove).toBeEnabled();
    await remove.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeDisabled();
    await expect(remove).toHaveCount(0);
  }
  if (thumbprint !== null) expect(await isTrusted(thumbprint)).toBe(false);
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
  for (const host of [...CONTROL_HOSTS, PASSTHROUGH_HOST]) {
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput)).toBeVisible();
    const button = getByAutomationId(page, AutomationIdFactory.tlsPassthroughRemoveHost(host));
    if (await button.isVisible()) {
      await button.click();
      await expect(getByAutomationId(page, AutomationIdFactory.tlsPassthroughHost(host))).toHaveCount(0);
    }
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

test('settings.tools.tls keeps configuration intent trust and mounted panels consistent', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(300_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.tls' });
  desktopApp.preserveUserDataOnFailure();
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let thumbprint: string | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：经正式 UI 配置 Provider 和控制面 passthrough；发现设置及 Capture Tool，不注入任何产品状态。
    // Arrange: configure the Provider and control-plane passthrough through UI, then discover Settings and Capture without injecting state.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
    for (const host of CONTROL_HOSTS) {
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.tlsPassthrough.hostInput).fill(host);
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.tlsPassthrough.addHost).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(host))).toBeVisible();
    }
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    await callTool(desktopApp.page, openAiCompatibleLab, 'tls-discover', 'discover_tools', { capabilityId: 'settings' });
    const discovery = successfulValue(openAiCompatibleLab, 'tls-discover');
    const names = Array.isArray(discovery.matches) ? discovery.matches.flatMap((entry) => (
      isRecord(entry) && isRecord(entry.descriptor) && typeof entry.descriptor.name === 'string' ? [entry.descriptor.name] : []
    )).filter((name) => TOOL_NAMES.some((expected) => expected === name)) : [];
    expect(names).toEqual(TOOL_NAMES);

    // 用户操作：保持证书面板挂载，Deny 不改名单，Allow 与 Auto 成功后当前行立即同步。
    // User actions: keep Certificates mounted; Deny preserves the list while Allow and Auto update its visible rows immediately.
    await openCertificates(desktopApp.page);
    await callTool(desktopApp.page, openAiCompatibleLab, 'insecure-deny', TOOL_NAMES[0], { hosts: [INSECURE_HOST] }, 'deny');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toHaveCount(0);
    await callTool(desktopApp.page, openAiCompatibleLab, 'insecure-allow', TOOL_NAMES[0], { hosts: [INSECURE_HOST.toUpperCase()] }, 'allow');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toBeVisible();
    await setMode(desktopApp.page, 'auto');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('insecure-allow')))
      .toHaveAttribute('data-summary-kind', 'tlsHosts');
    await callTool(desktopApp.page, openAiCompatibleLab, 'insecure-clear', TOOL_NAMES[0], { hosts: [] });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toHaveCount(0);
    await callTool(desktopApp.page, openAiCompatibleLab, 'insecure-auto', TOOL_NAMES[0], { hosts: [INSECURE_HOST] });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toBeVisible();

    // 用户操作：passthrough 按真实查询的 revision 提交；当前面板刷新，旧 revision 不覆盖新配置。
    // User actions: submit passthrough using its queried revision; the mounted panel refreshes and stale revisions cannot overwrite new settings.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-before', 'settings_get_tls_passthrough');
    let revision = Number(successfulValue(openAiCompatibleLab, 'passthrough-before').revision);
    const hosts = [...CONTROL_HOSTS, PASSTHROUGH_HOST];
    await setMode(desktopApp.page, 'ask');
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-deny', TOOL_NAMES[1], { hosts, expectedRevision: revision }, 'deny');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toHaveCount(0);
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-allow', TOOL_NAMES[1], {
      hosts: [...CONTROL_HOSTS, PASSTHROUGH_HOST.toUpperCase()], expectedRevision: revision,
    }, 'allow');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();
    await setMode(desktopApp.page, 'auto');
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('passthrough-allow')))
      .toHaveAttribute('data-summary-kind', 'tlsPassthrough');
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-stale', TOOL_NAMES[1], { hosts: CONTROL_HOSTS, expectedRevision: revision });
    expect(successfulValue(openAiCompatibleLab, 'passthrough-stale')).toMatchObject({ ok: false, reason: 'conflict' });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();
    revision += 1;
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-clear', TOOL_NAMES[1], { hosts: CONTROL_HOSTS, expectedRevision: revision });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toHaveCount(0);
    revision += 1;
    await callTool(desktopApp.page, openAiCompatibleLab, 'passthrough-auto', TOOL_NAMES[1], { hosts, expectedRevision: revision });
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();

    // 信任边界：未生成 CA 时只保存解密意图；证书只能由真实产品 UI 生成并通过 OS 正式安装。
    // Trust boundary: without a CA only decryption intent is saved; generate and install the certificate solely through real product UI and OS trust.
    await openCertificates(desktopApp.page);
    await callTool(desktopApp.page, openAiCompatibleLab, 'enable-untrusted', TOOL_NAMES[2]);
    expect(successfulValue(openAiCompatibleLab, 'enable-untrusted')).toMatchObject({ trusted: false, mitmEnabled: true });
    expect(successfulValue(openAiCompatibleLab, 'enable-untrusted').decrypting).toBe(false);
    await callTool(desktopApp.page, openAiCompatibleLab, 'disable-untrusted', TOOL_NAMES[3]);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.generate).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
    thumbprint = await certificateThumbprint(desktopApp);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeVisible({ timeout: 30_000 });
    expect(await isTrusted(thumbprint)).toBe(true);

    // 用户操作：启用和停用分别覆盖 Ask Deny/Allow 与 Auto，当前开关及真实 Core 状态保持一致。
    // User actions: cover Ask Deny/Allow and Auto for both directions, keeping the mounted switch and real Core state consistent.
    const toggle = getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.mitmToggle);
    await setMode(desktopApp.page, 'ask');
    await callTool(desktopApp.page, openAiCompatibleLab, 'enable-deny', TOOL_NAMES[2], {}, 'deny');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await callTool(desktopApp.page, openAiCompatibleLab, 'enable-allow', TOOL_NAMES[2], {}, 'allow');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(successfulValue(openAiCompatibleLab, 'enable-allow').decrypting).toBe(true);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('enable-allow')))
      .toHaveAttribute('data-summary-kind', 'decryption');
    await callTool(desktopApp.page, openAiCompatibleLab, 'disable-deny', TOOL_NAMES[3], {}, 'deny');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await callTool(desktopApp.page, openAiCompatibleLab, 'disable-allow', TOOL_NAMES[3], {}, 'allow');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(successfulValue(openAiCompatibleLab, 'disable-allow').decrypting).toBe(false);
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolResult('disable-allow')))
      .toHaveAttribute('data-summary-kind', 'decryption');
    await setMode(desktopApp.page, 'auto');
    await callTool(desktopApp.page, openAiCompatibleLab, 'enable-auto', TOOL_NAMES[2]);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await callTool(desktopApp.page, openAiCompatibleLab, 'disable-auto', TOOL_NAMES[3]);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await callTool(desktopApp.page, openAiCompatibleLab, 'enable-persisted', TOOL_NAMES[2]);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await certificateThumbprint(desktopApp)).toBe(thumbprint);

    // 撤权与重启：四项关闭后旧 Chat 无法执行，保留的配置和信任跨进程恢复但不重放请求。
    // Revocation and restart: stale Chat calls cannot execute disabled Tools; configuration and trust survive restart without replay.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }
    for (const name of TOOL_NAMES) {
      openAiCompatibleLab.enqueueToolCall({ callId: `disabled-${name}`, name, arguments: {} });
    }
    openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
    await sendMessage(desktopApp.page);
    await waitForTurn(desktopApp.page);
    for (const name of TOOL_NAMES) {
      expect(resultForCall(openAiCompatibleLab, `disabled-${name}`)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    }
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length - modelRequestCount).toBe(0);
    await openCertificates(relaunchedApp.page);
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.certificates.mitmToggle)).toHaveAttribute('aria-checked', 'true');
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.insecureHost(INSECURE_HOST))).toBeVisible();
    expect(await certificateThumbprint(relaunchedApp)).toBe(thumbprint);
    expect(await isTrusted(thumbprint)).toBe(true);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.tlsPassthrough).click();
    await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.tlsPassthroughHost(PASSTHROUGH_HOST))).toBeVisible();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
    }

    // 证据：仅记录契约结论与请求哈希，finally 通过 UI 移除真实信任、证书和测试配置。
    // Evidence: retain contract outcomes and request hashes only; finally removes real trust, certificate, and test settings through UI.
    const evidencePath = testInfo.outputPath('settings-tools-tls.json');
    await writeFile(evidencePath, JSON.stringify({
      names, askDenyCount: 4, askAllowCount: 4, mountedPanelsSynced: true,
      staleRevisionRejected: true, untrustedIntentPreserved: true, effectiveStateVerified: true,
      certificateIdentityPreserved: true, restartModelRequestCount: 0, revokedCount: 4,
      requestBodyHashes: openAiCompatibleLab.evidence().map((entry) => entry.requestBodyHash),
    }, null, 2), 'utf8');
    await testInfo.attach('settings-tools-tls.json', { path: evidencePath, contentType: 'application/json' });
  } catch (error) {
    workflowError = error;
  } finally {
    // 销毁：始终先清理 CA 信任与配置，再退出当前代际；清理失败保留 profile 并报告完整错误。
    // Teardown: always clean CA trust and settings before closing the current generation; preserve the profile and all errors on cleanup failure.
    const activeApp = relaunchedApp ?? desktopApp;
    if (!activeApp.page.isClosed()) {
      try {
        await cleanTlsThroughUi(activeApp.page, thumbprint);
        await testInfo.attach('tls-cleanup.json', {
          body: Buffer.from(JSON.stringify({
            testCaWasGenerated: thumbprint !== null,
            trustRemoved: thumbprint === null ? null : !await isTrusted(thumbprint),
            testCertificateRemoved: true,
            insecureHostRemoved: true,
            passthroughHostsRemoved: true,
          })),
          contentType: 'application/json',
        });
        desktopApp.releasePreservedUserData();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await closeGeneration(activeApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'TLS workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'TLS cleanup failed.');
});