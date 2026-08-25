import { expect, test } from '@playwright/test';

async function setDesignState(
  page: import('@playwright/test').Page,
  state: Record<string, unknown>,
): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate((nextState) => window.__setState?.(nextState), state);
}

test('only the selected logical queue head is editable', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    breakpointState: 'queue',
    breakpointQueueSelection: 'http-head',
  });

  const head = page.locator('[data-breakpoint-id="bp-http-request"]');
  const queued = page.locator('[data-breakpoint-id="bp-http-queued"]');

  await expect(head).toHaveAttribute('data-queue-key', 'http');
  await expect(head).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(queued).toHaveAttribute('data-queue-key', 'http');
  await expect(queued).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(page.locator('[data-breakpoint-component="content"]')).toBeVisible();

  await queued.click();

  await expect(page.locator('.app')).toHaveAttribute('data-breakpoint-queue-selection', 'http-queued');
  await expect(page.getByText('Queued', { exact: true })).toBeVisible();
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible();
  await expect(page.locator('[data-breakpoint-component="content"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Forward edited' })).toHaveCount(0);

  await head.click();

  await expect(page.locator('.app')).toHaveAttribute('data-breakpoint-queue-selection', 'http-head');
  await expect(page.locator('[data-breakpoint-component="content"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue actions' })).toBeVisible();
});

test('queue actions expose three explicit batch intentions', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    breakpointState: 'queue',
    breakpointQueueSelection: 'http-head',
  });

  await page.getByRole('button', { name: 'Queue actions' }).click();

  const menu = page.getByRole('menu', { name: 'Queue actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Continue all', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Drop all', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Continue all from this rule', exact: true })).toBeVisible();
});

test('WebSocket frames in one connection expose one editable head and queued followers', async ({ page }) => {
  await setDesignState(page, {
    view: 'capture',
    detail: 'open',
    scene: 'websocket',
    tab: 'messages',
    breakpointState: 'websocket',
    breakpointQueueSelection: 'websocket-head',
    websocketBreakpoint: 'enabled',
  });

  const head = page.locator('[data-breakpoint-id="bp-ws-head"]');
  const queued = page.locator('[data-breakpoint-id="bp-ws-queued"]');
  await expect(head).toHaveAttribute('data-queue-key', 'ws:ws-fixture');
  await expect(head).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(queued).toHaveAttribute('data-queue-position', '2');
  await expect(queued).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(page.getByRole('button', { name: 'Forward edited' })).toBeVisible();
  await page.getByRole('button', { name: 'Queue actions' }).click();
  const menu = page.getByRole('menu', { name: 'Queue actions' });
  await expect(menu.getByRole('menuitem', { name: 'Continue all', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Drop all', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Continue all from this rule' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await queued.click();

  await expect(page.locator('.app')).toHaveAttribute(
    'data-breakpoint-queue-selection',
    'websocket-queued',
  );
  await expect(page.locator('[data-parity="websocket-breakpoint-queued"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forward edited' })).toHaveCount(0);

  await head.click();

  await expect(page.locator('.app')).toHaveAttribute(
    'data-breakpoint-queue-selection',
    'websocket-head',
  );
  await expect(page.getByRole('button', { name: 'Forward edited' })).toBeVisible();
});
