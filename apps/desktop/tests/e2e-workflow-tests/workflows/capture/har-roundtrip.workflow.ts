import { readFile, writeFile } from 'node:fs/promises';

import type { TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import {
  expect,
  type LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const ALPHA_PATH = '/e2e/transfer/har-alpha';
const BINARY_PATH = '/e2e/transfer/har-binary';
const ALPHA_BODY = '{"marker":"har-alpha"}';
const AUTHORIZATION = 'Bearer har-roundtrip-secret';
const COOKIE = 'session=har-roundtrip';

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString?: Array<{ name: string; value: string }>;
    cookies?: Array<{ name: string; value: string }>;
  };
  response: {
    status: number;
    content?: { text?: string; encoding?: string };
    headers?: Array<{ name: string; value: string }>;
  };
}

/** Parse the product-generated HAR 1.2 document. */
async function readHar(filePath: string): Promise<{ text: string; entries: HarEntry[] }> {
  const text = await readFile(filePath, 'utf8');
  const document: unknown = JSON.parse(text);
  if (typeof document !== 'object' || document === null
    || !('log' in document) || typeof document.log !== 'object' || document.log === null
    || !('entries' in document.log) || !Array.isArray(document.log.entries)) {
    throw new Error('The product export is not a HAR document.');
  }
  return { text, entries: document.log.entries as HarEntry[] };
}

function findEntry(entries: HarEntry[], path: string): HarEntry {
  const entry = entries.find((candidate) => String(candidate.request.url).includes(path));
  if (!entry) throw new Error(`HAR omitted ${path}.`);
  return entry;
}

function headerValue(entry: HarEntry, name: string): string | undefined {
  return entry.request.headers.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/** Save one HAR through the product's real export flow and return its parsed document. */
async function exportHar(
  desktopApp: LocalElectronApplicationDriver,
  filePath: string,
  options: { maskAuthorization: boolean; maskCookies: boolean; stripBodies: boolean },
): Promise<{ text: string; entries: HarEntry[] }> {
  const { page } = desktopApp;
  await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.scopeAll).click();
  for (const [automationId, desired] of [
    [AUTOMATION_IDS.capture.transfer.maskAuthorization, options.maskAuthorization],
    [AUTOMATION_IDS.capture.transfer.maskCookies, options.maskCookies],
    [AUTOMATION_IDS.capture.transfer.stripBodies, options.stripBodies],
  ] as const) {
    const checkbox = getByAutomationId(page, automationId);
    if ((await checkbox.getAttribute('aria-checked') === 'true') !== desired) {
      await checkbox.click();
    }
    await expect(checkbox).toHaveAttribute('aria-checked', String(desired));
  }
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), filePath);
  await expect.poll(async () => {
    try {
      return (await readHar(filePath)).entries.length;
    } catch {
      // The product writes the HAR atomically; retry until the final document is readable.
      return -1;
    }
  }, { message: 'The product did not write the requested HAR.' }).toBeGreaterThanOrEqual(0);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start))
    .toHaveCount(0, { timeout: 30_000 });
  return readHar(filePath);
}

test('capture.transfer.har-roundtrip exports, redacts and reimports real Capture traffic', async ({
  desktopApp, httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.transfer.har-roundtrip',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const fullHar = testInfo.outputPath('roundtrip.har');
  const redactedHar = testInfo.outputPath('roundtrip-redacted.har');
  const brokenHar = testInfo.outputPath('roundtrip-broken.har');

  // 准备：制造带Authorization、Cookie、query和文本/二进制body的真实Capture。
  // Arrange: create real Capture records with Authorization, Cookie, query and text/binary bodies.
  await startRecording(desktopApp);
  loopbackLab.respondWith(ALPHA_PATH, {
    headers: {
      'content-type': 'application/json',
      'set-cookie': COOKIE,
      'content-length': String(Buffer.byteLength(ALPHA_BODY)),
    },
    body: ALPHA_BODY,
  });
  loopbackLab.respondWith(BINARY_PATH, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': '4',
    },
    body: Buffer.from([0, 1, 2, 255]),
  });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    `${ALPHA_PATH}?token=alpha`,
    {
      headers: { authorization: AUTHORIZATION, cookie: COOKIE },
    },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    BINARY_PATH,
    { method: 'POST', body: Buffer.from([0, 1, 2, 255]) },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(rows.filter({ hasText: ALPHA_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: BINARY_PATH })).toHaveCount(1);
  await screenshotStep('制造带敏感Header与二进制正文的真实Capture / Create real Capture with sensitive headers and a binary body');

  // 用户操作：从Export菜单导出All且不脱敏的HAR，外部只读解析。
  // User action: export an unmasked All-traffic HAR from the Export menu and parse it read-only.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/transfer/');
  const full = await exportHar(desktopApp, fullHar, {
    maskAuthorization: false,
    maskCookies: false,
    stripBodies: false,
  });
  const alphaEntry = findEntry(full.entries, ALPHA_PATH);
  const binaryEntry = findEntry(full.entries, BINARY_PATH);
  expect(alphaEntry.request.method).toBe('GET');
  expect(headerValue(alphaEntry, 'authorization')).toBe(AUTHORIZATION);
  expect(alphaEntry.request.queryString).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'token', value: 'alpha' }),
  ]));
  expect(alphaEntry.response.status).toBe(200);
  expect(alphaEntry.response.content?.text).toContain('har-alpha');
  expect(binaryEntry.request.method).toBe('POST');
  expect(binaryEntry.response.content?.text?.length ?? 0).toBeGreaterThan(0);
  await screenshotStep('完整HAR保留敏感Header、query与正文 / The complete HAR retains sensitive headers, query and bodies');

  // 用户操作：导出开启Authorization/Cookie遮罩和strip bodies的HAR。
  // User action: export a HAR with Authorization/Cookie masking and stripped bodies.
  const redacted = await exportHar(desktopApp, redactedHar, {
    maskAuthorization: true,
    maskCookies: true,
    stripBodies: true,
  });
  const redactedAlpha = findEntry(redacted.entries, ALPHA_PATH);
  const redactedBinary = findEntry(redacted.entries, BINARY_PATH);
  expect(headerValue(redactedAlpha, 'authorization')).not.toBe(AUTHORIZATION);
  expect(redactedAlpha.request.headers.some(
    (header) => header.name.toLowerCase() === 'authorization' && header.value === AUTHORIZATION,
  )).toBe(false);
  expect(redactedAlpha.response.content?.text ?? '').toBe('');
  expect(redactedBinary.response.content?.text ?? '').toBe('');
  expect(redacted.text).not.toContain(AUTHORIZATION);
  expect(redacted.text).not.toContain(COOKIE);
  await screenshotStep('脱敏HAR不再包含敏感Header与正文 / The redacted HAR contains no sensitive headers or bodies');

  // 用户操作：清空Capture，再从Import菜单导回同一份完整HAR。
  // User action: clear Capture, then import the same complete HAR through the Import menu.
  // 清空Capture前先暂停Recording，避免宿主流量在Clear后立刻重新进入列表。
  // Pause Recording before Clear so host traffic cannot refill the list immediately.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('');
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') {
    await recording.click();
  }
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
  await expect(rows).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), fullHar);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start))
    .toHaveCount(0, { timeout: 30_000 });
  await expect(rows.filter({ hasText: ALPHA_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: BINARY_PATH })).toHaveCount(1);

  // 业务断言：导入记录的HAR可表达字段与导出一致。
  // Assert: imported records keep the HAR-expressible fields from the export.
  const importedAlpha = rows.filter({ hasText: ALPHA_PATH }).first();
  await importedAlpha.click();
  const general = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general);
  if (await general.getAttribute('aria-expanded') !== 'true') await general.click();
  await expect(general.locator('..')).toContainText(ALPHA_PATH);
  const requestHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.requestHeaders,
  );
  if (await requestHeaders.getAttribute('aria-expanded') !== 'true') {
    await requestHeaders.click();
  }
  await expect(requestHeaders.locator('..')).toContainText('authorization');
  await expect(requestHeaders.locator('..')).toContainText(AUTHORIZATION);
  await screenshotStep('导回后恢复method、URL、status与Header / Reimport restores method, URL, status and headers');

  // 用户操作：破坏同一HAR后再次Import，失败且当前列表不变。
  // User action: corrupt the same HAR and import again; it must fail without changing the current list.
  await writeFile(brokenHar, '{"log":{"version":"1.2","entries":[', 'utf8');
  await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), brokenHar);
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.progress))
    .toHaveAttribute('data-transfer-job-state', 'failed', { timeout: 30_000 });
  await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close).click();
  await expect(rows.filter({ hasText: ALPHA_PATH })).toHaveCount(1);
  await expect(rows.filter({ hasText: BINARY_PATH })).toHaveCount(1);
  await screenshotStep('损坏HAR失败且不污染当前列表 / A corrupted HAR fails without changing the current list');

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
  const evidencePath = testInfo.outputPath('har-roundtrip.json');
  await writeFile(evidencePath, JSON.stringify({
    alphaPath: ALPHA_PATH,
    binaryPath: BINARY_PATH,
    fullEntries: full.entries.length,
    redactedEntries: redacted.entries.length,
    sensitiveHeaderMasked: headerValue(redactedAlpha, 'authorization') !== AUTHORIZATION,
    bodiesStripped: (redactedAlpha.response.content?.text ?? '') === '',
  }, null, 2), 'utf8');
  await testInfo.attach('har-roundtrip.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
