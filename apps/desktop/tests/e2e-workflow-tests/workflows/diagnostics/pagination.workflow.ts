import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const FIRST_PAGE_RECORDS = 200;
const BATCH_SENDS = 60;
const MAX_BATCHES = 6;
const POLL_WAIT_MS = 4_500;

interface DiagnosticRowState {
  readonly id: string;
  readonly seq: number;
  readonly command: string | null;
}

interface DiagnosticListState {
  readonly recordCount: number;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
}

async function readListState(page: Page): Promise<DiagnosticListState> {
  const list = getByAutomationId(page, AUTOMATION_IDS.diagnostics.list);
  return {
    recordCount: Number(await list.getAttribute('data-record-count') ?? 0),
    hasMore: await list.getAttribute('data-has-more') === 'true',
    loadingMore: await list.getAttribute('data-loading-more') === 'true',
  };
}

async function readRows(page: Page): Promise<DiagnosticRowState[]> {
  return getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.diagnosticRow)
    .evaluateAll((elements) => elements.map((element) => ({
      id: element.getAttribute('data-automation-id') ?? '',
      seq: Number(element.getAttribute('data-seq') ?? 0),
      command: element.getAttribute('data-command'),
    })));
}

/** Require unique rows in strictly increasing sequence order. */
function expectUniqueAscending(
  rows: readonly DiagnosticRowState[],
  description: string,
): void {
  expect(new Set(rows.map((row) => row.id)).size, `${description} duplicated a row.`)
    .toBe(rows.length);
  for (let index = 1; index < rows.length; index += 1) {
    expect(rows[index]!.seq, `${description} is not ordered by sequence.`)
      .toBeGreaterThan(rows[index - 1]!.seq);
  }
}

test('diagnostics.pagination keeps keyset pages and merges polling records by key', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'diagnostics.pagination',
  });
  desktopApp.configureWorkflowTimeout(testInfo, 300_000);
  const { page } = desktopApp;

  const list = getByAutomationId(page, AUTOMATION_IDS.diagnostics.list);
  const loadEarlier = getByAutomationId(
    page,
    AUTOMATION_IDS.diagnostics.loadEarlier,
  );
  const send = getByAutomationId(page, AUTOMATION_IDS.composer.send);
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  const bulkPath = '/e2e/diagnostics/pagination-bulk';
  const evidence: Record<string, unknown> = { bulkPath };

  /** Open Diagnostics and wait for its first page query to settle. */
  const openDiagnostics = async (): Promise<DiagnosticListState> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
    await expect(list).toBeVisible();
    await expect.poll(
      async () => Number(await list.getAttribute('data-record-count') ?? 0),
      { message: 'Diagnostics did not load its first page.' },
    ).toBeGreaterThan(0);
    await expect(list).toHaveAttribute('data-loading-more', 'false');
    return readListState(page);
  };

  // 准备：经Composer真实UI批量发送，直到首页满200且服务端报告还有更早页。
  // Arrange: send through the real Composer UI until the first 200-record page reports an older page.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await url.fill(loopbackLab.url(bulkPath));
  let bulkSends = 0;
  let observed: DiagnosticListState = { recordCount: 0, hasMore: false, loadingMore: false };
  for (let batch = 0; batch < MAX_BATCHES && !observed.hasMore; batch += 1) {
    for (let index = 0; index < BATCH_SENDS; index += 1) {
      await send.click();
      bulkSends += 1;
    }
    observed = await openDiagnostics();
    if (!observed.hasMore) {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    }
  }
  expect(observed.hasMore, 'Diagnostics never reported a second page.').toBe(true);
  expect(observed.recordCount).toBe(FIRST_PAGE_RECORDS);
  evidence['bulkSends'] = bulkSends;
  evidence['pageSize'] = observed.recordCount;
  await screenshotStep('首页满200条并出现加载较早记录 / The first 200-record page offers Load earlier');

  // 首页keys：按sequence升序、无重复；hasMore=true。
  // First-page keys: ascending sequence and unique; hasMore=true.
  const pageOneRows = await readRows(page);
  expectUniqueAscending(pageOneRows, 'First page');
  expect(pageOneRows.length).toBeGreaterThan(0);
  expect(pageOneRows.length).toBeLessThanOrEqual(FIRST_PAGE_RECORDS);
  await expect(loadEarlier).toBeVisible();
  evidence['pageOneRows'] = pageOneRows.length;
  await screenshotStep('Diagnostics首页按sequence升序 / The Diagnostics first page is ordered by sequence');

  // 轮询合并：常驻Rules命中轮询在Diagnostics打开期间产生新的真实命令，按key合并到列表底部。
  // Poll merge: the resident Rules hits poll issues real commands while Diagnostics is open; they merge by key at the bottom.
  const pageOneHits = pageOneRows.filter((row) => row.command === 'rules.hits').length;
  await expect.poll(
    async () => (await readRows(page)).filter((row) => row.command === 'rules.hits').length,
    { message: 'A background Rules hits command did not merge into Diagnostics.', timeout: 25_000 },
  ).toBeGreaterThan(pageOneHits);
  const mergedRows = await readRows(page);
  const appendedHits = mergedRows.filter((row) => row.command === 'rules.hits'
    && !pageOneRows.some((previous) => previous.id === row.id));
  expect(appendedHits.length).toBeGreaterThan(0);
  expect(appendedHits.at(-1)!.seq).toBeGreaterThan(pageOneRows.at(-1)!.seq);
  for (const previous of pageOneRows) {
    expect(mergedRows.some((row) => row.id === previous.id)).toBe(true);
  }
  expectUniqueAscending(mergedRows, 'Merged page');
  evidence['pollMerged'] = {
    backgroundCommand: 'rules.hits',
    mergedRows: mergedRows.length - pageOneRows.length,
  };
  await screenshotStep('轮询把后台Rules命中命令合并到列表底部 / Polling merges background Rules hits commands at the bottom');

  // 轮询去重：再等待两个周期，已合并的keys必须全部保留且集合仍无重复。
  // Polling dedupe: after two more cycles every merged key is retained and the row set stays unique.
  await page.waitForTimeout(POLL_WAIT_MS);
  const afterPollRows = await readRows(page);
  for (const previous of mergedRows) {
    expect(afterPollRows.some((row) => row.id === previous.id)).toBe(true);
  }
  expectUniqueAscending(afterPollRows, 'Polled page');

  // Load earlier：旧记录排到顶部，已加载keys保持且无重复，直到hasMore=false。
  // Load earlier: older rows move to the top while loaded keys stay unique until hasMore becomes false.
  const firstPageFirstSeq = mergedRows[0]!.seq;
  const beforeLoadCount = afterPollRows.length;
  await loadEarlier.click();
  await expect.poll(
    async () => (await readRows(page)).length,
    { message: 'Load earlier did not append older rows.' },
  ).toBeGreaterThan(beforeLoadCount);
  await expect(list).toHaveAttribute('data-loading-more', 'false');
  let loadedRows = await readRows(page);
  expect(loadedRows[0]!.seq).toBeLessThan(firstPageFirstSeq);
  for (const previous of afterPollRows) {
    expect(loadedRows.some((row) => row.id === previous.id)).toBe(true);
  }
  expectUniqueAscending(loadedRows, 'Loaded page');
  const pageRecordCounts = [observed.recordCount, (await readListState(page)).recordCount];
  await screenshotStep('加载较早记录后旧行排在顶部 / Older rows appear above after Load earlier');

  for (let guard = 0; guard < 10; guard += 1) {
    if (await list.getAttribute('data-has-more') !== 'true') {
      break;
    }
    const before = await readRows(page);
    await loadEarlier.click();
    await expect.poll(
      async () => (await readRows(page)).length,
      { message: 'A later Load earlier did not append rows.' },
    ).toBeGreaterThan(before.length);
    await expect(list).toHaveAttribute('data-loading-more', 'false');
    const after = await readRows(page);
    for (const previous of before) {
      expect(after.some((row) => row.id === previous.id)).toBe(true);
    }
    expectUniqueAscending(after, 'Paginated history');
    loadedRows = after;
    pageRecordCounts.push((await readListState(page)).recordCount);
  }
  await expect(list).toHaveAttribute('data-has-more', 'false');
  await expect(loadEarlier).toHaveCount(0);
  evidence['pageRecordCounts'] = pageRecordCounts;
  evidence['loadedRows'] = loadedRows.length;

  // 终态：hasMore=false后不再出现Load earlier；轮询仍可合并新命令但不得丢失已加载行或产生重复。
  // Final state: Load earlier never returns; polling may merge new commands without losing loaded rows or duplicating keys.
  const finalRows = await readRows(page);
  await page.waitForTimeout(POLL_WAIT_MS);
  const finalPolledRows = await readRows(page);
  for (const previous of finalRows) {
    expect(finalPolledRows.some((row) => row.id === previous.id)).toBe(true);
  }
  expectUniqueAscending(finalPolledRows, 'Final page');
  await expect(loadEarlier).toHaveCount(0);
  await expect(list).toHaveAttribute('data-has-more', 'false');
  expect((await readListState(page)).recordCount).toBeGreaterThanOrEqual(FIRST_PAGE_RECORDS);
  evidence['final'] = {
    rows: finalPolledRows.length,
    recordCount: (await readListState(page)).recordCount,
  };
  await screenshotStep('加载到最早一页后停止加载 / Loading stops after the oldest page');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('diagnostics-pagination-state.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('diagnostics-pagination-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
