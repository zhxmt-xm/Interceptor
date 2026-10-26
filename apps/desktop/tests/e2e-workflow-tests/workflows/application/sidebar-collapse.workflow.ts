import { writeFile } from 'node:fs/promises';

import type { TestInfo } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('shell.sidebar.collapse keeps navigation usable in the collapsed rail', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'shell.sidebar.collapse',
  });
  const { page } = desktopApp;
  const root = getByAutomationId(page, AUTOMATION_IDS.app.root);
  const navigation = getByAutomationId(page, AUTOMATION_IDS.shell.navigation);
  const toggle = getByAutomationId(page, AUTOMATION_IDS.shell.sidebarToggle);

  // 准备：确保Sidebar处于折叠态，并记录折叠宽度。
  // Arrange: force the collapsed rail and record its width.
  if (await root.getAttribute('data-collapsed') !== 'true') {
    await toggle.click();
  }
  await expect(root).toHaveAttribute('data-collapsed', 'true');
  const collapsedBox = await navigation.boundingBox();
  if (!collapsedBox) throw new Error('The Sidebar is not laid out.');
  expect(collapsedBox.width).toBeLessThan(120);
  await screenshotStep('折叠态只保留导航图标 / The collapsed rail keeps only navigation icons');

  // 用户操作：折叠态直接进入Rules，导航与Header保持同一view。
  // User action: open Rules from the collapsed rail; navigation and Header share the view.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await expect(root).toHaveAttribute('data-view', 'rules');
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.headerTitle))
    .toHaveAttribute('data-view', 'rules');
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create)).toBeVisible();
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: 0, vertical: 0 });
  await screenshotStep('折叠态进入Rules且页面无溢出 / Open Rules from the collapsed rail without page overflow');

  // 用户操作：展开Sidebar，Rules保持active且宽度恢复。
  // User action: expand the Sidebar; Rules stays active and the rail widens.
  await toggle.click();
  await expect(root).toHaveAttribute('data-collapsed', 'false');
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  const expandedBox = await navigation.boundingBox();
  if (!expandedBox) throw new Error('The expanded Sidebar is not laid out.');
  expect(expandedBox.width).toBeGreaterThan(collapsedBox.width + 50);
  const expandedOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(expandedOverflow).toEqual({ horizontal: 0, vertical: 0 });
  await screenshotStep('展开后Rules仍为当前view / Rules remains the active view after expanding');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('sidebar-collapse.json');
  await writeFile(evidencePath, JSON.stringify({
    collapsedWidth: collapsedBox.width,
    expandedWidth: expandedBox.width,
    activeView: 'rules',
  }, null, 2), 'utf8');
  await testInfo.attach('sidebar-collapse.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
