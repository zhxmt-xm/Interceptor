import { expect, test } from '@playwright/test';

async function setCaptureState(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    breakpointState: '',
  }));
}

test('loading facet options are permanent and last in every applicable group', async ({ page }) => {
  await setCaptureState(page);

  for (const facet of ['application', 'status', 'type']) {
    const lastOption = page.locator(`[data-grp="${facet}"] .fitem`).last();
    const text = (await lastOption.innerText()).trim();
    expect(text.startsWith('Pending'), `${facet} must end with Pending`).toBe(true);
  }
});
