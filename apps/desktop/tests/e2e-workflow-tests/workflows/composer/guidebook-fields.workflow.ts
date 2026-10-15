import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer field guide verifies enabled, disabled and removed rows plus JSON Format and Body None', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;
  const prefix = '/guide/composer-fields';
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-fields');
  const address = async (suffix: string) => {
    const parsed = new URL(httpTrafficRunner.url(`${prefix}/${suffix}`));
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${parsed.host}${parsed.pathname}`);
  };
  try {
    // 准备与操作：每次重发用独立路径核对源站事实，展示真实行开关与删除。
    // Arrange and act: use distinct paths for each send and operate real row toggles/deletion.
    await media.step('01-new', '新建请求 / Create a request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(httpTrafficRunner.url(`${prefix}/enabled`));
    });
    await media.step('02-header', '添加 x-guide-toggle=enabled / Add the test Header', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('x-guide-toggle');
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill('enabled');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    });
    await media.step('03-query', '添加 guide=enabled / Add the test Query', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('guide');
      await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill('enabled');
      await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
    });
    await media.step('04-send-enabled', '重发并核对两个字段 / Send and verify both enabled fields', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(`${prefix}/enabled?guide=enabled`)?.headers['x-guide-toggle']).toBe('enabled');
    });
    await media.step('05-query-off', '停用 Query 行 / Disable the Query row', async () => {
      const row = page.locator('input[value="guide"]').locator('..');
      await row.getByRole('checkbox').click();
    });
    await media.step('06-header-off', '停用 Header 行 / Disable the Header row', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await page.locator('input[value="x-guide-toggle"]').locator('..').getByRole('checkbox').click();
    });
    await media.step('07-send-disabled', '重发并确认字段未发送 / Send without the disabled fields', async () => {
      await address('disabled');
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(`${prefix}/disabled`)?.method).toBe('GET');
      expect(httpTrafficRunner.observation(`${prefix}/disabled`)?.headers['x-guide-toggle']).toBeUndefined();
    });
    await media.step('08-header-delete', '删除 Header 行 / Delete the Header row', async () => {
      await page.locator('input[value="x-guide-toggle"]').locator('..').getByRole('button').click();
      await expect(page.locator('input[value="x-guide-toggle"]')).toHaveCount(0);
    });
    await media.step('09-query-delete', '删除 Query 行 / Delete the Query row', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await page.locator('input[value="guide"]').locator('..').getByRole('button').click();
      await expect(page.locator('input[value="guide"]')).toHaveCount(0);
    });
    await media.step('10-json', '选择 POST 与 JSON / Select POST and JSON', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.method).click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).click();
      await getByAutomationId(page, AUTOMATION_IDS.composer.body).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('{"message":"format-demo","count":2}');
    });
    await media.step('11-format', 'Format JSON / Format JSON', async () => {
      const body = getByAutomationId(page, AUTOMATION_IDS.composer.body);
      await body.locator('xpath=preceding-sibling::div[1]').getByRole('button').first().click();
      await expect(body).toContainText('format-demo');
    });
    await media.step('12-send-json', '发送并核对格式化后的 JSON / Send and verify formatted JSON', async () => {
      await address('json');
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(`${prefix}/json`)?.method).toBe('POST');
      expect(JSON.parse(httpTrafficRunner.observation(`${prefix}/json`)!.body.toString('utf8'))).toEqual({ message: 'format-demo', count: 2 });
    });
    await media.step('13-none', '选择 Body None / Select Body None', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).locator('..').getByRole('radio').first().click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.body)).toHaveCount(0);
    });
    await media.step('14-send-none', '发送空正文 / Send without a body', async () => {
      await address('none');
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(`${prefix}/none`)?.method).toBe('POST');
      expect(httpTrafficRunner.observation(`${prefix}/none`)?.body.byteLength).toBe(0);
    });
    await media.step('15-history', '从 Recent sends 选择旧地址 / Select an earlier Recent send', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.history).click();
      const item = page.getByRole('button').filter({ hasText: `${prefix}/enabled` });
      await item.click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
    });
    await media.step('16-check-restored', '核对没有恢复已删除字段或正文 / Check that fields and body were not restored', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
      await expect(page.locator('input[value="x-guide-toggle"]')).toHaveCount(0);
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.body)).toHaveCount(0);
    });
    // 证据：实际发送与只恢复method/URL的边界均可观察，不以控件外观猜测。
    // Evidence: verify actual sends and method/URL-only restoration rather than inferring from appearance.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({ origin: httpTrafficRunner.url(prefix), headerName: 'x-guide-toggle', headerValue: 'enabled',
      queryName: 'guide', queryValue: 'enabled', json: '{"message":"format-demo","count":2}',
      historyRestores: 'method and URL only' });
  }
  // 清理：正常Close恢复进程、listener和系统代理。
  // Cleanup: normal Close restores processes, listener and system proxy.
});
