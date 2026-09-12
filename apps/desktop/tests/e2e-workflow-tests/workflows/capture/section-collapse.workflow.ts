import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

test('capture.inspector.section-collapse keeps sections independent and accessible', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.inspector.section-collapse',
  });

  const { page } = desktopApp;

  // 启动真实Recording并经8888捕获一条loopback请求，建立Inspector测试数据。
  // Start real Recording and capture one loopback request through 8888 to arrange Inspector data.
  await startRecording(desktopApp);
  await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: '/e2e/capture/section-collapse',
  });

  // 读取两个独立section的公共控件与正文关系，不依赖当前语言文案。
  // Resolve two independent public section controls and bodies without localized text.
  const general = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.general,
  );
  const responseHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.responseHeaders,
  );

  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');

  const generalBodyId = await general.getAttribute('aria-controls');
  const responseHeadersBodyId = await responseHeaders.getAttribute('aria-controls');
  expect(generalBodyId).toBeTruthy();
  expect(responseHeadersBodyId).toBeTruthy();
  const generalBody = page.locator(`[id="${generalBodyId}"]`);
  const responseHeadersBody = page.locator(`[id="${responseHeadersBodyId}"]`);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);

  // 用户依次折叠两个section；每次只允许目标状态变化。
  // Collapse each section in turn; each action may change only its target state.
  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await expect(generalBody).toHaveJSProperty('hidden', true);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);

  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await expect(general).toHaveAttribute('aria-expanded', 'false');

  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(general).toHaveAttribute('aria-controls', generalBodyId!);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);

  // 保存最终ARIA与正文状态；driver随后负责trace、正常Close和销毁验证。
  // Save final ARIA and body state; the driver then owns trace, graceful Close, and teardown verification.
  await testInfo.attach('section-collapse-state', {
    body: Buffer.from(JSON.stringify({
      general: {
        controls: generalBodyId,
        expanded: await general.getAttribute('aria-expanded'),
        hidden: await generalBody.getAttribute('hidden') !== null,
      },
      responseHeaders: {
        controls: responseHeadersBodyId,
        expanded: await responseHeaders.getAttribute('aria-expanded'),
        hidden: await responseHeadersBody.getAttribute('hidden') !== null,
      },
    }, null, 2)),
    contentType: 'application/json',
  });

  // 核对同排文字单元格与进度条居中，不把字体token值当成对齐结果。
  // Check centered timing cells and bars without treating a font token value as alignment evidence.
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing).click();
  const timingContentId = await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.timing,
  ).getAttribute('aria-controls');
  expect(timingContentId).toBeTruthy();
  const timingRows = page.locator(`[id="${timingContentId}"] > div:first-child > div`);
  await expect(timingRows).toHaveCount(2);
  const timingTypography = await timingRows.evaluateAll((rows) => rows.map((row) => {
    const rowBounds = row.getBoundingClientRect();
    const center = rowBounds.y + rowBounds.height / 2;
    return {
      rowHeight: rowBounds.height,
      alignItems: getComputedStyle(row).alignItems,
      pixelRatio: window.devicePixelRatio,
      cells: [...row.children].map((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          text: element.textContent,
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          height: bounds.height,
          centerDelta: bounds.y + bounds.height / 2 - center,
        };
      }),
    };
  }));
  await testInfo.attach('timing-typography', {
    body: Buffer.from(JSON.stringify(timingTypography, null, 2)),
    contentType: 'application/json',
  });
  for (const row of timingTypography) {
    expect(row.alignItems).toBe('center');
    expect(row.cells).toHaveLength(3);
    for (const cell of row.cells.slice(0, 2)) {
      expect(cell.text).toBeTruthy();
      expect(cell.fontSize).toBeGreaterThan(0);
    }
    for (const cell of row.cells) {
      expect(cell.height).toBeGreaterThan(0);
      expect(Math.abs(cell.centerDelta)).toBeLessThanOrEqual(1 / row.pixelRatio);
    }
  }
  await page.locator(`[id="${timingContentId}"] > div:first-child`).screenshot({
    path: testInfo.outputPath('timing-alignment.png'),
  });
});