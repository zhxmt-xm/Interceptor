import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('capture filter guide records OR, AND, search and non-destructive reset', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(180_000);
  const { page } = desktopApp;
  const prefix = '/guide/filters';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const option = (facet: string, value: string) =>
    getByAutomationId(page, AutomationIdFactory.captureFacetOption(facet, value));
  const open = async (facet: string): Promise<void> => {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  };
  // 准备：四条可公开请求构成可量化的筛选组合，不向Store预置记录。
  // Arrange: produce four public requests with measurable filter combinations, never seed the Store.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  await startRecording(desktopApp);
  for (const sample of [
    { path: `${prefix}/get-ok`, method: 'GET', statusCode: 200 },
    { path: `${prefix}/post-ok`, method: 'POST', statusCode: 200 },
    { path: `${prefix}/get-error`, method: 'GET', statusCode: 503 },
    { path: `${prefix}/put-ok`, method: 'PUT', statusCode: 200 },
  ]) {
    httpTrafficRunner.respondWith(sample.path, { statusCode: sample.statusCode, body: '{"example":"guide-filters"}',
      headers: { 'content-type': 'application/json' } });
    expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), sample.path,
      { method: sample.method, body: sample.method === 'GET' ? undefined : 'guide-filters' })).statusCode).toBe(sample.statusCode);
  }
  await getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle).click();
  await expect(rows).toHaveCount(4);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-filters');
  try {
    // 用户操作：每次改变过滤后验证真实行数，并保留组展开状态与记录。
    // User actions: verify actual counts after each filter while keeping groups and source records.
    await media.step('01-records', '查看四条演示请求 / Inspect four example requests', async () => {
      await expect(rows).toHaveCount(4);
    });
    await media.step('02-methods', '展开 Method / Expand Method', async () => { await open('method'); });
    await media.step('03-get', '只选 GET / Select GET', async () => {
      await option('method', 'GET').click();
      await expect(rows).toHaveCount(2);
    });
    await media.step('04-get-post', '同组再选 POST / Also select POST in the same group', async () => {
      await option('method', 'POST').click();
      await expect(rows).toHaveCount(3);
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetToggle('method'))).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('05-status', '展开 Status / Expand Status', async () => { await open('status'); });
    await media.step('06-and-status', '再选 200，跨组 AND / Select 200 for an AND across groups', async () => {
      await option('status', '200').click();
      await expect(rows).toHaveCount(2);
    });
    await media.step('07-search', '叠加 post-ok 搜索 / Add a post-ok search', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(`${prefix}/post-ok`);
      await expect(rows).toHaveCount(1);
    });
    await media.step('08-search-back', '恢复演示搜索范围 / Restore the example search scope', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
      await expect(rows).toHaveCount(2);
    });
    await media.step('09-remove-status', '取消 Status 条件 / Remove Status selection', async () => {
      await option('status', '200').click();
      await expect(rows).toHaveCount(3);
    });
    await media.step('10-remove-post', '取消 POST / Remove POST selection', async () => {
      await option('method', 'POST').click();
      await expect(rows).toHaveCount(2);
    });
    await media.step('11-remove-get', '取消 GET，保留原记录 / Remove GET without deleting records', async () => {
      await option('method', 'GET').click();
      await expect(rows).toHaveCount(4);
    });
    await media.step('12-collapse', '只折叠组标题 / Collapse only the group', async () => {
      await getByAutomationId(page, AutomationIdFactory.captureFacetToggle('method')).click();
      await expect(rows).toHaveCount(4);
    });
    // 证据：所有过滤都未执行Clear，结束仍有四条原始演示记录。
    // Evidence: no filter operation used Clear; all four example records remain.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ search: prefix, methods: 'GET + POST', status: '200',
      addedSearch: `${prefix}/post-ok`, initialRecords: '4', afterOr: '3', afterAnd: '2', afterSearch: '1', finalRecords: '4' });
  }
  // 清理：既有fixture完成真实Close、8888与系统代理恢复。
  // Cleanup: the existing fixture verifies normal Close, port 8888 and proxy restoration.
});
