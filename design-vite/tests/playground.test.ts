import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({
    view: 'playground',
    playgroundSection: 'capture',
  }));
});

test('Capture Lab is the first page and MCP connection details stay on MCP', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  const navigation = playground.getByRole('navigation', { name: 'Playground' });

  await expect(navigation.getByRole('button')).toHaveText([/Capture Lab/, /MCP/]);
  await expect(page.locator('.app')).toHaveAttribute('data-playground-section', 'capture');
  await expect(playground.getByRole('code').filter({ hasText: '127.0.0.1:8888' })).toBeVisible();
  await expect(playground.getByText('MCP 2026-07-28')).toHaveCount(0);
  await expect(playground.getByRole('button', { name: 'Refresh tools' })).toHaveCount(0);
  await expect(playground.locator('[data-playground-scenario]')).toHaveCount(39);

  await navigation.getByRole('button', { name: /MCP/ }).click();

  await expect(page.locator('.app')).toHaveAttribute('data-playground-section', 'mcp');
  await expect(playground.getByText('MCP 2026-07-28')).toBeVisible();
  await expect(playground.getByRole('button', { name: 'Refresh tools' })).toBeVisible();
  await expect(playground.locator('[data-playground-tool]')).toHaveCount(42);
});

test('Capture request draft is editable and resets to the selected scenario default', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  const draft = playground.getByLabel('Request Draft JSON');

  await expect(draft).toContainText('/playground/h1-json');
  await expect(draft).toContainText('"kind": "http"');
  await expect(draft).toContainText('"protocol": "h1"');
  await draft.fill('{"method":"POST","path":"/edited/request"}');
  await expect(draft).toHaveValue('{"method":"POST","path":"/edited/request"}');

  await playground.getByRole('button', { name: 'Reset request' }).click();

  await expect(draft).toContainText('/playground/h1-json');
  await expect(draft).toContainText('"method": "GET"');
});

test('Capture protocol scenarios expose their native editable Draft fields', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  const draft = playground.getByLabel('Request Draft JSON');

  await playground.locator('[data-playground-scenario="ws-control"]').click();
  await expect(draft).toContainText('"kind": "websocket"');
  await expect(draft).toContainText('"controls"');

  await playground.locator('[data-playground-scenario="grpc-compressed"]').click();
  await expect(draft).toContainText('"kind": "grpc"');
  await expect(draft).toContainText('"compressed": true');
  await expect(playground.getByTestId('scenario-setup')).toContainText('Enable HTTPS decryption');

  await playground.locator('[data-playground-scenario="tls-passthrough"]').click();
  await expect(draft).toContainText('"kind": "tls"');
  await expect(draft).toContainText('"mode": "tunnel-only"');
  await expect(playground.getByTestId('scenario-setup')).toContainText('TLS passthrough');
});

test('Response Detail splitter expands the evidence pane and resets after reload', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  const detail = playground.locator('[data-playground-detail]');
  const splitter = playground.getByRole('separator', { name: 'Resize Response Detail' });
  const initialWidth = (await detail.boundingBox())?.width ?? 0;

  await splitter.dragTo(playground.locator('[data-playground-workbench]'), {
    targetPosition: { x: 420, y: 300 },
  });

  const expandedWidth = (await detail.boundingBox())?.width ?? 0;
  expect(expandedWidth).toBeGreaterThan(initialWidth + 80);

  const navigation = playground.getByRole('navigation', { name: 'Playground' });
  await navigation.getByRole('button', { name: /MCP/ }).click();
  expect((await detail.boundingBox())?.width ?? 0).toBeCloseTo(initialWidth, 0);
  await navigation.getByRole('button', { name: /Capture Lab/ }).click();
  expect((await detail.boundingBox())?.width ?? 0).toBeCloseTo(expandedWidth, 0);

  await page.reload();
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({ view: 'playground' }));
  const resetWidth = (await page.locator('[data-playground-detail]').boundingBox())?.width ?? 0;
  expect(resetWidth).toBeCloseTo(initialWidth, 0);
});

test('MCP change Tool and manual result controls remain available on the MCP page', async ({ page }) => {
  const playground = page.locator('[data-parity="acceptance-playground"]');
  await playground.getByRole('navigation', { name: 'Playground' })
    .getByRole('button', { name: /MCP/ })
    .click();
  await playground.locator('[data-playground-tool="capture_stop_recording"]').click();

  await expect(page.locator('.app')).toHaveAttribute('data-playground-call-state', 'approval');
  await expect(playground).toContainText('Waiting for approval in Interceptor');

  await playground.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-playground-manual-status', 'pass');
});