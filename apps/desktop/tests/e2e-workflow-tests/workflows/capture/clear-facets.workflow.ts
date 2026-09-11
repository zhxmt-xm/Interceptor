import { writeFile } from 'node:fs/promises';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

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
  const methodToggle = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetToggle('method'),
  );
  if (await methodToggle.getAttribute('aria-expanded') !== 'true') {
    await methodToggle.click();
  }
  await expect(methodToggle).toHaveAttribute('aria-expanded', 'true');

  const requestPath = '/e2e/capture/clear-facets';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
    { method: 'GET' },
  )).resolves.toMatchObject({ statusCode: 200 });

  // 冻结新录制，不假设系统代理接管期间只有本轮请求；既有请求与facet仍保留供Clear验证。
  // Freeze new recording without assuming exclusive system traffic; keep existing rows and facets for Clear assertions.
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');

  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
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

  // 筛选清除只重置筛选，不清记录或selection；按钮随有效筛选在禁用与启用间切换。
  // Clearing filters preserves records and selection; the button follows inactive and active filter states.
  const clearFilters = getByAutomationId(page, AUTOMATION_IDS.capture.clearFilters);
  await expect(clearFilters).toBeDisabled();
  await expect(clearFilters).toHaveCSS('opacity', '0.35');
  await getOption.click();
  await expect(getOption).toHaveAttribute('aria-pressed', 'true');
  await expect(clearFilters).toBeEnabled();
  await expect(clearFilters).toHaveCSS('opacity', '1');
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
  };
  expect(immediateState).toEqual({
    rows: 0,
    inspector: 0,
    methodGroupCount: '0',
    getOptions: 0,
  });

  // 保存同帧归零证据；fixture随后正常Close并验证Main/Core、8888与系统代理恢复。
  // Save the same-transition clear evidence; the fixture then verifies normal Close, Main/Core, port 8888, and proxy restoration.
  const evidencePath = testInfo.outputPath('capture-clear-facets.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath,
    beforeClear,
    immediateState,
  }, null, 2), 'utf8');
  await testInfo.attach('capture-clear-facets', {
    path: evidencePath,
    contentType: 'application/json',
  });
});