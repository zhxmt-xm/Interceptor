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