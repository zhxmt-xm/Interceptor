import { expect, test } from '@playwright/test';

async function setDesignState(
  page: import('@playwright/test').Page,
  state: Record<string, string>,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate((nextState) => window.__setState?.(nextState), state);
}

test('Capture detail sections expose independent collapse controls', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'http',
    tab: 'headers',
    breakpointState: '',
  });

  const general = page.getByRole('button', { name: 'General', exact: true });
  const responseHeaders = page.getByRole('button', { name: /Response Headers/ });

  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
});

test('Composer header sections expose independent collapse controls', async ({ page }) => {
  await setDesignState(page, {
    view: 'composer',
    composerTab: 'headers',
    composerResponseTab: 'headers',
  });

  const responseHeaders = page.getByRole('button', { name: /Response Headers/ });
  const requestHeaders = page.getByRole('button', { name: /Request Headers/ });

  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');
  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(requestHeaders).toHaveAttribute('aria-expanded', 'true');
});

test('Breakpoint submenu trigger aligns with the other Control menu items', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    breakpointState: '',
    requestMenu: 'open',
  });

  const rootMenu = page.locator('.ant-dropdown:visible').first();
  const block = rootMenu.locator('.ant-dropdown-menu-item .itemName').filter({ hasText: 'Block' });
  const breakpoint = rootMenu
    .locator('.ant-dropdown-menu-submenu-title .itemName')
    .filter({ hasText: 'Breakpoint' });

  await expect.poll(async () => {
    const blockBox = await block.boundingBox();
    const breakpointBox = await breakpoint.boundingBox();
    return blockBox && breakpointBox
      ? Math.abs(blockBox.x - breakpointBox.x)
      : Number.POSITIVE_INFINITY;
  }).toBeLessThan(1);
});

test('Capture response BodyViewer fills the remaining Inspector height', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'http',
    tab: 'response',
    bodyPreview: 'json',
    breakpointState: '',
  });

  const scroll = page.locator('.insp .scroll');
  const bodyViewer = page.locator('.insp .bodyview.grow:visible');
  const bodyPane = bodyViewer.locator('.bpane[data-pane="json"]');
  await expect(bodyViewer).toBeVisible();
  await expect(bodyPane).toHaveCSS('display', 'flex');

  const [scrollBox, bodyViewerBox, bodyPaneBox] = await Promise.all([
    scroll.boundingBox(),
    bodyViewer.boundingBox(),
    bodyPane.boundingBox(),
  ]);
  expect(scrollBox).not.toBeNull();
  expect(bodyViewerBox).not.toBeNull();
  expect(bodyPaneBox).not.toBeNull();
  expect(bodyPaneBox!.height).toBeGreaterThanOrEqual(320);
  expect(
    scrollBox!.y + scrollBox!.height - (bodyViewerBox!.y + bodyViewerBox!.height),
  ).toBeGreaterThanOrEqual(16);
  expect(
    scrollBox!.y + scrollBox!.height - (bodyViewerBox!.y + bodyViewerBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(Math.abs(
    bodyViewerBox!.y + bodyViewerBox!.height - (bodyPaneBox!.y + bodyPaneBox!.height),
  )).toBeLessThan(1);
});

test('Capture BodyViewer chains wheel scrolling to the Inspector at its boundary', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'http',
    tab: 'request',
    bodyPreview: 'json',
    breakpointState: '',
  });

  const scroll = page.locator('.insp .scroll');
  const bodyPane = page.locator(
    '.insp .tp[data-tab="request"] .bodyview.grow [data-monaco="fill"]',
  );
  await expect(bodyPane).toBeVisible();
  await page.addStyleTag({
    content: `
      .insp .tp[data-tab="request"] .bodyview.grow [data-monaco="fill"] {
        height: 80px !important;
        max-height: 80px !important;
        flex: 0 0 80px !important;
      }
    `,
  });
  const outerMaxScroll = await scroll.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(outerMaxScroll).toBeGreaterThan(20);
  await scroll.evaluate((element, maximum) => {
    const remaining = Math.min(80, maximum / 2);
    element.scrollTop = maximum - remaining;
  }, outerMaxScroll);
  const paneBox = await bodyPane.boundingBox();
  expect(paneBox).not.toBeNull();
  await page.mouse.move(
    paneBox!.x + paneBox!.width / 2,
    Math.max(paneBox!.y + 12, 120),
  );

  const outerBeforeInnerScroll = await scroll.evaluate((element) => element.scrollTop);
  const linesBeforeInnerScroll = (await bodyPane.locator('.view-line').allTextContents()).join('\n');
  await page.mouse.wheel(0, 100);
  await expect.poll(async () =>
    (await bodyPane.locator('.view-line').allTextContents()).join('\n'))
    .not.toBe(linesBeforeInnerScroll);
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(outerBeforeInnerScroll);

  await page.mouse.wheel(0, 5_000);
  const beforeOuterScroll = await scroll.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 300);
  await expect.poll(
    () => scroll.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(beforeOuterScroll);
});

test('Capture request body effect switches between Original and Final evidence', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'http',
    tab: 'request',
    breakpointState: '',
    bodyRuleEffect: 'request-text',
  });

  await expect(page.locator('.app')).toHaveAttribute(
    'data-body-rule-effect',
    'request-text',
  );
  const marker = page.getByRole('button', { name: 'Rule replaced', exact: true });
  const original = page.getByRole('radio', { name: 'Original' });
  const final = page.getByRole('radio', { name: 'Final' });
  await expect(marker).toBeVisible();
  await expect(final).toHaveAttribute('aria-checked', 'true');
  await original.click();
  await expect(original).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('"original"')).toBeVisible();
});

test('Capture response body effect exposes Final and disables unavailable Original', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'http',
    tab: 'response',
    breakpointState: '',
    bodyRuleEffect: 'response-file',
  });

  await expect(page.getByRole('button', {
    name: 'Rule replaced',
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Original' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Final' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText(
    'Original response body is unavailable for a headers-stage replacement.',
  )).toBeVisible();
});
