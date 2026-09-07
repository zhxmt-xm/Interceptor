import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';

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

const TOOL_NAMES = [
  'capture_get_proxy_status',
  'capture_get_storage_status',
  'capture_start_recording',
  'capture_stop_recording',
  'capture_clear',
  'capture_list_exchanges',
  'capture_get_exchange',
  'capture_get_exchange_body',
  'capture_list_websocket_messages',
  'capture_list_grpc_messages',
  'capture_get_transfer_job',
  'capture_cancel_transfer_job',
  'capture_export_body',
  'capture_export_har',
  'capture_import_har',
  'capture_export_archive',
  'capture_import_archive',
  'rules_get_tree',
  'rules_get_hits',
  'rules_replace_tree',
  'rules_export',
  'rules_import',
  'composer_send_request',
  'composer_probe_connection',
  'composer_get_collection',
  'composer_replace_collection',
  'composer_export_collection',
  'composer_import_collection',
  'breakpoints_list',
  'breakpoints_enable_http',
  'breakpoints_disable_http',
  'breakpoints_enable_websocket',
  'breakpoints_disable_websocket',
  'breakpoints_continue',
  'breakpoints_forward_edited',
  'breakpoints_drop',
  'breakpoints_continue_queue',
  'breakpoints_drop_queue',
  'breakpoints_continue_rule',
  'diagnostics_query',
  'diagnostics_get_trace',
  'diagnostics_get_recent',
  'diagnostics_export',
  'settings_get_core_process_status',
  'settings_get_system_proxy_status',
  'settings_get_certificate_status',
  'settings_get_tls_insecure_hosts',
  'settings_get_tls_passthrough',
  'settings_list_app_containers',
  'settings_enable_system_proxy',
  'settings_restore_system_proxy',
  'settings_replace_tls_insecure_hosts',
  'settings_replace_tls_passthrough',
  'settings_enable_https_decryption',
  'settings_disable_https_decryption',
] as const;

const TOOL_GROUP_IDS = ['capture', 'rules', 'composer', 'breakpoints', 'diagnostics', 'settings'] as const;
const TOOL_GROUP_AUTOMATION_PREFIX = 'agent.tools.group.';

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
    expect(evidence.toolNames).toEqual(TOOL_NAMES);
    const groupIds = await desktopApp.page.locator(
      `[data-automation-id^="${TOOL_GROUP_AUTOMATION_PREFIX}"]`,
    ).evaluateAll((groups, prefix) => groups.map((group) => (
      group.getAttribute('data-automation-id')?.replace(
        prefix,
        '',
      ) ?? ''
    )), TOOL_GROUP_AUTOMATION_PREFIX);
    expect(groupIds).toEqual(TOOL_GROUP_IDS);

    // 业务断言：fresh profile的50行、100个Agent/MCP开关必须全部开启。
    // Business assertion: all 100 Agent/MCP switches across 50 fresh-profile rows start enabled.
    const switches = getByAutomationId(
      desktopApp.page,
      AUTOMATION_IDS.agent.tools.capabilities,
    ).getByRole('switch');
    await expect(switches).toHaveCount(110);
    expect(await switches.evaluateAll((items) => (
      items.every((item) => item.getAttribute('aria-checked') === 'true')
    ))).toBe(true);

    // 用户操作：两列各关闭一项；同一行另一列和其他Tool不得联动。
    // User actions: disable one Tool in each column without changing its peer or other Tools.
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolAgentSwitch('capture_get_proxy_status'),
    ).click();
    await expectToolState(desktopApp.page, 'capture_get_proxy_status', 'agent', false);
    await expectToolState(desktopApp.page, 'capture_get_proxy_status', 'mcp', true);
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolMcpSwitch('rules_replace_tree'),
    ).click();
    await expectToolState(desktopApp.page, 'rules_replace_tree', 'agent', true);
    await expectToolState(desktopApp.page, 'rules_replace_tree', 'mcp', false);
    await expectToolState(desktopApp.page, 'capture_get_exchange', 'agent', true);
    await expectToolState(desktopApp.page, 'capture_get_exchange', 'mcp', true);

    // 用户操作：搜索只过滤可见行；清空与Settings往返后关闭状态仍由Main快照恢复。
    // User actions: search only filters rows; clearing it and returning to Settings retain Main state.
    const search = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.tools.search);
    await search.fill('diagnostics');
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentToolRow('diagnostics_query'),
    )).toBeVisible();
    expect(await toolNames(desktopApp.page)).toEqual(['diagnostics_query', 'diagnostics_get_trace', 'diagnostics_get_recent', 'diagnostics_export']);
    await search.fill('');
    expect(await toolNames(desktopApp.page)).toEqual(evidence.toolNames);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
    await openAgentSettings(desktopApp.page);
    await expectToolState(desktopApp.page, 'capture_get_proxy_status', 'agent', false);
    await expectToolState(desktopApp.page, 'rules_replace_tree', 'mcp', false);

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
    await expectToolState(relaunchedApp.page, 'capture_get_proxy_status', 'agent', false);
    await expectToolState(relaunchedApp.page, 'rules_replace_tree', 'mcp', false);
    evidence.disabledRestored = true;
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolAgentSwitch('capture_get_proxy_status'),
    ).click();
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentToolMcpSwitch('rules_replace_tree'),
    ).click();
    await expectToolState(relaunchedApp.page, 'capture_get_proxy_status', 'agent', true);
    await expectToolState(relaunchedApp.page, 'rules_replace_tree', 'mcp', true);

    // 重启二：空关闭集不依赖文件存在，50项必须再次全部开启。
    // Restart two: an empty disabled set needs no file and all 50 Tools must return enabled.
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
    await expect(restoredSwitches).toHaveCount(110);
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