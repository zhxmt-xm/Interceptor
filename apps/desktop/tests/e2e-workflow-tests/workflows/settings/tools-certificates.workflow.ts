import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { closeCertificateWindow, listCertificateWindows, verifyAndCloseCertificateWindow, type CertificateWindow } from '../../fixtures/ui/windows-certificate-windows';

const execFileAsync = promisify(execFile);

const TOOL_NAMES = [
  'settings_generate_certificate', 'settings_install_certificate',
  'settings_uninstall_certificate', 'settings_delete_certificate',
  'settings_reveal_certificate', 'settings_view_certificate',
] as const;
const PROMPT = ['Verify the requested', 'certificate operation.'].join(' ');
const ANSWER = ['The certificate', 'operation completed.'].join(' ');

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
  throw new Error(`Missing certificate Tool result: ${callId}`);
}

async function configureProvider(page: Page, lab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Certificate Tool lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(lab.baseUrl('certificate-tools'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('certificate-tools-model');
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

async function callAgentTool(
  page: Page, lab: OpenAiCompatibleLab, callId: string, name: string,
  options: { verdict?: 'allow' | 'deny'; expectedError?: string; fails?: boolean; args?: Readonly<Record<string, unknown>> } = {},
): Promise<Readonly<Record<string, unknown>> | null> {
  lab.enqueueToolCall({ callId, name, arguments: options.args ?? {} });
  if (!options.fails) lab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  const approval = getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId));
  if (options.verdict !== undefined) {
    await expect(approval).toHaveAttribute('data-approval-status', 'pending');
    const verdictId = options.verdict === 'allow'
      ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId);
    await getByAutomationId(page, verdictId).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root))
    .toHaveAttribute('data-turn-status', options.fails ? 'failed' : 'completed');
  if (options.fails) return null;
  const result = resultForCall(lab, callId);
  const errorCode = options.verdict === 'deny' ? 'tool_denied' : options.expectedError;
  if (errorCode) expect(result).toMatchObject({ ok: false, error: { code: errorCode } });
  else expect(result.ok).toBe(true);
  expect(/\b[A-Za-z]:[\\/]|"(?:privateKey|path)"/.test(JSON.stringify(result))).toBe(false);
  return result;
}

async function certificateIdentity(desktopApp: LocalElectronApplicationDriver): Promise<string | null> {
  try {
    const pem = await readFile(path.join(desktopApp.userDataDirectory, 'certificates', 'root-cert.pem'));
    return new X509Certificate(pem).fingerprint.replaceAll(':', '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function rootFingerprints(): Promise<string[]> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command',
    'ConvertTo-Json -InputObject @(Get-ChildItem Cert:\\LocalMachine\\Root | Select-Object -ExpandProperty Thumbprint | Sort-Object) -Compress',
  ], { encoding: 'utf8', windowsHide: true });
  return JSON.parse(stdout.trim()) as string[];
}

async function setMode(page: Page, mode: 'ask' | 'auto'): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode[mode]).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-tool-execution-mode', mode);
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver) {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Certificate MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('Missing certificate MCP Client identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    servers: { interceptor: { url: string; headers: { Authorization: string } } };
  };
  const configuration = copied.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
  const client = new Client({ name: 'certificate-workflow', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(configuration.url), { requestInit: { headers: configuration.headers } }));
  return { client, clientId };
}

async function callMcpTool(client: Client, page: Page, name: string, verdict?: 'allow' | 'deny') {
  const [result] = await Promise.all([
    client.callTool({ name, arguments: {} }),
    (async () => {
      if (!verdict) return;
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', name);
      await getByAutomationId(page, verdict === 'allow' ? AUTOMATION_IDS.mcp.approval.allow : AUTOMATION_IDS.mcp.approval.deny).click();
    })(),
  ]);
  if (verdict === 'deny') {
    expect(result.isError).toBe(true);
    return null;
  }
  expect(result.isError).not.toBe(true);
  const text = result.content.find((entry) => entry.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('Certificate MCP result has no text.');
  const value: unknown = JSON.parse(text);
  expect(/\b[A-Za-z]:[\\/]|"(?:privateKey|path)"/.test(text)).toBe(false);
  return value;
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

test('settings.tools.certificates shares certificate lifecycle and viewing across Agent and MCP', async ({
  desktopApp, openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(420_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.tools.certificates' });
  desktopApp.preserveUserDataOnFailure();
  for (const text of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(text);
  const rootsBefore = await rootFingerprints();
  const certificateDirectory = path.join(desktopApp.userDataDirectory, 'certificates');
  const windowsBefore = await listCertificateWindows(certificateDirectory);
  const ownedWindows: CertificateWindow[] = [];
  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let client: Client | null = null;
  let workflowError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    // 准备：经真实UI配置Provider，发现六项证书生命周期与查看Tool。
    // Arrange: configure the Provider through UI and discover the six certificate lifecycle and viewing Tools.
    await configureProvider(desktopApp.page, openAiCompatibleLab);
    await desktopApp.stopTrace(testInfo);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.panel.toggle).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.chat.new).click();
    const discovery = await callAgentTool(desktopApp.page, openAiCompatibleLab, 'certificate-discover', 'discover_tools', {
      args: { capabilityId: 'settings' },
    });
    if (!discovery) throw new Error('Certificate discovery did not return a result.');
    const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
    const names = matches.flatMap((match) => (
      isRecord(match) && isRecord(match.descriptor) && typeof match.descriptor.name === 'string' ? [match.descriptor.name] : []
    )).filter((name) => TOOL_NAMES.some((expected) => expected === name));
    expect(names).toEqual(TOOL_NAMES);

    // 用户操作与业务断言：Ask拒绝不能生成CA，Allow通过正式Main操作生成且刷新挂载面板。
    // User actions and assertions: Ask denial cannot create a CA; Allow generates it through Main and refreshes the mounted panel.
    await openCertificates(desktopApp.page);
    for (const name of TOOL_NAMES) {
      await callAgentTool(desktopApp.page, openAiCompatibleLab, `deny-${name}`, name, { verdict: 'deny' });
    }
    expect(await certificateIdentity(desktopApp)).toBeNull();
    expect(await rootFingerprints()).toEqual(rootsBefore);
    expect(await listCertificateWindows(certificateDirectory)).toEqual(windowsBefore);
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'generate-allow', TOOL_NAMES[0], { verdict: 'allow' });
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
    const generatedIdentity = await certificateIdentity(desktopApp);
    expect(generatedIdentity).not.toBeNull();
    await setMode(desktopApp.page, 'auto');
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'regenerate-auto', TOOL_NAMES[0]);
    const installedIdentity = await certificateIdentity(desktopApp);
    expect(installedIdentity).not.toBe(generatedIdentity);
    await setMode(desktopApp.page, 'ask');
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'install-allow', TOOL_NAMES[1], { verdict: 'allow' });
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    expect(await rootFingerprints()).toEqual([...rootsBefore, installedIdentity!].sort());
    await setMode(desktopApp.page, 'auto');
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'regenerate-trusted', TOOL_NAMES[0], { fails: true });
    expect(await certificateIdentity(desktopApp)).toBe(installedIdentity);
    expect(await rootFingerprints()).toEqual([...rootsBefore, installedIdentity!].sort());

    // 原生窗口：打开并关闭本轮Explorer与Viewer，MMC由独立workflow验收。
    // Native windows: open and close this workflow's Explorer and viewer; MMC has an independent workflow.
    await setMode(desktopApp.page, 'ask');
    for (const [name, kind] of [[TOOL_NAMES[4], 'reveal'], [TOOL_NAMES[5], 'view']] as const) {
      const before = await listCertificateWindows(certificateDirectory);
      await callAgentTool(desktopApp.page, openAiCompatibleLab, `allow-${name}`, name, { verdict: 'allow' });
      await verifyAndCloseCertificateWindow(kind, before, certificateDirectory, ownedWindows);
    }
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'uninstall-allow', TOOL_NAMES[2], { verdict: 'allow' });
    expect(await rootFingerprints()).toEqual(rootsBefore);
    expect(await certificateIdentity(desktopApp)).toBe(installedIdentity);
    await setMode(desktopApp.page, 'auto');
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'reinstall-auto', TOOL_NAMES[1]);
    await setMode(desktopApp.page, 'ask');
    await callAgentTool(desktopApp.page, openAiCompatibleLab, 'delete-trusted-allow', TOOL_NAMES[3], { verdict: 'allow' });
    expect(await rootFingerprints()).toEqual(rootsBefore);
    expect(await certificateIdentity(desktopApp)).toBeNull();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install)).toBeDisabled();

    // MCP：产品UI创建独立Client，Ask拒绝六项不产生副作用，Auto依次验证相同正式owner。
    // MCP: create a Client through UI; Ask denials have no effects and Auto exercises the same real owners.
    const configured = await createMcpClient(desktopApp);
    client = configured.client;
    expect((await client.listTools()).tools.map((tool) => tool.name).filter((name) => TOOL_NAMES.some((expected) => name === expected)))
      .toEqual(TOOL_NAMES);
    await openCertificates(desktopApp.page);
    for (const name of TOOL_NAMES) await callMcpTool(client, desktopApp.page, name, 'deny');
    expect(await certificateIdentity(desktopApp)).toBeNull();
    expect(await rootFingerprints()).toEqual(rootsBefore);
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[0], 'allow');
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientAuto(configured.clientId)).click();
    await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.mcpClientRow(configured.clientId)))
      .toHaveAttribute('data-execution-mode', 'auto');
    await openCertificates(desktopApp.page);
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[0]);
    const mcpIdentity = await certificateIdentity(desktopApp);
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[1]);
    expect(await rootFingerprints()).toEqual([...rootsBefore, mcpIdentity!].sort());
    for (const [name, kind] of [[TOOL_NAMES[4], 'reveal'], [TOOL_NAMES[5], 'view']] as const) {
      const before = await listCertificateWindows(certificateDirectory);
      expect(await callMcpTool(client, desktopApp.page, name)).toEqual({ requested: true });
      await verifyAndCloseCertificateWindow(kind, before, certificateDirectory, ownedWindows);
    }
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[2]);
    expect(await rootFingerprints()).toEqual(rootsBefore);
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[1]);
    await callMcpTool(client, desktopApp.page, TOOL_NAMES[3]);
    expect(await rootFingerprints()).toEqual(rootsBefore);
    expect(await certificateIdentity(desktopApp)).toBeNull();

    // 撤权和重启：两列授权各自关闭，旧调用无效；保留未受信任CA确认跨代身份和零重放。
    // Revocation and restart: disable both entry points, reject stale calls, and preserve an untrusted CA to verify identity without replay.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolAgentSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name)).click();
      await expect(getByAutomationId(desktopApp.page, AutomationIdFactory.agentToolMcpSwitch(name))).toHaveAttribute('aria-checked', 'false');
      await callAgentTool(desktopApp.page, openAiCompatibleLab, `revoked-${name}`, name, { expectedError: 'unknown_tool' });
      await expect(client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 });
    }
    await client.close();
    client = null;
    await openCertificates(desktopApp.page);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.generate).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
    const persistedIdentity = await certificateIdentity(desktopApp);
    const modelRequestCount = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch',
    });
    for (const text of [PROMPT, ANSWER]) relaunchedApp.registerSensitiveTextForEvidenceAudit(text);
    await relaunchedApp.waitUntilReady();
    await relaunchedApp.stopTrace(testInfo);
    expect(openAiCompatibleLab.evidence().length).toBe(modelRequestCount);
    expect(await certificateIdentity(relaunchedApp)).toBe(persistedIdentity);
    expect(await rootFingerprints()).toEqual(rootsBefore);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    for (const name of TOOL_NAMES) {
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill(name);
      for (const automationId of [AutomationIdFactory.agentToolAgentSwitch(name), AutomationIdFactory.agentToolMcpSwitch(name)]) {
        await expect(getByAutomationId(relaunchedApp.page, automationId)).toHaveAttribute('aria-checked', 'false');
      }
    }
    await testInfo.attach('certificate-tools.json', {
      body: Buffer.from(JSON.stringify({ agentCalls: 6, mcpCalls: 6, agentDenied: 6, mcpDenied: 6,
        trustedRegenerationRejected: true, nativeWindowsOpenedAndClosed: 4, restartRequests: 0, revoked: 12 })),
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    // 清理与证据：仅经正式UI删除本轮材料，保留失败profile，完成进程及宿主guard验证。
    // Cleanup and evidence: delete test material through UI only, preserve failed profiles, and verify process and host restoration.
    const activeApp = relaunchedApp ?? desktopApp;
    if (client) await client.close().catch((error: unknown) => cleanupErrors.push(error));
    try {
      const oldHandles = new Set(windowsBefore.map((window) => window.handle));
      const cleanupWindows = new Map([...ownedWindows, ...await listCertificateWindows(certificateDirectory)]
        .map((window) => [window.handle, window]));
      for (const window of cleanupWindows.values()) {
        if (!oldHandles.has(window.handle)) await closeCertificateWindow(window);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (!activeApp.page.isClosed()) {
        await openCertificates(activeApp.page);
        const identity = await certificateIdentity(activeApp);
        if (identity) {
          if ((await rootFingerprints()).includes(identity)) {
            const uninstall = getByAutomationId(activeApp.page, AUTOMATION_IDS.settings.certificates.uninstall);
            await expect(uninstall).toBeEnabled();
            await uninstall.click();
            await expect.poll(async () => (await rootFingerprints()).includes(identity)).toBe(false);
          }
          const remove = getByAutomationId(activeApp.page, AUTOMATION_IDS.settings.certificates.delete);
          await expect(remove).toBeEnabled();
          await remove.click();
          await expect.poll(() => certificateIdentity(activeApp)).toBeNull();
        }
      }
      expect(await rootFingerprints()).toEqual(rootsBefore);
      await testInfo.attach('certificate-cleanup.json', {
        body: Buffer.from(JSON.stringify({ rootStoreRestored: true, certificateRemoved: true })), contentType: 'application/json',
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    await closeGeneration(activeApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
  }
  if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Certificate workflow and cleanup failed.');
  if (workflowError) throw workflowError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Certificate cleanup failed.');
});
