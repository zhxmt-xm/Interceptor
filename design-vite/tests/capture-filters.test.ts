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

test('selecting a facet option keeps its manually expanded group open', async ({ page }) => {
  await setCaptureState(page);

  const methodGroup = page.locator('[data-grp="method"]');
  await methodGroup.locator('.fgrp-toggle').click();
  await expect(methodGroup).toHaveClass(/\bon\b/);

  const postOption = methodGroup.locator('.fitem').filter({ hasText: 'POST' });
  await postOption.click();

  await expect(methodGroup).toHaveClass(/\bon\b/);
  await expect(postOption).toHaveClass(/\bon\b/);

  await postOption.click();

  await expect(methodGroup).toHaveClass(/\bon\b/);
  await expect(postOption).not.toHaveClass(/\bon\b/);
});
