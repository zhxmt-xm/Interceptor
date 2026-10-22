import { access, readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS, PENDING_FACET_VALUE } from '../../../../src/renderer/features/capture/constants';
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

  // 路由隔离：公开Restore恢复个人代理，显式客户端仍经8888；不靠Keyword隐藏背景记录。
  // Route isolation: Restore the personal proxy through UI while explicit clients keep using 8888; never hide background records with Keyword.
  const proxyJournal = JSON.parse(await readFile(desktopApp.systemProxyJournalPath(), 'utf8')) as { original: unknown };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
  expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), proxyJournal.original)).toBe(true);
  await expect(access(desktopApp.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'false');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue('');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const prepareClear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
  if (await rows.count() === 0) {
    await expect(rows).toHaveCount(0);
    await expect(prepareClear).toBeDisabled();
  } else {
    await expect(prepareClear).toBeEnabled();
    await prepareClear.click();
    await expect(rows).toHaveCount(0);
  }
  let expectedExchangeCount = 0;
  const assertOwnedCapture = async (): Promise<void> => {
    for (const facet of CAPTURE_FACET_IDS) {
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount(facet)))
        .toHaveText(String(facet === 'rule' ? 0 : expectedExchangeCount));
    }
    expect(await rows.evaluateAll(elements => elements.every(element => element.textContent?.includes('/e2e/facets/'))))
      .toBe(true);
  };
  const captureStep = async (title: string, options?: Parameters<typeof screenshotStep>[1]): Promise<void> => {
    await assertOwnedCapture();
    await screenshotStep(title, options);
    await assertOwnedCapture();
  };

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
  await captureStep('展开筛选并检查Pending选项 / Expand facets and inspect Pending options', {
    highlights: [{ target: typePending, label: '1' }],
  });

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
  expectedExchangeCount = 2;

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
  await captureStep('在请求菜单中展开断点选项 / Open breakpoint options in the request menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.captureCreateBreakpoint(capturedExchangeId, 'endpoint')), label: '1' }],
  });
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
  await captureStep('展开Method并查看已有方法 / Expand Method and inspect captured methods', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.captureFacetToggle('method')), label: '1' }],
  });

  const postRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: '/e2e/facets/post-first' })
    .last();
  await expect(postRow).toBeVisible();
  await applicationPending.click();
  await expect(getRow).toBeHidden();
  await expect(postRow).toBeHidden();
  await captureStep('选择Application的Pending / Select Pending in Application', {
    highlights: [{ target: applicationPending, label: '1' }],
  });
  await applicationPending.click();
  await expect(getRow).toBeVisible();
  await expect(postRow).toBeVisible();
  await captureStep('取消Application的Pending / Deselect Pending in Application', {
    highlights: [{ target: applicationPending, label: '1' }],
  });

  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facets/post-second',
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 200 });
  expectedExchangeCount = 3;
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'POST'),
  )).toHaveText('2');
  expect.soft(
    await optionIds(),
    'Facet options must not move when a later value overtakes the count.',
  ).toEqual(expectedOrder);
  await captureStep('请求增加后筛选顺序保持不变 / Keep facet order as request counts grow');

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
  expectedExchangeCount = 4;
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
  await captureStep('按Status Pending查看未完成请求 / Filter unfinished requests by Status Pending', {
    highlights: [{ target: statusPending, label: '1' }],
  });
  await statusPending.click();
  await typePending.click();
  await expect(pendingRow).toBeVisible();
  await expect(getRow).toBeHidden();

  await captureStep('按Content type Pending查看未完成请求 / Filter unfinished requests by Content type Pending', {
    highlights: [{ target: typePending, label: '1' }],
  });
  releasePending();
  await expect(pendingRequest).resolves.toMatchObject({ statusCode: 200 });
  await expect(statusPending).toBeVisible();
  await expect(typePending).toBeVisible();
  await expect(pendingRow).toBeHidden();
  await typePending.click();
  await captureStep('响应完成后退出Pending筛选 / Leave the Pending filter after completion', {
    highlights: [{ target: typePending, label: '1' }],
  });

  // 组合筛选：同组OR、跨组AND与搜索只改变可见记录，不删除请求。
  // Combined filters: OR within a group, AND across groups and search only change visibility.
  const errorPath = '/e2e/facets/get-error';
  loopbackLab.respondWith(errorPath, { statusCode: 503, body: 'facet-error' });
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), errorPath))
    .resolves.toMatchObject({ statusCode: 503 });
  expectedExchangeCount = 5;
  // Restore后的控件状态不等于Core已暂停；不再点击它，避免Start重新接管系统路由。
  // The control after Restore does not prove Core is paused; do not click it again and let Start reacquire the system route.
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  const ownRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: '/e2e/facets/' });
  await expect(ownRows).toHaveCount(5);
  await captureStep('五条自产记录已保留，录制控件显示Paused / Five owned records are retained and the recording control shows Paused', {
    highlights: [{ target: recording, label: '1' }],
  });
  await getOption.click();
  await expect(ownRows).toHaveCount(3);
  await captureStep('Method只选择GET / Select only GET in Method', {
    highlights: [{ target: getOption, label: '1' }],
  });
  await postOption.click();
  await expect(ownRows).toHaveCount(5);
  await captureStep('Method再选择POST，与GET按OR组合 / Also select POST to combine with GET using OR', {
    highlights: [{ target: postOption, label: '1' }],
  });
  const status200 = getByAutomationId(page, AutomationIdFactory.captureFacetOption('status', '200'));
  await status200.click();
  await expect(ownRows).toHaveCount(4);
  await captureStep('Status选择200，与Method按AND组合 / Select Status 200 and combine with Method using AND', {
    highlights: [{ target: status200, label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/facets/post');
  await expect(ownRows).toHaveCount(2);
  await captureStep('搜索/e2e/facets/post并保留分组条件 / Search /e2e/facets/post while retaining facet selections', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.clearSearch).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue('');
  await expect(ownRows).toHaveCount(4);
  await captureStep('Clear search只移除关键词，分组条件仍保留 / Clear search removes only the keyword and retains facet selections', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter), label: '1' }],
  });
  await status200.click();
  await captureStep('取消Status 200，仍保留Method条件 / Deselect Status 200 while retaining Method selections', {
    highlights: [{ target: status200, label: '1' }],
  });
  await postOption.click();
  await captureStep('取消POST，仍保留GET / Deselect POST while retaining GET', {
    highlights: [{ target: postOption, label: '1' }],
  });
  await getOption.click();
  await expect(ownRows).toHaveCount(5);
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await captureStep('取消最后一个GET条件，保留五条记录 / Deselect the final GET condition while retaining all five records', {
    highlights: [{ target: getOption, label: '1' }],
  });

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
  expectedExchangeCount = 0;
  await captureStep('Clear同步清空Capture与筛选计数 / Clear Capture and facet counts together', {
    highlights: [{ target: clear, label: '1' }],
  });
  expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), proxyJournal.original)).toBe(true);
  await expect(access(desktopApp.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });

  await testInfo.attach('capture-facet-state', {
    body: Buffer.from(JSON.stringify({
      expectedOrder,
      systemProxyRestoredBeforeTraffic: true,
      systemProxyNotReacquired: true,
      recordingControlAfterRestore: 'paused',
      recordingControlNotRetoggledAfterRestore: true,
      onlyOwnedCaptureFrames: true,
      finalGroupCount: groupCount?.trim(),
      remainingRows: await rows.count(),
    }, null, 2)),
    contentType: 'application/json',
  });
});
