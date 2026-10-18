import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { GuidebookMedia } from '../../fixtures/ui/guidebook-media';

test('capture guide records request scrolling, Markdown Source and capture after Clear', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  test.setTimeout(360_000);
  const { page } = desktopApp;
  const prefix = '/guide/inspection';
  const query = new URLSearchParams(Array.from({ length: 24 }, (_, index) => [`detail${index}`, `guide-${index}`]));
  const requestPath = `${prefix}/body?${query}`;
  const requestBody = JSON.stringify({
    requestId: 'guide-request',
    entries: Array.from({ length: 96 }, (_, index) => ({ index, value: `request-${String(index).padStart(3, '0')}` })),
    end: 'guide-request-end',
  }, null, 2);
  const responseBody = `# Guide response source\n\n${Array.from({ length: 160 }, (_, index) =>
    `- response-${String(index).padStart(3, '0')}: public example`).join('\n')}\n\nEnd: guide-response-end\n`;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const inspector = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
  const pane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
  const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
  const modes = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).locator('..').getByRole('radio');
  const splitter = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.splitter);
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  let originalInspectorWidth = 0;
  const dragSplitter = async (distance: number): Promise<void> => {
    const box = await splitter.boundingBox();
    if (!box) throw new Error('The Inspector splitter is not visible.');
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + distance, box.y + 80, { steps: 16 });
    await page.mouse.up();
  };
  const moveOverVisibleBody = async (): Promise<void> => {
    const box = await pane.boundingBox();
    const viewport = await inspector.boundingBox();
    if (!box || !viewport) throw new Error('The body has no visible scroll viewport.');
    const y = Math.min(Math.max(box.y + 24, viewport.y + 24), viewport.y + viewport.height - 24);
    if (y >= box.y + box.height) throw new Error('The body is outside the Inspector viewport.');
    await page.mouse.move(box.x + Math.min(100, box.width / 2), y);
  };

  // 准备：仅使用自产POST与Markdown响应，查询字段让内外层都具有真实可滚动内容。
  // Arrange: use an owned POST and Markdown response; query fields give both scroll levels actual overflow.
  httpTrafficRunner.respondWith(requestPath, { body: responseBody, headers: { 'content-type': 'text/markdown' } });
  httpTrafficRunner.respondWith(`${prefix}/after-clear`, {
    body: '{"afterClear":"guide-visible"}', headers: { 'content-type': 'application/json' },
  });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(prefix);
  const media = await GuidebookMedia.start(desktopApp, testInfo, 'capture-inspection');
  try {
    await media.step('01-filter', '限定本轮检查路径 / Scope the inspection path', async () => {
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter)).toHaveValue(prefix);
    });
    await media.step('02-record', '开启 Recording / Start Recording', async () => { await startRecording(desktopApp); });
    await media.step('03-post', '发送长正文 POST / Send the long-body POST', async () => {
      expect(await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), requestPath, {
        method: 'POST', body: requestBody, headers: { 'content-type': 'application/json' },
      })).toMatchObject({ statusCode: 200, body: responseBody });
      expect(httpTrafficRunner.observation(requestPath)?.body.toString('utf8')).toBe(requestBody);
    });
    await media.step('04-pause', '暂停后检查已捕获请求 / Pause before inspecting the captured request', async () => {
      await recording.click();
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('05-select', '选择 body 请求 / Select the body request', async () => {
      await rows.filter({ hasText: `${prefix}/body` }).click();
    });
    await media.step('06-headers', '查看 Headers / Inspect Headers', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general)).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('07-collapse', '折叠 General / Collapse General', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general)).toHaveAttribute('aria-expanded', 'false');
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.responseHeaders)).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('08-expand', '重新展开 General / Expand General again', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.general)).toHaveAttribute('aria-expanded', 'true');
    });
    await media.step('09-request', '打开 Request 正文 / Open the Request body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
      await expect(pane).toContainText('guide-request');
    });
    await media.step('10-raw', '选择请求 Raw / Select request Raw', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('11-widen', '拖动分栏扩大详情 / Drag the splitter to widen details', async () => {
      const box = await inspector.boundingBox();
      if (!box) throw new Error('Inspector geometry is unavailable.');
      originalInspectorWidth = box.width;
      await dragSplitter(-240);
      await expect.poll(async () => (await inspector.boundingBox())?.width).toBeGreaterThan(originalInspectorWidth + 200);
    });
    await media.step('12-inner-scroll', '在正文内使用滚轮 / Scroll inside the body with the wheel', async () => {
      await pane.scrollIntoViewIfNeeded();
      const before = await pane.textContent();
      await moveOverVisibleBody();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => pane.textContent()).not.toBe(before);
    });
    await media.step('13-request-end', '用键盘到达请求末尾 / Reach the request end with the keyboard', async () => {
      await pane.click({ position: { x: 100, y: 40 } });
      await page.keyboard.press('Meta+ArrowDown');
      await expect(pane).toContainText('guide-request-end');
    });
    await media.step('14-outer-up', '在详情边缘向上滚动 / Scroll up at the Inspector edge', async () => {
      const before = await inspector.evaluate(element => element.scrollTop);
      expect(before).toBeGreaterThan(0);
      await inspector.hover({ position: { x: 8, y: 60 } });
      await page.mouse.wheel(0, -100);
      await expect.poll(() => inspector.evaluate(element => element.scrollTop)).toBeLessThan(before);
    });
    await media.step('15-scroll-chain', '正文到底后继续滚动外层 / Continue scrolling the outer pane at the body boundary', async () => {
      const before = await inspector.evaluate(element => element.scrollTop);
      await moveOverVisibleBody();
      await page.mouse.wheel(0, 500);
      await expect.poll(() => inspector.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
    });
    await media.step('16-copy-request', '复制完整请求正文 / Copy the complete request body', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(requestBody);
    });

    // 用户操作：Markdown的Preview、Split、Source通过既有模式控件和真实键盘切换。
    // User actions: switch Markdown Preview, Split and Source through existing controls and real keyboard input.
    await media.step('17-preview', '打开 Markdown Preview / Open Markdown Preview', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Guide response source');
    });
    await media.step('18-split', '右方向键切换 Split / Use ArrowRight to switch to Split', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).press('ArrowRight');
      await expect(modes.nth(1)).toHaveAttribute('aria-checked', 'true');
      await expect(bodyView).toContainText('# Guide response source');
    });
    await media.step('19-source', '再次右移切换 Source / Press ArrowRight again for Source', async () => {
      await page.keyboard.press('ArrowRight');
      await expect(modes.nth(2)).toHaveAttribute('aria-checked', 'true');
      await expect(pane).toContainText('# Guide response source');
    });
    await media.step('20-copy-source', '复制 Markdown Source / Copy Markdown Source', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy).click();
      expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(responseBody);
    });
    await media.step('21-source-scroll', '滚动长 Source / Scroll the long Source', async () => {
      await pane.scrollIntoViewIfNeeded();
      const before = await pane.textContent();
      await moveOverVisibleBody();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => pane.textContent()).not.toBe(before);
    });
    await media.step('22-source-end', '用键盘查看 Source 末尾 / Use the keyboard to inspect the Source end', async () => {
      await pane.click({ position: { x: 100, y: 40 } });
      await page.keyboard.press('Meta+ArrowDown');
      await expect(pane).toContainText('guide-response-end');
    });
    await media.step('23-fullscreen', '全屏查看 Source / View Source fullscreen', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('radio').nth(2)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('24-return', 'Escape 返回 Source / Return to Source with Escape', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).hover();
      await expect(modes.nth(2)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('25-preview-again', '返回 Markdown Preview / Return to Markdown Preview', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default).click();
      await expect(bodyView.getByRole('heading', { level: 1 })).toHaveText('Guide response source');
    });
    await media.step('26-hex', '查看同一响应的 Hex / Inspect Hex for the same response', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex).click();
      await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.hex)).toHaveAttribute('aria-checked', 'true');
    });
    await media.step('27-restore-width', '拖回原来的详情宽度 / Restore the original detail width', async () => {
      await dragSplitter(240);
      await expect.poll(async () => (await inspector.boundingBox())?.width).toBeCloseTo(originalInspectorWidth, 0);
    });
    await media.step('28-close-details', '关闭详情回到列表 / Close details and return to the list', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.close).click();
    });
    await media.step('29-clear', 'Clear 本轮临时记录 / Clear this run’s temporary records', async () => {
      await getByAutomationId(page, AUTOMATION_IDS.capture.clear).click();
      await expect(rows).toHaveCount(0);
      await expect(recording).toHaveAttribute('aria-pressed', 'false');
    });
    await media.step('30-resume', '清理后重新开启 Recording / Resume Recording after Clear', async () => { await startRecording(desktopApp); });
    await media.step('31-new-request', '发送清理后的新请求 / Send a new request after Clear', async () => {
      expect(await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/after-clear`))
        .toMatchObject({ statusCode: 200, body: '{"afterClear":"guide-visible"}' });
      await expect(rows).toHaveCount(1);
    });
    await media.step('32-new-body', '确认新请求正文可读 / Verify the new request body is readable', async () => {
      await rows.filter({ hasText: `${prefix}/after-clear` }).click();
      await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
      await expect(pane).toContainText('guide-visible');
    });
    // 证据：查看、分栏和滚动未重发原POST，Clear之后只捕获明确的新请求。
    // Evidence: viewing, resizing and scrolling do not resend the POST; only the explicit new request follows Clear.
    expect(httpTrafficRunner.evidence().filter(observation => 'path' in observation && observation.path === requestPath)).toHaveLength(1);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } finally {
    await media.stop({
      url: httpTrafficRunner.url(requestPath), search: prefix,
      requestId: 'guide-request', requestEntries: 'request-000 through request-095',
      queryFields: 'detail0=guide-0 through detail23=guide-23',
      requestEnd: 'guide-request-end', responseTitle: 'Guide response source',
      responseEntries: 'response-000 through response-159', responseEnd: 'guide-response-end',
      responseMime: 'text/markdown', inspectorDrag: '240px wider, then restored',
      afterClearPath: `${prefix}/after-clear`, afterClearBody: '{"afterClear":"guide-visible"}',
    });
  }
  // 清理：fixture经正式Close验证代理、CA、进程和8888恢复。
  // Cleanup: the fixture verifies proxy/CA, processes and port 8888 through normal Close.
});
