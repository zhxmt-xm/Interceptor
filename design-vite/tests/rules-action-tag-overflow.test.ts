import { expect, test } from '@playwright/test';

test('Rules action tags collapse after two and expose the full ordered list', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({ view: 'rules' }));

  const rule = page.locator('.rrule').filter({ hasText: 'Dispute stub' });
  const inlineTags = rule.locator('.rchips > .rchip');
  const overflow = rule.getByRole('button', { name: 'Show all 4 actions' });

  await expect(inlineTags).toHaveCount(2);
  await expect(inlineTags).toHaveText(['Rewrite', 'Map Local']);
  await expect(overflow).toBeVisible();

  await overflow.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('.rchip')).toHaveText([
    'Rewrite',
    'Map Local',
    'Delay',
    'Breakpoint',
  ]);

  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await overflow.focus();
  await expect(tooltip).toBeVisible();
});