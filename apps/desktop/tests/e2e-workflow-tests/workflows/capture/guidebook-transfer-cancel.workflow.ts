import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('transfer guide cancels a real running archive and waits before clearing records', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const requestPath = '/guide/transfer-cancel/large-source';
  const byteCount = 128 * 1024 * 1024;
  const body = randomBytes(byteCount);
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-cancel-'));
  const archivePath = path.join(directory, 'guide-cancel.iarchive');
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  const progress = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.progress);
  let media: GuidebookMedia | undefined;
  let completed = false;
  try {
    // 准备：真实自有大响应提供可取消的文件工作，流量和文件均不来自个人数据。
    // Arrange: an actual owned large response provides cancellable file work, without personal traffic or files.
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/guide/transfer-cancel');
    if (await recording.getAttribute('aria-pressed') === 'true') await recording.click();
    const clear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
    if (await clear.isEnabled()) await clear.click();
    httpTrafficRunner.respondWith(requestPath, { body, headers: { 'content-type': 'application/octet-stream' } });
    await startRecording(desktopApp);
    const received = await new Promise<{ bytes: number; sha256: string }>((resolve, reject) => {
      const outgoing = request({
        hostname: '127.0.0.1', port: desktopApp.capturePort(), path: httpTrafficRunner.url(requestPath),
        headers: { host: `127.0.0.1:${httpTrafficRunner.port}`, connection: 'close' },
      }, response => {
        let bytes = 0;
        const hash = createHash('sha256');
        response.on('data', (chunk: Buffer) => { bytes += chunk.length; hash.update(chunk); });
        response.once('error', reject);
        response.once('end', () => resolve({ bytes, sha256: hash.digest('hex') }));
      });
      outgoing.once('error', reject);
      outgoing.end();
    });
    expect(received).toEqual({ bytes: byteCount, sha256: bodyHash });
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await expect(rows).toHaveCount(1);
    await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount('method'))).toHaveText('1');
    await rows.click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save)).toBeEnabled();
    media = await GuidebookMedia.start(desktopApp, testInfo, 'transfer-cancel');
    await media.step('01-source', '检查已完成的大响应 / Inspect the completed large response', async () => {
      await expect(rows).toContainText('128 MB');
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('02-export-menu', '打开Export / Open Export', async () => { await getByAutomationId(page, AUTOMATION_IDS.capture.exportMenu).click(); });
    await media.step('03-archive', '选择Native Archive / Choose Native Archive', async () => { await getByAutomationId(page, AUTOMATION_IDS.capture.saveArchive).click(); });
    await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.start).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), archivePath, () => media!.nativeDialogStep(
      '04-save-dialog', '选择guide-cancel.iarchive / Choose guide-cancel.iarchive',
    ));
    await media.transientStep('05-running', '查看真实运行中的进度 / Inspect actual running progress', async () => {
      await expect(progress).toHaveAttribute('data-transfer-job-state', 'running');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.transfer.cancel)).toBeEnabled();
    });
    await media.step('06-cancel', '取消正在运行的归档 / Cancel the running archive', async () => {
      await expect(progress).toHaveAttribute('data-transfer-job-state', 'running');
      await getByAutomationId(page, AUTOMATION_IDS.capture.transfer.cancel).click();
      await expect(progress).toHaveCount(0);
    });
    await media.step('07-cleaned', '等待取消清理完成 / Wait for cancellation cleanup', async () => {
      await expect.poll(() => readdir(directory)).toEqual([]);
      await expect(rows).toHaveCount(1);
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('08-clear', '清理完成后再Clear / Clear only after cleanup finishes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
      await expect(rows).toHaveCount(0);
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    // 证据：取消没有留下归档或部分文件，Clear只在文件工作结束后发生。
    // Evidence: cancellation leaves neither an archive nor partial files; Clear happens only after file work ends.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    try {
      const cancel = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.cancel);
      if (await cancel.isVisible() && await cancel.isEnabled()) await cancel.click();
      const close = getByAutomationId(page, AUTOMATION_IDS.capture.transfer.close);
      if (await close.isVisible()) await close.click();
    } finally {
      if (media) await media.stop({
        path: requestPath, responseBytes: String(byteCount), responseSha256: bodyHash,
        archive: 'guide-cancel.iarchive', cancellation: 'Cancel clicked while the real archive job was running',
        result: 'No archive or partial file remains; source record retained until explicit Clear',
      });
      if (completed) await rm(directory, { recursive: true, force: true });
    }
  }
  // 清理：现有driver正常关闭App，验证文件任务、代理、CA、进程与8888恢复。
  // Cleanup: the driver closes the App normally and verifies file work, proxy/CA, processes and port 8888.
});
