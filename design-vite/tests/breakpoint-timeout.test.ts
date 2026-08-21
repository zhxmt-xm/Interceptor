import { expect, test } from '@playwright/test';

async function setDesignState(
  page: import('@playwright/test').Page,
  state: Record<string, unknown>,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate((nextState) => window.__setState?.(nextState), state);
}

async function selectVisibleOption(
  page: import('@playwright/test').Page,
  label: string,
): Promise<void> {
  await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click();
}

test('HTTP breakpoint timeout select supports no timeout, presets, and custom seconds', async ({ page }) => {
  await setDesignState(page, {
    view: 'rules',
    ruleBreakpointTimeout: 'none',
  });

  const action = page.locator('[data-parity="rule-breakpoint-timeout-action"]');
  const timeout = page.getByRole('combobox', { name: 'Timeout', exact: true });
  await expect(action.getByText('No timeout', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'On timeout' })).toHaveCount(0);

  await timeout.click();
  await selectVisibleOption(page, '30 seconds');

  await expect(page.locator('.app')).toHaveAttribute('data-rule-breakpoint-timeout', '30');
  await expect(page.getByRole('combobox', { name: 'On timeout' })).toBeVisible();

  await timeout.click();
  await selectVisibleOption(page, 'Custom…');
  const seconds = page.getByRole('spinbutton', { name: 'Timeout seconds' });
  await expect(seconds).toBeVisible();
  await seconds.fill('0');
  await seconds.blur();
  await expect(action.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await seconds.fill('-2');
  await seconds.blur();
  await expect(action.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await seconds.fill('1.5');
  await seconds.blur();
  await expect(action.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await seconds.fill('');
  await seconds.blur();
  await expect(action.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await seconds.fill('7');
  await seconds.blur();
  await expect(page.locator('.app')).toHaveAttribute('data-rule-breakpoint-custom-seconds', '7');
  await expect(action.getByRole('alert')).toHaveCount(0);

  await timeout.click();
  await selectVisibleOption(page, 'No timeout');
  await expect(seconds).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'On timeout' })).toHaveCount(0);
});

test('WebSocket breakpoint timeout select supports no timeout, presets, and custom seconds', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'websocket',
    tab: 'messages',
    breakpointState: '',
    websocketBreakpoint: 'setup',
    websocketBreakpointTimeout: 'none',
  });

  const setup = page.locator('[data-parity="websocket-breakpoint-setup"]');
  const timeout = setup.getByRole('combobox', { name: 'Timeout', exact: true });
  await expect(setup.getByText('No timeout', { exact: true })).toBeVisible();

  await timeout.click();
  await selectVisibleOption(page, '30 seconds');

  await expect(page.locator('.app')).toHaveAttribute('data-websocket-breakpoint-timeout', '30');
  await expect(setup.locator('.ant-select-content[title="30 seconds"]')).toBeVisible();

  await timeout.click();
  await selectVisibleOption(page, 'Custom…');
  const seconds = setup.getByRole('spinbutton', { name: 'Timeout seconds' });
  const enable = setup.getByRole('button', { name: 'Enable breakpoint' });
  await expect(seconds).toBeVisible();
  await seconds.fill('0');
  await seconds.blur();
  await expect(setup.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await expect(enable).toBeDisabled();
  await seconds.fill('1.5');
  await seconds.blur();
  await expect(setup.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await expect(enable).toBeDisabled();
  await seconds.fill('');
  await seconds.blur();
  await expect(setup.getByRole('alert')).toHaveText('Enter a positive whole number of seconds.');
  await expect(enable).toBeDisabled();
  await seconds.fill('7');
  await seconds.blur();
  await expect(page.locator('.app')).toHaveAttribute('data-websocket-breakpoint-custom-seconds', '7');
  await expect(setup.getByRole('alert')).toHaveCount(0);
  await expect(enable).toBeEnabled();
});
