import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('capture.detail-body-fill uses the available Inspector height end to end', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.detail-body-fill',
  });

  // Arrange real captured traffic with enough request body lines to scroll.
  // 准备真实抓包流量，并提供足够多的请求正文行以产生滚动。
  await startRecording(desktopApp);
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/detail-body-fill');
  // 截图准备：保留分栏宽度，仅收起与正文滚动无关的facet值。
  // Screenshot preparation: retain pane widths and only collapse facet values unrelated to body scrolling.
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(desktopApp.page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  const requestBody = JSON.stringify({
    entries: Array.from({ length: 200 }, (_value, index) => ({
      index,
      value: `entry-${index}`,
    })),
  }, null, 2);
  await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: '/e2e/detail-body-fill',
    method: 'POST',
    body: requestBody,
  });

  // Open the response body through the same Inspector interaction users perform.
  // 通过用户使用的同一 Inspector 交互打开响应正文。
  const { page } = desktopApp;
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.tab.response,
  ).click();

  const scroll = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
  const bodyView = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyView);
  const bodyPane = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
  await expect(bodyView).toBeVisible();
  await expect(bodyPane).toBeVisible();
  await screenshotStep('打开Response正文 / Open the Response body', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
  });

  // Prove the response pane consumes the available Inspector height end to end.
  // 验证响应正文 pane 从头到尾占满 Inspector 的可用高度。
  const geometry = async () => {
    const [scrollBox, bodyViewBox, bodyPaneBox] = await Promise.all([
      scroll.boundingBox(),
      bodyView.boundingBox(),
      bodyPane.boundingBox(),
    ]);
    if (!scrollBox || !bodyViewBox || !bodyPaneBox) {
      return null;
    }
    return {
      scrollHeight: scrollBox.height,
      bodyViewHeight: bodyViewBox.height,
      bodyPaneHeight: bodyPaneBox.height,
      bottomInset: scrollBox.y + scrollBox.height - (bodyViewBox.y + bodyViewBox.height),
      paneBottomDelta:
        bodyViewBox.y + bodyViewBox.height - (bodyPaneBox.y + bodyPaneBox.height),
    };
  };

  await expect.poll(async () => (await geometry())?.bodyPaneHeight ?? 0).toBeGreaterThanOrEqual(320);
  const finalGeometry = await geometry();
  expect(finalGeometry).not.toBeNull();
  expect(finalGeometry!.bottomInset).toBeGreaterThanOrEqual(16);
  expect(finalGeometry!.bottomInset).toBeLessThanOrEqual(20);
  expect(Math.abs(finalGeometry!.paneBottomDelta)).toBeLessThan(1);

  // 窗口准备：Windows仅在滚动阶段缩小真实窗口，保留上面的默认尺寸布局验证。
  // Window setup: shrink the real Windows window only for scrolling, retaining the default-size geometry checks above.
  if (process.platform === 'win32') {
    const application = desktopApp.application;
    if (!application) throw new Error('The Windows driver did not expose its Electron application.');
    const browserWindowHandle = await application.browserWindow(page);
    try {
      await browserWindowHandle.evaluate(browserWindow => {
        const [width] = browserWindow.getContentSize();
        browserWindow.setContentSize(width, 800);
      });
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(800);
    } finally {
      await browserWindowHandle.dispose();
    }
  }

  // Scroll Monaco to its lower boundary, then prove the next wheel reaches Inspector.
  // 将 Monaco 滚到下边界，再验证下一次滚轮会交接给 Inspector。
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.tab.request,
  ).click();
  await expect(bodyPane).toBeVisible();
  await screenshotStep('打开含200条entries的Request正文 / Open the Request body with 200 entries', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request), label: '1' }],
  });
  await bodyPane.scrollIntoViewIfNeeded();
  const outerMaxScroll = await scroll.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(outerMaxScroll).toBeGreaterThan(1);
  await scroll.evaluate((element, maximum) => {
    element.scrollTop = maximum - Math.min(80, maximum / 2);
  }, outerMaxScroll);
  const paneBox = await bodyPane.boundingBox();
  expect(paneBox).not.toBeNull();
  await page.mouse.move(
    paneBox!.x + paneBox!.width / 2,
    Math.max(paneBox!.y + 12, 120),
  );
  const verticalScrollbar = bodyPane.locator('.scrollbar.vertical').first();
  const verticalSlider = verticalScrollbar.locator('.slider');
  await expect(verticalSlider).toBeVisible();
  const initialSliderBox = await verticalSlider.boundingBox();
  expect(initialSliderBox).not.toBeNull();
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await verticalSlider.boundingBox())?.y ?? 0)
    .toBeGreaterThan(initialSliderBox!.y);
  await screenshotStep('在请求正文内使用滚轮 / Use the wheel inside the request body', {
    highlights: [{ target: scroll, label: '1' }],
  });

  const [scrollbarBox, sliderBox] = await Promise.all([
    verticalScrollbar.boundingBox(),
    verticalSlider.boundingBox(),
  ]);
  expect(scrollbarBox).not.toBeNull();
  expect(sliderBox).not.toBeNull();
  await page.mouse.move(
    sliderBox!.x + sliderBox!.width / 2,
    sliderBox!.y + sliderBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sliderBox!.x + sliderBox!.width / 2,
    scrollbarBox!.y + scrollbarBox!.height - sliderBox!.height / 2,
  );
  await page.mouse.up();
  await expect.poll(async () => {
    const [track, slider] = await Promise.all([
      verticalScrollbar.boundingBox(),
      verticalSlider.boundingBox(),
    ]);
    return track && slider
      ? Math.abs(track.y + track.height - (slider.y + slider.height))
      : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(1);
  await screenshotStep('拖动正文滚动条到下边界 / Drag the body scrollbar to its lower boundary', {
    highlights: [{ target: scroll, label: '1' }],
  });

  const beforeOuterScroll = await scroll.evaluate((element) => element.scrollTop);
  await page.mouse.move(
    paneBox!.x + paneBox!.width / 2,
    Math.max(paneBox!.y + 12, 120),
  );
  await page.mouse.wheel(0, 300);
  await expect.poll(
    () => scroll.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(beforeOuterScroll);
  const afterOuterScroll = await scroll.evaluate((element) => element.scrollTop);
  await screenshotStep('正文到底后继续滚动Inspector / Continue scrolling the Inspector after the body reaches its end', {
    highlights: [{ target: scroll, label: '1' }],
  });

  // Retain geometry and both outer scroll positions as workflow evidence.
  // 保留几何数据和两次外层滚动位置作为 workflow 证据。
  await testInfo.attach('body-viewer-geometry.json', {
    body: Buffer.from(JSON.stringify({
      ...finalGeometry,
      scrollChaining: {
        beforeOuterScroll,
        afterOuterScroll,
      },
    }, null, 2)),
    contentType: 'application/json',
  });
});
