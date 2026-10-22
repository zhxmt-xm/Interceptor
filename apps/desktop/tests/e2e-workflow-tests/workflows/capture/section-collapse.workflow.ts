import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
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
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/e2e/capture/section-collapse');
  // 截图准备：Header折叠不依赖facet，正常收起其全量选项。
  // Screenshot preparation: Header collapsing does not depend on facets, so collapse their full-recording options normally.
  for (const facet of CAPTURE_FACET_IDS) {
    const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
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
  await screenshotStep('查看展开的General与Response Headers / Inspect expanded General and Response Headers', {
    highlights: [{ target: general, label: '1' }],
  });

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
  await screenshotStep('折叠General，Response Headers保持展开 / Collapse General while keeping Response Headers expanded', {
    highlights: [{ target: general, label: '1' }],
  });

  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await expect(general).toHaveCSS('min-height', '36px');
  await expect(responseHeaders).toHaveCSS('min-height', '36px');
  await screenshotStep('再折叠Response Headers / Collapse Response Headers too', {
    highlights: [{ target: responseHeaders, label: '1' }],
  });

  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(general).toHaveAttribute('aria-controls', generalBodyId!);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await screenshotStep('重新展开General，不改变Response Headers / Reopen General without changing Response Headers', {
    highlights: [{ target: general, label: '1' }],
  });

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
  await screenshotStep('打开Timing查看本次请求时序 / Open Timing for this request', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.timing), label: '1' }],
  });

  // Query：保留原请求及前述布局断言，追加同源请求检查重复参数与真实解码。
  // Query: retain the original request and layout assertions, then capture another same-origin request with repeated and encoded parameters.
  const queryPath = '/e2e/capture/section-collapse/query';
  const queryRequestPath = `${queryPath}?orderId=ord_42&tag=books&tag=featured&message=hello%20capture`;
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(queryPath);
  const { row: queryRow } = await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: queryRequestPath,
  });
  const queryRowId = await queryRow.getAttribute('data-automation-id');
  expect(queryRowId).toBeTruthy();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  const queryParameters = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.section.queryParameters);
  await expect(queryParameters).toHaveAttribute('aria-expanded', 'true');
  await expect(queryParameters.locator(':scope > span').last()).toHaveText('4');
  const queryContentId = await queryParameters.getAttribute('aria-controls');
  expect(queryContentId).toBeTruthy();
  const queryContent = page.locator(`[id="${queryContentId}"]`);
  await expect(queryContent).toHaveJSProperty('hidden', false);
  for (const value of ['orderId', 'ord_42', 'books', 'featured', 'hello capture']) {
    await expect(queryContent).toContainText(value);
  }
  await expect(queryContent.getByText('tag', { exact: true })).toHaveCount(2);
  await screenshotStep('在Request检查Query的重复参数与空格解码 / Inspect repeated Query parameters and decoded spaces in Request', {
    highlights: [{ target: queryParameters, label: '1' }],
  });
  await queryParameters.click();
  await expect(queryParameters).toHaveAttribute('aria-expanded', 'false');
  await expect(queryContent).toHaveJSProperty('hidden', true);
  await screenshotStep('折叠Query Parameters / Collapse Query Parameters', {
    highlights: [{ target: queryParameters, label: '1' }],
  });
  await queryParameters.click();
  await expect(queryParameters).toHaveAttribute('aria-expanded', 'true');
  await expect(queryContent).toHaveJSProperty('hidden', false);
  await expect(queryContent.getByText('tag', { exact: true })).toHaveCount(2);
  await expect(queryContent).toContainText('hello capture');
  await expect(queryRow).toHaveAttribute('data-automation-id', queryRowId!);
  await screenshotStep('重新展开同一请求的Query Parameters / Reopen Query Parameters for the same request', {
    highlights: [{ target: queryParameters, label: '1' }],
  });

  // 分栏：真实拖动列表与Inspector之间的轨道，最后用同一UI恢复原宽度。
  // Split panes: drag the real list/Inspector divider and restore its original width through the same UI.
  const splitter = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.splitter);
  const inspector = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.scroll);
  const initialSplitter = await splitter.boundingBox();
  const initialInspector = await inspector.boundingBox();
  if (!initialSplitter || !initialInspector) throw new Error('The Inspector divider is not visible.');
  const initialX = initialSplitter.x + initialSplitter.width / 2;
  const dragInspectorSplitter = async (targetX: number): Promise<void> => {
    const bounds = await splitter.boundingBox();
    if (!bounds) throw new Error('The Inspector divider disappeared.');
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(bounds.x + bounds.width / 2, y);
    await page.mouse.down();
    try {
      await page.mouse.move(targetX, y, { steps: 12 });
    } finally {
      await page.mouse.up();
    }
  };
  let widenedWidth: number | undefined;
  try {
    await dragInspectorSplitter(initialX - 120);
    await expect.poll(async () => (await inspector.boundingBox())?.width).toBeGreaterThan(initialInspector.width);
    widenedWidth = (await inspector.boundingBox())?.width;
    await expect(queryContent.getByText('tag', { exact: true })).toHaveCount(2);
    await expect(queryContent).toContainText('hello capture');
    await expect(queryRow).toHaveAttribute('data-automation-id', queryRowId!);
    await screenshotStep('向左拖动分栏，扩大Inspector / Drag the divider left to widen the Inspector', {
      highlights: [{ target: splitter, label: '1' }],
    });
  } finally {
    await dragInspectorSplitter(initialX);
    await expect.poll(async () => (await inspector.boundingBox())?.width).toBe(initialInspector.width);
  }
  await expect(queryContent).toContainText('hello capture');
  await expect(queryRow).toHaveAttribute('data-automation-id', queryRowId!);
  await screenshotStep('恢复Inspector原宽度，保留同一Query请求 / Restore the Inspector width while retaining the same Query request', {
    highlights: [{ target: splitter, label: '1' }],
  });
  await testInfo.attach('query-and-inspector-resize.json', {
    body: Buffer.from(JSON.stringify({
      requestPath: queryRequestPath,
      row: queryRowId,
      queryCount: 4,
      originalWidth: initialInspector.width,
      widenedWidth,
      restoredWidth: (await inspector.boundingBox())?.width,
    }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
});