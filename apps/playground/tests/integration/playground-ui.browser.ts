import { expect, test, type Route } from '@playwright/test';

test('Capture Lab is first, owns its Header, and exposes all current scenarios', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Playground' });

  await expect(navigation.getByRole('button')).toHaveText([/Capture Lab/, /MCP/]);
  await expect(page.locator('main')).toHaveAttribute('data-section', 'capture');
  await expect(page.getByTestId('capture-proxy')).toHaveText('127.0.0.1:8888');
  await expect(page.getByText('MCP 2026-07-28')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh tools' })).toHaveCount(0);
  await expect(page.locator('[data-scenario-id]')).toHaveCount(39);

  await navigation.getByRole('button', { name: /MCP/ }).click();
  await expect(page.locator('main')).toHaveAttribute('data-section', 'mcp');
  await expect(page.getByText('MCP 2026-07-28')).toBeVisible();
  await expect(page.getByTestId('capture-proxy')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh tools' })).toBeVisible();
});

test('Request Draft edits and Response Detail width reset after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const draft = page.getByLabel('Request Draft JSON');
  await expect(draft).toContainText('/playground/h1-json');

  await draft.fill('{"kind":"http","method":"POST","path":"/edited","headers":{},"body":"","protocol":"h1"}');
  await page.getByRole('button', { name: 'Reset request' }).click();
  await expect(draft).toContainText('/playground/h1-json');

  const detail = page.locator('[data-response-detail]');
  const splitter = page.getByRole('separator', { name: 'Resize Response Detail' });
  const initialWidth = (await detail.boundingBox())?.width ?? 0;
  await splitter.dragTo(page.locator('[data-playground-workbench]'), {
    targetPosition: { x: 420, y: 300 },
  });
  expect((await detail.boundingBox())?.width ?? 0).toBeGreaterThan(initialWidth + 80);
  const captureWidth = (await detail.boundingBox())?.width ?? 0;

  const navigation = page.getByRole('navigation', { name: 'Playground' });
  await navigation.getByRole('button', { name: /MCP/ }).click();
  expect((await detail.boundingBox())?.width ?? 0).toBeCloseTo(initialWidth, 0);
  await navigation.getByRole('button', { name: /Capture Lab/ }).click();
  expect((await detail.boundingBox())?.width ?? 0).toBeCloseTo(captureWidth, 0);

  await page.reload();
  await expect(page.getByLabel('Request Draft JSON')).toContainText('/playground/h1-json');
  expect((await page.locator('[data-response-detail]').boundingBox())?.width ?? 0).toBeCloseTo(initialWidth, 0);
});

test('narrow windows keep Response Detail available through horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 760 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const app = page.locator('main');
  const dimensions = await app.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  await page.locator('[data-response-detail]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-response-detail]')).toBeVisible();
});

test('protocol scenarios load native editable Drafts', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const draft = page.getByLabel('Request Draft JSON');

  await page.locator('[data-scenario-id="ws-control"]').click();
  await expect(draft).toContainText('"kind": "websocket"');
  await expect(draft).toContainText('"controls"');

  await page.locator('[data-scenario-id="grpc-compressed"]').click();
  await expect(draft).toContainText('"kind": "grpc"');
  await expect(draft).toContainText('"compressed": true');
  await expect(page.getByTestId('scenario-setup')).toContainText('Enable HTTPS decryption');
  await expect(page.getByTestId('scenario-observations')).toContainText('compressed envelope');

  await page.locator('[data-scenario-id="tls-passthrough"]').click();
  await expect(draft).toContainText('"kind": "tls"');
  await expect(draft).toContainText('"mode": "tunnel-only"');
  await expect(page.getByTestId('scenario-setup')).toContainText('TLS passthrough');
  await expect(page.getByTestId('scenario-observations')).toContainText('opaque CONNECT');
});

test('a completed run cannot overwrite the scenario selected while it was pending', async ({ page }) => {
  let pendingRoute: Route | undefined;
  let notifyRequestStarted: (() => void) | undefined;
  const requestStarted = new Promise<void>((resolve) => {
    notifyRequestStarted = resolve;
  });
  await page.route('**/api/traffic/run', (route) => {
    pendingRoute = route;
    notifyRequestStarted?.();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-scenario-id="h1-stream"]').click();
  await page.locator('[data-playground-action="run"]').click();
  await requestStarted;

  await page.locator('[data-scenario-id="ws-text"]').click();
  if (pendingRoute === undefined) throw new Error('Traffic request was not intercepted.');
  await pendingRoute.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      attempt: { method: 'GET', path: '/playground/h1-stream', url: 'http://origin/playground/h1-stream' },
      durationMs: 80,
      protocol: 'http/1.1',
      request: null,
      response: { body: 'complete', bodyBytes: 8, bodyEncoding: 'utf8', chunkTimingsMs: [1, 40, 80], headers: {}, statusCode: 200 },
      scenarioId: 'h1-stream',
      startedAt: '2026-09-02T00:00:00.000Z',
      state: 'complete',
    }),
    status: 200,
  });

  await expect(page.getByLabel('Request Draft JSON')).toContainText('/playground/ws/text');
  await expect(page.locator('[data-traffic-state]')).toHaveCount(0);
});