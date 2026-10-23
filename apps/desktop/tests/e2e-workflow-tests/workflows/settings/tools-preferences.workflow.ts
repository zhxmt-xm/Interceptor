import { writeFile } from 'node:fs/promises';
import { request } from 'node:http';

import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import type { OpenAiCompatibleLab } from '../../fixtures/agent/openai-compatible-lab';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { connectWorkflowMcpClient, type WorkflowMcpClient } from '../../fixtures/runtime/workflow-mcp-client';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';

const PROMPT = ['Change the selected', 'application preference.'].join(' ');
const ANSWER = ['The preference', 'operation is settled.'].join(' ');
const WORKFLOWS = [
  { id: 'settings.tools.language', tools: ['settings_set_language'] },
  { id: 'settings.tools.preferences', tools: ['settings_set_theme', 'settings_set_export_privacy_defaults'] },
] as const;

const PRIVACY_IDS = {
  maskAuthorization: AUTOMATION_IDS.settings.privacy.maskAuthorization,
  maskCookies: AUTOMATION_IDS.settings.privacy.maskCookies,
  warnBeforeUnmasked: AUTOMATION_IDS.settings.privacy.warnUnmasked,
} as const;

interface McpConfiguration {
  readonly url: string;
  readonly headers: { readonly Authorization: string };
}

function mcpValue(result: unknown): Record<string, unknown> {
  if (!isRecord(result) || !Array.isArray(result.content)) throw new Error('Missing MCP content.');
  expect(result.isError).not.toBe(true);
  const content = result.content.find((entry) => isRecord(entry) && entry.type === 'text');
  if (!isRecord(content) || typeof content.text !== 'string') throw new Error('Missing MCP text.');
  const value: unknown = JSON.parse(content.text);
  if (!isRecord(value)) throw new Error('Invalid MCP preference result.');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agentResult(openAiCompatibleLab: OpenAiCompatibleLab, callId: string): Record<string, unknown> {
  for (const modelRequest of [...openAiCompatibleLab.requestsForAssertions()].reverse()) {
    if (!Array.isArray(modelRequest.messages)) continue;
    const message = modelRequest.messages.find((entry) => isRecord(entry) && entry.role === 'tool' && entry.tool_call_id === callId);
    if (!isRecord(message) || typeof message.content !== 'string') continue;
    const result: unknown = JSON.parse(message.content);
    if (isRecord(result)) return result;
  }
  throw new Error(`Missing preference Tool result: ${callId}`);
}

async function configureProvider(page: Page, openAiCompatibleLab: OpenAiCompatibleLab): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill('Preferences lab');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(openAiCompatibleLab.baseUrl('preferences'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('preferences-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus)).toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
}

async function callAgent(page: Page, openAiCompatibleLab: OpenAiCompatibleLab, callId: string, name: string, args: Record<string, unknown>, verdict?: 'allow' | 'deny'): Promise<Record<string, unknown>> {
  openAiCompatibleLab.enqueueToolCall({ callId, name, arguments: args });
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
  if (verdict !== undefined) {
    await expect(getByAutomationId(page, AutomationIdFactory.agentToolApproval(callId))).toHaveAttribute('data-approval-status', 'pending');
    await getByAutomationId(page, verdict === 'allow' ? AutomationIdFactory.agentToolAllow(callId) : AutomationIdFactory.agentToolDeny(callId)).click();
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
  return agentResult(openAiCompatibleLab, callId);
}

async function createMcpClient(desktopApp: LocalElectronApplicationDriver, testInfo: TestInfo) {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('data-server-state', 'running');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill('Preferences MCP');
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('Missing MCP Client identity.');
  await getByAutomationId(page, AutomationIdFactory.mcpClientCopyConfiguration(clientId)).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { servers: { interceptor: McpConfiguration } };
  const configuration = copied.servers.interceptor;
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.headers.Authorization.slice('Bearer '.length));
  return {
    client: await connectWorkflowMcpClient(configuration, 'settings-preferences', testInfo),
    clientId,
    configuration,
  };
}

async function openPrivacy(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
}

async function readPrivacy(page: Page): Promise<Record<string, boolean>> {
  const values: Record<string, boolean> = {};
  for (const [key, automationId] of Object.entries(PRIVACY_IDS)) {
    await expect(getByAutomationId(page, automationId)).toHaveAttribute('aria-checked', /^(true|false)$/);
    values[key] = await getByAutomationId(page, automationId).getAttribute('aria-checked') === 'true';
  }
  return values;
}

async function assertPreference(page: Page, name: string, values: Record<string, unknown>): Promise<void> {
  if (name === 'settings_set_language') {
    await expect(page.locator('html')).toHaveAttribute('lang', String(values.language));
  } else if (name === 'settings_set_theme') {
    await expect(page.locator('html')).toHaveAttribute('data-theme', String(values.theme));
  } else {
    for (const [key, automationId] of Object.entries(PRIVACY_IDS)) {
      await expect(getByAutomationId(page, automationId)).toHaveAttribute('aria-checked', String(values[key]));
    }
  }
}

async function chooseUiLanguage(page: Page, language: string): Promise<void> {
  const automationId = Object.values(AUTOMATION_IDS.shell.language).find((value) => value === `shell.language.${language}`);
  if (!automationId) throw new Error('Unsupported initial UI language.');
  await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
  await getByAutomationId(page, automationId).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

async function chooseUiTheme(page: Page, theme: string): Promise<void> {
  const automationId = Object.values(AUTOMATION_IDS.shell.theme).find((value) => value === `shell.theme.${theme}`);
  if (!automationId) throw new Error('Unsupported initial UI theme.');
  await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
  await getByAutomationId(page, automationId).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function prepareExportDraft(desktopApp: LocalElectronApplicationDriver, httpTrafficRunner: HttpTrafficRunner): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/preferences/');
  const facetToggles = desktopApp.page.locator('[data-automation-id^="capture.filter.toggle."]');
  for (let index = 0; index < await facetToggles.count(); index += 1) {
    const toggle = facetToggles.nth(index);
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  }
  await startRecording(desktopApp);
  const sourcePath = '/e2e/preferences/export-defaults';
  httpTrafficRunner.respondWith(sourcePath, { statusCode: 200, headers: { 'content-type': 'text/plain', 'content-length': '2' }, body: 'ok' });
  await new Promise<void>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port: desktopApp.capturePort(), path: httpTrafficRunner.url(sourcePath), headers: { host: `127.0.0.1:${httpTrafficRunner.port}`, connection: 'close' } }, (response) => {
      response.resume();
      response.once('end', resolve);
      response.once('error', reject);
    });
    outgoing.once('error', reject);
    outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('Preference source request timed out.')));
    outgoing.end();
  });
  await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.exportMenu)).toBeEnabled();
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

async function runPreferenceWorkflow(desktopApp: LocalElectronApplicationDriver, openAiCompatibleLab: OpenAiCompatibleLab, testInfo: TestInfo, workflow: (typeof WORKFLOWS)[number], httpTrafficRunner?: HttpTrafficRunner): Promise<void> {
    test.setTimeout(180_000);
    testInfo.annotations.push({ type: 'renderer-workflow', description: workflow.id });
    const { page } = desktopApp;
    const initialLanguage = await page.locator('html').getAttribute('lang');
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    if (!initialLanguage || !initialTheme) throw new Error('Initial preferences missing from document state.');
    const languageOnly = workflow.id === 'settings.tools.language';
    let client: WorkflowMcpClient | null = null;
    let relaunchedApp: LocalElectronApplicationDriver | null = null;
    let retainedRequest: { id: string; url: string; path: string } | null = null;
    for (const value of [PROMPT, ANSWER]) desktopApp.registerSensitiveTextForEvidenceAudit(value);
    let workflowError: unknown;
    const cleanupErrors: unknown[] = [];
    try {
      // 准备与Red：真实Settings创建Provider，正式discovery必须披露本流程的设置Tool。
      // Arrange and Red: configure a Provider through real Settings and require this workflow's preference Tools in formal discovery.
      await configureProvider(page, openAiCompatibleLab);
      await desktopApp.stopTrace(testInfo);
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
      openAiCompatibleLab.enqueueToolCall({ callId: 'preferences-discover', name: 'discover_tools', arguments: { capabilityId: 'settings' } });
      openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.input).fill(PROMPT);
      await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.root)).toHaveAttribute('data-turn-status', 'completed');
      const discovery = agentResult(openAiCompatibleLab, 'preferences-discover');
      const matches = isRecord(discovery.value) && Array.isArray(discovery.value.matches) ? discovery.value.matches : [];
      for (const name of workflow.tools) {
        expect(matches.some((entry) => isRecord(entry) && isRecord(entry.descriptor) && entry.descriptor.name === name), `Preference Tool must be discoverable: ${name}`).toBe(true);
      }
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      const configured = await createMcpClient(desktopApp, testInfo);
      client = configured.client;
      let initialPrivacy: Record<string, boolean> = {};
      if (!languageOnly) {
        await openPrivacy(page);
        initialPrivacy = await readPrivacy(page);
      }
      const cases: { name: string; initial: Record<string, unknown>; first: Record<string, unknown>; second: Record<string, unknown> }[] = languageOnly ? [{
        name: 'settings_set_language', initial: { language: initialLanguage },
        first: { language: initialLanguage === 'fr' ? 'ja' : 'fr' }, second: { language: initialLanguage === 'ja' ? 'fr' : 'ja' },
      }] : [{
        name: 'settings_set_theme', initial: { theme: initialTheme }, first: { theme: 'dark' }, second: { theme: 'ember' },
      }, {
        name: 'settings_set_export_privacy_defaults', initial: initialPrivacy,
        first: { maskAuthorization: false, maskCookies: true, warnBeforeUnmasked: false },
        second: { maskAuthorization: true, maskCookies: false, warnBeforeUnmasked: true },
      }];
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();

      // Agent操作：Deny保持原值，Allow和Auto应用指定设置，已挂载UI反映结果。
      // Agent actions: Deny preserves values; Allow and Auto apply the requested preferences and update the mounted UI.
      for (const item of cases) {
        await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.ask).click();
        expect(await callAgent(page, openAiCompatibleLab, `deny-${item.name}`, item.name, item.first, 'deny')).toMatchObject({ ok: false, error: { code: 'tool_denied' } });
        await assertPreference(page, item.name, item.initial);
        expect(await callAgent(page, openAiCompatibleLab, `allow-${item.name}`, item.name, item.first, 'allow')).toEqual({ ok: true, value: item.first });
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolResult(`allow-${item.name}`)))
          .toHaveAttribute('data-summary-kind', item.name === 'settings_set_language' ? 'uiLanguage' : item.name === 'settings_set_theme' ? 'uiTheme' : 'exportPrivacyDefaults');
        await assertPreference(page, item.name, item.first);
        await getByAutomationId(page, AUTOMATION_IDS.agent.executionMode.auto).click();
        expect(await callAgent(page, openAiCompatibleLab, `auto-${item.name}`, item.name, item.second)).toEqual({ ok: true, value: item.second });
        await assertPreference(page, item.name, item.second);
      }
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      await screenshotStep('Agent操作：Deny保持原值，Allow和Auto应用指定设置，已挂载UI反映结果。 / Agent actions: Deny preserves values; Allow and Auto apply the requested preferences and update the mounted UI.');

      // 原UI：Sidebar仍应用同一设置请求；Privacy连续点击只修改各自字段。
      // Original UI: Sidebar uses the same preference request; consecutive Privacy clicks change only their own fields.
      if (languageOnly) await chooseUiLanguage(page, initialLanguage);
      else {
        await chooseUiTheme(page, 'warm');
        await screenshotStep('Privacy中的三个默认设置相互独立 / Inspect the three independent Privacy defaults', {
          highlights: [
            { target: getByAutomationId(page, PRIVACY_IDS.maskAuthorization), label: '1' },
            { target: getByAutomationId(page, PRIVACY_IDS.maskCookies), label: '2' },
            { target: getByAutomationId(page, PRIVACY_IDS.warnBeforeUnmasked), label: '3' },
          ],
        });
        await getByAutomationId(page, PRIVACY_IDS.maskAuthorization).click();
        await getByAutomationId(page, PRIVACY_IDS.maskCookies).click();
        await assertPreference(page, 'settings_set_export_privacy_defaults', { maskAuthorization: false, maskCookies: true, warnBeforeUnmasked: true });
        await screenshotStep('分别修改Authorization与Cookie默认值 / Change Authorization and Cookie defaults separately', {
          highlights: [
            { target: getByAutomationId(page, PRIVACY_IDS.maskAuthorization), label: '1' },
            { target: getByAutomationId(page, PRIVACY_IDS.maskCookies), label: '2' },
          ],
        });
      }
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(page, AUTOMATION_IDS.agent.tools.search).fill('settings_set_');
      for (const item of cases) {
        await getByAutomationId(page, AutomationIdFactory.agentToolAgentSwitch(item.name)).click();
        await expect(getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(item.name))).toHaveAttribute('aria-checked', 'true');
      }
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
      for (const item of cases) {
        expect(await callAgent(page, openAiCompatibleLab, `revoked-${item.name}`, item.name, item.first)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
      }
      await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
      if (!languageOnly) await openPrivacy(page);
      await screenshotStep('原UI：Sidebar仍应用同一设置请求；Privacy连续点击只修改各自字段。 / Original UI: Sidebar uses the same preference request; consecutive Privacy clicks change only their own fields.');

      // MCP：Agent撤权不影响独立Ask/Auto，审批拒绝无修改，允许后结果与页面一致。
      // MCP: Agent revocation leaves independent Ask/Auto access; denial does not mutate settings and allowed results agree with the page.
      for (const item of cases) {
        const before = item.name === 'settings_set_language' ? { language: await page.locator('html').getAttribute('lang') }
          : item.name === 'settings_set_theme' ? { theme: await page.locator('html').getAttribute('data-theme') } : await readPrivacy(page);
        const [denied] = await Promise.all([
          client.callTool({ name: item.name, arguments: item.first }),
          (async () => {
            await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', item.name);
            await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.deny).click();
          })(),
        ]);
        expect(denied).toMatchObject({ isError: true });
        await assertPreference(page, item.name, before);
        const [allowed] = await Promise.all([
          client.callTool({ name: item.name, arguments: item.first }),
          (async () => {
            await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveAttribute('data-tool-name', item.name);
            await getByAutomationId(page, AUTOMATION_IDS.mcp.approval.allow).click();
          })(),
        ]);
        expect(mcpValue(allowed)).toEqual(item.first);
        await assertPreference(page, item.name, item.first);
      }
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(configured.clientId)).click();
      await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(configured.clientId))).toHaveAttribute('data-execution-mode', 'auto');
      if (!languageOnly) await openPrivacy(page);
      for (const item of cases) {
        expect(mcpValue(await client.callTool({ name: item.name, arguments: item.second }))).toEqual(item.second);
        await assertPreference(page, item.name, item.second);
      }
      await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.approval.root)).toHaveCount(0);
      await screenshotStep('MCP：Agent撤权不影响独立Ask/Auto，审批拒绝无修改，允许后结果与页面一致。 / MCP: Agent revocation leaves independent Ask/Auto access; denial does not mutate settings and allowed results agree with the page.');

      // 导出默认值：真实Capture使HAR选项可用，打开中的草稿保持原值，下次打开读取新偏好。
      // Export defaults: real Capture enables HAR options; an open draft retains its values and the next draft reads the updated preferences.
      if (!languageOnly) {
        if (!httpTrafficRunner) throw new Error('Preference export workflow requires its HTTP origin.');
        await prepareExportDraft(desktopApp, httpTrafficRunner);
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
        const authorization = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskAuthorization);
        const cookies = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.maskCookies);
        await expect(authorization).toBeChecked();
        await expect(cookies).not.toBeChecked();
        await screenshotStep('打开HAR时读取当时的Privacy默认值 / An opened HAR draft uses the current Privacy defaults', {
          highlights: [{ target: authorization, label: '1' }, { target: cookies, label: '2' }],
        });
        const nextDefaults = { maskAuthorization: false, maskCookies: true, warnBeforeUnmasked: false };
        expect(mcpValue(await client.callTool({ name: 'settings_set_export_privacy_defaults', arguments: nextDefaults }))).toEqual(nextDefaults);
        await expect(authorization).toBeChecked();
        await expect(cookies).not.toBeChecked();
        await screenshotStep('默认值改变不改写已经打开的HAR草稿 / Changing defaults does not rewrite an open HAR draft', {
          highlights: [{ target: authorization, label: '1' }, { target: cookies, label: '2' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.headerClose).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
        await expect(authorization).not.toBeChecked();
        await expect(cookies).toBeChecked();
        await screenshotStep('重新打开HAR读取新的默认值 / Reopening HAR reads the new defaults', {
          highlights: [{ target: authorization, label: '1' }, { target: cookies, label: '2' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.headerClose).click();
        await openPrivacy(page);
        await assertPreference(page, 'settings_set_export_privacy_defaults', nextDefaults);
        await screenshotStep('关闭前核对保存的Privacy设置 / Inspect saved Privacy settings before closing', {
          highlights: [
            { target: getByAutomationId(page, PRIVACY_IDS.maskAuthorization), label: '1' },
            { target: getByAutomationId(page, PRIVACY_IDS.maskCookies), label: '2' },
            { target: getByAutomationId(page, PRIVACY_IDS.warnBeforeUnmasked), label: '3' },
          ],
        });
      }
      const finalLanguage = await page.locator('html').getAttribute('lang');
      const finalTheme = await page.locator('html').getAttribute('data-theme');
      const finalPrivacy = languageOnly ? {} : await readPrivacy(page);
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
      for (const item of cases) await getByAutomationId(page, AutomationIdFactory.agentToolMcpSwitch(item.name)).click();
      await expect.poll(async () => (await client!.listTools()).tools.filter((tool) => cases.some((item) => item.name === tool.name)).length).toBe(0);
      const missingToolError = process.env.INTERCEPTOR_E2E_MCP_CLIENT === 'current-host'
        ? { code: -32603, message: expect.stringContaining('MCP tool not found') }
        : { code: -32602 };
      for (const item of cases) {
        await expect(client.callTool({ name: item.name, arguments: item.first })).rejects.toMatchObject(missingToolError);
      }
      await client.close();
      client = null;
      await screenshotStep('导出默认值：真实Capture使HAR选项可用，打开中的草稿保持原值，下次打开读取新偏好。 / Export defaults: real Capture enables HAR options; an open draft retains its values and the next draft reads the updated preferences.');

      // Save a Collection definition and retain temporary Capture before the same normal restart.
      // 在同一次正常重启前保存Collection定义，并保留临时Capture作独立对照。
      if (!languageOnly) {
        if (!httpTrafficRunner) throw new Error('Workspace persistence requires the owned HTTP origin.');
        const requestPath = '/e2e/preferences/retained-request';
        const url = httpTrafficRunner.url(requestPath);
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
        await screenshotStep('在Collection中新建需要保留的请求 / Create a Collection request to retain', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.newRequest), label: '1' }],
        });
        await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
        await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url);
        const requestRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.composerCollectionRequest).last();
        const automationId = await requestRow.getAttribute('data-automation-id');
        if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.composerCollectionRequest)) throw new Error('The retained request has no public identifier.');
        const id = automationId.slice(AUTOMATION_ID_PREFIXES.composerCollectionRequest.length);
        retainedRequest = { id, url, path: requestPath };
        await screenshotStep('填写请求URL并等待自动保存，不发送 / Enter the URL for autosave without sending', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
        });
        await requestRow.click({ button: 'right' });
        await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(id, 'rename')).click();
        const rename = getByAutomationId(page, AutomationIdFactory.composerCollectionFolderRename(id));
        await rename.fill('Workspace retained request');
        await screenshotStep('填写保存请求的名称 / Name the saved request', {
          highlights: [{ target: rename, label: '1' }],
        });
        await rename.press('Enter');
        await expect(requestRow).toContainText('Workspace retained request');
        expect(httpTrafficRunner.observation(requestPath)).toBeUndefined();
        await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
        const oldCapture = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
          .filter({ hasText: '/e2e/preferences/export-defaults' });
        await expect(oldCapture).toBeVisible();
        await screenshotStep('关闭前的Capture记录仍是临时数据 / Capture records remain temporary before closing', {
          highlights: [{ target: oldCapture, label: '1' }],
        });
        await screenshotStep('保存后通过窗口Close正常退出 / Close the window normally after saving', {
          highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.shell.window.close), label: '1' }],
        });
      }

      // 证据与重启：偏好与授权持久化，Model零重放；恢复初始值仍通过原UI。
      // Evidence and restart: preferences and permissions persist without Model replay; restore initial values through the original UI.
      const modelRequests = openAiCompatibleLab.evidence().length;
      await closeGeneration(desktopApp, testInfo);
      relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, { userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'relaunch' });
      for (const value of [PROMPT, ANSWER, configured.configuration.headers.Authorization.slice('Bearer '.length)]) relaunchedApp.registerSensitiveTextForEvidenceAudit(value);
      await relaunchedApp.waitUntilReady();
      await relaunchedApp.stopTrace(testInfo);
      await expect(relaunchedApp.page.locator('html')).toHaveAttribute('lang', finalLanguage!);
      await expect(relaunchedApp.page.locator('html')).toHaveAttribute('data-theme', finalTheme!);
      if (!languageOnly) {
        await openPrivacy(relaunchedApp.page);
        await assertPreference(relaunchedApp.page, 'settings_set_export_privacy_defaults', finalPrivacy);
        await screenshotStep('重启后Privacy保持关闭前的设置 / Privacy retains its saved settings after restart', {
          highlights: [
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.maskAuthorization), label: '1' },
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.maskCookies), label: '2' },
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.warnBeforeUnmasked), label: '3' },
          ],
        });
        if (!retainedRequest || !httpTrafficRunner) throw new Error('The saved workspace request was not prepared.');
        await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.composer).click();
        const restoredRow = getByAutomationId(relaunchedApp.page, AutomationIdFactory.composerCollectionRequest(retainedRequest.id));
        await expect(restoredRow).toContainText('Workspace retained request');
        await restoredRow.click();
        const savedUrl = new URL(retainedRequest.url);
        const restoredUrl = getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.composer.url);
        await expect(restoredUrl).toHaveValue(`${savedUrl.host}${savedUrl.pathname}${savedUrl.search}${savedUrl.hash}`);
        await expect(restoredUrl.locator('..')).toContainText(`${savedUrl.protocol}//`);
        expect(httpTrafficRunner.observation(retainedRequest.path)).toBeUndefined();
        await screenshotStep('重启后Collection名称和URL保留且没有自动Send / The Collection name and URL survive restart without an automatic Send', {
          highlights: [{ target: restoredRow, label: '1' }, { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.composer.url), label: '2' }],
        });
        await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
        await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/preferences/');
        await expect(getByAutomationIdPrefix(relaunchedApp.page, AUTOMATION_ID_PREFIXES.captureRequestRow)).toHaveCount(0);
        await screenshotStep('重启后上一代临时Capture记录不再保留 / Temporary Capture records from the previous process are not retained');
      }
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
      await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.tools.search).fill('settings_set_');
      for (const item of cases) {
        await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolAgentSwitch(item.name))).toHaveAttribute('aria-checked', 'false');
        await expect(getByAutomationId(relaunchedApp.page, AutomationIdFactory.agentToolMcpSwitch(item.name))).toHaveAttribute('aria-checked', 'false');
      }
      expect(openAiCompatibleLab.evidence().length).toBe(modelRequests);
      if (languageOnly) await chooseUiLanguage(relaunchedApp.page, initialLanguage);
      else {
        await chooseUiTheme(relaunchedApp.page, initialTheme);
        await openPrivacy(relaunchedApp.page);
        for (const [key, automationId] of Object.entries(PRIVACY_IDS)) {
          if ((await getByAutomationId(relaunchedApp.page, automationId).getAttribute('aria-checked') === 'true') !== initialPrivacy[key]) {
            await getByAutomationId(relaunchedApp.page, automationId).click();
          }
        }
        await assertPreference(relaunchedApp.page, 'settings_set_export_privacy_defaults', initialPrivacy);
        await expect(relaunchedApp.page.locator('html')).toHaveAttribute('lang', initialLanguage);
        await screenshotStep('恢复原来的Privacy默认值和主题 / Restore the original Privacy defaults and theme', {
          highlights: [
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.maskAuthorization), label: '1' },
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.maskCookies), label: '2' },
            { target: getByAutomationId(relaunchedApp.page, PRIVACY_IDS.warnBeforeUnmasked), label: '3' },
          ],
        });
      }
      const evidencePath = testInfo.outputPath('preferences.json');
      await writeFile(evidencePath, JSON.stringify({
        workflow: workflow.id, toolNames: cases.map((item) => item.name), originalUiVerified: true,
        independentRevocation: true, mountedUiUpdated: true, preferencesPersisted: true, restartModelRequests: 0,
        consecutivePrivacyFields: !languageOnly, openExportDraftPreserved: !languageOnly, initialPreferencesRestored: true,
      }, null, 2), 'utf8');
      await testInfo.attach('preferences.json', { path: evidencePath, contentType: 'application/json' });
    } catch (error) {
      workflowError = error;
    } finally {
      // 清理：正常关闭真实Electron并保存trace、进程和完整宿主恢复证据。
      // Cleanup: close the real Electron application gracefully and retain trace, process and complete host recovery evidence.
      if (client !== null) await client.close().catch((error: unknown) => cleanupErrors.push(error));
      await closeGeneration(relaunchedApp ?? desktopApp, testInfo).catch((error: unknown) => cleanupErrors.push(error));
    }
    if (workflowError && cleanupErrors.length > 0) throw new AggregateError([workflowError, ...cleanupErrors], 'Preference workflow and cleanup failed.');
    if (workflowError) throw workflowError;
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Preference cleanup failed.');
}

test('settings.tools.language shares preference changes across UI, Agent and MCP', async ({ desktopApp, openAiCompatibleLab }, testInfo) => {
  await runPreferenceWorkflow(desktopApp, openAiCompatibleLab, testInfo, WORKFLOWS[0]);
});

test('settings.tools.preferences shares preference changes across UI, Agent and MCP', async ({ desktopApp, openAiCompatibleLab, httpTrafficRunner }, testInfo) => {
  await runPreferenceWorkflow(desktopApp, openAiCompatibleLab, testInfo, WORKFLOWS[1], httpTrafficRunner);
});