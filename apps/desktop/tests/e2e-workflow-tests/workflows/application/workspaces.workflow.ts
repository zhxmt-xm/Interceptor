import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** The six top-level views exposed by the Sidebar; only the first four sit in its workspace group. */
type WorkspaceViewId =
  | 'capture'
  | 'rules'
  | 'composer'
  | 'diagnostics'
  | 'guidebook'
  | 'settings';

interface WorkspaceView {
  /** Sidebar entry that activates the view. */
  readonly entry: AutomationId;
  /** Value expected on the Shell view markers. */
  readonly view: WorkspaceViewId;
  /** Always-visible control that proves the feature main region rendered. */
  readonly mainControl: AutomationId;
}

const WORKSPACE_VIEWS: readonly WorkspaceView[] = [
  {
    entry: AUTOMATION_IDS.shell.workspace.capture,
    view: 'capture',
    mainControl: AUTOMATION_IDS.capture.keywordFilter,
  },
  {
    entry: AUTOMATION_IDS.shell.workspace.rules,
    view: 'rules',
    mainControl: AUTOMATION_IDS.rules.toolbar.create,
  },
  {
    entry: AUTOMATION_IDS.shell.workspace.composer,
    view: 'composer',
    mainControl: AUTOMATION_IDS.composer.newRequest,
  },
  {
    entry: AUTOMATION_IDS.shell.workspace.diagnostics,
    view: 'diagnostics',
    mainControl: AUTOMATION_IDS.diagnostics.processFilter,
  },
  {
    entry: AUTOMATION_IDS.shell.workspace.guidebook,
    view: 'guidebook',
    mainControl: AUTOMATION_IDS.guidebook.root,
  },
  {
    entry: AUTOMATION_IDS.shell.workspace.settings,
    view: 'settings',
    mainControl: AUTOMATION_IDS.settings.section.certificates,
  },
];

/** Require exactly one active Sidebar entry and matching Header/Main/Statusbar markers. */
async function expectActiveView(
  page: Page,
  target: WorkspaceView,
): Promise<void> {
  await expect(
    page.locator('[data-automation-id^="shell.workspace."][aria-current="page"]'),
  ).toHaveCount(1);
  await expect(getByAutomationId(page, target.entry)).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.root)).toHaveAttribute(
    'data-view',
    target.view,
  );
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.headerTitle))
    .toHaveAttribute('data-view', target.view);
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.statusbar))
    .toHaveAttribute('data-view', target.view);
  await expect(getByAutomationId(page, target.mainControl)).toBeVisible();
  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: 0, vertical: 0 });
}

test('shell.navigation.workspaces switches all six top-level views with matching shell context', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'shell.navigation.workspaces',
  });
  const { page } = desktopApp;
  const shellViews: Array<{
    view: WorkspaceViewId;
    activeEntry: string | null;
    headerView: string | null;
    statusbarView: string | null;
  }> = [];

  // 准备：fresh profile完成真实启动，首次readiness弹窗已由driver通过真实UI收起；暂停Recording让导航期间不新增Exchange。
  // Arrange: a fresh profile finished real startup and the driver dismissed readiness; pause Recording so navigation adds no Exchange.
  await expectActiveView(page, WORKSPACE_VIEWS[0]!);
  const recordingToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.recordingToggle,
  );
  if (await recordingToggle.getAttribute('aria-pressed') === 'true') {
    await recordingToggle.click();
  }
  await expect(recordingToggle).toHaveAttribute('aria-pressed', 'false');
  const captureRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  );
  const initialRowCount = await captureRows.count();
  await screenshotStep('默认进入Capture且Header/Statusbar同属Capture / Capture is the default view and Header/Statusbar share it');

  // 用户操作：依次通过六个正式入口切换顶层view，覆盖Sidebar两个分组。
  // User actions: switch the six top-level views through their real entries, covering both Sidebar groups.
  for (const target of WORKSPACE_VIEWS.slice(1)) {
    await getByAutomationId(page, target.entry).click();
    await expectActiveView(page, target);
    shellViews.push({
      view: target.view,
      activeEntry: await getByAutomationId(page, target.entry)
        .getAttribute('aria-current'),
      headerView: await getByAutomationId(page, AUTOMATION_IDS.app.headerTitle)
        .getAttribute('data-view'),
      statusbarView: await getByAutomationId(page, AUTOMATION_IDS.app.statusbar)
        .getAttribute('data-view'),
    });
    await screenshotStep(`${target.view}的Shell三层一致 / Shell Header, Main and Statusbar agree on ${target.view}`);
  }

  // 业务断言：返回Capture后列表与暂停前一致；Breakpoint manager只是Capture的浮层，不产生workspace状态。
  // Business assertion: Capture matches its paused baseline; the Breakpoint manager is a Capture overlay and never a workspace.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expectActiveView(page, WORKSPACE_VIEWS[0]!);
  await expect(captureRows).toHaveCount(initialRowCount);
  const manager = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.breakpointManager,
  );
  await manager.click();
  await expect(manager).toHaveAttribute('aria-expanded', 'true');
  await expect(
    getByAutomationId(page, AUTOMATION_IDS.breakpoints.toggle),
  ).toBeVisible();
  await expectActiveView(page, WORKSPACE_VIEWS[0]!);
  await page.keyboard.press('Escape');
  await expect(manager).toHaveAttribute('aria-expanded', 'false');
  await screenshotStep('Breakpoint浮层不改变workspace / The Breakpoint overlay does not change the workspace');

  // 证据与销毁：附加语言无关的view标记；driver随后保存trace并验证进程与8888释放。
  // Evidence and teardown: attach language-independent view markers; the driver retains trace and verifies process and 8888 release.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('workspace-navigation-state.json');
  await writeFile(evidencePath, JSON.stringify({
    initialRowCount,
    views: shellViews,
  }, null, 2), 'utf8');
  await testInfo.attach('workspace-navigation-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
