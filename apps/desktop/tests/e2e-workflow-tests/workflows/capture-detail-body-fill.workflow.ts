import { AUTOMATION_IDS } from '../../../src/shared/automation-ids';
import { getByAutomationId } from '../fixtures/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../fixtures/capture-workflow';
import { expect, test } from '../fixtures/local-electron-driver';

test('capture.detail-body-fill uses the available Inspector height end to end', async ({
  desktopApp,
  loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.detail-body-fill',
  });

  await startRecording(desktopApp);
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

  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.tab.request,
  ).click();
  await expect(bodyPane).toBeVisible();
  await bodyPane.scrollIntoViewIfNeeded();
  await scroll.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 80);
  });
  const paneBox = await bodyPane.boundingBox();
  expect(paneBox).not.toBeNull();
  await page.mouse.move(
    paneBox!.x + paneBox!.width / 2,
    Math.max(paneBox!.y + 12, 120),
  );
  await page.mouse.wheel(0, 5_000);
  const beforeOuterScroll = await scroll.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 300);
  await expect.poll(
    () => scroll.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(beforeOuterScroll);
  const afterOuterScroll = await scroll.evaluate((element) => element.scrollTop);

  await testInfo.attach('body-viewer-geometry', {
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
