import { access, readFile, writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { AUTOMATION_IDS, type AutomationId } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Contract values shared with CaptureMain and the design baseline. */
const DEFAULT_INSPECTOR_WIDTH = 448;
const MINIMUM_INSPECTOR_WIDTH = 360;
const MINIMUM_LIST_WIDTH = 512;
const SPLITTER_TRACK_WIDTH = 1;
const DEFAULT_WINDOW = { width: 1600, height: 900 } as const;

const INSPECTOR_TAB_SECTIONS: ReadonlyArray<{
  readonly tab: AutomationId;
  readonly section: AutomationId;
}> = [
  {
    tab: AUTOMATION_IDS.capture.inspector.tab.headers,
    section: AUTOMATION_IDS.capture.inspector.section.general,
  },
  {
    tab: AUTOMATION_IDS.capture.inspector.tab.request,
    section: AUTOMATION_IDS.capture.inspector.section.requestLine,
  },
  {
    tab: AUTOMATION_IDS.capture.inspector.tab.response,
    section: AUTOMATION_IDS.capture.inspector.section.responseBody,
  },
  {
    tab: AUTOMATION_IDS.capture.inspector.tab.timing,
    section: AUTOMATION_IDS.capture.inspector.section.timing,
  },
  {
    tab: AUTOMATION_IDS.capture.inspector.tab.cookies,
    section: AUTOMATION_IDS.capture.inspector.section.requestCookies,
  },
];

interface PaneGeometry {
  readonly mainWidth: number;
  readonly inspectorWidth: number;
  readonly listWidth: number;
  readonly splitterWidth: number;
}

/** Read the live Capture pane geometry from the real Renderer. */
async function readPaneGeometry(page: Page): Promise<PaneGeometry> {
  const [mainWidth, inspectorBox, listBox, splitterBox] = await Promise.all([
    getByAutomationId(page, AUTOMATION_IDS.app.main)
      .evaluate((element) => element.clientWidth),
    getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll).boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.capture.list).boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.capture.inspector.splitter).boundingBox(),
  ]);
  if (!inspectorBox || !listBox || !splitterBox) {
    throw new Error('The Capture list, splitter and Inspector are not laid out.');
  }
  return {
    mainWidth,
    inspectorWidth: inspectorBox.width,
    listWidth: listBox.width,
    splitterWidth: splitterBox.width,
  };
}

async function readInspectorWidth(page: Page): Promise<number> {
  const box = await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.scroll,
  ).boundingBox();
  if (!box) {
    throw new Error('The Inspector is not laid out.');
  }
  return box.width;
}

/** Require the live Inspector width to match one contract value within a sub-pixel. */
async function expectInspectorWidth(
  page: Page,
  expected: number,
  description: string,
): Promise<void> {
  await expect.poll(
    async () => Math.abs(await readInspectorWidth(page) - expected),
    { message: `The Inspector width did not reach ${expected}px (${description}).` },
  ).toBeLessThanOrEqual(1);
}

/** Drag the real Inspector splitter to an absolute viewport X coordinate. */
async function dragSplitterTo(page: Page, targetX: number): Promise<void> {
  const box = await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.splitter,
  ).boundingBox();
  if (!box) {
    throw new Error('The Inspector splitter disappeared.');
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

async function dragSplitterToEdge(
  page: Page,
  edge: 'left' | 'right',
): Promise<void> {
  const innerWidth = await page.evaluate(() => window.innerWidth);
  await dragSplitterTo(page, edge === 'left' ? 0 : innerWidth - 1);
}

/** Require one real control to stay horizontally inside the Inspector. */
async function expectInsideInspector(
  page: Page,
  target: Locator,
  description: string,
): Promise<void> {
  const [targetBox, inspectorBox] = await Promise.all([
    target.boundingBox(),
    getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll).boundingBox(),
  ]);
  expect(targetBox, `${description} has no bounding box.`).not.toBeNull();
  expect(inspectorBox, 'The Inspector has no bounding box.').not.toBeNull();
  expect(targetBox!.x, `${description} starts left of the Inspector.`)
    .toBeGreaterThanOrEqual(inspectorBox!.x - 1);
  expect(targetBox!.x + targetBox!.width, `${description} ends right of the Inspector.`)
    .toBeLessThanOrEqual(inspectorBox!.x + inspectorBox!.width + 1);
}

test('capture.inspector.resize clamps the Inspector splitter and re-clamps on window resize', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.inspector.resize',
  });
  desktopApp.configureWorkflowTimeout(testInfo, 150_000);
  const { page } = desktopApp;

  const splitter = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.splitter,
  );
  const inspector = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.scroll,
  );
  const main = getByAutomationId(page, AUTOMATION_IDS.app.main);
  const bodyView = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyView,
  );
  const bodyPane = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyPane,
  );

  // 准备：fresh profile真实启动；冷启动bootstrap自动接管系统代理并进入Recording，未选择请求时Inspector不存在。
  // Arrange: a fresh profile finished startup; cold bootstrap owns the system proxy and records, and no Inspector exists before selection.
  const recordingToggle = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.recordingToggle,
  );
  await expect(splitter).toHaveCount(0);
  await expect(inspector).toHaveCount(0);
  const initialMainWidth = await main.evaluate((element) => element.clientWidth);
  await screenshotStep('未选择请求时没有 Inspector / No Inspector before selecting a request');

  // 真实Recording与一条带长URL、POST正文的请求建立Inspector数据；未自动录像时走readiness Enable。
  // Real Recording plus one request with a long URL and POST body populate the Inspector; fall back to readiness Enable only when needed.
  await startRecording(desktopApp);
  await expect(recordingToggle).toHaveAttribute('aria-pressed', 'true');
  const requestPath = `/e2e/capture/inspector-resize?trace=${'x'.repeat(160)}`;
  const { row } = await CaptureWorkflowFixture.captureAndSelect(
    desktopApp,
    loopbackLab,
    { requestPath, method: 'POST', body: JSON.stringify({ entries: Array.from({ length: 40 }, (_, index) => index) }) },
  );
  await expect(row).toBeVisible();
  await expectInspectorWidth(page, DEFAULT_INSPECTOR_WIDTH, 'initial width');
  expect((await readPaneGeometry(page)).splitterWidth).toBeCloseTo(SPLITTER_TRACK_WIDTH, 1);
  await screenshotStep('选中请求后Inspector使用默认宽度448 / The selected request opens a 448px Inspector');

  // 收起筛选分栏，使可用宽度等于app.main；记录上限公式与初始几何。
  // Collapse the filter panel so the available width equals app.main; record the maximum formula and initial geometry.
  const filtersSplitter = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.filterPanelSplitter,
  );
  if (await filtersSplitter.count() > 0) {
    await getByAutomationId(page, AUTOMATION_IDS.capture.filtersToggle).click();
  }
  await expect(filtersSplitter).toHaveCount(0);
  const availableMainWidth = await main.evaluate((element) => element.clientWidth);
  expect(availableMainWidth).toBe(initialMainWidth);
  const maximumInspectorWidth = availableMainWidth - MINIMUM_LIST_WIDTH - SPLITTER_TRACK_WIDTH;
  expect(maximumInspectorWidth).toBeGreaterThan(MINIMUM_INSPECTOR_WIDTH);
  const initialGeometry = await readPaneGeometry(page);
  expect(initialGeometry.inspectorWidth).toBeCloseTo(DEFAULT_INSPECTOR_WIDTH, 0);
  expect(initialGeometry.listWidth).toBeGreaterThanOrEqual(MINIMUM_LIST_WIDTH);

  // 最小宽度：连续向右拖动只停在360，列表与Inspector不重叠。
  // Minimum width: repeated rightward drags stop at 360 and the list never overlaps the Inspector.
  await dragSplitterToEdge(page, 'right');
  await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH, 'minimum width');
  await dragSplitterToEdge(page, 'right');
  await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH, 'minimum width after a second drag');
  const minimumGeometry = await readPaneGeometry(page);
  expect(minimumGeometry.inspectorWidth).toBeCloseTo(MINIMUM_INSPECTOR_WIDTH, 0);
  expect(minimumGeometry.listWidth).toBeGreaterThanOrEqual(MINIMUM_LIST_WIDTH);
  await screenshotStep('拖动分栏把Inspector缩到最小360 / Drag the splitter to the 360px minimum');

  // 最小宽度下切换Response正文档位，正文控件必须留在Inspector内。
  // Switch Response body modes at the minimum width; body controls must stay inside the Inspector.
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(bodyView).toBeVisible({ timeout: 20_000 });
  for (const mode of ['tree', 'raw', 'hex', 'default'] as const) {
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode[mode]).click();
    await expect(bodyView).toBeVisible();
    await expectInsideInspector(page, bodyView, `body view in ${mode} mode`);
    if (mode === 'tree' || mode === 'hex') {
      await expect(bodyPane).toHaveCount(0);
    } else {
      await expect(bodyPane).toBeVisible();
      await expectInsideInspector(page, bodyPane, `body pane in ${mode} mode`);
    }
  }
  await screenshotStep('最小宽度下切换正文档位 / Switch body modes at the minimum width');

  // 中间宽度：pointer位移与宽度变化保持1:1。
  // Middle width: pointer displacement and width change stay 1:1.
  const middleTarget = MINIMUM_INSPECTOR_WIDTH + 340;
  const minimumSplitterBox = await splitter.boundingBox();
  if (!minimumSplitterBox) throw new Error('The Inspector splitter disappeared.');
  await dragSplitterTo(
    page,
    minimumSplitterBox.x + minimumSplitterBox.width / 2 - 340,
  );
  await expectInspectorWidth(page, middleTarget, 'middle width after a 340px drag');
  const middleGeometry = await readPaneGeometry(page);
  expect(Math.abs(middleGeometry.inspectorWidth - middleTarget)).toBeLessThanOrEqual(1);
  await screenshotStep('向左拖动340px得到中间宽度 / A 340px leftward drag yields the middle width');

  // 最大宽度：Inspector等于可用宽度减列表512与1px轨道，列表正好512。
  // Maximum width: the Inspector equals available width minus 512 and the 1px track, leaving a 512px list.
  await dragSplitterToEdge(page, 'left');
  await expectInspectorWidth(page, maximumInspectorWidth, 'maximum width');
  await dragSplitterToEdge(page, 'left');
  await expectInspectorWidth(page, maximumInspectorWidth, 'maximum width after a second drag');
  const maximumGeometry = await readPaneGeometry(page);
  expect(maximumGeometry.mainWidth).toBe(availableMainWidth);
  expect(maximumGeometry.inspectorWidth).toBeCloseTo(maximumInspectorWidth, 0);
  expect(Math.abs(maximumGeometry.listWidth - MINIMUM_LIST_WIDTH)).toBeLessThanOrEqual(1);
  await screenshotStep('拖动到Inspector最大宽度且列表保留512 / Drag to the maximum Inspector width with a 512px list');

  // 最大宽度下切换全部Inspector tab：目标section出现，tab互不重叠且完整位于Inspector内。
  // Switch every Inspector tab at the maximum width: each target section appears, tabs do not overlap and stay inside.
  const tabs = page.locator('[data-automation-id^="capture.inspector.tab."]');
  const readTabBoxes = (): Promise<Array<{
    id: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }>> => tabs.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      id: element.getAttribute('data-automation-id') ?? '',
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    };
  }));
  await expect(tabs).toHaveCount(6);
  const tabBoxes = await readTabBoxes();
  for (let left = 0; left < tabBoxes.length; left += 1) {
    for (let right = left + 1; right < tabBoxes.length; right += 1) {
      const first = tabBoxes[left]!;
      const second = tabBoxes[right]!;
      const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      expect(
        horizontalOverlap > 1 && verticalOverlap > 1,
        `${first.id} overlaps ${second.id}`,
      ).toBe(false);
    }
  }
  for (const { tab, section } of INSPECTOR_TAB_SECTIONS) {
    await getByAutomationId(page, tab).click();
    await expect(getByAutomationId(page, section)).toBeVisible();
    await expectInsideInspector(page, getByAutomationId(page, tab), `${tab} tab`);
  }
  await screenshotStep('在最大宽度下切换Headers/Request/Response/Timing/Cookies / Switch Headers, Request, Response, Timing and Cookies at the maximum width');

  // 页面溢出：文档、机身、Main与Inspector都不产生横向溢出。
  // Page overflow: document, body, Main and Inspector produce no horizontal overflow.
  const overflow = await page.evaluate(() => {
    const difference = (element: HTMLElement): number => element.scrollWidth - element.clientWidth;
    const mainElement = document.querySelector<HTMLElement>(
      '[data-automation-id="app.main"]',
    );
    const inspectorElement = document.querySelector<HTMLElement>(
      '[data-automation-id="capture.inspector.scroll"]',
    );
    if (!mainElement || !inspectorElement) {
      throw new Error('The Capture pane overflow could not be measured.');
    }
    return {
      document: difference(document.documentElement),
      body: difference(document.body),
      main: difference(mainElement),
      inspector: difference(inspectorElement),
    };
  });
  expect(overflow).toEqual({ document: 0, body: 0, main: 0, inspector: 0 });

  // 窗口缩小时按新容器重新clamp；低于下限保持360，恢复窗口后不自动扩张。
  // Shrinking the real window re-clamps to the new container; below the floor it stays 360 and never expands back automatically.
  const windowEvidence: Array<{ width: number; height: number; inspectorWidth: number; maximum: number }> = [];
  try {
    const resizedWindow = await desktopApp.resizeWindow(1200, DEFAULT_WINDOW.height);
    const resizedMainWidth = await main.evaluate((element) => element.clientWidth);
    const resizedMaximum = resizedMainWidth - MINIMUM_LIST_WIDTH - SPLITTER_TRACK_WIDTH;
    await expectInspectorWidth(page, resizedMaximum, 'width re-clamped after shrinking to 1200');
    windowEvidence.push({
      width: resizedWindow.width,
      height: resizedWindow.height,
      inspectorWidth: await readInspectorWidth(page),
      maximum: resizedMaximum,
    });
    await screenshotStep('窗口缩到1200后Inspector按新上限重新clamp / Shrinking the window to 1200 re-clamps the Inspector');

    const minimumWindow = await desktopApp.resizeWindow(880, DEFAULT_WINDOW.height);
    await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH, 'minimum width after shrinking to 880');
    windowEvidence.push({
      width: minimumWindow.width,
      height: minimumWindow.height,
      inspectorWidth: await readInspectorWidth(page),
      maximum: Math.max(
        MINIMUM_INSPECTOR_WIDTH,
        (await main.evaluate((element) => element.clientWidth)) - MINIMUM_LIST_WIDTH - SPLITTER_TRACK_WIDTH,
      ),
    });
    await screenshotStep('窗口缩到880时Inspector保持360下限 / Shrinking to 880 keeps the 360px floor');

    const restoredWindow = await desktopApp.resizeWindow(DEFAULT_WINDOW.width, DEFAULT_WINDOW.height);
    await expectInspectorWidth(page, MINIMUM_INSPECTOR_WIDTH, 'width retained after restoring the window');
    windowEvidence.push({
      width: restoredWindow.width,
      height: restoredWindow.height,
      inspectorWidth: await readInspectorWidth(page),
      maximum: (await main.evaluate((element) => element.clientWidth))
        - MINIMUM_LIST_WIDTH
        - SPLITTER_TRACK_WIDTH,
    });
    await screenshotStep('恢复1600窗口后Inspector不自动扩张 / Restoring the 1600px window does not expand the Inspector');
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

  // 恢复默认宽度并选择第二条真实请求：宽度、tab与响应正文仍可用。
  // Restore the default width and select a second real request: width, tabs and the response body remain usable.
  const currentSplitterBox = await splitter.boundingBox();
  if (!currentSplitterBox) throw new Error('The Inspector splitter disappeared.');
  await dragSplitterTo(
    page,
    currentSplitterBox.x
      + currentSplitterBox.width / 2
      - (DEFAULT_INSPECTOR_WIDTH - MINIMUM_INSPECTOR_WIDTH),
  );
  await expectInspectorWidth(page, DEFAULT_INSPECTOR_WIDTH, 'restored default width');
  const secondRequestPath = '/e2e/capture/inspector-resize/second';
  const { row: secondRow } = await CaptureWorkflowFixture.captureAndSelect(
    desktopApp,
    loopbackLab,
    { requestPath: secondRequestPath, method: 'PUT', body: '{"second":true}' },
  );
  await expect(secondRow).toBeVisible();
  await expectInspectorWidth(page, DEFAULT_INSPECTOR_WIDTH, 'width retained after selecting another request');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(bodyView).toBeVisible({ timeout: 20_000 });
  await expectInsideInspector(page, bodyView, 'body view for the second request');
  await screenshotStep('选择第二条请求后Inspector仍为448 / The Inspector stays 448px for the second request');

  // 通过产品UI交还系统代理，再核对启动快照；driver随后负责trace、Close和销毁断言。
  // Hand the system proxy back through product UI and compare against the startup snapshot; the driver owns trace, Close and teardown.
  const proxyJournal = JSON.parse(
    await readFile(desktopApp.systemProxyJournalPath(), 'utf8'),
  ) as { original: unknown };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
  expect(
    desktopApp.matchesSystemProxyEvidence(
      await desktopApp.readSystemProxySettings(),
      proxyJournal.original,
    ),
  ).toBe(true);
  await expect(access(desktopApp.systemProxyJournalPath())).rejects.toMatchObject({ code: 'ENOENT' });
  await screenshotStep('在Proxy点击Restore交还系统代理 / Restore the system proxy from Proxy settings');

  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('inspector-resize-state.json');
  await writeFile(evidencePath, JSON.stringify({
    requestPath,
    secondRequestPath,
    availableMainWidth,
    maximumInspectorWidth,
    initialGeometry,
    minimumGeometry,
    middleGeometry,
    maximumGeometry,
    tabBoxes,
    windowEvidence,
  }, null, 2), 'utf8');
  await testInfo.attach('inspector-resize-state.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
