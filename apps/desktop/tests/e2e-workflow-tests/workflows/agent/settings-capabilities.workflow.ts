import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/local-electron-driver';

interface ProductState {
  readonly recording: string | null;
  readonly rulesRevision: string | null;
  readonly systemProxyControl: 'enable' | 'restore';
}

interface ToolSettingsEvidence {
  toolNames: string[];
  initialProductState: ProductState | null;
  finalProductState: ProductState | null;
  disabledRestored: boolean;
  allEnabledRestored: boolean;
}

/** Navigate through public UI to the global Agent settings section. */
async function openAgentSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.tools.capabilities)).toBeVisible();
}

/** Read business state only from public product UI. */
async function readProductState(page: Page): Promise<ProductState> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  const recording = await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.recordingToggle,
  ).getAttribute('aria-pressed');

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  const revision = getByAutomationId(page, AUTOMATION_IDS.rules.status.revision);
  await expect(revision).toHaveAttribute('data-revision', /^\d+$/);
  const rulesRevision = await revision.getAttribute('data-revision');

  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  const restore = getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore);
  const enable = getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable);
  await expect(restore.or(enable)).toBeVisible();
  const systemProxyControl = await restore.isVisible().catch(() => false) ? 'restore' : 'enable';

  return { recording, rulesRevision, systemProxyControl };
}

/** Read stable Tool names in current DOM order. */
async function toolNames(page: Page): Promise<string[]> {
  return page.locator('[data-automation-id^="agent.tools.row."]').evaluateAll((rows) => (
    rows.map((row) => row.getAttribute('data-automation-id')?.replace('agent.tools.row.', '') ?? '')
  ));
}

/** Assert both public switches for one Tool. */
async function expectToolState(
  page: Page,
  toolName: string,
  target: 'agent' | 'mcp',
  enabled: boolean,
): Promise<void> {
  const automationId = target === 'agent'
    ? AutomationIdFactory.agentToolAgentSwitch(toolName)
    : AutomationIdFactory.agentToolMcpSwitch(toolName);
  await expect(getByAutomationId(page, automationId))
    .toHaveAttribute('aria-checked', enabled ? 'true' : 'false');
}

/** Close one application generation and preserve its normal destroy evidence. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

test('agent.tools.settings-capabilities persists independent default-on switches', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.tools.settings-capabilities',
  });

  let activeApp: LocalElectronApplicationDriver | null = desktopApp;
  let workflowError: unknown;
  let cleanupError: unknown;
  const evidence: ToolSettingsEvidence = {
    toolNames: [],
    initialProductState: null,
    finalProductState: null,
    disabledRestored: false,
    allEnabledRestored: false,
  };

  try {
    // 准备：记录真实产品业务初态，再进入无Provider也必须可用的Tool设置。
    // Arrange: record real product state, then open Tool settings that require no Provider.
    evidence.initialProductState = await readProductState(desktopApp.page);
    await openAgentSettings(desktopApp.page);
    evidence.toolNames = await toolNames(desktopApp.page);
    expect(evidence.toolNames).toHaveLength(24);
    expect(new Set(evidence.toolNames).size).toBe(24);

    // 业务断言：fresh profile的24行、48个Agent/MCP开关必须全部开启。
    // Business assertion: all 48 Agent/MCP switches across 24 fresh-profile rows start enabled.
    const switches = getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.agent.tools.capabilities,
    ).getByRole('switch');
    await expect(switches).toHaveCount(48);
    expect(await switches.evaluateAll((items) => (
      items.every((item) => item.getAttribute('aria-checked') === 'true')
    ))).toBe(true);

    // 用户操作：两列各关闭一项；同一行另一列和其他Tool不得联动。
    // User actions: disable one Tool in each column without changing its peer or other Tools.
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_proxy_status'),
    ).click();
    await expectToolState(desktopApp.page, 'get_proxy_status', 'agent', false);
    await expectToolState(desktopApp.page, 'get_proxy_status', 'mcp', true);
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolMcpSwitch('apply_rules'),
    ).click();
    await expectToolState(desktopApp.page, 'apply_rules', 'agent', true);
    await expectToolState(desktopApp.page, 'apply_rules', 'mcp', false);
    await expectToolState(desktopApp.page, 'get_exchange', 'agent', true);
    await expectToolState(desktopApp.page, 'get_exchange', 'mcp', true);

    // 用户操作：搜索只过滤可见行；清空与Settings往返后关闭状态仍由Main快照恢复。
    // User actions: search only filters rows; clearing it and returning to Settings retain Main state.
    const search = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search);
    await search.fill('diagnostics');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolRow('query_diagnostics'),
    )).toBeVisible();
    expect(await toolNames(desktopApp.page)).toEqual(['query_diagnostics']);
    await search.fill('');
    expect(await toolNames(desktopApp.page)).toEqual(evidence.toolNames);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await openAgentSettings(desktopApp.page);
    await expectToolState(desktopApp.page, 'get_proxy_status', 'agent', false);
    await expectToolState(desktopApp.page, 'apply_rules', 'mcp', false);

    // 业务断言：开关交互没有改变Capture、Rules或系统代理状态。
    // Business assertion: capability switches do not change Capture, Rules, or system proxy state.
    evidence.finalProductState = await readProductState(desktopApp.page);
    expect(evidence.finalProductState).toEqual(evidence.initialProductState);

    // 重启一：同一profile恢复两项关闭状态，再由真实Switch重新开启。
    // Restart one: the same profile restores both disabled entries, then real switches enable them.
    await closeGeneration(desktopApp, testInfo);
    activeApp = null;
    const relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    activeApp = relaunchedApp;
    await relaunchedApp.waitUntilReady();
    await openAgentSettings(relaunchedApp.page);
    await expectToolState(relaunchedApp.page, 'get_proxy_status', 'agent', false);
    await expectToolState(relaunchedApp.page, 'apply_rules', 'mcp', false);
    evidence.disabledRestored = true;
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('get_proxy_status'),
    ).click();
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolMcpSwitch('apply_rules'),
    ).click();
    await expectToolState(relaunchedApp.page, 'get_proxy_status', 'agent', true);
    await expectToolState(relaunchedApp.page, 'apply_rules', 'mcp', true);

    // 重启二：空关闭集不依赖文件存在，24项必须再次全部开启。
    // Restart two: an empty disabled set needs no file and all 24 Tools must return enabled.
    await closeGeneration(relaunchedApp, testInfo);
    activeApp = null;
    const secondRelaunch = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'second-relaunch',
    });
    activeApp = secondRelaunch;
    await secondRelaunch.waitUntilReady();
    await openAgentSettings(secondRelaunch.page);
    const restoredSwitches = getByAutomationId(
      secondRelaunch.page,
      AUTOMATION_IDS.agent.tools.capabilities,
    ).getByRole('switch');
    await expect(restoredSwitches).toHaveCount(48);
    evidence.allEnabledRestored = await restoredSwitches.evaluateAll((items) => (
      items.every((item) => item.getAttribute('aria-checked') === 'true')
    ));
    expect(evidence.allEnabledRestored).toBe(true);
    expect(secondRelaunch.rendererPageErrors()).toEqual([]);

    // 证据：只附加公开行ID和状态，不读取或注入内部设置文件。
    // Evidence: attach only public row IDs and state without reading or seeding the settings file.
    const evidencePath = testInfo.outputPath('agent-tool-capability-settings.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('agent-tool-capability-settings.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } catch (error) {
    workflowError = error;
  } finally {
    if (activeApp !== null) {
      try {
        await closeGeneration(activeApp, testInfo);
      } catch (error) {
        cleanupError = error;
        await activeApp.forceCleanup().catch(() => undefined);
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Tool settings workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});