import { writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const DEFAULT_DETAIL_WIDTH = 468;
const MINIMUM_DETAIL_WIDTH = 360;
const MINIMUM_LIST_WIDTH = 420;
const SPLITTER_TRACK_WIDTH = 1;

interface DiagnosticsGeometry {
  listWidth: number;
  detailWidth: number;
}

/** Read the live two-pane geometry from the real Renderer. */
async function readGeometry(page: Page): Promise<DiagnosticsGeometry> {
  const [mainBox, splitterBox] = await Promise.all([
    getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.diagnostics.splitter).boundingBox(),
  ]);
  if (!mainBox || !splitterBox) {
    throw new Error('The Diagnostics panes are not laid out.');
  }
  return {
    listWidth: splitterBox.x - mainBox.x,
    detailWidth: mainBox.x + mainBox.width - splitterBox.x - SPLITTER_TRACK_WIDTH,
  };
}

/** Drag the real Diagnostics splitter to an absolute viewport X coordinate. */
async function dragSplitterTo(page: Page, targetX: number): Promise<void> {
  const splitter = getByAutomationId(page, AUTOMATION_IDS.diagnostics.splitter);
  const box = await splitter.boundingBox();
  if (!box) {
    throw new Error('The Diagnostics splitter disappeared.');
  }
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  try {
    await page.mouse.move(targetX, y, { steps: 12 });
  } finally {
    await page.mouse.up();
  }
}

/** Require the detail pane to settle on one contract width within a sub-pixel. */
async function expectDetailWidth(
  page: Page,
  expected: number,
  description: string,
): Promise<void> {
  await expect.poll(
    async () => Math.abs((await readGeometry(page)).detailWidth - expected),
    { message: `The Diagnostics detail width did not reach ${expected}px (${description}).` },
  ).toBeLessThanOrEqual(1);
}

test('diagnostics.resize clamps both panes and keeps the query and selection state', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'diagnostics.resize',
  });
  const { page } = desktopApp;
  const list = getByAutomationId(page, AUTOMATION_IDS.diagnostics.list);
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.diagnosticRow);
  const processFilter = getByAutomationId(page, AUTOMATION_IDS.diagnostics.processFilter);

  // 准备：进入Diagnostics，等待启动记录和默认两栏布局。
  // Arrange: open Diagnostics, wait for startup records and the default two-pane layout.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
  await expect(list).toBeVisible();
  await expect.poll(async () => Number(await list.getAttribute('data-record-count') ?? 0), {
    message: 'Diagnostics did not load its first page.',
  }).toBeGreaterThan(0);
  await expectDetailWidth(page, DEFAULT_DETAIL_WIDTH, 'default layout');
  const defaultGeometry = await readGeometry(page);
  await screenshotStep('Diagnostics默认两栏布局 / The default Diagnostics two-pane layout');

  // 用户操作：选择一条真实记录作为resize期间的selection基线。
  // User action: select one real record as the selection baseline for resizing.
  const firstRow = rows.first();
  await expect(firstRow).toBeVisible();
  const selectedIdentity = await firstRow.getAttribute('data-automation-id');
  const selectedCommand = await firstRow.getAttribute('data-command');
  if (!selectedIdentity || !selectedCommand) {
    throw new Error('The Diagnostics row omitted its public identity or command.');
  }
  const selectedRow = getByAutomationId(page, selectedIdentity as AutomationId);
  await selectedRow.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText(selectedCommand);
  const filterTextBefore = (await processFilter.textContent())?.trim() ?? '';
  await screenshotStep('选择一条真实Diagnostics记录 / Select one real Diagnostics record');

  // 细节最小宽度：向右拖到360，列表与详情都不溢出。
  // Minimum detail width: drag to 360; neither pane overflows.
  const mainBox = await getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox();
  if (!mainBox) throw new Error('The Diagnostics main region is not laid out.');
  try {
    await dragSplitterTo(page, mainBox.x + mainBox.width - MINIMUM_DETAIL_WIDTH);
    await expectDetailWidth(page, MINIMUM_DETAIL_WIDTH, 'minimum detail width');
    const minimumGeometry = await readGeometry(page);
    expect(minimumGeometry.listWidth).toBeGreaterThanOrEqual(MINIMUM_LIST_WIDTH - 1);
    const overflow = await page.evaluate(() => {
      const difference = (element: HTMLElement): number => element.scrollWidth - element.clientWidth;
      return {
        document: difference(document.documentElement),
        main: difference(document.querySelector<HTMLElement>('[data-automation-id="app.main"]')!),
        list: difference(document.querySelector<HTMLElement>('[data-automation-id="diagnostics.list"]')!),
      };
    });
    expect(overflow).toEqual({ document: 0, main: 0, list: 0 });
    await expect(selectedRow).toHaveCount(1);
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText(selectedCommand);
    await screenshotStep('Detail最小宽度下保留记录与详情 / Keep the record and detail at the minimum detail width');

    // 中间宽度：向左拖340px，宽度按1:1变化。
    // Middle width: drag 340px left; the width follows 1:1.
    await dragSplitterTo(
      page,
      mainBox.x + mainBox.width - MINIMUM_DETAIL_WIDTH - 340,
    );
    await expectDetailWidth(page, MINIMUM_DETAIL_WIDTH + 340, 'middle detail width');
    await screenshotStep('向左拖动340px得到中间宽度 / A 340px leftward drag yields the middle width');

    // List最小宽度：继续向左拖到底，列表停在420，Detail不超出Main。
    // Minimum list width: drag fully left; the list stops at 420 and the detail stays inside Main.
    await dragSplitterTo(page, mainBox.x + MINIMUM_LIST_WIDTH);
    await expectDetailWidth(
      page,
      mainBox.width - MINIMUM_LIST_WIDTH - SPLITTER_TRACK_WIDTH,
      'minimum list width',
    );
    const maximumGeometry = await readGeometry(page);
    expect(Math.abs(maximumGeometry.listWidth - MINIMUM_LIST_WIDTH)).toBeLessThanOrEqual(1);
    expect(maximumGeometry.detailWidth).toBeLessThanOrEqual(mainBox.width - MINIMUM_LIST_WIDTH);
    await expect(selectedRow).toHaveCount(1);
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.main)).toContainText(selectedCommand);
    await screenshotStep('List最小宽度下保留选中记录 / Keep the selected record at the minimum list width');
  } finally {
    // 恢复默认宽度，避免本workflow的拖拽影响后续断言与截图。
    // Restore the default width so this workflow's drag cannot affect later assertions or screenshots.
    await dragSplitterTo(page, mainBox.x + mainBox.width - DEFAULT_DETAIL_WIDTH).catch(() => undefined);
  }

  // 业务断言：resize不改变filter，filter仍可切换。
  // Assert: resizing preserves the filter, and the filter still cycles.
  expect((await processFilter.textContent())?.trim() ?? '').toBe(filterTextBefore);
  await processFilter.click();
  await expect.poll(async () => (await processFilter.textContent())?.trim() ?? '')
    .not.toBe(filterTextBefore);
  await expect(getByAutomationId(page, AUTOMATION_IDS.diagnostics.splitter)).toBeVisible();
  await screenshotStep('resize保留filter且filter仍可切换 / Resizing preserves the filter and the filter still cycles');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('diagnostics-resize.json');
  await writeFile(evidencePath, JSON.stringify({
    defaultGeometry,
    selectedCommand,
    filterTextBefore,
    detailWidthAfterRestore: (await readGeometry(page)).detailWidth,
  }, null, 2), 'utf8');
  await testInfo.attach('diagnostics-resize.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
