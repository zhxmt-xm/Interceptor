import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

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
  await screenshotStep('读取两个独立section的公共控件与正文关系，不依赖当前语言文案。 / Resolve two independent public section controls and bodies without localized text.');

  // 标题：公共最小高度一致，保留父行flex居中和内容自然增高。
  // Headings: share a minimum height while preserving flex alignment and natural content growth.
  await page.screenshot({ path: testInfo.outputPath('section-header-height.png') });
  for (const header of [general, responseHeaders]) {
    await expect(header).toHaveCSS('min-height', '36px');
    await expect(header).toHaveCSS('align-items', 'center');
  }

  const generalBodyId = await general.getAttribute('aria-controls');
  const responseHeadersBodyId = await responseHeaders.getAttribute('aria-controls');
  expect(generalBodyId).toBeTruthy();
  expect(responseHeadersBodyId).toBeTruthy();
  const generalBody = page.locator(`[id="${generalBodyId}"]`);
  const responseHeadersBody = page.locator(`[id="${responseHeadersBodyId}"]`);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);
  await screenshotStep('标题：公共最小高度一致，保留父行flex居中和内容自然增高。 / Headings: share a minimum height while preserving flex alignment and natural content growth.');

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
  await expect(general).toHaveCSS('min-height', '36px');
  await expect(responseHeaders).toHaveCSS('min-height', '36px');

  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(general).toHaveAttribute('aria-controls', generalBodyId!);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await screenshotStep('用户依次折叠两个section；每次只允许目标状态变化。 / Collapse each section in turn; each action may change only its target state.');

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

  // 核对真实flex行、固定文字列与弹性进度条，不以字形或自算矩形中心定义对齐。
  // Verify the flex row, fixed text columns and flexible bar without glyph or calculated-center assertions.
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing).click();
  const timingContentId = await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.timing,
  ).getAttribute('aria-controls');
  expect(timingContentId).toBeTruthy();
  const timingRows = page.locator(`[id="${timingContentId}"] > div:first-child > div`);
  await expect(timingRows).toHaveCount(2);
  await page.locator(`[id="${timingContentId}"] > div:first-child`).screenshot({
    path: testInfo.outputPath('timing-alignment.png'),
  });
  const timingTypography = await timingRows.evaluateAll((rows) => rows.map((row) => {
    const rowBounds = row.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    return {
      rowHeight: rowBounds.height,
      display: rowStyle.display,
      alignItems: rowStyle.alignItems,
      lineHeight: rowStyle.lineHeight,
      gap: rowStyle.gap,
      cells: [...row.children].map((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          text: element.textContent,
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          height: bounds.height,
          flexBasis: style.flexBasis,
          flexGrow: style.flexGrow,
          width: bounds.width,
        };
      }),
    };
  }));
  await testInfo.attach('timing-typography', {
    body: Buffer.from(JSON.stringify(timingTypography, null, 2)),
    contentType: 'application/json',
  });
  for (const row of timingTypography) {
    expect(row.display).toBe('flex');
    expect(row.alignItems).toBe('center');
    expect(row.lineHeight).toBe('normal');
    expect(row.gap).toBe('12px');
    expect(row.cells).toHaveLength(3);
    expect(row.cells[0]!.flexBasis).toBe('150px');
    expect(row.cells[1]!.flexBasis).toBe('58px');
    expect(row.cells[2]!.flexGrow).toBe('1');
    expect(row.cells[2]!.height).toBe(6);
    for (const cell of row.cells.slice(0, 2)) {
      expect(cell.text).toBeTruthy();
      expect(cell.fontSize).toBeGreaterThan(0);
    }
    for (const cell of row.cells) {
      expect(cell.height).toBeGreaterThan(0);
    }
  }
  await screenshotStep('核对真实flex行、固定文字列与弹性进度条，不以字形或自算矩形中心定义对齐。 / Verify the flex row, fixed text columns and flexible bar without glyph or calculated-center assertions.');
});