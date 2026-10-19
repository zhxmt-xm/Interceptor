import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { PENDING_FACET_VALUE } from '../../../../src/renderer/features/capture/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Extract a Core-owned exchange ID from one public Capture row automation ID. */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

test('capture facets, Clear and breakpoint menu stay stable end to end', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.facets-clear-menu',
  });

  const { page } = desktopApp;
  await startRecording(desktopApp);

  const openFacet = async (facet: 'application' | 'method' | 'status' | 'type') => {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') !== 'true') {
      await toggle.click();
    }
  };
  for (const facet of ['application', 'status', 'type'] as const) {
    await openFacet(facet);
  }
  const applicationPending = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('application', PENDING_FACET_VALUE),
  );
  const statusPending = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('status', PENDING_FACET_VALUE),
  );
  const typePending = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('type', PENDING_FACET_VALUE),
  );
  await expect(applicationPending).toBeVisible();
  await expect(statusPending).toBeVisible();
  await expect(typePending).toBeVisible();
  const expectPendingLast = async (): Promise<void> => {
    for (const facet of ['application', 'status', 'type'] as const) {
      const group = getByAutomationId(
        page,
        AutomationIdFactory.captureFacetGroup(facet),
      );
      await expect(group.locator(
        `[data-automation-id^="capture.filter.option.${facet}."]`,
      ).last()).toHaveAttribute(
        'data-automation-id',
        AutomationIdFactory.captureFacetOption(facet, PENDING_FACET_VALUE),
      );
    }
  };
  await expectPendingLast();
  await screenshotStep('展开筛选并检查Pending选项 / Expand facets and inspect Pending options');

  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/get-first',
    { method: 'GET' },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-first',
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 200 });

  const getRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: '/e2e/facets/get-first' })
    .last();
  await expect(getRow).toBeVisible();
  const capturedExchangeId = await exchangeId(getRow);
  await getRow.click({ button: 'right' });

  const block = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'block'),
  );
  const breakpoint = getByAutomationId(
    page,
    AutomationIdFactory.captureCreateRule(capturedExchangeId, 'breakpoint'),
  );
  await expect(block).toBeVisible();
  await expect(breakpoint).toBeVisible();
  await expect.soft.poll(async () => {
    const blockBox = await block.boundingBox();
    const breakpointBox = await breakpoint.boundingBox();
    return blockBox && breakpointBox
      ? Math.abs(blockBox.x - breakpointBox.x)
      : Number.POSITIVE_INFINITY;
  }).toBeLessThan(1);
  await breakpoint.hover();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint'),
  )).toBeVisible();
  await screenshotStep('在请求菜单中展开断点选项 / Open breakpoint options in the request menu');
  await page.keyboard.press('Escape');

  await openFacet('method');
  const methodGroup = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroup('method'),
  );
  const getOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'GET'),
  );
  const postOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  );
  await expect(getOption).toBeVisible();
  await expect(postOption).toBeVisible();

  const expectedOrder = [
    AutomationIdFactory.captureFacetOption('method', 'GET'),
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  ];
  const optionIds = async (): Promise<string[]> => (
    await methodGroup
      .locator('[data-automation-id^="capture.filter.option.method."]')
      .evaluateAll((options) => options.map(
        (option) => option.getAttribute('data-automation-id') ?? '',
      ))
  ).filter((automationId) => expectedOrder.includes(automationId));
  expect(await optionIds()).toEqual(expectedOrder);
  await screenshotStep('按首次出现顺序查看Method筛选 / Inspect methods in first-seen order');

  const postRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: '/e2e/facets/post-first' })
    .last();
  await expect(postRow).toBeVisible();
  await applicationPending.click();
  await expect(getRow).toBeHidden();
  await expect(postRow).toBeHidden();
  await applicationPending.click();
  await expect(getRow).toBeVisible();
  await expect(postRow).toBeVisible();

  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-second',
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'POST'),
  )).toHaveText('2');
  expect.soft(
    await optionIds(),
    'Facet options must not move when a later value overtakes the count.',
  ).toEqual(expectedOrder);
  await screenshotStep('请求增加后筛选顺序保持不变 / Keep facet order as request counts grow');

  const pendingPath = '/e2e/facets/pending';
  const releasePending = loopbackLab.holdResponse(pendingPath);
  const pendingRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    pendingPath,
  );
  const pendingRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: pendingPath }).last();
  await expect(pendingRow).toBeVisible();
  await expect.poll(async () => Number(await getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('status', PENDING_FACET_VALUE),
  ).textContent())).toBeGreaterThan(0);
  await expect.poll(async () => Number(await getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('type', PENDING_FACET_VALUE),
  ).textContent())).toBeGreaterThan(0);
  await statusPending.click();
  await expect(pendingRow).toBeVisible();
  await expect(getRow).toBeHidden();
  await statusPending.click();
  await typePending.click();
  await expect(pendingRow).toBeVisible();
  await expect(getRow).toBeHidden();

  await screenshotStep('使用Pending筛选尚未完成的请求 / Filter requests that are still pending');
  releasePending();
  await expect(pendingRequest).resolves.toMatchObject({ statusCode: 200 });
  await expect(statusPending).toBeVisible();
  await expect(typePending).toBeVisible();
  await expect(pendingRow).toBeHidden();
  await typePending.click();
  await screenshotStep('响应完成后退出Pending筛选 / Leave the Pending filter after completion');

  // 组合筛选：同组OR、跨组AND与搜索只改变可见记录，不删除请求。
  // Combined filters: OR within a group, AND across groups and search only change visibility.
  const errorPath = '/e2e/facets/get-error';
  loopbackLab.respondWith(errorPath, { statusCode: 503, body: 'facet-error' });
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), errorPath))
    .resolves.toMatchObject({ statusCode: 503 });
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  const ownRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: '/e2e/facets/' });
  await expect(ownRows).toHaveCount(5);
  await getOption.click();
  await expect(ownRows).toHaveCount(3);
  await postOption.click();
  await expect(ownRows).toHaveCount(5);
  await screenshotStep('同一Method组的多选按OR组合 / Multiple methods in the same group combine with OR');
  const status200 = getByAutomationId(page, AutomationIdFactory.captureFacetOption('status', '200'));
  await status200.click();
  await expect(ownRows).toHaveCount(4);
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/facets/post');
  await expect(ownRows).toHaveCount(2);
  await screenshotStep('跨组AND再叠加关键词 / Combine groups with AND and add a keyword');
  await getByAutomationId(page, AUTOMATION_IDS.capture.clearSearch).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue('');
  await expect(ownRows).toHaveCount(4);
  await status200.click();
  await postOption.click();
  await getOption.click();
  await expect(ownRows).toHaveCount(5);
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await screenshotStep('清除搜索和筛选不删除记录或恢复录制 / Clear search and filters without deleting records or resuming recording');

  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const clear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
  await clear.click();
  await expect(rows).toHaveCount(0);

  const groupCount = await getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroupCount('method'),
  ).textContent();
  expect.soft(
    groupCount?.trim(),
    'Clear must reset the facet snapshot in the same visible state transition.',
  ).toBe('0');
  expect.soft(await getOption.count()).toBe(0);
  expect.soft(await postOption.count()).toBe(0);
  await expect(applicationPending).toBeVisible();
  await expect(statusPending).toBeVisible();
  await expect(typePending).toBeVisible();
  await expectPendingLast();
  for (const facet of ['application', 'status', 'type'] as const) {
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureFacetOptionCount(facet, PENDING_FACET_VALUE),
    )).toHaveText('0');
  }
  await screenshotStep('停止录制并同步清空Capture与筛选计数 / Stop recording and clear Capture and facet counts together');

  await testInfo.attach('capture-facet-state', {
    body: Buffer.from(JSON.stringify({
      expectedOrder,
      finalGroupCount: groupCount?.trim(),
      remainingRows: await rows.count(),
    }, null, 2)),
    contentType: 'application/json',
  });
});
