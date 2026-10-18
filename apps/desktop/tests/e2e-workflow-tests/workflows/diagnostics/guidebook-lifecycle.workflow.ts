import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';
import { submitMacosFileDialogPath } from '../../fixtures/ui/macos-file-dialog';

test('diagnostics guide records actual Composer success/failure, timeline, filter reset and older records', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(480_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  let resets = 0;
  const resetOrigin = net.createServer(socket => { resets++; socket.destroy(); });
  resetOrigin.listen(0, '127.0.0.1');
  await once(resetOrigin, 'listening');
  const resetAddress = resetOrigin.address();
  if (!resetAddress || typeof resetAddress === 'string') throw new Error('The owned reset origin has no port.');
  const failureUrl = `http://127.0.0.1:${resetAddress.port}/guide/diagnostics-failure`;
  const successPath = '/guide/diagnostics-visible/success';
  const successUrl = httpTrafficRunner.url(successPath);
  const unavailablePac = httpTrafficRunner.url('/guide/diagnostics-visible/unavailable.pac');
  const failedPhase = 'main.upstream.apply.failed';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-guidebook-diag-'));
  const exportPath = path.join(directory, 'guide-diagnostics-lifecycle.jsonl');
  const unfilteredPath = path.join(directory, 'guide-diagnostics-before-filter.jsonl');
  const main = getByAutomationId(page, AUTOMATION_IDS.app.main);
  const buttons = () => main.getByRole('button');
  const command = () => main.getByRole('button').filter({ hasText: 'composer.send' });
  const failedAction = () => main.getByRole('button').filter({ hasText: failedPhase });
  const grid = () => main.locator('[style*="grid-template-columns"]');
  const detail = () => grid().locator(':scope > div').nth(2);
  const address = async (url: string): Promise<void> => {
    const parsed = new URL(url);
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${parsed.host}${parsed.pathname}`);
  };
  let media: GuidebookMedia | undefined;
  let completed = false;
  try {
    // 准备：历史分页来自真实UI Send，不写入Diagnostics数据库或伪造action。
    // Arrange: create paging history through real UI Send, never by writing diagnostic records or actions.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url('/guide/diagnostics-history/0'));
    for (let index = 0; index < 120; index++) {
      const pathname = `/guide/diagnostics-history/${index}`;
      const marker = `guide-history-${index}`;
      httpTrafficRunner.respondWith(pathname, { body: JSON.stringify({ marker }), headers: { 'content-type': 'application/json' } });
      if (index > 0) await address(httpTrafficRunner.url(pathname));
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(pathname)?.method).toBe('GET');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText(marker);
    }
    httpTrafficRunner.respondWith(successPath, { body: '{"marker":"guide-visible-success"}', headers: { 'content-type': 'application/json' } });
    httpTrafficRunner.respondWith('/guide/diagnostics-visible/unavailable.pac', {
      statusCode: 404, body: 'guide-pac-unavailable', headers: { 'content-type': 'text/plain' },
    });
    media = await GuidebookMedia.start(desktopApp, testInfo, 'diagnostics-lifecycle');
    await media.step('01-input', '填写本次可见的成功请求 / Enter the visible success example', async () => { await address(successUrl); });
    await media.step('02-send-success', '真实Send并核对成功响应 / Actually Send and verify the successful response', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('guide-visible-success');
      expect(httpTrafficRunner.observation(successPath)?.method).toBe('GET');
    });
    await media.step('03-failed-input', '填写本轮会关闭连接的自有端点 / Enter the owned endpoint that closes its connection', async () => { await address(failureUrl); });
    await media.step('04-send-failed', '观察真实网络失败 / Observe the real network failure', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => resets).toBeGreaterThan(0);
    });
    await media.step('04a-upstream', '打开自有PAC失败示例 / Open the owned PAC failure example', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
      await getByAutomationId(page, AUTOMATION_IDS.settings.section.upstream).click();
    });
    await media.step('04b-pac-mode', '选择PAC草稿 / Choose a PAC draft', async () => { await getByAutomationId(page, AUTOMATION_IDS.upstream.mode.pac).check(); });
    await media.step('04c-pac-url', '填写本轮返回404的PAC地址 / Enter the owned PAC URL that returns 404', async () => { await getByAutomationId(page, AUTOMATION_IDS.upstream.pacUrl).fill(unavailablePac); });
    await media.step('04d-pac-failure', 'Apply实际失败并保持原路线 / Observe actual Apply failure while retaining the route', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.apply).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.error)).toBeVisible();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.currentRoute)).toHaveAttribute('data-upstream-mode', 'system');
    });
    await media.step('04e-discard', 'Discard失败草稿不改原配置 / Discard the failed draft without changing saved configuration', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.upstream.discard).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.upstream.mode.system)).toBeChecked();
    });
    await media.step('05-diagnostics', '进入Diagnostics / Open Diagnostics', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.diagnostics).click();
      await expect(command().last()).toBeVisible();
    });
    await buttons().nth(3).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), unfilteredPath, () => media!.nativeDialogStep(
      '05a-save-evidence', '先导出当前记录留证据 / Export current records before filtering',
    ));
    await media.step('05b-evidence', '核对产品导出的真实结果分类 / Inspect the actual exported outcome classifications', async () => {
      const records: unknown[] = (await readFile(unfilteredPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      const summaries = new Map<string, number>();
      for (const record of records) {
        if (typeof record !== 'object' || record === null || !('command' in record) || record.command !== 'composer.send') continue;
        const summary = JSON.stringify(Object.fromEntries(['process', 'level', 'phase', 'outcome', 'errorCode']
          .filter(key => key in record).map(key => [key, Reflect.get(record, key)])));
        summaries.set(summary, (summaries.get(summary) ?? 0) + 1);
      }
      const body = JSON.stringify([...summaries], null, 2);
      await testInfo.attach('actual-composer-diagnostic-outcomes', { body, contentType: 'application/json' });
      console.log(body);
      expect(summaries.size).toBeGreaterThan(0);
      expect(records).toEqual(expect.arrayContaining([expect.objectContaining({
        process: 'main', level: 'error', phase: failedPhase, outcome: 'failed',
      })]));
    });
    await media.step('06-core', '按core进程筛选 / Filter by core process', async () => {
      await buttons().nth(0).click();
      await expect(buttons().nth(0)).toContainText('core');
    });
    await media.step('06a-main', '切到失败操作所属main进程 / Switch to the failed action’s main process', async () => {
      await buttons().nth(0).click();
      await expect(buttons().nth(0)).toContainText('main');
    });
    await media.step('07-error', '按error级别筛选 / Filter by error level', async () => {
      await buttons().nth(1).click();
      await expect(buttons().nth(1)).toContainText('error');
    });
    await media.step('08-success-filter', '查看success结果组合 / Inspect the success outcome combination', async () => { await buttons().nth(2).click(); });
    await media.step('09-failed-filter', '切到failed结果 / Switch to failed outcomes', async () => {
      await buttons().nth(2).click();
      await expect(failedAction().last()).toBeVisible();
    });
    await media.step('10-select-failed', '选择真正失败的上游操作 / Select the actually failed upstream action', async () => {
      await failedAction().last().click();
      await expect(detail()).toContainText(failedPhase);
      await expect(detail()).toContainText('failed');
    });
    await media.step('11-timeline', '读取自动展示的关联时间线 / Read the automatically shown related timeline', async () => {
      await expect(detail()).toContainText(failedPhase);
    });
    await media.step('12-widen', '拖动Diagnostics分栏 / Drag the Diagnostics splitter', async () => {
      const splitter = grid().locator(':scope > div').nth(1);
      const initial = await detail().boundingBox();
      const box = await splitter.boundingBox();
      if (!initial || !box) throw new Error('Diagnostics pane geometry is unavailable.');
      await page.mouse.move(box.x + box.width / 2, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 180, box.y + 80, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => (await detail().boundingBox())?.width).toBeGreaterThan(initial.width + 150);
    });
    for (const level of ['warn', 'info', 'debug', 'all'] as const) {
      await media.step(`13-level-${level}`, `切换Level至${level} / Cycle Level to ${level}`, async () => {
        await buttons().nth(1).click();
        if (level !== 'all') await expect(buttons().nth(1)).toContainText(level);
      });
    }
    for (const outcome of ['cancelled', 'timed_out', 'all'] as const) {
      await media.step(`14-outcome-${outcome}`, `切换Outcome至${outcome} / Cycle Outcome to ${outcome}`, async () => {
        await buttons().nth(2).click();
      });
    }
    for (const process of ['renderer', 'all'] as const) {
      await media.step(`15-process-${process}`, `切换Process至${process} / Cycle Process to ${process}`, async () => {
        await buttons().nth(0).click();
        if (process !== 'all') await expect(buttons().nth(0)).toContainText(process);
      });
    }
    await media.step('16-filters-cleared', '确认三个筛选全部清除 / Verify all three filters are cleared', async () => {
      await expect(buttons().nth(0)).not.toContainText(/core|main|renderer/);
      await expect(buttons().nth(1)).not.toContainText(/error|warn|info|debug/);
      await expect(buttons().nth(2)).not.toContainText(/success|failed|cancelled|timed_out/);
      await expect(command().last()).toBeVisible();
    });
    await media.step('17-earlier', '加载实际历史页 / Load the actual earlier page', async () => {
      const before = await buttons().nth(4).textContent();
      const count = await buttons().count();
      await buttons().last().click();
      await expect.poll(() => buttons().nth(4).textContent()).not.toBe(before);
      await expect.poll(() => buttons().count()).toBeGreaterThan(count);
    });
    await media.step('18-list-wheel', '滚动真实历史列表 / Scroll the real history list', async () => {
      const first = command().first();
      const viewport = await first.evaluate(element => {
        let parent = element.parentElement;
        while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
        if (!parent) throw new Error('Diagnostics rows have no scroll viewport.');
        const box = parent.getBoundingClientRect();
        return { top: parent.scrollTop, x: box.x, y: box.y, height: box.height };
      });
      await page.mouse.move(viewport.x + 100, viewport.y + viewport.height / 2);
      await page.mouse.wheel(0, -500);
      await expect.poll(() => first.evaluate(element => element.parentElement?.scrollTop)).not.toBe(viewport.top);
    });
    await buttons().nth(3).click();
    await submitMacosFileDialogPath(desktopApp.nativeFileDialogOwner(), exportPath, () => media!.nativeDialogStep(
      '19-export', '保存本次Diagnostics JSONL / Save this Diagnostics JSONL',
    ));
    await media.step('20-exported', '核对实际导出而不是只看弹窗 / Verify the actual export, not just the dialog', async () => {
      const text = await readFile(exportPath, 'utf8');
      const records: unknown[] = text.trim().split('\n').map(line => JSON.parse(line));
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ command: 'composer.send', outcome: 'success' }),
        expect.objectContaining({ phase: failedPhase, outcome: 'failed' }),
      ]));
    });
    await media.step('21-composer-return', '返回产生记录的Composer / Return to Composer, which produced the records', async () => { await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click(); });
    await media.step('22-good-url', '改回可工作的自有服务 / Return to the working owned service', async () => { await address(successUrl); });
    await media.step('23-recovered', '再次Send核对真实业务恢复 / Send again and verify actual recovery', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane)).toContainText('guide-visible-success');
    });
    // 证据：日志不是业务替身，最后回到功能重发；没有伪造取消/超时记录或额外时间线控件。
    // Evidence: return to the feature and resend; do not fabricate cancellation/timeout records or extra timeline controls.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    completed = true;
  } finally {
    try {
      if (media) await media.stop({
        successUrl, failureUrl, unavailablePac, failedOrigin: 'Owned loopback TCP service closes its accepted connection',
        history: '120 real Composer Send operations prepared before filming, not seeded diagnostic rows',
        command: 'composer.send', failedAction: failedPhase, failureFilter: 'main / error / failed', clearedFilter: 'all / all / all',
        outcomeBoundary: 'Composer returns a normal command result with ok=false for network failure; diagnostic success does not imply HTTP success',
        file: 'guide-diagnostics-lifecycle.jsonl', timeline: 'Shown automatically for the selected operation; not an expandable control',
      });
      if (completed) await rm(directory, { recursive: true, force: true });
    } finally {
      await new Promise<void>((resolve, reject) => resetOrigin.close(error => error ? reject(error) : resolve()));
    }
  }
  // 清理：关闭本轮测试端点，Main正常Close验证代理、CA、进程和8888。
  // Cleanup: close the owned endpoint; normal Main Close verifies proxy/CA, processes and port 8888.
});
