import { createHash, randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { copyMcpClientConfiguration, openMcpSettings, resumeRecording } from '../../fixtures/ui/mcp-workflow';

const HOST_KINDS = ['vscode-copilot', 'copilot-cli', 'claude-code', 'codex'] as const;
const hostKind = process.env.INTERCEPTOR_E2E_MCP_HOST;
const hostVersion = process.env.INTERCEPTOR_E2E_MCP_HOST_VERSION;
const phase = process.env.INTERCEPTOR_E2E_MCP_PHASE ?? 'prepare';
const existingProfile = process.env.INTERCEPTOR_E2E_MCP_PROFILE;
const HOST_STEP_TIMEOUT = 10 * 60_000;

test.skip(hostKind === undefined, 'Requires the current development Agent and its real MCP Host.');
test.use({
  desktopAppUserDataDirectory: phase === 'verify' ? existingProfile : undefined,
  preserveDesktopAppUserData: phase === 'prepare',
});

test(`mcp.current-host ${phase} uses the current Host and a retained isolated profile`, async ({
  desktopApp,
  httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(phase === 'prepare' ? 60_000 : 30 * 60_000);
  desktopApp.preserveUserDataOnFailure();
  if (phase !== 'prepare' && phase !== 'verify') {
    throw new Error('INTERCEPTOR_E2E_MCP_PHASE must be prepare or verify.');
  }
  if (phase === 'verify' && !existingProfile) {
    throw new Error('The verify phase requires INTERCEPTOR_E2E_MCP_PROFILE from a successful prepare phase.');
  }
  if (!HOST_KINDS.some((kind) => kind === hostKind) || !hostVersion?.trim()) {
    throw new Error('Set a verified INTERCEPTOR_E2E_MCP_HOST and INTERCEPTOR_E2E_MCP_HOST_VERSION.');
  }
  testInfo.annotations.push({ type: 'renderer-workflow', description: `mcp.current-host.${phase}` });
  const { page } = desktopApp;
  const requestPath = `/e2e/current-mcp-host/${randomUUID()}`;
  const responseBody = JSON.stringify({ source: 'current-mcp-host-workflow', requestPath });
  const configurationPath = path.join(desktopApp.userDataDirectory, 'current-host-mcp.json');
  const preparedStatePath = path.join(desktopApp.userDataDirectory, 'current-host-prepared.json');
  const phasePath = testInfo.outputPath('current-host-phase.json');
  let tokenHash = '';
  let endpoint = '';
  const phases: string[] = [];
  let completed = false;
  const publishPhase = async (stage: string): Promise<void> => {
    phases.push(stage);
    await writeFile(phasePath, JSON.stringify({
      hostKind, hostVersion, phase, stage, endpoint, configurationPath,
      userDataDirectory: desktopApp.userDataDirectory,
      tokenHash, requestPath, responseBody,
    }, null, 2), 'utf8');
    console.log(`[current-mcp-host] ${stage}; instructions: ${phasePath}`);
  };

  try {
    // 准备：创建或恢复同一测试Client，不从Store注入凭据或复制业务状态。
    // Arrange: create or resume the same test Client without injecting credentials or business state.
    await openMcpSettings(page);
    const server = getByAutomationId(page, AUTOMATION_IDS.mcp.server.root);
    if (phase === 'prepare') {
      await expect(server).toHaveAttribute('data-server-state', 'disabled');
      await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
      await expect(server).toHaveAttribute('data-server-state', 'running');
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill(`Current ${hostKind}`);
      await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
    }
    await expect(server).toHaveAttribute('data-server-state', 'running');
    const row = page.locator('[data-automation-id^="mcp.client.row."]');
    await expect(row).toHaveCount(1);
    const clientId = await row.getAttribute('data-client-id');
    if (!clientId) throw new Error('The real MCP Client row omitted its id.');
    const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
    endpoint = configuration.url;
    tokenHash = createHash('sha256').update(configuration.token).digest('hex');
    if (phase === 'prepare') {
      await writeFile(configurationPath, JSON.stringify({
        name: 'interceptor-current-host',
        type: 'http',
        url: configuration.url,
        headers: { Authorization: `Bearer ${configuration.token}` },
      }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await writeFile(preparedStatePath, JSON.stringify({
        workflow: 'mcp.current-host', clientId, endpoint, tokenHash,
      }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      // 证据与清理：准备结束即正常退出App并恢复系统，只保留隔离配置等待Host加载。
      // Evidence and cleanup: finish preparation by closing the App normally; retain only its isolated configuration.
      await publishPhase('prepared');
      return;
    }
    const prepared: unknown = JSON.parse(await readFile(preparedStatePath, 'utf8'));
    expect(prepared).toEqual({ workflow: 'mcp.current-host', clientId, endpoint, tokenHash });
    await getByAutomationId(page, AutomationIdFactory.mcpClientAsk(clientId)).click();
    await expect(row).toHaveAttribute('data-execution-mode', 'ask');

    // 用户操作：准备自产流量，当前Agent负责正式Host配置、查询和MCP调用，本workflow不构造SDK Client。
    // User actions: generate owned traffic; the current Agent configures its Host and calls MCP, without a test SDK Client.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    httpTrafficRunner.respondWith(requestPath, {
      headers: { 'content-type': 'application/json' },
      body: responseBody,
    });
    const response = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath);
    expect(response.body).toBe(responseBody);
    const requests = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: requestPath });
    await expect(requests).toHaveCount(1);
    await desktopApp.writeEvidence(testInfo);
    await publishPhase('connect-query-then-deny-stop');

    // 业务断言：真实Host先后触发Deny和Allow，UI裁决决定真实Recording，不以模型总结代替。
    // Business assertion: the real Host triggers Deny and Allow; actual UI verdicts govern Recording.
    const approval = getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root);
    const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
    await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording', { timeout: HOST_STEP_TIMEOUT });
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
    await expect(approval).toHaveCount(0);
    await expect(recording).toHaveAttribute('aria-pressed', 'true');
    await publishPhase('allow-stop');
    await expect(approval).toHaveAttribute('data-tool-name', 'capture_stop_recording', { timeout: HOST_STEP_TIMEOUT });
    await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await resumeRecording(desktopApp);

    // 用户操作：通过真实Settings切换Auto，当前Host再次执行相同Tool。
    // User actions: switch to Auto through real Settings, then let the current Host call the same Tool again.
    await openMcpSettings(page);
    await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId)))
      .toHaveAttribute('data-execution-mode', 'auto');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await publishPhase('auto-stop');
    await expect(recording).toHaveAttribute('aria-pressed', 'false', { timeout: HOST_STEP_TIMEOUT });
    await expect(approval).toHaveCount(0);
    await resumeRecording(desktopApp);

    // 业务断言：当前Agent继续适用场景，最后真实调用capture_clear结束这一代Host验收。
    // Business assertion: the current Agent exercises applicable scenarios and calls capture_clear last.
    await publishPhase('exercise-tools-then-clear');
    await expect(requests).toHaveCount(0, { timeout: HOST_STEP_TIMEOUT });
    await expect(recording).toHaveAttribute('aria-pressed', 'true');

    // 证据与清理：真实撤销本轮凭据、关闭MCP，fixture负责App正常退出及完整宿主恢复。
    // Evidence and cleanup: revoke this credential and stop MCP; the fixture verifies App shutdown and host restoration.
    await openMcpSettings(page);
    await getByAutomationId(page, AutomationIdFactory.mcpClientRevoke(clientId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.client.revokeConfirm).click();
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(server).toHaveAttribute('data-server-state', 'disabled');
    await writeFile(testInfo.outputPath('current-host-evidence.json'), JSON.stringify({
      hostKind, hostVersion, endpoint, tokenHash, requestPath, phases,
      actualOrigin: httpTrafficRunner.evidence(),
      deniedCallPreservedRecording: true,
      allowedCallStoppedRecording: true,
      autoCallStoppedRecording: true,
      finalClearPreservedRecording: true,
    }, null, 2), 'utf8');
    await publishPhase('completed-remove-host-configuration');
    completed = true;
  } finally {
    if (completed) await rm(configurationPath, { force: true });
  }
});
