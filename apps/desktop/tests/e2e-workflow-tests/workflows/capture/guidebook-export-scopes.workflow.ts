import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

function exportedUrls(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('log' in value)
    || typeof value.log !== 'object' || value.log === null || !('entries' in value.log)
    || !Array.isArray(value.log.entries)) throw new Error('The product HAR omitted entries.');
  return value.log.entries.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('request' in entry)
      || typeof entry.request !== 'object' || entry.request === null
      || !('url' in entry.request) || typeof entry.request.url !== 'string') {
      throw new Error('The product HAR omitted a request URL.');
    }
    return entry.request.url;
  });
}

test('transfer guide distinguishes all, filtered and selected HAR exports', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/export-scopes';
  const paths = [`${prefix}/filtered-one`, `${prefix}/filtered-two`, `${prefix}/other`];
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-scopes-'));
  const filteredFile = path.join(directory, 'guide-filtered.har');
  const owner = desktopApp.nativeFileDialogOwner();
  let completed = false;
  const finish = async (): Promise<void> => {
    const progress = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.progress);
    await expect.poll(() => progress.evaluateAll(elements => elements.length === 0
      || elements[0]?.getAttribute('data-transfer-job-state') === 'completed')).toBe(true);
    const close = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close);
    if (await close.isVisible()) await close.click();
    await expect(progress).toHaveCount(0);
  };

  // 准备：暂停后只保留三条自产记录；每个导入输入都来自本流程的真实Export。
  // Arrange: retain only three owned records while paused; every import input comes from this workflow's real Export.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  if (await recording.getAttribute('aria-pressed') === 'true') await recording.click();
  const clear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
  if (await clear.isEnabled()) await clear.click();
  await startRecording(desktopApp);
  for (const requestPath of paths) {
    httpTrafficRunner.respondWith(requestPath, { body: `{"example":"${requestPath.slice(requestPath.lastIndexOf('/') + 1)}"}`, headers: { 'content-type': 'application/json' } });
    expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath)).statusCode).toBe(200);
  }
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount('method'))).toHaveText('3');
  await expect(rows).toHaveCount(3);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'transfer-scopes');
  try {
    await media.step('01-filter', '搜索filtered，保留两条可见记录 / Search filtered to show two records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${prefix}/filtered`);
      await expect(rows).toHaveCount(2);
    });
    await media.step('02-select', '选中filtered-one / Select filtered-one', async () => {
      await rows.filter({ hasText: paths[0] }).click();
    });
    for (const choice of [
      { id: 'all', label: '全部记录 / All records', scope: AUTOMATION_IDS.capture.transfer.scopeAll, paths, file: 'guide-all.har' },
      { id: 'filtered', label: '当前筛选 / Current filter', scope: AUTOMATION_IDS.capture.transfer.scopeFilter, paths: paths.slice(0, 2), file: 'guide-filtered.har' },
      { id: 'selected', label: '当前选中 / Selected request', scope: AUTOMATION_IDS.capture.transfer.scopeSelected, paths: paths.slice(0, 1), file: 'guide-selected.har' },
    ]) {
      await media.step(`${choice.id}-01-menu`, '打开Export菜单 / Open the Export menu', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click();
      });
      await media.step(`${choice.id}-02-har`, '选择HAR / Choose HAR', async () => {
        await getByAutomationId(page, AUTOMATION_IDS.capture.exportHar).click();
      });
      await media.step(`${choice.id}-03-scope`, choice.label, async () => {
        await getByAutomationId(page, choice.scope).click();
      });
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
      const destination = path.join(directory, choice.file);
      await submitMacosFileDialogPath(owner, destination, () => media.nativeDialogStep(
        `${choice.id}-04-save`, `保存${choice.file} / Save ${choice.file}`,
      ));
      await media.step(`${choice.id}-05-complete`, `核对保存${choice.paths.length}条请求 / Verify ${choice.paths.length} exported requests`, async () => {
        await finish();
        const har: unknown = JSON.parse(await readFile(destination, 'utf8'));
        expect(exportedUrls(har).sort()).toEqual(choice.paths.map(requestPath => httpTrafficRunner.url(requestPath)).sort());
        await expect(rows).toHaveCount(2);
        await expect(recording).toHaveAttribute('aria-pressed', 'false');
      });
    }
    await media.step('import-01-menu', '打开Import菜单 / Open the Import menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importMenu).click();
    });
    await media.step('import-02-har', '选择HAR导入 / Choose HAR import', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.importHar).click();
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(owner, filteredFile, () => media.nativeDialogStep(
      'import-03-open', '打开刚导出的guide-filtered.har / Open the exported guide-filtered.har',
    ));
    await media.step('import-04-complete', '确认仅追加文件中的两条 / Verify only the two file entries are appended', async () => {
      await finish();
      await expect(rows).toHaveCount(4);
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount('method'))).toHaveText('5');
    });
    await media.step('import-05-all', '清空搜索查看全部五条 / Clear search to view all five records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clearSearch).click();
      await expect(rows).toHaveCount(5);
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    // 证据：三个实际文件分别只有3/2/1条，导入追加2条而没有重发源站请求。
    // Evidence: actual files contain 3/2/1 entries, and importing appends two without resending origin requests.
    expect(httpTrafficRunner.evidence()).toHaveLength(3);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    await media.stop({
      paths: paths.join(', '), filter: `${prefix}/filtered`, selectedPath: paths[0]!,
      allFile: 'guide-all.har (3 entries)', filteredFile: 'guide-filtered.har (2 entries)',
      selectedFile: 'guide-selected.har (1 entry)', afterImport: '5 total, 4 match the filter',
      inputSource: 'Import uses guide-filtered.har created by this same product Export flow',
    });
    if (completed) await rm(directory, { recursive: true, force: true });
  }
  // 清理：文件操作全部结束后关闭App，验证宿主、所有进程和8888恢复。
  // Cleanup: close the App only after file operations finish, verifying host settings, all processes and port 8888.
});
