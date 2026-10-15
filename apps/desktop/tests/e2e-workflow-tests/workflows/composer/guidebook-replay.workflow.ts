import { writeFile } from 'node:fs/promises';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer replay guide records duplicate Query, Text input and actual Recent sends replay', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'composer.guidebook.replay' });
  const { page } = desktopApp;
  const initialUrlPath = '/guide/composer-replay/query?guide=url';
  const initialSentPath = `${initialUrlPath}&guide=table&guide=again`;
  const textUrlPath = '/guide/composer-replay/text?guide=text-url';
  const textSentPath = `${textUrlPath}&guide=table&guide=again`;
  const replaySentPath = `${initialSentPath}&guide=current&guide=again`;
  const textPartial = 'Hello';
  const textBody = 'Hello text';
  const replayBody = 'Hello replay';
  httpTrafficRunner.respondWith(initialSentPath, {
    headers: { 'content-type': 'application/json' },
    body: '{"message":"Query received","guide":["url","table","again"]}',
  });
  httpTrafficRunner.respondWith(textSentPath, {
    headers: { 'content-type': 'application/json' },
    body: '{"message":"Text received","body":"Hello text"}',
  });
  httpTrafficRunner.respondWith(replaySentPath, {
    headers: { 'content-type': 'application/json' },
    body: '{"message":"Replay received","guide":["url","table","again","current","again"],"body":"Hello replay"}',
  });
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  const method = getByAutomationId(page, AUTOMATION_IDS.composer.method);
  const requestBody = getByAutomationId(page, AUTOMATION_IDS.composer.body);
  const responseBody = getByAutomationId(page, AUTOMATION_IDS.composer.responseBody);
  const queryName = getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name);
  const queryValue = getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value);
  const addressWithoutScheme = (requestPath: string) => {
    const parsed = new URL(httpTrafficRunner.url(requestPath));
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  };
  let recordingCompleted = false;
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-replay');
  try {
    // 准备：每次发送的完整path唯一，避免observation()首条记录掩盖重发事实。
    // Arrange: each actual request path is unique, so observation() cannot confuse a replay with its first send.
    await media.step('01-open', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.newRequest)).toBeVisible();
    });
    await media.step('02-new', '新建 Query 与重发请求 / Create the Query and replay request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      await expect(url).toHaveValue('');
    });
    await media.step('03-url', '在 URL 中填写 guide=url / Enter guide=url in the URL', async () => {
      await url.fill(httpTrafficRunner.url(initialUrlPath));
      await expect(url).toHaveValue(addressWithoutScheme(initialUrlPath));
    });
    await media.step('04-post', '选择 POST / Select POST', async () => {
      await method.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(method).toContainText('POST');
    });
    await media.step('05-query', '打开仍为空的 Query 表格 / Open the still-empty Query table', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await expect(queryName).toHaveValue('');
      await expect(page.locator('input[value="guide"]')).toHaveCount(0);
      await expect(url).toHaveValue(addressWithoutScheme(initialUrlPath));
    });
    await media.step('06-query-name', '填写 Query 名称 guide / Enter the Query name guide', async () => {
      await queryName.fill('guide');
      await expect(queryName).toHaveValue('guide');
    });
    await media.step('07-query-value', '填写 Query 值 table / Enter the Query value table', async () => {
      await queryValue.fill('table');
      await expect(queryValue).toHaveValue('table');
    });
    await media.step('08-add-query', '添加 guide=table / Add guide=table', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
      await expect(page.locator('input[value="table"]')).toBeVisible();
      await expect(url).toHaveValue(addressWithoutScheme(initialUrlPath));
    });
    await media.step('09-duplicate-name', '再次填写同名 guide / Enter the duplicate name guide', async () => {
      await queryName.fill('guide');
      await expect(queryName).toHaveValue('guide');
    });
    await media.step('10-duplicate-value', '填写第二行值 again / Enter the second row value again', async () => {
      await queryValue.fill('again');
      await expect(queryValue).toHaveValue('again');
    });
    await media.step('11-add-duplicate', '添加第二条同名 Query / Add the second same-name Query row', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
      await expect(page.locator('input[value="guide"]')).toHaveCount(2);
      await expect(page.locator('input[value="again"]')).toBeVisible();
      await expect(url).toHaveValue(addressWithoutScheme(initialUrlPath));
    });
    await media.step('12-send-query', '发送并核对三个 guide 值 / Send and verify all three guide values', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(initialSentPath)?.method).toBe('POST');
      const observation = httpTrafficRunner.observation(initialSentPath)!;
      expect(new URL(observation.path, 'http://127.0.0.1').searchParams.getAll('guide')).toEqual(['url', 'table', 'again']);
      expect(observation.body.byteLength).toBe(0);
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
      await expect(responseBody).toContainText('Query received');
      await expect(url).toHaveValue(addressWithoutScheme(initialUrlPath));
    });

    // 用户输入：单独记录Text选中、部分输入、完整输入；编辑过程不得隐式发送。
    // User input: record Text selection, partial input and complete input separately, without implicit sends.
    await media.step('13-text-url', '只修改主机与路径为文本地址 / Edit only host and path for the text URL', async () => {
      await url.fill(addressWithoutScheme(textUrlPath));
      await expect(url).toHaveValue(addressWithoutScheme(textUrlPath));
    });
    await media.step('14-put', '将方法改为 PUT / Change the method to PUT', async () => {
      await expect(method).toContainText('POST');
      await method.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(method).toContainText('PUT');
    });
    await media.step('15-body', '打开请求 Body / Open request Body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bodyType)).toBeVisible();
      await expect(requestBody).toHaveCount(0);
    });
    await media.step('16-text-mode', '选择 Text，暂不输入 / Select Text before entering content', async () => {
      const textMode = getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).locator('..').getByRole('radio').nth(2);
      await textMode.click();
      await expect(textMode).toHaveAttribute('aria-checked', 'true');
      await expect(requestBody).toBeVisible();
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
    });
    await media.step('17-text-partial', '输入中间态 Hello / Enter the intermediate text Hello', async () => {
      await requestBody.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(textPartial);
      await expect(requestBody).toContainText(textPartial);
      await expect(requestBody).not.toContainText(textBody);
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
    });
    await media.step('18-text-complete', '继续输入为 Hello text / Complete the text as Hello text', async () => {
      await page.keyboard.insertText(' text');
      await expect(requestBody).toContainText(textBody);
      expect(httpTrafficRunner.evidence()).toHaveLength(1);
    });
    await media.step('19-send-text', '发送并核对 Hello text 字节 / Send and verify Hello text bytes', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(textSentPath)?.body.toString('utf8')).toBe(textBody);
      expect(httpTrafficRunner.observation(textSentPath)?.method).toBe('PUT');
      expect(httpTrafficRunner.observation(textSentPath)?.headers['content-type']).toBeUndefined();
      expect(httpTrafficRunner.evidence()).toHaveLength(2);
      await expect(responseBody).toContainText('Text received');
    });

    // 重发：保留当前Query与Body，选回历史method/已组合URL后再次真实Send。
    // Replay: keep the current Query and Body, restore the historical method/composed URL, then actually Send.
    await media.step('20-query-again', '回到 Query 表格 / Return to the Query table', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await expect(page.locator('input[value="table"]')).toBeVisible();
    });
    await media.step('21-query-current', '将 table 改为 current / Change table to current', async () => {
      await page.locator('input[value="table"]').fill('current');
      await expect(page.locator('input[value="current"]')).toBeVisible();
      await expect(page.locator('input[value="again"]')).toBeVisible();
    });
    await media.step('22-body-again', '回到当前 Text 正文 / Return to the current Text body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await expect(requestBody).toContainText(textBody);
    });
    await media.step('23-body-current', '将正文改为 Hello replay / Change the body to Hello replay', async () => {
      await requestBody.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(replayBody);
      await expect(requestBody).toContainText(replayBody);
      expect(httpTrafficRunner.evidence()).toHaveLength(2);
    });
    await media.step('24-history', '打开 Recent sends 菜单 / Open the Recent sends menu', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.history).click();
      await expect(page.getByRole('button').filter({ hasText: initialSentPath })).toBeVisible();
      await expect(page.getByRole('button').filter({ hasText: textSentPath })).toBeVisible();
    });
    await media.step('25-restore-old', '选回旧 POST 地址 / Select the earlier POST address', async () => {
      await page.getByRole('button').filter({ hasText: initialSentPath }).click();
      await expect(method).toContainText('POST');
      await expect(url).toHaveValue(addressWithoutScheme(initialSentPath));
      await expect(requestBody).toContainText(replayBody);
      expect(httpTrafficRunner.evidence()).toHaveLength(2);
    });
    await media.step('26-current-query', '检查 Query 仍为 current 与 again / Check that Query remains current and again', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
      await expect(page.locator('input[value="current"]')).toBeVisible();
      await expect(page.locator('input[value="again"]')).toBeVisible();
      await expect(page.locator('input[value="table"]')).toHaveCount(0);
      await expect(url).toHaveValue(addressWithoutScheme(initialSentPath));
    });
    await media.step('27-resend', '再次 Send，核对追加的 Query 与当前正文 / Send again and verify appended Query and current body', async () => {
      expect(replaySentPath).not.toBe(initialSentPath);
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(replaySentPath)?.body.toString('utf8')).toBe(replayBody);
      const observation = httpTrafficRunner.observation(replaySentPath)!;
      expect(observation.method).toBe('POST');
      expect(observation.headers['content-type']).toBeUndefined();
      expect(new URL(observation.path, 'http://127.0.0.1').searchParams.getAll('guide'))
        .toEqual(['url', 'table', 'again', 'current', 'again']);
      expect(httpTrafficRunner.evidence()).toHaveLength(3);
      await expect(responseBody).toContainText('Replay received');
      await expect(responseBody).toContainText(replayBody);
    });
    await media.step('28-confirm-body', '查看重发后保留的 Text 正文 / Inspect the Text body retained after replay', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
      await expect(requestBody).toContainText(replayBody);
      await expect(method).toContainText('POST');
      await expect(url).toHaveValue(addressWithoutScheme(initialSentPath));
    });

    // 证据：只依据真实origin记录描述重复参数与历史恢复，不推断覆盖或自动同步。
    // Evidence: describe duplicates and history restoration from real origin records, not assumed merging.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    recordingCompleted = true;
  } finally {
    await writeFile(testInfo.outputPath('composer-replay-observations.json'), JSON.stringify({
      recordingCompleted, origin: httpTrafficRunner.evidence(),
      initialUrlPath, initialSentPath, textUrlPath, textSentPath, replaySentPath,
      textPartial, textBody, replayBody,
      expectedReplay: {
        method: 'POST', restoredUrl: httpTrafficRunner.url(initialSentPath),
        queryValues: ['url', 'table', 'again', 'current', 'again'],
      },
    }, null, 2), 'utf8');
    await media.stop({
      initialUrl: httpTrafficRunner.url(initialUrlPath),
      initialSentUrl: httpTrafficRunner.url(initialSentPath),
      initialMethod: 'POST', queryName: 'guide',
      urlQueryValue: 'url', firstTableValue: 'table', secondTableValue: 'again',
      textUrl: httpTrafficRunner.url(textUrlPath), textSentUrl: httpTrafficRunner.url(textSentPath),
      textMethod: 'PUT', textPartial, textBody,
      textContentType: 'not added automatically in Text mode; this example leaves the Header unset',
      currentTableValue: 'current', currentBody: replayBody,
      restoredMethod: 'POST', restoredUrl: httpTrafficRunner.url(initialSentPath),
      replaySentUrl: httpTrafficRunner.url(replaySentPath),
      replayQueryValues: 'url, table, again, current, again',
      historyRestores: 'method and previously composed URL only; enabled current Query rows append again',
    });
  }
  // 清理：由原driver完成正常Close与Main/Core/Worker、8888、系统代理及证书恢复门禁。
  // Cleanup: the original driver proves normal Close, process/port release and host proxy/certificate restoration.
});
