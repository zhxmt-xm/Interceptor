import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Contract values shared with the Composer constants and design baseline. */
const COLLECTION_WIDTH = 320;
const MIN_COLLECTION_WIDTH = 160;
const MIN_WORK_WIDTH = 480;
const RESPONSE_HEIGHT = 368;
const MIN_RESPONSE_HEIGHT = 160;
const DOCUMENT_TABS_HEIGHT = 40;
const URL_BAR_HEIGHT = 56;
const MIN_REQUEST_HEIGHT = 180;
const SPLITTER_TRACK = 1;
const DEFAULT_WINDOW = { width: 1600, height: 900 } as const;
const SHRUNK_WINDOW = { width: 1200, height: 700 } as const;

interface ComposerGeometry {
  readonly mainWidth: number;
  readonly mainHeight: number;
  readonly collectionWidth: number;
  readonly responseHeight: number;
}

/** Read the live Composer pane geometry from the real Renderer. */
async function readGeometry(page: Page): Promise<ComposerGeometry> {
  const [mainSize, collectionBox, responseBox] = await Promise.all([
    getByAutomationId(page, AUTOMATION_IDS.app.main).evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    })),
    getByAutomationId(page, AUTOMATION_IDS.composer.collection).boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.composer.response).boundingBox(),
  ]);
  if (!collectionBox || !responseBox) {
    throw new Error('The Composer Collection and Response panes are not laid out.');
  }
  return {
    mainWidth: mainSize.width,
    mainHeight: mainSize.height,
    collectionWidth: collectionBox.width,
    responseHeight: responseBox.height,
  };
}

async function readSize(
  page: Page,
  locator: Locator,
  axis: 'width' | 'height',
): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('The requested Composer pane is not laid out.');
  }
  return box[axis];
}

/** Require one live pane size to match a contract value within a sub-pixel. */
async function expectPaneSize(
  page: Page,
  target: Locator,
  axis: 'width' | 'height',
  expected: number,
  description: string,
): Promise<void> {
  await expect.poll(
    async () => Math.abs(await readSize(page, target, axis) - expected),
    { message: `${description} did not reach ${expected}px.` },
  ).toBeLessThanOrEqual(1);
}

/** Drag the vertical Collection splitter to an absolute viewport X coordinate. */
async function dragCollectionTo(page: Page, targetX: number): Promise<void> {
  const box = await getByAutomationId(
    page,
    AUTOMATION_IDS.composer.collectionSplitter,
  ).boundingBox();
  if (!box) {
    throw new Error('The Composer Collection splitter disappeared.');
  }
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  try {
    await page.mouse.move(targetX, y, { steps: 12 });
  } finally {
    await page.mouse.up();
  }
}

/** Drag the horizontal Response splitter to an absolute viewport Y coordinate. */
async function dragResponseTo(page: Page, targetY: number): Promise<void> {
  const box = await getByAutomationId(
    page,
    AUTOMATION_IDS.composer.splitter,
  ).boundingBox();
  if (!box) {
    throw new Error('The Composer Response splitter disappeared.');
  }
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(x, targetY, { steps: 12 });
  } finally {
    await page.mouse.up();
  }
}

test('composer.resize clamps both splitters and re-clamps on window resize', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.resize',
  });
  desktopApp.configureWorkflowTimeout(testInfo, 150_000);
  const { page } = desktopApp;

  const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
  const collectionSplitter = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.collectionSplitter,
  );
  const response = getByAutomationId(page, AUTOMATION_IDS.composer.response);
  const responseSplitter = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.splitter,
  );
  const main = getByAutomationId(page, AUTOMATION_IDS.app.main);

  const requestPath = '/e2e/composer/resize';
  const responseText = JSON.stringify({
    message: 'composer-resize',
    items: Array.from({ length: 30 }, (_, index) => ({ index, ok: true })),
  });
  loopbackLab.respondWith(requestPath, {
    body: responseText,
    headers: {
      'content-type': 'application/json',
      'x-interceptor-e2e-long': 'v'.repeat(2_000),
      'set-cookie': ['e2e_session=resize-value; Path=/; HttpOnly'],
    },
  });

  // 准备：进入Composer，fresh profile没有打开文档，没有Response splitter。
  // Arrange: open Composer; a fresh profile has no open document and therefore no Response splitter.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await expect(collection).toBeVisible();
  await expect(collectionSplitter).toBeVisible();
  await expect(responseSplitter).toHaveCount(0);
  await expect(response).toHaveCount(0);
  await screenshotStep('进入Composer，Collection可见且没有打开文档 / Open Composer with the Collection visible and no open document');

  // 新建请求并经真实UI发送loopback请求，建立Response数据。
  // Create a request and send the loopback request through real UI to populate the Response.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  await expect(responseSplitter).toBeVisible();
  await expect(response).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(loopbackLab.url(requestPath));
  await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
  await expect.poll(() => loopbackLab.observation(requestPath)?.method).toBe('GET');
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseBody))
    .toContainText('composer-resize', { timeout: 20_000 });
  await screenshotStep('发送真实请求并得到响应正文 / Send a real request and receive the response body');

  // 初始几何：Collection 320、Response 368，并记录容器上限基准。
  // Initial geometry: Collection 320 and Response 368 while recording the container bounds.
  const initialGeometry = await readGeometry(page);
  expect(initialGeometry.collectionWidth).toBeCloseTo(COLLECTION_WIDTH, 0);
  expect(initialGeometry.responseHeight).toBeCloseTo(RESPONSE_HEIGHT, 0);
  const maximumCollectionWidth = initialGeometry.mainWidth - MIN_WORK_WIDTH - SPLITTER_TRACK;
  const maximumResponseHeight = initialGeometry.mainHeight
    - DOCUMENT_TABS_HEIGHT
    - URL_BAR_HEIGHT
    - MIN_REQUEST_HEIGHT
    - SPLITTER_TRACK;
  expect(maximumCollectionWidth).toBeGreaterThan(MIN_COLLECTION_WIDTH);
  expect(maximumResponseHeight).toBeGreaterThan(MIN_RESPONSE_HEIGHT);

  // Collection最小：连续向左拖动只停在160，工作区不重叠。
  // Collection minimum: repeated leftward drags stop at 160 without overlapping the work area.
  const innerWidth = await page.evaluate(() => window.innerWidth);
  await dragCollectionTo(page, 0);
  await expectPaneSize(page, collection, 'width', MIN_COLLECTION_WIDTH, 'Collection minimum width');
  await dragCollectionTo(page, 0);
  await expectPaneSize(page, collection, 'width', MIN_COLLECTION_WIDTH, 'Collection minimum width after a second drag');
  const minimumCollectionGeometry = await readGeometry(page);
  const collectionBox = await collection.boundingBox();
  const minimumSplitterBox = await collectionSplitter.boundingBox();
  const urlBox = await getByAutomationId(page, AUTOMATION_IDS.composer.url).boundingBox();
  expect(minimumCollectionGeometry.collectionWidth).toBeCloseTo(MIN_COLLECTION_WIDTH, 0);
  expect(collectionBox!.x + collectionBox!.width)
    .toBeLessThanOrEqual(minimumSplitterBox!.x + 1);
  expect(urlBox!.x).toBeGreaterThanOrEqual(minimumSplitterBox!.x + minimumSplitterBox!.width - 1);
  await screenshotStep('向左拖动Collection到160最小宽 / Drag the Collection to its 160px minimum');

  // Collection中间与最大：340px位移对应340px宽度变化，最大值为main宽减480和1px轨道。
  // Collection middle and maximum: a 340px pointer move equals a 340px width change; the maximum is main width minus 480 and the 1px track.
  await dragCollectionTo(page, minimumSplitterBox!.x + 340);
  await expectPaneSize(page, collection, 'width', MIN_COLLECTION_WIDTH + 340, 'Collection middle width');
  await dragCollectionTo(page, innerWidth - 1);
  await expectPaneSize(page, collection, 'width', maximumCollectionWidth, 'Collection maximum width');
  await dragCollectionTo(page, innerWidth - 1);
  await expectPaneSize(page, collection, 'width', maximumCollectionWidth, 'Collection maximum width after a second drag');
  const maximumCollectionGeometry = await readGeometry(page);
  expect(maximumCollectionGeometry.mainWidth).toBe(initialGeometry.mainWidth);
  expect(maximumCollectionGeometry.collectionWidth).toBeCloseTo(maximumCollectionWidth, 0);
  expect(maximumCollectionGeometry.mainWidth - maximumCollectionGeometry.collectionWidth - SPLITTER_TRACK)
    .toBeGreaterThanOrEqual(MIN_WORK_WIDTH - 1);
  await screenshotStep('拖动Collection到最大，工作区保留480 / Drag the Collection to its maximum with a 480px work area');

  // Response最小：连续向下拖动只停在160；max由高度公式推导。
  // Response minimum: repeated downward drags stop at 160; the maximum follows the height formula.
  const innerHeight = await page.evaluate(() => window.innerHeight);
  await dragResponseTo(page, innerHeight - 1);
  await expectPaneSize(page, response, 'height', MIN_RESPONSE_HEIGHT, 'Response minimum height');
  await dragResponseTo(page, innerHeight - 1);
  await expectPaneSize(page, response, 'height', MIN_RESPONSE_HEIGHT, 'Response minimum height after a second drag');
  const minimumResponseGeometry = await readGeometry(page);
  const responseBox = await response.boundingBox();
  const minimumResponseSplitterBox = await responseSplitter.boundingBox();
  expect(minimumResponseGeometry.responseHeight).toBeCloseTo(MIN_RESPONSE_HEIGHT, 0);
  expect(responseBox!.y)
    .toBeGreaterThanOrEqual(minimumResponseSplitterBox!.y + minimumResponseSplitterBox!.height - 1);
  await screenshotStep('向下拖动Response到160最小高 / Drag the Response to its 160px minimum');

  // Response中间与最大：340px位移对应340px高度变化，最大值为main高减固定行与请求区最小高。
  // Response middle and maximum: a 340px pointer move equals a 340px height change; the maximum subtracts the fixed rows and the minimum request height.
  await dragResponseTo(
    page,
    minimumResponseSplitterBox!.y + minimumResponseSplitterBox!.height / 2 - 340,
  );
  await expectPaneSize(page, response, 'height', MIN_RESPONSE_HEIGHT + 340, 'Response middle height');
  await dragResponseTo(page, 0);
  await expectPaneSize(page, response, 'height', maximumResponseHeight, 'Response maximum height');
  await dragResponseTo(page, 0);
  await expectPaneSize(page, response, 'height', maximumResponseHeight, 'Response maximum height after a second drag');
  const maximumResponseGeometry = await readGeometry(page);
  expect(maximumResponseGeometry.mainHeight).toBe(initialGeometry.mainHeight);
  expect(maximumResponseGeometry.responseHeight).toBeCloseTo(maximumResponseHeight, 0);
  await screenshotStep('向上拖动Response到最大 / Drag the Response to its maximum');

  // 窗口双向缩小：两个区域按新容器重新clamp；恢复窗口后保持clamp值、不自动扩张。
  // Shrink the real window in both axes: both panes re-clamp; restoring the window retains the clamped values without expanding.
  let shrunkGeometry: ComposerGeometry | null = null;
  let restoredGeometry: ComposerGeometry | null = null;
  try {
    const shrunkWindow = await desktopApp.resizeWindow(SHRUNK_WINDOW.width, SHRUNK_WINDOW.height);
    shrunkGeometry = await readGeometry(page);
    const shrunkCollectionMaximum = shrunkGeometry.mainWidth - MIN_WORK_WIDTH - SPLITTER_TRACK;
    const shrunkResponseMaximum = shrunkGeometry.mainHeight
      - DOCUMENT_TABS_HEIGHT
      - URL_BAR_HEIGHT
      - MIN_REQUEST_HEIGHT
      - SPLITTER_TRACK;
    await expectPaneSize(page, collection, 'width', shrunkCollectionMaximum, 'Collection width re-clamped after shrinking the window');
    await expectPaneSize(page, response, 'height', shrunkResponseMaximum, 'Response height re-clamped after shrinking the window');
    shrunkGeometry = await readGeometry(page);
    await screenshotStep('窗口缩到1200x700后两个区域重新clamp / Shrinking the window to 1200x700 re-clamps both panes');

    await desktopApp.resizeWindow(DEFAULT_WINDOW.width, DEFAULT_WINDOW.height);
    await expectPaneSize(page, collection, 'width', shrunkGeometry.collectionWidth, 'Collection width retained after restoring the window');
    await expectPaneSize(page, response, 'height', shrunkGeometry.responseHeight, 'Response height retained after restoring the window');
    restoredGeometry = await readGeometry(page);
    expect(restoredGeometry.mainWidth).toBe(initialGeometry.mainWidth);
    expect(restoredGeometry.mainHeight).toBe(initialGeometry.mainHeight);
    expect(shrunkWindow.width).toBe(SHRUNK_WINDOW.width);
    expect(shrunkWindow.height).toBe(SHRUNK_WINDOW.height);
    await screenshotStep('恢复1600x900后保持clamp值 / Restoring 1600x900 keeps the clamped values');
  } finally {
    const currentSize = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    if (
      Math.abs(currentSize.width - DEFAULT_WINDOW.width) > 2
      || Math.abs(currentSize.height - DEFAULT_WINDOW.height) > 2
    ) {
      await desktopApp.resizeWindow(DEFAULT_WINDOW.width, DEFAULT_WINDOW.height);
    }
  }

  // 回到初始尺寸：Collection 320、Response 368；两处均按当前clamp值继续可控。
  // Return to the initial sizes: Collection 320 and Response 368, both still controllable within their current clamps.
  const restoredSplitterBox = await collectionSplitter.boundingBox();
  if (!restoredSplitterBox) throw new Error('The Composer Collection splitter disappeared.');
  const clampedCollectionWidth = await readSize(page, collection, 'width');
  await dragCollectionTo(
    page,
    restoredSplitterBox.x
      + restoredSplitterBox.width / 2
      - (clampedCollectionWidth - COLLECTION_WIDTH),
  );
  await expectPaneSize(page, collection, 'width', COLLECTION_WIDTH, 'Collection width restored to 320');
  const responseBeforeRestore = await responseSplitter.boundingBox();
  if (!responseBeforeRestore) throw new Error('The Composer Response splitter disappeared.');
  await dragResponseTo(
    page,
    responseBeforeRestore.y
      + responseBeforeRestore.height / 2
      - (RESPONSE_HEIGHT - restoredGeometry!.responseHeight),
  );
  await expectPaneSize(page, response, 'height', RESPONSE_HEIGHT, 'Response height restored to 368');

  // tab与body mode：真实响应的四个tab与Pretty/Tree/Raw/Hex均可切换，控件不撑破布局。
  // Tabs and body modes: all four real response tabs and Pretty/Tree/Raw/Hex work without breaking the layout.
  const bodyView = getByAutomationId(page, AUTOMATION_IDS.composer.responseBody);
  const modeRadios = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseBodyMode,
  ).locator('..').getByRole('radio');
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
  await expect(bodyView).toContainText('composer-resize');
  await expect(modeRadios).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await modeRadios.nth(index).click();
    await expect(modeRadios.nth(index)).toHaveAttribute('aria-checked', 'true');
    await expect(bodyView).toBeVisible();
  }
  await modeRadios.nth(0).click();
  await screenshotStep('在最小尺寸恢复后切换响应正文档位 / Switch response body modes after restoring the initial sizes');

  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.headers).click();
  const responseHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseSection.responseHeaders,
  );
  await expect(responseHeaders).toBeVisible();
  const headersBodyId = await responseHeaders.getAttribute('aria-controls');
  expect(headersBodyId).toBeTruthy();
  const headersBody = page.locator(`[id="${headersBodyId}"]`);
  await expect(headersBody).toContainText('vvvv');
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.cookies).click();
  const responseCookies = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.responseSection.responseCookies,
  );
  const cookiesBodyId = await responseCookies.getAttribute('aria-controls');
  expect(cookiesBodyId).toBeTruthy();
  await expect(page.locator(`[id="${cookiesBodyId}"]`)).toContainText('resize-value');
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.timing).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.composer.responseSection.timing))
    .toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow).toEqual({ document: 0, body: 0 });
  await screenshotStep('查看响应Headers/Cookies/Timing且页面无横向溢出 / Inspect response Headers, Cookies and Timing without horizontal overflow');

  // 文档切换：新建第二个文档后切回第一个，response内容与document tab选择保持。
  // Document switch: create a second document, return to the first, and retain its response and selected tab.
  await getByAutomationId(page, AUTOMATION_IDS.composer.newRequest).click();
  const documents = getByAutomationId(
    page,
    AUTOMATION_IDS.composer.documentTabs,
  ).getByRole('tab');
  await expect(documents).toHaveCount(2);
  await expect(documents.nth(1)).toHaveAttribute('aria-selected', 'true');
  await documents.nth(0).click();
  await expect(documents.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(documents.nth(1)).toHaveAttribute('aria-selected', 'false');
  await getByAutomationId(page, AUTOMATION_IDS.composer.responseTab.body).click();
  await expect(bodyView).toContainText('composer-resize');
  await screenshotStep('切回第一个文档保留原响应 / Return to the first document and retain its response');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('composer-resize-state.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath,
    initialGeometry,
    collection: {
      minimum: MIN_COLLECTION_WIDTH,
      middle: MIN_COLLECTION_WIDTH + 340,
      maximum: maximumCollectionWidth,
    },
    response: {
      minimum: MIN_RESPONSE_HEIGHT,
      middle: MIN_RESPONSE_HEIGHT + 340,
      maximum: maximumResponseHeight,
    },
    shrunkWindow: shrunkGeometry,
    restoredWindow: restoredGeometry,
    bodyModes: await modeRadios.count(),
  }, null, 2), 'utf8');
  await testInfo.attach('composer-resize-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
