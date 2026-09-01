import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({ view: 'playground' }));
});

test('Playground exposes the complete current Tool catalog and manual result controls', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  await expect(playground.locator('[data-playground-tool]')).toHaveCount(24);
  await expect(playground.getByText('MCP 2026-07-28')).toBeVisible();

  await playground.locator('[data-playground-tool="stop_recording"]').click();
  await expect(page.locator('.app')).toHaveAttribute('data-playground-call-state', 'approval');
  await expect(playground).toContainText('Waiting for approval in Interceptor');

  await playground.getByRole('button', { name: 'Pass' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-playground-manual-status', 'pass');
});

test('Playground switches to the manually operated Traffic Lab', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  await playground.getByRole('button', { name: 'Traffic Lab' }).click();

  await expect(page.locator('.app')).toHaveAttribute('data-playground-section', 'traffic');
  await expect(playground.locator('[data-playground-scenario]')).toHaveCount(4);
  await expect(playground.getByRole('button', { name: /Run through/ })).toBeVisible();
});