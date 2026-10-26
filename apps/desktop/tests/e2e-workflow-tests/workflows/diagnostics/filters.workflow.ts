import { writeFile } from 'node:fs/promises';

import type { Locator, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Read the value a FilterChip exposes after its label separator, if any. */
function chipValue(text: string | null): string | null {
  return /[:：]\s*(.+)$/.exec(text ?? '')?.[1]?.trim() ?? null;
}

/** Map one filter value onto the compact attribute rendered by the Diagnostics rows. */
function rowAttributeValue(value: string, attribute: string): string {
  if (attribute !== 'data-outcome') return value;
  return ({
    success: 'ok',
    failed: 'fail',
    cancelled: 'cx',
    timed_out: 'to',
  } as Record<string, string>)[value] ?? value;
}

/** Cycle one Diagnostics filter until it returns to All, verifying every selected value. */
async function cycleFilter(
  page: Page,
  rows: Locator,
  chipId: AutomationId,
  attribute: string,
): Promise<{ initial: string; selected: string[] }> {
  const chip = getByAutomationId(page, chipId);
  const initial = (await chip.textContent())?.trim() ?? '';
  const selected: string[] = [];
  await chip.click();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const text = (await chip.textContent())?.trim() ?? '';
    const value = chipValue(text);
    if (value !== null) {
      selected.push(value);
      const expected = rowAttributeValue(value, attribute);
      await expect.poll(async () => rows.evaluateAll(
        (elements, target) => elements.every(
          (element) => element.getAttribute(target.attribute) === target.value,
        ),
        { attribute, value: expected },
      )).toBe(true);
    }
    await chip.click();
    if (((await chip.textContent())?.trim() ?? '') === initial) {
      return { initial, selected };
    }
  }
  throw new Error(`The ${chipId} filter did not return to All.`);
}

test('diagnostics.filters applies process, level and outcome filters and restores All', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'diagnostics.filters',
  });
  const { page } = desktopApp;
  const list = getByAutomationId(page, AUTOMATION_IDS.diagnostics.list);
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.diagnosticRow);

  // 准备：进入Diagnostics，等待启动记录。
  // Arrange: open Diagnostics and wait for startup records.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
  await expect(list).toBeVisible();
  await expect.poll(async () => Number(await list.getAttribute('data-record-count') ?? 0), {
    message: 'Diagnostics did not load its first page.',
  }).toBeGreaterThan(0);
  const initialCount = Number(await list.getAttribute('data-record-count') ?? 0);
  await screenshotStep('Diagnostics初始记录 / Initial Diagnostics records');

  // 用户操作：Process、Level、Outcome三个filter分别循环到All，每次选中都校验可见行。
  // User actions: cycle Process, Level and Outcome to All, verifying every selected value.
  const process = await cycleFilter(page, rows, AUTOMATION_IDS.diagnostics.processFilter, 'data-process');
  await screenshotStep('Process筛选后恢复All / Process filtering returns to All');
  const level = await cycleFilter(page, rows, AUTOMATION_IDS.diagnostics.levelFilter, 'data-level');
  await screenshotStep('Level筛选后恢复All / Level filtering returns to All');
  const outcome = await cycleFilter(page, rows, AUTOMATION_IDS.diagnostics.outcomeFilter, 'data-outcome');
  await screenshotStep('Outcome筛选后恢复All / Outcome filtering returns to All');

  // 业务断言：三个filter都回到All后记录数恢复，且每次选中至少校验过一个具体值。
  // Assert: all three filters are back to All and every filter exercised at least one value.
  await expect(list).toHaveAttribute('data-record-count', String(initialCount));
  expect(process.selected.length).toBeGreaterThan(0);
  expect(level.selected.length).toBeGreaterThan(0);
  expect(outcome.selected.length).toBeGreaterThan(0);
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  const evidencePath = testInfo.outputPath('diagnostics-filters.json');
  await writeFile(evidencePath, JSON.stringify({
    initialCount,
    process: process.selected,
    level: level.selected,
    outcome: outcome.selected,
  }, null, 2), 'utf8');
  await testInfo.attach('diagnostics-filters.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
