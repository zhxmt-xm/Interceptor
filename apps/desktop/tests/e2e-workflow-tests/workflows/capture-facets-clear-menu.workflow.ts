import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../fixtures/automation';
import { startRecording } from '../fixtures/capture-workflow';
import { expect, test } from '../fixtures/local-electron-driver';

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

  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/get-first',
  );
  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-first',
    { method: 'POST' },
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
  await expect.poll(async () => {
    const blockBox = await block.boundingBox();
    const breakpointBox = await breakpoint.boundingBox();
    return blockBox && breakpointBox
      ? Math.abs(blockBox.x - breakpointBox.x)
      : Number.POSITIVE_INFINITY;
  }).toBeLessThan(1);
  await breakpoint.hover();
  await expect(page.getByText('This endpoint', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const methodToggle = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetToggle('method'),
  );
  if (await methodToggle.getAttribute('aria-expanded') !== 'true') {
    await methodToggle.click();
  }
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

  const optionIds = async (): Promise<string[]> => methodGroup
    .locator('[data-automation-id^="capture.filter.option.method."]')
    .evaluateAll((options) => options.map(
      (option) => option.getAttribute('data-automation-id') ?? '',
    ));
  const expectedOrder = [
    AutomationIdFactory.captureFacetOption('method', 'GET'),
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  ];
  expect(await optionIds()).toEqual(expectedOrder);

  await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-second',
    { method: 'POST' },
  );
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'POST'),
  )).toHaveText('2');
  expect(await optionIds()).toEqual(expectedOrder);

  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const clear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
  await clear.click();
  await expect(rows).toHaveCount(0);

  const groupCount = await getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroupCount('method'),
  ).textContent();
  expect(groupCount?.trim()).toBe('0');
  expect(await getOption.count()).toBe(0);
  expect(await postOption.count()).toBe(0);

  await testInfo.attach('capture-facet-state', {
    body: Buffer.from(JSON.stringify({
      expectedOrder,
      finalGroupCount: groupCount?.trim(),
      remainingRows: await rows.count(),
    }, null, 2)),
    contentType: 'application/json',
  });
});
