import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function oneHarEntry(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!record(value) || !record(value.log) || !Array.isArray(value.log.entries)
    || value.log.entries.length !== 1 || !record(value.log.entries[0])) throw new Error('The actual HAR did not contain exactly the selected request.');
  return value.log.entries[0];
}
function headersOf(entry: Record<string, unknown>, side: 'request' | 'response'): Map<string, string> {
  const message = entry[side];
  if (!record(message) || !Array.isArray(message.headers)) throw new Error('The HAR omitted message Headers.');
  return new Map(message.headers.map((header: unknown) => {
    if (!record(header) || typeof header.name !== 'string' || typeof header.value !== 'string') throw new Error('Invalid exported Header.');
    return [header.name.toLowerCase(), header.value];
  }));
}

test('settings guide verifies privacy defaults, per-export overrides and actual HAR redaction', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const privacy = AUTOMATION_IDS.settings.privacy;
  const transfer = AUTOMATION_IDS.capture.transfer;
  const requestPath = '/guide/privacy-export/record';
  const authorization = 'Bearer public-export-value';
  const cookie = 'guide-request=public';
  const replyCookie = 'guide-response=public; Path=/';
  const body = '{"message":"public privacy example"}';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-privacy-'));
  const overridePath = path.join(directory, 'guide-auth-masked.har');
  const plainPath = path.join(directory, 'guide-public-unmasked.har');
  const strippedPath = path.join(directory, 'guide-redacted-no-body.har');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  let firstFileHash = '';
  let completed = false;
  const openPrivacy = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.privacy).click();
  };
  const openExport = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
    await getByAutomationId(page, transfer.scopeSelected).click();
  };
  const finish = async (): Promise<void> => {
    const progress = getByAutomationId(page, transfer.progress);
    await expect.poll(() => progress.evaluateAll(elements => elements.length === 0
      || elements[0]?.getAttribute('data-transfer-job-state') === 'completed')).toBe(true);
    const close = getByAutomationId(page, transfer.close);
    if (await close.isVisible()) await close.click();
  };
  // 准备：只用公开演示Header/Cookie，所有HAR都由本轮产品Export生成。
  // Arrange: use public demonstration Header/Cookie values; every HAR comes from this run's product Export.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  await startRecording(desktopApp);
  httpTrafficRunner.respondWith(requestPath, { body, headers: { 'content-type': 'application/json', 'set-cookie': replyCookie, 'x-guide-note': 'public-note' } });
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath, {
    headers: { authorization, cookie, 'x-guide-note': 'public-note' },
  })).body).toBe(body);
  await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle)).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(1);
  await rows.click();
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'settings-privacy-export');
  try {
    await media.step('01-privacy', '查看三项Privacy默认值 / Inspect all three Privacy defaults', async () => {
      await openPrivacy();
      for (const id of [privacy.maskAuthorization, privacy.maskCookies, privacy.warnUnmasked]) await expect(getByAutomationId(page, id)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('02-auth-default', '更改Authorization默认值 / Change the Authorization default', async () => { await getByAutomationId(page, privacy.maskAuthorization).click(); });
    await media.step('03-cookie-default', '更改Cookie默认值 / Change the Cookie default', async () => { await getByAutomationId(page, privacy.maskCookies).click(); });
    await media.step('04-inherited-export', '打开新HAR草稿核对继承 / Open a new HAR draft and verify inherited defaults', async () => {
      await openExport();
      await expect(getByAutomationId(page, transfer.maskAuthorization)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, transfer.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('05-one-time-override', '本次只遮罩Authorization / Mask Authorization for this export only', async () => {
      await getByAutomationId(page, transfer.maskAuthorization).click();
      await expect(getByAutomationId(page, transfer.maskAuthorization)).toHaveAttribute('aria-checked', 'true');
    });
    await getByAutomationId(page, transfer.start).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), overridePath, () => media.nativeDialogStep(
      '06-save-override', '保存guide-auth-masked.har / Save guide-auth-masked.har',
    ));
    await media.step('07-check-override', '核对文件只遮罩指定字段 / Verify only the selected fields are masked', async () => {
      await finish();
      const bytes = await readFile(overridePath);
      const entry = oneHarEntry(bytes.toString('utf8'));
      expect(headersOf(entry, 'request').get('authorization')).toBe('[REDACTED]');
      expect(headersOf(entry, 'request').get('cookie')).toBe(cookie);
      expect(headersOf(entry, 'response').get('set-cookie')).toBe(replyCookie);
      firstFileHash = createHash('sha256').update(bytes).digest('hex');
    });
    await media.step('08-defaults-unchanged', '核对单次覆盖没改全局默认值 / Verify the per-export override did not change defaults', async () => {
      await openPrivacy();
      await expect(getByAutomationId(page, privacy.maskAuthorization)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, privacy.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('09-warning-default', '关闭未遮罩前的警示偏好 / Disable the unmasked-export warning preference', async () => {
      await getByAutomationId(page, privacy.warnUnmasked).click();
      await expect(getByAutomationId(page, privacy.warnUnmasked)).toHaveAttribute('aria-checked', 'false');
    });
    await media.step('10-unmasked-draft', '查看新的公开数据导出草稿 / Inspect the new public-data export draft', async () => {
      await openExport();
      await expect(getByAutomationId(page, transfer.maskAuthorization)).toHaveAttribute('aria-checked', 'false');
      await expect(getByAutomationId(page, transfer.maskCookies)).toHaveAttribute('aria-checked', 'false');
    });
    await getByAutomationId(page, transfer.start).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), plainPath, () => media.nativeDialogStep(
      '11-save-public', '只保存本轮公开测试值 / Save only this run’s public example values',
    ));
    await media.step('12-check-public', '核对取消遮罩后文件的真实字段 / Verify the actual unmasked exported fields', async () => {
      await finish();
      const entry = oneHarEntry(await readFile(plainPath, 'utf8'));
      expect(headersOf(entry, 'request').get('authorization')).toBe(authorization);
      expect(headersOf(entry, 'request').get('cookie')).toBe(cookie);
      expect(headersOf(entry, 'response').get('x-guide-note')).toBe('public-note');
      expect(createHash('sha256').update(await readFile(overridePath)).digest('hex')).toBe(firstFileHash);
    });
    await media.step('13-restore-privacy', '返回Privacy恢复默认值 / Return to Privacy to restore defaults', openPrivacy);
    await media.step('14-restore-auth', '恢复Authorization遮罩 / Restore Authorization masking', async () => { await getByAutomationId(page, privacy.maskAuthorization).click(); });
    await media.step('15-restore-cookies', '恢复Cookie遮罩 / Restore Cookie masking', async () => { await getByAutomationId(page, privacy.maskCookies).click(); });
    await media.step('16-restore-warning', '恢复未遮罩警示 / Restore the unmasked-export warning', async () => { await getByAutomationId(page, privacy.warnUnmasked).click(); });
    await media.step('17-redacted-draft', '检查新草稿使用恢复后的默认值 / Inspect a new draft with restored defaults', async () => {
      await openExport();
      await expect(getByAutomationId(page, transfer.maskAuthorization)).toHaveAttribute('aria-checked', 'true');
      await expect(getByAutomationId(page, transfer.maskCookies)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('18-strip-bodies', '本次移除请求与响应正文 / Remove request and response bodies for this export', async () => {
      await getByAutomationId(page, transfer.stripBodies).click();
      await expect(getByAutomationId(page, transfer.stripBodies)).toHaveAttribute('aria-checked', 'true');
    });
    await getByAutomationId(page, transfer.start).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), strippedPath, () => media.nativeDialogStep(
      '19-save-redacted', '保存guide-redacted-no-body.har / Save guide-redacted-no-body.har',
    ));
    await media.step('20-check-redacted', '逐字段核对真正的文件内容 / Verify the actual file field by field', async () => {
      await finish();
      const entry = oneHarEntry(await readFile(strippedPath, 'utf8'));
      expect(headersOf(entry, 'request').get('authorization')).toBe('[REDACTED]');
      expect(headersOf(entry, 'request').get('cookie')).toBe('[REDACTED]');
      expect(headersOf(entry, 'response').get('set-cookie')).toBe('[REDACTED]');
      expect(headersOf(entry, 'response').get('x-guide-note')).toBe('public-note');
      expect(entry).toMatchObject({ response: { content: { size: Buffer.byteLength(body) } } });
      expect(JSON.stringify(entry)).not.toContain('public privacy example');
    });
    await media.step('21-clear', '清空本轮临时记录再检查导入 / Clear this run’s temporary records before checking import', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
      await expect(rows).toHaveCount(0);
    });
    await media.step('22-import', '从产品选择刚导出的HAR / Select the just-exported HAR through the product', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
    });
    await getByAutomationId(page, transfer.start).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), strippedPath, () => media.nativeDialogStep(
      '23-open-redacted', '打开本轮去正文HAR / Open this run’s body-stripped HAR',
    ));
    await media.step('24-imported', '导入不会凭空恢复已移除正文 / Import does not recreate removed body bytes', async () => {
      await finish();
      await expect(rows).toHaveCount(1);
      await rows.click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane)).toHaveCount(0);
    });
    // 证据：默认值、单次选项和已生成文件是不同状态，截图之外核对真实导出与导入。
    // Evidence: defaults, per-export choices and existing files are distinct; verify actual exported/imported data beyond screenshots.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({
      url: httpTrafficRunner.url(requestPath), publicAuthorization: authorization, publicCookie: cookie,
      publicResponseCookie: replyCookie, retainedHeader: 'x-guide-note: public-note', originalBody: body,
      firstFile: 'guide-auth-masked.har', secondFile: 'guide-public-unmasked.har', finalFile: 'guide-redacted-no-body.har',
      safety: 'All authentication-like values are deliberately public loopback examples, not real credentials',
      finalDefaults: 'Authorization, Cookie and warning enabled; existing files not rewritten',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：只删除本轮导出目录，正常Close核对Core/Worker、代理、CA与8888。
  // Cleanup: remove only the owned export directory; normal Close verifies Core/Worker, proxy/CA and port 8888.
});
