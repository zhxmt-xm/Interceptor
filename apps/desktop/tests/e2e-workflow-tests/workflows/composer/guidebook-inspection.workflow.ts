import { writeFile } from 'node:fs/promises';

import type { Locator } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('composer inspection guide records response sections, body views, actions and splitters', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(420_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'composer.guidebook.inspection' });
  const { page } = desktopApp;
  const jsonPath = '/guide/composer-inspection/response';
  const cssPath = '/guide/composer-inspection/format';
  const jsonBody = '{"message":"Hello response","order":{"id":"guide-001","items":[{"sku":"demo-001","quantity":2}]},"ok":true}';
  const cssRule = '.guide{color:teal}';
  const cssPaddingBytes = 1024 * 1024;
  const cssBody = `${cssRule}${' '.repeat(cssPaddingBytes)}`;
  const requestHeader = 'x-guide-request';
  const headerValue = 'inspection-demo';
  httpTrafficRunner.respondWith(jsonPath, {
    body: jsonBody,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-guide-response': headerValue,
      'set-cookie': [
        'guide_session=inspection-demo; Path=/; HttpOnly',
        'guide_theme=light; Path=/',
      ],
    },
  });
  httpTrafficRunner.respondWith(cssPath, {
    body: cssBody,
    headers: { 'content-type': 'text/css; charset=utf-8' },
  });
  const responseBody = getByAutomationId(page, AUTOMATION_IDS.composer.responseBody);
  const defaultMode = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyMode);
  const modes = () => defaultMode.locator('..').getByRole('radio');
  const copy = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.copy);
  const format = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyAction.format);
  const sectionBody = async (section: Locator): Promise<Locator> => {
    const id = await section.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    return page.locator(`[id="${id}"]`);
  };
  const toggleSection = async (section: Locator, expanded: boolean): Promise<void> => {
    await section.click();
    await expect(section).toHaveAttribute('aria-expanded', String(expanded));
    if (expanded) await expect(await sectionBody(section)).toBeVisible();
    else await expect(await sectionBody(section)).toBeHidden();
  };
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const evidence: Record<string, unknown> = {};
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'composer-inspection');
  try {
    // 准备：只操作正式Composer与本轮loopback origin，保持应用当前语言。
    // Arrange: use the released Composer and this workflow's loopback origin without changing language.
    await media.step('01-open', '打开 Composer / Open Composer', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.newRequest)).toBeVisible();
    });
    await media.step('02-new', '新建响应检查请求 / Create the response inspection request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.method)).toContainText('GET');
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue('');
    });
    await media.step('03-url', '填写响应检查地址 / Enter the response inspection URL', async () => {
      const url = new URL(httpTrafficRunner.url(jsonPath));
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(url.href);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue(`${url.host}${url.pathname}`);
    });
    await media.step('04-header-name', '填写 x-guide-request / Enter x-guide-request', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill(requestHeader);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name)).toHaveValue(requestHeader);
    });
    await media.step('05-header-value', '填写 inspection-demo / Enter inspection-demo', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(headerValue);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value)).toHaveValue(headerValue);
    });
    await media.step('06-add-header', '添加请求 Header / Add the request Header', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
      await expect(page.locator(`input[value="${requestHeader}"]`)).toBeVisible();
    });
    await media.step('07-send', 'Send 并接收真实 JSON / Send and receive real JSON', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(jsonPath)?.headers[requestHeader]).toBe(headerValue);
      expect(httpTrafficRunner.observation(jsonPath)?.method).toBe('GET');
      await expect(responseBody).toContainText('Hello response');
      await expect(defaultMode).toHaveAttribute('aria-checked', 'true');
    });

    // 用户操作与断言：每个页签和分组切换单独留图，不以最后状态替代中间操作。
    // Act and assert: capture each tab and section toggle separately, including intermediate states.
    const responseHeaders = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.responseHeaders);
    const requestHeaders = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.requestHeaders);
    await media.step('08-headers', '打开响应 Headers / Open response Headers', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.headers).click();
      await expect(await sectionBody(responseHeaders)).toContainText('x-guide-response');
      await expect(await sectionBody(responseHeaders)).toContainText(headerValue);
      await expect(await sectionBody(requestHeaders)).toContainText(requestHeader);
      await expect(await sectionBody(requestHeaders)).toContainText(headerValue);
    });
    await media.step('09-response-collapse', '折叠 Response Headers / Collapse Response Headers', async () => {
      await toggleSection(responseHeaders, false);
      await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('10-request-collapse', '折叠 Request Headers / Collapse Request Headers', async () => {
      await toggleSection(requestHeaders, false);
      await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
    });
    await media.step('11-response-expand', '展开 Response Headers / Expand Response Headers', async () => {
      await toggleSection(responseHeaders, true);
      await expect(requestHeaders).toHaveAttribute('aria-expanded', 'false');
    });
    await media.step('12-request-expand', '展开 Request Headers / Expand Request Headers', async () => {
      await toggleSection(requestHeaders, true);
      await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
    });
    const cookies = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.responseCookies);
    await media.step('13-cookies', '打开响应 Cookies / Open response Cookies', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.cookies).click();
      const content = await sectionBody(cookies);
      await expect(content).toContainText('guide_session');
      await expect(content).toContainText('inspection-demo');
      await expect(content).toContainText('guide_theme');
      await expect(content).toContainText('light');
    });
    await media.step('14-cookies-collapse', '折叠 Cookies 分组 / Collapse the Cookies section', async () => {
      await toggleSection(cookies, false);
    });
    await media.step('15-cookies-expand', '展开 Cookies 分组 / Expand the Cookies section', async () => {
      await toggleSection(cookies, true);
    });
    const timing = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.timing);
    const connection = getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.connection);
    await media.step('16-timing', '查看 Timing 与连接信息 / Inspect Timing and connection details', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.timing).click();
      await expect(await sectionBody(timing)).toBeVisible();
      await expect((await sectionBody(timing)).locator(':scope > div > div')).toHaveCount(6);
      await expect(await sectionBody(connection)).toContainText('127.0.0.1');
      evidence.timing = await (await sectionBody(timing)).innerText();
      evidence.connection = await (await sectionBody(connection)).innerText();
    });
    await media.step('17-timing-collapse', '折叠 Timing 分组 / Collapse Timing', async () => {
      await toggleSection(timing, false);
      await expect(connection).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('18-connection-collapse', '折叠 Connection 分组 / Collapse Connection', async () => {
      await toggleSection(connection, false);
      await expect(timing).toHaveAttribute('aria-expanded', 'false');
    });
    await media.step('19-timing-expand', '展开 Timing 分组 / Expand Timing', async () => {
      await toggleSection(timing, true);
      await expect(connection).toHaveAttribute('aria-expanded', 'false');
    });
    await media.step('20-connection-expand', '展开 Connection 分组 / Expand Connection', async () => {
      await toggleSection(connection, true);
      await expect(timing).toHaveAttribute('aria-expanded', 'true');
    });

    // 正文：用实际返回的同一份字节检查Tree、Raw、Hex、Copy和Fullscreen。
    // Body: inspect Tree, Raw, Hex, Copy and Fullscreen against the same actual response bytes.
    await media.step('21-body', '返回响应 Body / Return to response Body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
      await expect(defaultMode).toHaveAttribute('aria-checked', 'true');
      await expect(responseBody).toContainText('Hello response');
    });
    await media.step('22-tree', '切换 Tree / Switch to Tree', async () => {
      await modes().nth(1).click();
      await expect(modes().nth(1)).toHaveAttribute('aria-checked', 'true');
      await expect(responseBody.getByText('guide-001', { exact: false })).toBeVisible();
    });
    await media.step('23-tree-collapse', '折叠 JSON 根节点 / Collapse the JSON root', async () => {
      await responseBody.locator('button[aria-expanded]').first().click();
      await expect(responseBody.locator('button[aria-expanded]').first()).toHaveAttribute('aria-expanded', 'false');
      await expect(responseBody.getByText('message', { exact: true })).toHaveCount(0);
    });
    await media.step('24-tree-expand', '展开 JSON 根节点 / Expand the JSON root', async () => {
      await responseBody.locator('button[aria-expanded]').first().click();
      await expect(responseBody.getByText('message', { exact: true })).toBeVisible();
    });
    await media.step('25-tree-menu', '打开 message 的右键菜单 / Open the message context menu', async () => {
      await responseBody.getByText('message', { exact: true }).click({ button: 'right' });
      const menu = responseBody.locator('div').filter({
        has: page.locator(':scope > button:nth-child(3)'),
      }).last();
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('button')).toHaveCount(3);
    });
    await media.step('26-tree-copy-value', '复制 message 的值 / Copy the message value', async () => {
      const menu = responseBody.locator('div').filter({
        has: page.locator(':scope > button:nth-child(3)'),
      }).last();
      await menu.getByRole('button').first().click();
      await expect.poll(clipboard).toBe('Hello response');
      evidence.treeCopy = await clipboard();
    });
    await media.step('27-raw', '切换 Raw / Switch to Raw', async () => {
      await modes().nth(2).click();
      await expect(modes().nth(2)).toHaveAttribute('aria-checked', 'true');
      await expect(responseBody).toContainText('Hello response');
    });
    await media.step('28-copy-raw', '复制 Raw 原始文本 / Copy the Raw response text', async () => {
      await copy.click();
      await expect.poll(clipboard).toBe(jsonBody);
      evidence.rawCopy = await clipboard();
    });
    await media.step('29-hex', '切换 Hex 字节视图 / Switch to Hex bytes', async () => {
      await modes().nth(3).click();
      await expect(modes().nth(3)).toHaveAttribute('aria-checked', 'true');
      await expect(responseBody).toContainText('00000000');
      await expect(responseBody).toContainText('7b 22 6d 65 73 73 61 67');
    });
    await media.step('30-copy-hex', '复制 Hex 并核对原始字节 / Copy Hex and verify the original bytes', async () => {
      await copy.click();
      await expect.poll(clipboard).toMatch(/^00000000  7b 22/);
      const hex = await clipboard();
      const bytes = hex.split('\n').flatMap((line) =>
        line.slice(10, 57).trim().split(/\s+/).map((byte) => Number.parseInt(byte, 16)));
      expect(Buffer.from(bytes)).toEqual(Buffer.from(jsonBody));
      evidence.hexCopy = hex;
    });
    await media.step('31-fullscreen', '全屏查看响应 Hex / Open the response Hex fullscreen', async () => {
      await copy.locator('..').getByRole('button').last().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('radio').nth(3)).toHaveAttribute('aria-checked', 'true');
      await expect(dialog).toContainText('7b 22 6d 65 73 73 61 67');
    });
    await media.step('32-exit-fullscreen', '退出正文全屏 / Exit body fullscreen', async () => {
      await page.getByRole('dialog').locator('header').getByRole('button').last().click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(modes().nth(3)).toHaveAttribute('aria-checked', 'true');
    });

    // 布局：真实pointer拖动两条分隔线，几何变化与当前响应同时断言。
    // Layout: drag both real splitters and verify geometry while keeping the current response.
    await media.step('33-collection-drag', '拖宽 Collection 分栏 / Widen the Collection pane', async () => {
      const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
      const before = (await collection.boundingBox())!.width;
      const splitter = (await getByAutomationId(page, AUTOMATION_IDS.composer.collectionSplitter).boundingBox())!;
      await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + 100);
      await page.mouse.down();
      await page.mouse.move(splitter.x + splitter.width / 2 + 80, splitter.y + 100, { steps: 16 });
      await page.mouse.up();
      await expect.poll(async () => (await collection.boundingBox())!.width).toBeGreaterThan(before + 60);
      evidence.collectionWidth = { before, after: (await collection.boundingBox())!.width };
      await expect(responseBody).toContainText('7b 22 6d 65');
    });
    await media.step('34-response-drag', '向上拖动以增高响应区 / Drag upward to enlarge the response pane', async () => {
      const splitter = getByAutomationId(page, AUTOMATION_IDS.composer.splitter);
      const before = (await splitter.boundingBox())!;
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 - 80, { steps: 16 });
      await page.mouse.up();
      await expect.poll(async () => (await splitter.boundingBox())!.y).toBeLessThan(before.y - 60);
      evidence.responseSplitter = { beforeY: before.y, afterY: (await splitter.boundingBox())!.y };
      await expect(responseBody).toContainText('7b 22 6d 65');
    });

    // Format：独立CSS响应超过自动阈值，先核对原文，再用真实按钮手动格式化。
    // Format: use a separate CSS response above the auto threshold, verify raw text, then format via UI.
    await media.step('35-format-url', '填写独立 CSS 地址 / Enter the separate CSS URL', async () => {
      const url = new URL(httpTrafficRunner.url(cssPath));
      await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`${url.host}${url.pathname}`);
      await expect(getByAutomationId(page, AUTOMATION_IDS.composer.url)).toHaveValue(`${url.host}${url.pathname}`);
    });
    await media.step('36-css-send', '接收需要手动 Format 的 CSS / Receive CSS requiring manual Format', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
      await expect.poll(() => httpTrafficRunner.observation(cssPath)?.method).toBe('GET');
      await expect(format).toBeEnabled();
      await expect(responseBody).toContainText('.guide');
    });
    await media.step('37-css-copy-before', '复制并核对 Format 前的 CSS / Copy and verify CSS before Format', async () => {
      await copy.click();
      await expect.poll(async () => (await clipboard()).length).toBe(cssBody.length);
      expect(await clipboard()).toBe(cssBody);
      evidence.cssBefore = { length: cssBody.length, rule: cssRule, paddingBytes: cssPaddingBytes };
    });
    await media.step('38-format', '点击 Format 格式化响应 / Click Format on the response', async () => {
      await format.click();
      await expect(format).toBeEnabled();
      await expect(responseBody).toContainText(/color:\s+teal/);
    });
    await media.step('39-css-copy-after', '复制并核对格式化结果 / Copy and verify the formatted result', async () => {
      await copy.click();
      await expect.poll(clipboard).toMatch(/\.guide\s*\{\s*color:\s*teal;?\s*\}/);
      const formatted = await clipboard();
      expect(formatted.split('\n').length).toBeGreaterThan(1);
      expect(formatted.length).toBeLessThan(cssBody.length);
      evidence.cssAfter = formatted;
    });

    // 证据：保存实际origin、剪贴板和拖动几何；不读取Store或调用Preload业务API。
    // Evidence: persist real origin, clipboard and drag geometry without Store or business API access.
    expect(desktopApp.rendererPageErrors()).toEqual([]);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.collection)).toHaveAttribute('data-save-state', 'saved');
    evidence.recordingCompleted = true;
  } finally {
    await writeFile(testInfo.outputPath('composer-inspection-observations.json'), JSON.stringify({
      ...evidence, origin: httpTrafficRunner.evidence(),
    }, null, 2), 'utf8');
    await media.stop({
      responseUrl: httpTrafficRunner.url(jsonPath),
      requestHeader, requestHeaderValue: headerValue,
      responseHeader: 'x-guide-response', responseHeaderValue: headerValue,
      responseJson: jsonBody,
      cookieOne: 'guide_session=inspection-demo; Path=/; HttpOnly',
      cookieTwo: 'guide_theme=light; Path=/',
      treeCopyValue: 'Hello response',
      cssUrl: httpTrafficRunner.url(cssPath), cssRule,
      cssPaddingBytes: String(cssPaddingBytes), cssResponseBytes: String(Buffer.byteLength(cssBody)),
      cssPadding: 'ASCII spaces after the rule; above the 1 MiB automatic formatting threshold',
    });
  }
  // 清理：原driver正常Close，核对Main/Core/Worker退出、8888释放及完整宿主恢复。
  // Cleanup: the original driver closes normally and verifies processes, port 8888 and host restoration.
});
