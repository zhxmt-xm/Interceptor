import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, type AutomationId } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

interface PanelGeometryEvidence {
  readonly step: string;
  readonly view: AutomationId;
  readonly panelWidth: number;
  readonly mainRight: number;
  readonly panelLeft: number;
  readonly provider: string | null;
}

/** 断言 Agent 是 440px 的独立右栏，且当前 Workspace 不与其重叠。 */
/** Assert that Agent is an independent 440px right column that does not overlap the workspace. */
async function expectOpenAgentPanel(
  page: Page,
  view: AutomationId,
  evidence: PanelGeometryEvidence[],
  step: string,
): Promise<void> {
  const panel = getByAutomationId(page, AUTOMATION_IDS.agent.panel.root);
  const main = getByAutomationId(page, AUTOMATION_IDS.app.main);
  await expect(panel).toBeVisible();
  await expect(getByAutomationId(page, view)).toHaveAttribute('aria-current', 'page');
  const [panelBox, mainBox, provider] = await Promise.all([
    panel.boundingBox(),
    main.boundingBox(),
    panel.getAttribute('data-agent-provider'),
  ]);
  expect(panelBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(panelBox!.width).toBe(440);
  expect(mainBox!.x + mainBox!.width).toBe(panelBox!.x);
  expect(provider).toBe('unconfigured');
  evidence.push({
    step,
    view,
    panelWidth: panelBox!.width,
    mainRight: mainBox!.x + mainBox!.width,
    panelLeft: panelBox!.x,
    provider,
  });
}

test('agent.panel.navigation-persistence keeps the unconfigured side panel across navigation', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.panel.navigation-persistence',
  });

  const { page } = desktopApp;
  const geometryEvidence: PanelGeometryEvidence[] = [];

  // 准备：fresh profile 已完成真实 App/Core/listener readiness，Agent 初始关闭且窗口为 1600×900。
  // Arrange: a fresh profile passed real App/Core/listener readiness; Agent starts closed in a 1600×900 window.
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(viewport).toEqual({ width: 1600, height: 900 });
  const closedMainBox = await getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox();
  expect(closedMainBox).not.toBeNull();

  // 用户操作：从 Header 显式打开 Agent，fresh profile 只能呈现诚实的未配置态。
  // User action: explicitly open Agent from the Header; a fresh profile may only show the honest unconfigured state.
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await expectOpenAgentPanel(
    page,
    AUTOMATION_IDS.shell.workspace.capture,
    geometryEvidence,
    'capture:open',
  );
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.chat.new)).toBeDisabled();

  // 用户操作：唯一配置出口深链 Settings > Agent，导航不得关闭或替换 Panel。
  // User action: the sole configuration exit deep-links to Settings > Agent without closing or replacing the Panel.
  await getByAutomationId(page, AUTOMATION_IDS.agent.configure).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.agent,
  )).toHaveAttribute('aria-current', 'page');
  await expectOpenAgentPanel(
    page,
    AUTOMATION_IDS.shell.workspace.settings,
    geometryEvidence,
    'settings:agent',
  );

  // 业务断言：跨全部 Workspace 往返时 Panel 保持打开、固定宽度且不获得隐式页面 Context。
  // Business assertion: every workspace round trip preserves the fixed Panel and never injects implicit page context.
  for (const workspaceId of [
    AUTOMATION_IDS.shell.workspace.rules,
    AUTOMATION_IDS.shell.workspace.composer,
    AUTOMATION_IDS.shell.workspace.diagnostics,
    AUTOMATION_IDS.shell.workspace.capture,
  ] as const) {
    await getByAutomationId(page, workspaceId).click();
    await expectOpenAgentPanel(page, workspaceId, geometryEvidence, `navigate:${workspaceId}`);
    await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root))
      .toHaveAttribute('data-agent-context', 'none');
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.settings.section.agent,
  )).toHaveAttribute('aria-current', 'page');

  // 用户操作：Panel Close 与全局 toggle 是唯二关闭入口，关闭后 Main 释放完整 440px track。
  // User action: Panel Close and the global toggle are the only close commands; Main reclaims the 440px track.
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.close).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);
  const reopenedMainBox = await getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox();
  expect(reopenedMainBox).not.toBeNull();
  expect(reopenedMainBox!.width - closedMainBox!.width).toBe(0);
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await expectOpenAgentPanel(
    page,
    AUTOMATION_IDS.shell.workspace.settings,
    geometryEvidence,
    'settings:reopened',
  );
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.panel.root)).toHaveCount(0);

  // 证据与销毁：附加语言无关几何；fixture 随后保存 trace/screenshot并验证完整销毁。
  // Evidence and teardown: attach language-neutral geometry; the fixture then retains trace/screenshot and proves destruction.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('agent-panel-geometry.json');
  await writeFile(evidencePath, JSON.stringify(geometryEvidence, null, 2), 'utf8');
  await testInfo.attach('agent-panel-geometry.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});