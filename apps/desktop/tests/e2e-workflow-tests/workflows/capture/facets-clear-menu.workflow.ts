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
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

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
  loopbackLab,
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

  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/get-first',
    { method: 'E2E-FIRST' },
  );
  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-first',
    { method: 'E2E-LATER' },
  );

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
  await expect(page.getByText('This endpoint', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await openFacet('method');
  const methodGroup = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroup('method'),
  );
  const getOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'E2E-FIRST'),
  );
  const postOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'E2E-LATER'),
  );
  await expect(getOption).toBeVisible();
  await expect(postOption).toBeVisible();

  const optionIds = async (): Promise<string[]> => methodGroup
    .locator('[data-automation-id^="capture.filter.option.method."]')
    .evaluateAll((options) => options.map(
      (option) => option.getAttribute('data-automation-id') ?? '',
    ));
  const expectedOrder = [
    AutomationIdFactory.captureFacetOption('method', 'E2E-FIRST'),
    AutomationIdFactory.captureFacetOption('method', 'E2E-LATER'),
  ];
  expect(await optionIds()).toEqual(expectedOrder);

  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-second',
    { method: 'E2E-LATER' },
  );
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'E2E-LATER'),
  )).toHaveText('2');
  expect.soft(
    await optionIds(),
    'Facet options must not move when a later value overtakes the count.',
  ).toEqual(expectedOrder);

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

  releasePending();
  await expect(pendingRequest).resolves.toMatchObject({ statusCode: 200 });
  await expect(statusPending).toBeVisible();
  await expect(typePending).toBeVisible();
  await statusPending.click();

  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');

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
  for (const facet of ['application', 'status', 'type'] as const) {
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureFacetOptionCount(facet, PENDING_FACET_VALUE),
    )).toHaveText('0');
  }

  await testInfo.attach('capture-facet-state', {
    body: Buffer.from(JSON.stringify({
      expectedOrder,
      finalGroupCount: groupCount?.trim(),
      remainingRows: await rows.count(),
    }, null, 2)),
    contentType: 'application/json',
  });
});
