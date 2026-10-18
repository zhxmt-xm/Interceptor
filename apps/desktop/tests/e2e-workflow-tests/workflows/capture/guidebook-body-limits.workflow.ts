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

test('capture guide records manual formatting, preview truncation and complete body saving', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/body-limits';
  const manual = JSON.stringify({ begin: 'guide-manual-start', data: 'x'.repeat(1.25 * 1024 * 1024), end: 'guide-manual-end' });
  const large = JSON.stringify({ begin: 'guide-large-start', data: 'x'.repeat(3 * 1024 * 1024), end: 'guide-large-end' });
  const preview = large.slice(0, 2 * 1024 * 1024);
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-large-'));
  const savedPath = path.join(directory, 'guide-full-response.json');
  const format = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.format);
  const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
  let completed = false;
  const copied = () => page.evaluate(async () => {
    const text = (await navigator.clipboard.readText()).replaceAll('\r\n', '\n');
    const bytes = new TextEncoder().encode(text);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { length: text.length, sha256: [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  });
  const expected = (text: string) => ({ length: text.length, sha256: createHash('sha256').update(text).digest('hex') });

  // 准备：网络返回完整的公开JSON，大文件必须经产品Save body产生。
  // Arrange: the origin sends complete public JSON; the product must create the large saved file.
  httpTrafficRunner.respondWith(`${prefix}/manual`, { body: Buffer.from(manual), headers: { 'content-type': 'application/json' } });
  httpTrafficRunner.respondWith(`${prefix}/large`, { body: Buffer.from(large), headers: { 'content-type': 'application/json' } });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-body-limits');
  try {
    await media.step('01-scope', '限定本轮正文路径 / Scope this run’s body paths', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
    });
    await media.step('02-record', '开启 Recording / Start Recording', async () => { await startRecording(desktopApp); });
    await media.step('03-manual-request', '请求超过1MiB的JSON / Request JSON larger than 1 MiB', async () => {
      const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/manual`);
      expect(result.statusCode).toBe(200);
      expect(expected(result.body)).toEqual(expected(manual));
    });
    await media.step('04-manual-select', '选择 manual 请求 / Select the manual request', async () => {
      await rows.filter({ hasText: `${prefix}/manual` }).click();
    });
    await media.step('05-unformatted', '查看尚未自动格式化的正文 / Inspect the body without automatic formatting', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(pane).toContainText('guide-manual-start');
      await expect(format).toBeEnabled();
    });
    await media.step('06-copy-before', '复制并核对原始文本 / Copy and verify the original text', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect(await copied()).toEqual(expected(manual));
    });
    await media.step('07-format', '手动点击 Format / Click Format manually', async () => { await format.click(); });
    await media.step('08-copy-formatted', '核对格式化只改变显示 / Verify formatting changes only presentation', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      const formatted = JSON.stringify(JSON.parse(manual), null, 2);
      await expect.poll(copied).toEqual(expected(formatted));
      expect(httpTrafficRunner.evidence().filter(item => 'path' in item && item.path === `${prefix}/manual`)).toHaveLength(1);
    });
    await media.step('09-large-request', '请求超过2MiB的完整JSON / Request complete JSON larger than 2 MiB', async () => {
      const result = await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/large`);
      expect(result.statusCode).toBe(200);
      expect(expected(result.body)).toEqual(expected(large));
    });
    await media.step('10-large-select', '选择 large 请求 / Select the large request', async () => {
      await rows.filter({ hasText: `${prefix}/large` }).click();
    });
    await media.step('11-preview', '查看有上限的正文预览 / Inspect the bounded body preview', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(pane).toContainText('guide-large-start');
      await expect(format).toBeDisabled();
    });
    await media.step('12-copy-preview', 'Copy只取当前2MiB预览 / Copy only the current 2 MiB preview', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect(await copied()).toEqual(expected(preview));
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), savedPath, () => media.nativeDialogStep(
      '13-save-dialog', '保存完整 guide-full-response.json / Save the complete guide-full-response.json',
    ));
    await media.step('14-saved-complete', '核对保存文件没有按预览截断 / Verify the saved file is not truncated to the preview', async () => {
      const saved = await readFile(savedPath, 'utf8');
      expect(expected(saved)).toEqual(expected(large));
      expect(saved.endsWith('"end":"guide-large-end"}')).toBe(true);
      await expect(format).toBeDisabled();
    });
    // 证据：完整网络、预览Copy和产品保存分别核对长度与摘要，不以文件名代替字节。
    // Evidence: independently verify full wire data, preview Copy and the product-saved bytes.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({
      search: prefix, manualPath: `${prefix}/manual`, largePath: `${prefix}/large`,
      manualDataBytes: String(1.25 * 1024 * 1024), manualWireBytes: String(Buffer.byteLength(manual)),
      largeDataBytes: String(3 * 1024 * 1024), largeWireBytes: String(Buffer.byteLength(large)),
      previewBytes: String(Buffer.byteLength(preview)), manualStart: 'guide-manual-start',
      largeStart: 'guide-large-start', savedEnd: 'guide-large-end', savedFile: 'guide-full-response.json',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：仅删除本轮导出的临时目录，正式Close负责代理和进程恢复。
  // Cleanup: remove only this exported temporary directory; normal Close restores proxy settings and processes.
});
