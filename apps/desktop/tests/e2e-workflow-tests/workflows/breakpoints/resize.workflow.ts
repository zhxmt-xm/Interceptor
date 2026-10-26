import { access, readFile, writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const DEFAULT_INSPECTOR_WIDTH = 448;
const MINIMUM_INSPECTOR_WIDTH = 360;
const MINIMUM_LIST_WIDTH = 512;
const SPLITTER_TRACK_WIDTH = 1;
const REQUEST_PATH = '/e2e/breakpoints/resize';

/** Read the live Capture Inspector column width from the real Renderer. */
async function readInspectorWidth(page: Page): Promise<number> {
  const [mainBox, splitterBox] = await Promise.all([
    getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.capture.inspector.splitter).boundingBox(),
  ]);
  if (!mainBox || !splitterBox) {
    throw new Error('The Capture Inspector is not laid out.');
  }
  return mainBox.x + mainBox.width - splitterBox.x - SPLITTER_TRACK_WIDTH;
}

/** Drag the real Capture Inspector splitter to an absolute viewport X coordinate. */
async function dragSplitterTo(page: Page, targetX: number): Promise<void> {
  const box = await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.splitter)
    .boundingBox();
  if (!box) throw new Error('The Capture Inspector splitter disappeared.');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  try {
    await page.mouse.move(targetX, y, { steps: 12 });
  } finally {
    await page.mouse.up();
  }
}

async function expectInspectorWidth(
  page: Page,
  expected: number,
  description: string,
): Promise<void> {
  await expect.poll(
    async () => Math.abs(await readInspectorWidth(page) - expected),
    { message: `The breakpoint Inspector width did not reach ${expected}px (${description}).` },
  ).toBeLessThanOrEqual(1);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Require two real controls to keep a visible gap instead of overlapping. */
function expectNoOverlap(first: Box, second: Box, description: string): void {
  const horizontal = Math.min(first.x + first.width, second.x + second.width)
    - Math.max(first.x, second.x);
  const vertical = Math.min(first.y + first.height, second.y + second.height)
    - Math.max(first.y, second.y);
  expect(horizontal > 1 && vertical > 1, description).toBe(false);
}

test('breakpoints.resize keeps the pending editor usable and preserves its draft while resizing', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.resize',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);

  // 准备：创建真实request断点并挂起一条请求，选中paused row打开Breakpoint Inspector。
  // Arrange: create a real request breakpoint, hold one request and select its paused row.
  await createRequestBreakpointRule(page, 'E2E breakpoints resize', 'POST', REQUEST_PATH);
  const pending = loopbackLab.startAbortableRequestThroughProxy(
    desktopApp.capturePort(),
    REQUEST_PATH,
    { method: 'POST', body: 'resize-pending-body' },
  );
  const outcome = pending.result.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const pendingRow = rows.filter({ hasText: REQUEST_PATH }).last();
  await expect(pendingRow).toHaveAttribute('data-breakpoint-state', 'head');
  await pendingRow.click();
  await expect(pendingRow).toHaveAttribute('aria-pressed', 'true');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.replacement.text).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.breakpoints.body)).toBeVisible();
  await expectInspectorWidth(page, DEFAULT_INSPECTOR_WIDTH, 'default width');
  await screenshotStep('选中paused请求并打开Breakpoint Inspector / Select the paused request and open the Breakpoint Inspector');

  const body = getByAutomationId(page, AUTOMATION_IDS.breakpoints.body);
  const addHeader = getByAutomationId(page, AUTOMATION_IDS.breakpoints.addHeader);
  const drop = getByAutomationId(page, AUTOMATION_IDS.breakpoints.drop);
  const continueUnmodified = getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.continueUnmodified,
  );
  const executeEdited = getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited);
  await Promise.all([
    expect(addHeader).toBeVisible(),
    expect(drop).toBeVisible(),
    expect(continueUnmodified).toBeVisible(),
    expect(executeEdited).toBeVisible(),
  ]);
  const mainBox = await getByAutomationId(page, AUTOMATION_IDS.app.main).boundingBox();
  if (!mainBox) throw new Error('The Capture main region is not laid out.');

  // 细节最小宽度：Inspector收到360，header/body/footer仍完整可用且互不重叠。
  // Minimum width: shrink to 360 and keep header, body and footer usable without overlap.
  try {
    await dragSplitterTo(page, mainBox.x + mainBox.width - MINIMUM_INSPECTOR_WIDTH);
    await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH, 'minimum width');
    const splitterBox = await getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.splitter,
    ).boundingBox();
    if (!splitterBox) throw new Error('The breakpoint Inspector splitter is not laid out.');
    const inspectorBox = {
      x: splitterBox.x + SPLITTER_TRACK_WIDTH,
      width: mainBox.x + mainBox.width - splitterBox.x - SPLITTER_TRACK_WIDTH,
    };
    const [addHeaderBox, bodyBox, dropBox, continueBox, executeBox] = await Promise.all([
      addHeader.boundingBox(),
      body.boundingBox(),
      drop.boundingBox(),
      continueUnmodified.boundingBox(),
      executeEdited.boundingBox(),
    ]);
    if (!addHeaderBox || !bodyBox || !dropBox || !continueBox || !executeBox) {
      throw new Error('The breakpoint Inspector controls are not laid out.');
    }
    expectNoOverlap(addHeaderBox, bodyBox, 'The header editor overlaps the body editor.');
    expectNoOverlap(dropBox, continueBox, 'The drop and continue actions overlap.');
    expectNoOverlap(continueBox, executeBox, 'The continue and execute actions overlap.');
    for (const box of [addHeaderBox, bodyBox, dropBox, continueBox, executeBox]) {
      expect(box.x).toBeGreaterThanOrEqual(inspectorBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(inspectorBox.x + inspectorBox.width + 1);
    }
    await screenshotStep('最小宽度下编辑区与footer不重叠 / The editor and footer do not overlap at the minimum width');

    // 中间宽度：拖回700，宽度按1:1变化。
    // Middle width: drag back to 700; the width follows 1:1.
    await dragSplitterTo(page, mainBox.x + mainBox.width - (MINIMUM_INSPECTOR_WIDTH + 340));
    await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH + 340, 'middle width');
    await screenshotStep('Inspector中间宽度 / The middle Inspector width');

    // 最大宽度：列表保留512，Inspector吃满剩余空间。
    // Maximum width: keep a 512px list and give the Inspector the rest.
    await dragSplitterTo(page, mainBox.x + MINIMUM_LIST_WIDTH);
    const listBox = getByAutomationId(page, AUTOMATION_IDS.capture.list);
    await expect.poll(async () => (await listBox.boundingBox())?.width ?? 0, {
      message: 'The Capture list did not stop at its 512px minimum.',
    }).toBeGreaterThanOrEqual(MINIMUM_LIST_WIDTH - 1);
    expect((await readInspectorWidth(page))).toBeGreaterThan(MINIMUM_INSPECTOR_WIDTH + 340);
    await expect(pendingRow).toHaveAttribute('aria-pressed', 'true');
    await expect(body).toBeVisible();
    await screenshotStep('Inspector最大宽度且列表保留512 / The maximum Inspector width with a 512px list');

    // 用户操作：编辑body但不提交，再拖动splitter，草稿与selection必须保持。
    // User action: edit the body without submitting, then resize; the draft and selection must survive.
    await body.fill('breakpoints-resize-draft');
    await expect(body).toHaveValue('breakpoints-resize-draft');
    await dragSplitterTo(page, mainBox.x + mainBox.width - 620);
    await expectInspectorWidth(page, 620, 'width after editing the draft');
    await expect(body).toHaveValue('breakpoints-resize-draft');
    await expect(pendingRow).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep('拖动splitter后保留body草稿与选中 / Resizing preserves the body draft and selection');

    // 释放请求：Continue unmodified让真实请求完成，footer随之消失。
    // Release: Continue unmodified completes the real request and the footer disappears.
    await continueUnmodified.click();
    await expect(outcome).resolves.toMatchObject({ result: { statusCode: 200 } });
    await expect(continueUnmodified).toHaveCount(0);
    await expect(pendingRow).not.toHaveAttribute('data-breakpoint-state');
  } finally {
    // 无论断言结果如何都释放挂起请求，避免fixture退出被等待中的请求拖住。
    // Release the held request in every case so fixture teardown cannot wait on it.
    const stillHeld = await continueUnmodified.isVisible().catch(() => false);
    if (stillHeld) {
      await continueUnmodified.click().catch(() => undefined);
      await outcome.catch(() => undefined);
    }
    pending.abort();
  }

  // 清理路由：经真实Proxy Restore交回系统代理，再由fixture正常Close。
  // Route cleanup: hand the system proxy back through the real Proxy Restore, then let the fixture close normally.
  const journalPath = desktopApp.systemProxyJournalPath();
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { original: unknown };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
  expect(desktopApp.matchesSystemProxyEvidence(
    await desktopApp.readSystemProxySettings(),
    journal.original,
  )).toBe(true);
  await expect(access(journalPath)).rejects.toMatchObject({ code: 'ENOENT' });

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('breakpoints-resize.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath: REQUEST_PATH,
    defaultInspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    systemProxyRestoredBeforeClose: true,
  }, null, 2), 'utf8');
  await testInfo.attach('breakpoints-resize.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
