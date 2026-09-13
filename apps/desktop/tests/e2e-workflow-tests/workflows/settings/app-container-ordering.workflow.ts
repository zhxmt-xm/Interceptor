import { writeFile } from 'node:fs/promises';
import type { Locator, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

const APP_CONTAINER_ROW_PREFIX = 'settings.app-containers.row.';

interface AppContainerRowEvidence {
  readonly automationId: string;
  readonly appContainerSid: string;
  readonly exempt: boolean;
}

/** 读取按 DOM 顺序呈现的公共 SID 与 exemption 状态。 */
/** Read public SIDs and exemption states in rendered DOM order. */
async function readRows(rows: Locator): Promise<AppContainerRowEvidence[]> {
  return rows.evaluateAll((elements, prefix) => elements.map((element) => {
    const automationId = element.getAttribute('data-automation-id');
    const exempt = element.getAttribute('data-exempt');
    if (!automationId?.startsWith(prefix) || (exempt !== 'true' && exempt !== 'false')) {
      throw new Error('AppContainer row omitted its public identity or exemption state.');
    }
    return {
      automationId,
      appContainerSid: decodeURIComponent(automationId.slice(prefix.length)),
      exempt: exempt === 'true',
    };
  }), APP_CONTAINER_ROW_PREFIX);
}

/** 断言 enabled 分组连续位于 disabled 分组之前。 */
/** Assert that the enabled group appears contiguously before the disabled group. */
function expectEnabledFirst(rows: readonly AppContainerRowEvidence[]): void {
  const firstDisabled = rows.findIndex((row) => !row.exempt);
  if (firstDisabled < 0) {
    return;
  }
  expect(rows.slice(firstDisabled).every((row) => !row.exempt)).toBe(true);
}

/** 从真实 SID 中选择能缩小结果集的搜索值。 */
/** Choose a real SID fragment that narrows the result set. */
function chooseSearch(
  rows: readonly AppContainerRowEvidence[],
): { query: string; expectedRows: AppContainerRowEvidence[] } {
  for (const row of rows) {
    const segments = row.appContainerSid.split('-').filter(Boolean);
    for (const segment of segments.slice(4)) {
      if (segment.length < 3) {
        continue;
      }
      const expectedRows = rows.filter((candidate) =>
        candidate.appContainerSid.toLocaleLowerCase().includes(segment.toLocaleLowerCase()));
      if (expectedRows.length > 0 && expectedRows.length < rows.length) {
        return { query: segment, expectedRows };
      }
    }
  }
  throw new Error('The real AppContainer SIDs did not provide a narrowing search value.');
}

test('settings.app-containers.ordering keeps enabled rows first through filtering', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.app-containers.ordering',
  });
  if (process.platform !== 'win32') {
    throw new Error('settings.app-containers.ordering requires Windows AppContainer APIs.');
  }

  const { page } = desktopApp;

  // 准备：通过正式导航打开真实 Windows AppContainer 枚举，不修改任何 exemption。
  // Arrange: open the real Windows AppContainer enumeration through public navigation without changing exemptions.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.appContainers).click();
  const rows = page.locator(`[data-automation-id^="${APP_CONTAINER_ROW_PREFIX}"]`);
  await expect(rows.first()).toBeVisible();
  const listHead = rows.first().locator('xpath=..').locator(':scope > div').first();
  await listHead.screenshot({ path: testInfo.outputPath('app-container-list-head.png') });
  await expect(listHead).toHaveCSS('display', 'flex');
  await expect(listHead).toHaveCSS('align-items', 'center');
  await expect(listHead).toHaveCSS('line-height', 'normal');
  await expect(listHead.locator('span').last()).toHaveCSS('line-height', 'normal');
  const initialRows = await readRows(rows);
  expect(initialRows.some((row) => row.exempt)).toBe(true);
  expect(initialRows.some((row) => !row.exempt)).toBe(true);
  expectEnabledFirst(initialRows);
  const rowLayouts = await rows.evaluateAll((elements) => elements.map((element) => {
    const identity = element.children[1]!;
    const nameLine = identity.firstElementChild!;
    const name = nameLine.querySelector('b')!;
    const packageName = identity.children[1]!;
    const recommended = nameLine.querySelector('span');
    const nameBox = name.getBoundingClientRect();
    const recommendedBox = recommended?.getBoundingClientRect();
    return {
      automationId: element.getAttribute('data-automation-id'),
      nameLineHeight: getComputedStyle(name).lineHeight,
      packageLineHeight: getComputedStyle(packageName).lineHeight,
      recommended: recommended && recommendedBox ? {
        display: getComputedStyle(recommended).display,
        alignItems: getComputedStyle(recommended).alignItems,
        height: recommendedBox.height,
        centerDelta: recommendedBox.y + recommendedBox.height / 2 - nameBox.y - nameBox.height / 2,
      } : null,
      pixelRatio: devicePixelRatio,
    };
  }));
  for (const layout of rowLayouts) {
    expect(layout.nameLineHeight).toBe('15px');
    expect(layout.packageLineHeight).toBe('14px');
    if (layout.recommended) {
      expect(['flex', 'inline-flex']).toContain(layout.recommended.display);
      expect(layout.recommended).toMatchObject({ alignItems: 'center', height: 20 });
      expect(Math.abs(layout.recommended.centerDelta)).toBeLessThanOrEqual(1 / layout.pixelRatio);
    }
  }

  // 用户操作：用真实 SID 片段缩小结果，过滤结果必须保持完整列表中的相对顺序。
  // User action: narrow by a real SID fragment; filtered rows must preserve full-list relative order.
  const { query, expectedRows } = chooseSearch(initialRows);
  const search = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.appContainers.search,
  );
  await search.fill(query);
  await expect.poll(() => readRows(rows)).toEqual(expectedRows);
  const filteredRows = await readRows(rows);
  expectEnabledFirst(filteredRows);

  // 业务断言：清空搜索后逐项恢复原始顺序，期间没有触发开关或 UAC。
  // Business assertion: clearing search restores the exact order without switches or UAC.
  await search.fill('');
  await expect.poll(() => readRows(rows)).toEqual(initialRows);
  const restoredRows = await readRows(rows);
  expect(restoredRows).toEqual(initialRows);
  expect(desktopApp.rendererPageErrors()).toEqual([]);

  // 证据与销毁：保留三阶段 SID/状态；fixture 负责 trace、正常 Close、进程与 8888 验证。
  // Evidence and teardown: retain all three SID/state phases; the fixture owns trace, graceful Close, processes, and 8888.
  const evidencePath = testInfo.outputPath('app-container-ordering.json');
  await writeFile(evidencePath, JSON.stringify({
    query,
    initialRows,
    filteredRows,
    restoredRows,
    rowLayouts,
  }, null, 2), 'utf8');
  await testInfo.attach('app-container-ordering.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});