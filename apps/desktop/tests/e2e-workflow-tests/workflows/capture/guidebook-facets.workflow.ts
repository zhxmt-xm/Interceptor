import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { UNKNOWN_FACET_VALUE } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('capture guide records Application, Host, Protocol, Type and Rule facets', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(300_000);
  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);
  const prefix = '/guide/facets';
  const matchedPath = `${prefix}/selected-json`;
  const otherPath = `${prefix}/other-text`;
  const ruleName = 'Guide facets';
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  let ruleId = '';
  const option = (facet: string, value: string) => getByAutomationId(page, AutomationIdFactory.captureFacetOption(facet, value));
  const open = async (facet: string): Promise<void> => {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  };
  const apply = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
  };

  // 准备：规则只匹配一条公开路径；在录制暂停时编辑，避免在分组里显示个人流量。
  // Arrange: scope the Rule to one public path and edit while paused, keeping personal traffic out of facet lists.
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const cancel = getByAutomationId(page, AUTOMATION_IDS.capture.readiness.cancel);
  if (await cancel.isVisible()) await cancel.click();
  if (await recording.getAttribute('aria-pressed') === 'true') await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  const clear = getByAutomationId(page, AUTOMATION_IDS.capture.clear);
  if (await clear.isEnabled()) await clear.click();
  await expect(rows).toHaveCount(0);
  httpTrafficRunner.respondWith(matchedPath, { body: '{"example":"guide-facets"}', headers: { 'content-type': 'application/json' } });
  httpTrafficRunner.respondWith(otherPath, { body: 'guide-facets-text', headers: { 'content-type': 'text/plain' } });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
  const id = await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last().getAttribute('data-automation-id');
  if (!id?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('Missing facet Rule identity.');
  ruleId = id.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(ruleName);
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(matchedPath);
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill('x-guide-facet');
  await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('selected');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), matchedPath)).statusCode).toBe(200);
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), otherPath)).statusCode).toBe(200);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(2);
  await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroupCount('method'))).toHaveText('2');
  expect(httpTrafficRunner.observation(matchedPath)?.headers['x-guide-facet']).toBe('selected');
  expect(httpTrafficRunner.observation(otherPath)?.headers['x-guide-facet']).toBeUndefined();
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-facets');
  try {
    // 用户操作：从真实分组值选择，逐项核对选中状态、行数和不同维度的含义。
    // User actions: select actual facet values and verify selection, counts and each dimension's meaning.
    await media.step('01-application', '展开 Application / Expand Application', async () => { await open('application'); });
    await media.step('02-unknown', '选择本次 Unknown 归属 / Select this run’s Unknown attribution', async () => {
      await option('application', UNKNOWN_FACET_VALUE).click();
      await expect(option('application', UNKNOWN_FACET_VALUE)).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(2);
    });
    await media.step('03-host-group', '展开 Host / Expand Host', async () => { await open('host'); });
    await media.step('04-host-select', '选择 127.0.0.1 / Select 127.0.0.1', async () => {
      await option('host', '127.0.0.1').click();
      await expect(option('host', '127.0.0.1')).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(2);
    });
    await media.step('05-protocol-group', '展开 Protocol / Expand Protocol', async () => { await open('protocol'); });
    await media.step('06-protocol-select', '选择 HTTP/1.1 / Select HTTP/1.1', async () => {
      await option('protocol', 'HTTP/1.1').click();
      await expect(option('protocol', 'HTTP/1.1')).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(2);
    });
    await media.step('07-type-group', '展开 Content type / Expand Content type', async () => { await open('type'); });
    await media.step('08-json', '选择 json，剩一条请求 / Select json to keep one request', async () => {
      await option('type', 'json').click();
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(matchedPath);
    });
    await media.step('09-rule-group', '展开 Rule / Expand Rule', async () => { await open('rule'); });
    await media.step('10-rule-select', '选择实际命中的 Guide facets / Select the matched Guide facets Rule', async () => {
      await option('rule', ruleId).click();
      await expect(option('rule', ruleId)).toHaveAttribute('aria-pressed', 'true');
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(matchedPath);
    });
    await media.step('11-remove-type', '取消 json，仍按规则保留一条 / Remove json while the Rule still keeps one request', async () => {
      await option('type', 'json').click();
      await expect(option('type', 'json')).toHaveAttribute('aria-pressed', 'false');
      await expect(rows).toHaveCount(1);
    });
    await media.step('12-clear-facets', '清除分组筛选但保留搜索 / Clear facet selections while keeping search', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clearFilters).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
      await expect(rows).toHaveCount(2);
      for (const [facet, value] of [['application', UNKNOWN_FACET_VALUE], ['host', '127.0.0.1'], ['protocol', 'HTTP/1.1'], ['rule', ruleId]] as const) {
        await expect(option(facet, value)).toHaveAttribute('aria-pressed', 'false');
      }
    });
    await media.step('13-hide-filters', '收起筛选栏 / Hide the filter panel', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.filtersToggle).click();
      await expect(getByAutomationId(page, AutomationIdFactory.captureFacetGroup('host'))).toBeHidden();
      await expect(rows).toHaveCount(2);
    });
    await media.step('14-show-filters', '重新显示筛选栏 / Show the filter panel again', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.filtersToggle).click();
      await expect(option('host', '127.0.0.1')).toBeVisible();
    });
    await media.step('15-rules', '返回示例规则 / Return to the example Rule', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    });
    await media.step('16-disable', '停用 Guide facets / Disable Guide facets', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
    });
    await media.step('17-apply-disabled', 'Apply 停用状态 / Apply the disabled state', apply);
    // 证据：Unknown只是本次实际归属，不能推断Windows进程识别；原请求一直保留。
    // Evidence: Unknown describes this run only, not Windows attribution; original requests remain.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      search: prefix, ruleName, rulePath: matchedPath, host: '127.0.0.1', protocol: 'HTTP/1.1',
      application: 'Unknown (actual macOS result, not Windows attribution)',
      prerequisite: 'Two captured owned requests and one applied Guide facets Rule; recording is paused before filming',
      jsonPath: matchedPath, textPath: otherPath, header: 'x-guide-facet: selected',
      initialRecords: '2', afterJson: '1', afterRule: '1', afterClearFacets: '2',
    });
  }
  // 清理：正式Close与宿主guard核对代理、CA、全部进程及8888。
  // Cleanup: normal Close and the host guard verify proxy/CA, all processes and port 8888.
});
