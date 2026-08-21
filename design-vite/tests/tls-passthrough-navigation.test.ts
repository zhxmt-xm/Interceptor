import { expect, test } from '@playwright/test';

async function showTunnel(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    detail: 'open',
    scene: 'tunnel',
    tab: 'tunnel',
    breakpointState: '',
    mitm: 'active',
    tlsPassthroughTargetHost: '',
    tlsPassthroughTargetPattern: '',
    tlsPassthroughTargetSequence: 0,
    tlsPassthroughTargetExpires: false,
  }));
}

test('TLS tunnel navigation opens and highlights the covering passthrough pattern', async ({ page }) => {
  await showTunnel(page);

  await page.locator('[data-parity="tls-tunnel-view-passthrough"]').click();

  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-view', 'settings');
  await expect(app).toHaveAttribute('data-settings', 'tls-passthrough');
  await expect(app).toHaveAttribute('data-tls-passthrough-target', '*.wvd.microsoft.com');
  await expect(page.locator('[data-parity="tls-passthrough-target-row"]'))
    .toHaveAttribute('data-highlighted', 'true');
});

test('TLS passthrough target highlight expires after three seconds', async ({ page }) => {
  await showTunnel(page);
  await page.locator('[data-parity="tls-tunnel-view-passthrough"]').click();
  await expect(page.locator('[data-parity="tls-passthrough-target-row"]')).toBeVisible();

  await expect(page.locator('.app')).not.toHaveAttribute(
    'data-tls-passthrough-target',
    /.+/,
    { timeout: 4_000 },
  );
  await expect(page.locator('[data-parity="tls-passthrough-target-row"]')).toHaveCount(0);
});