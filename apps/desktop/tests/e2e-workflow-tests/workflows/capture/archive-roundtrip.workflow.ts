import { readFile, writeFile } from 'node:fs/promises';

import type { TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const ALPHA_PATH = '/e2e/archive/alpha';
const BINARY_PATH = '/e2e/archive/binary';
const WS_PATH = '/e2e/archive/ws';
const ALPHA_BODY = '{"marker":"archive-alpha"}';

test('capture.transfer.archive-roundtrip saves and reopens real Capture state', async ({
  desktopApp, httpTrafficRunner: loopbackLab, trafficLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.transfer.archive-roundtrip',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const archiveFile = testInfo.outputPath('roundtrip.iarchive');
  const brokenArchive = testInfo.outputPath('roundtrip-broken.iarchive');

  // 准备：制造HTTP文本、HTTP二进制和WebSocket记录，作为全保真往返基线。
  // Arrange: create text, binary and WebSocket records as the lossless round-trip baseline.
  await startRecording(desktopApp);
  loopbackLab.respondWith(ALPHA_PATH, {
    headers: {
      'content-type': 'application/json',
      'x-e2e-archive': 'alpha',
      'content-length': String(Buffer.byteLength(ALPHA_BODY)),
    },
    body: ALPHA_BODY,
  });
  loopbackLab.respondWith(BINARY_PATH, {
    headers: { 'content-type': 'application/octet-stream', 'content-length': '4' },
    body: Buffer.from([0, 1, 2, 255]),
  });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    ALPHA_PATH,
    { headers: { 'x-e2e-archive': 'alpha' } },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    BINARY_PATH,
    { method: 'POST', body: Buffer.from([0, 1, 2, 255]) },
  )).resolves.toMatchObject({ statusCode: 200 });
  const wsClient = await trafficLab.webSocketTrafficRunner.openThroughProxy(
    desktopApp.capturePort(),
    WS_PATH,
  );
  await wsClient.closeGracefully(1000, 'archive-roundtrip');
  await expect(rows.filter({ hasText: ALPHA_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: BINARY_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: WS_PATH })).toHaveCount(1);
  await screenshotStep('制造HTTP文本/二进制与WS基线 / Create text, binary and WebSocket baseline records');

  // 用户操作：通过真实Export菜单保存archive。
  // User action: save the archive through the real Export menu.
  await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.saveArchive).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), archiveFile);
  await expect.poll(async () => {
    try {
      return (await readFile(archiveFile)).length;
    } catch {
      return -1;
    }
  }, { message: 'The product did not write the archive.', timeout: 120_000 }).toBeGreaterThan(0);
  const archiveBytes = await readFile(archiveFile);
  expect(archiveBytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(archiveBytes.length).toBeGreaterThan(1_000);
  await screenshotStep('产品写出可识别的archive / The product writes a recognizable archive');

  // 用户操作：暂停Recording后清空Capture，再通过真实Open Dialog打开同一archive。
  // User action: pause Recording, clear Capture, then reopen the same archive through the real Open dialog.
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
  await expect(rows).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.openArchive).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), archiveFile);
  const restoredAlpha = rows.filter({ hasText: ALPHA_PATH });
  await expect(restoredAlpha).toHaveCount(1, { timeout: 120_000 });
  await expect(rows.filter({ hasText: BINARY_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: WS_PATH })).toHaveCount(1);

  // 业务断言：恢复记录的method、URL、status与自定义Header保持；WS session保留。
  // Assert: restored method, URL, status and custom headers survive; the WS session remains.
  await restoredAlpha.first().click();
  const general = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general);
  if (await general.getAttribute('aria-expanded') !== 'true') await general.click();
  await expect(general.locator('..')).toContainText(ALPHA_PATH);
  await expect(general.locator('..')).toContainText('200');
  const requestHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.requestHeaders,
  );
  if (await requestHeaders.getAttribute('aria-expanded') !== 'true') await requestHeaders.click();
  await expect(requestHeaders.locator('..')).toContainText('x-e2e-archive');
  await screenshotStep('Archive恢复method/URL/status与Header / The archive restores method, URL, status and headers');

  // 用户操作：截断同一archive后再次Open，失败且当前列表不变。
  // User action: truncate the archive and open it again; it must fail without changing the current list.
  await writeFile(brokenArchive, (await readFile(archiveFile)).subarray(0, 100));
  await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.openArchive).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), brokenArchive);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.progress))
    .toHaveAttribute('data-transfer-job-state', 'failed', { timeout: 60_000 });
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close).click();
  await expect(rows.filter({ hasText: ALPHA_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: WS_PATH })).toHaveCount(1);
  await screenshotStep('损坏archive失败且不污染当前列表 / A corrupted archive fails without changing the current list');

  // 清理路由并保存证据。
  // Restore routing and retain evidence.
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
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('archive-roundtrip.json');
  await writeFile(evidencePath, JSON.stringify({
    alphaPath: ALPHA_PATH,
    binaryPath: BINARY_PATH,
    webSocketPath: WS_PATH,
    archiveBytes: archiveBytes.length,
    h2AndMitmCoveredBy: 'capture.scenarios.http2',
  }, null, 2), 'utf8');
  await testInfo.attach('archive-roundtrip.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
