import { writeFile } from 'node:fs/promises';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/automation';
import { startRecording } from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

test('capture.clear-facets clears rows, selection and facets in one visible transition', async ({
  desktopApp,
  loopbackLab,
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
  await expect(methodGroupCount).toHaveText('1');
  await expect(getOption).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'GET'),
  )).toHaveText('1');

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
    immediateState,
  }, null, 2), 'utf8');
  await testInfo.attach('capture-clear-facets', {
    path: evidencePath,
    contentType: 'application/json',
  });
});