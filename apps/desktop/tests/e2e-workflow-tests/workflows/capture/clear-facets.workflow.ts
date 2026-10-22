import { access, readFile, writeFile } from 'node:fs/promises';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('capture.clear-facets clears rows, selection and facets in one visible transition', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.clear-facets',
  });

  const { page } = desktopApp;

  // 通过真实Recording与显式代理请求建立一条刚进入facet快照的Capture记录。
  // Build one freshly snapshotted Capture record through real Recording and an explicit proxy request.
  await startRecording(desktopApp);
  // 路由隔离：只通过公开Restore恢复原代理，然后正常清空本profile录制；保留完整列表断言。
  // Route isolation: restore the original proxy through public UI, then clear this profile's recording without weakening full-list assertions.
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
  const methodToggle = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetToggle('method'),
  );
  if (await methodToggle.getAttribute('aria-expanded') !== 'true') {
    await methodToggle.click();
  }
  await expect(methodToggle).toHaveAttribute('aria-expanded', 'true');

  const requestPath = '/e2e/capture/clear-facets';
  let expectedExchangeCount = 1;
  const assertOwnedCapture = async (): Promise<void> => {
    await expect(rows).toHaveCount(expectedExchangeCount);
    for (const facet of CAPTURE_FACET_IDS) {
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount(facet)))
        .toHaveText(String(facet === 'rule' ? 0 : expectedExchangeCount));
    }
    expect(await rows.evaluateAll((elements, path) => elements.every(element => element.textContent?.includes(path)), requestPath))
      .toBe(true);
  };
  const captureStep = async (title: string, options?: Parameters<typeof screenshotStep>[1]): Promise<void> => {
    await assertOwnedCapture();
    await screenshotStep(title, options);
    await assertOwnedCapture();
  };
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
    { method: 'GET' },
  )).resolves.toMatchObject({ statusCode: 200 });
  await captureStep('通过真实Recording与显式代理请求建立一条刚进入facet快照的Capture记录。 / Build one freshly snapshotted Capture record through real Recording and an explicit proxy request.');

  // Restore后不再切换Recording：现有控件显示Paused，点击会重新Start并接管系统路由。
  // Do not toggle Recording after Restore: the control shows Paused, and clicking would Start and reacquire system routing.
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await expect(recording).toHaveAttribute('aria-pressed', 'false');

  const requestRow = rows.filter({ hasText: requestPath }).last();
  await expect(requestRow).toBeVisible();
  await requestRow.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toBeVisible();

  const methodGroupCount = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroupCount('method'),
  );
  const getOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'GET'),
  );
  await expect(methodGroupCount).toHaveText(/^[1-9]\d*$/);
  await expect(getOption).toBeVisible();
  const getCount = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'GET'),
  );
  await expect(getCount).toHaveText(/^[1-9]\d*$/);
  await captureStep('保持系统路由已恢复，选中自产记录准备Clear / Keep system routing restored and select the owned record before Clear');

  // 筛选清除只重置筛选，不清记录或selection；按钮随有效筛选在禁用与启用间切换。
  // Clearing filters preserves records and selection; the button follows inactive and active filter states.
  const clearFilters = getByAutomationId(page, AUTOMATION_IDS.capture.clearFilters);
  await expect(clearFilters).toBeDisabled();
  await expect(clearFilters).toHaveCSS('opacity', '0.35');
  await getOption.click();
  await expect(getOption).toHaveAttribute('aria-pressed', 'true');
  await expect(clearFilters).toBeEnabled();
  await expect(clearFilters).toHaveCSS('opacity', '1');
  await captureStep('选择GET后Clear filters可用 / Selecting GET enables Clear filters', {
    highlights: [{ target: clearFilters, label: '1' }],
  });
  await clearFilters.click();
  await expect(getOption).toHaveAttribute('aria-pressed', 'false');
  await expect(clearFilters).toBeDisabled();
  await expect(clearFilters).toHaveCSS('opacity', '0.35');
  await expect(requestRow).toBeVisible();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close)).toBeVisible();

  const beforeClear = {
    methodGroupCount: (await methodGroupCount.textContent())?.trim() ?? null,
    getCount: (await getCount.textContent())?.trim() ?? null,
  };
  await captureStep('Clear filters保留记录和选中详情 / Clear filters preserves records and the selected Inspector', {
    highlights: [{ target: clearFilters, label: '1' }],
  });

  // Clear完成后只等待列表业务结果，再原始读取selection与facet，禁止auto-retry掩盖600ms旧快照。
  // After Clear, wait only for the list result, then read selection and facets raw so auto-retry cannot hide the stale 600 ms snapshot.
  await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
  await expect(rows).toHaveCount(0);
  const immediateState = {
    rows: await rows.count(),
    inspector: await getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.close,
    ).count(),
    methodGroupCount: (await methodGroupCount.textContent())?.trim() ?? null,
    getOptions: await getOption.count(),
    groupCounts: Object.fromEntries(await Promise.all(CAPTURE_FACET_IDS.map(async (facet) => [
      facet,
      (await getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount(facet)).textContent())?.trim(),
    ]))),
  };
  expect(immediateState).toEqual({
    rows: 0,
    inspector: 0,
    methodGroupCount: '0',
    getOptions: 0,
    groupCounts: Object.fromEntries(CAPTURE_FACET_IDS.map((facet) => [facet, '0'])),
  });
  expectedExchangeCount = 0;
  await captureStep('Clear移除记录、详情和计数 / Clear removes records, selection and counts', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.clear), label: '1' }],
  });
  expect(desktopApp.matchesSystemProxyEvidence(await desktopApp.readSystemProxySettings(), proxyJournal.original)).toBe(true);
  await expect(access(desktopApp.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });

  // 保存同帧归零证据；fixture随后正常Close并验证Main/Core、8888与系统代理恢复。
  // Save the same-transition clear evidence; the fixture then verifies normal Close, Main/Core, port 8888, and proxy restoration.
  const evidencePath = testInfo.outputPath('capture-clear-facets.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath,
    systemProxyRestoredBeforeTraffic: true,
    systemProxyNotReacquired: true,
    recordingControlAfterRestore: 'paused',
    recordingControlNotRetoggledAfterRestore: true,
    onlyOwnedCaptureFrames: true,
    beforeClear,
    immediateState,
  }, null, 2), 'utf8');
  await testInfo.attach('capture-clear-facets', {
    path: evidencePath,
    contentType: 'application/json',
  });
});