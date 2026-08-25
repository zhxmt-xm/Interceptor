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

  const referenceTag = page.locator('.rrule').filter({ hasText: 'Refund stub' }).locator('.rchip');
  const [referenceBox, firstTagBox, secondTagBox, overflowBox] = await Promise.all([
    referenceTag.boundingBox(),
    inlineTags.nth(0).boundingBox(),
    inlineTags.nth(1).boundingBox(),
    overflow.boundingBox(),
  ]);
  expect(referenceBox).not.toBeNull();
  expect(firstTagBox).not.toBeNull();
  expect(secondTagBox).not.toBeNull();
  expect(overflowBox).not.toBeNull();
  expect(firstTagBox!.height).toBeCloseTo(referenceBox!.height, 1);
  expect(secondTagBox!.height).toBeCloseTo(referenceBox!.height, 1);
  const overflowCenter = overflowBox!.y + overflowBox!.height / 2;
  expect(Math.abs(firstTagBox!.y + firstTagBox!.height / 2 - overflowCenter)).toBeLessThan(0.5);
  expect(Math.abs(secondTagBox!.y + secondTagBox!.height / 2 - overflowCenter)).toBeLessThan(0.5);

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