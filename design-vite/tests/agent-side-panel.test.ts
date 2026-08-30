import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'closed',
  }));
});

test('Agent panel opens beside the current workspace without covering it', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Agent' }).click();

  const app = page.locator('.app');
  const mainhost = page.locator('.mainhost');
  const panel = page.locator('[data-parity="agent-panel"]');
  await expect(app).toHaveAttribute('data-view', 'capture');
  await expect(app).toHaveAttribute('data-agent-panel', 'open');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Model provider connected' })).toBeVisible();
  const [mainhostBox, panelBox] = await Promise.all([
    mainhost.boundingBox(),
    panel.boundingBox(),
  ]);
  expect(mainhostBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.width).toBe(440);
  expect(mainhostBox!.x + mainhostBox!.width).toBeLessThanOrEqual(panelBox!.x);

  await panel.getByRole('button', { name: 'Close Agent' }).click();
  await expect(app).toHaveAttribute('data-view', 'capture');
  await expect(app).toHaveAttribute('data-agent-panel', 'closed');
  await expect(panel).toHaveCount(0);
});

test('Agent chat remains unchanged when the active workspace changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Agent' }).click();
  const panel = page.locator('[data-parity="agent-panel"]');
  await expect(panel).toContainText('Checkout failures');
  await expect(panel).toContainText('Help me diagnose repeated 401 responses');
  await expect(panel).not.toContainText('list_exchanges');

  await page.evaluate(() => window.__setState?.({ view: 'rules' }));

  await expect(page.locator('.app')).toHaveAttribute('data-view', 'rules');
  await expect(panel).toContainText('Checkout failures');
  await expect(panel).toContainText('Help me diagnose repeated 401 responses');
  await expect(panel).not.toContainText('Rewrite auth header');
});

test('Agent composer aligns the model select with visible context-window usage', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
  }));

  const modelSelect = page.locator('[data-parity="agent-model-select"]');
  const contextUsage = page.locator('[data-parity="agent-context-usage"]');
  await expect(contextUsage).toContainText('Context');
  await expect(contextUsage).toContainText('2.3%');
  await expect(contextUsage).toContainText('23k / 1M');
  const [modelBox, usageBox] = await Promise.all([
    modelSelect.boundingBox(),
    contextUsage.boundingBox(),
  ]);
  expect(modelBox).not.toBeNull();
  expect(usageBox).not.toBeNull();
  const modelCenter = modelBox!.y + modelBox!.height / 2;
  const usageCenter = usageBox!.y + usageBox!.height / 2;
  expect(Math.abs(modelCenter - usageCenter)).toBeLessThanOrEqual(1);
});

test('Agent session exposes an explicit Ask or Auto execution mode', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'ask',
  }));

  const mode = page.getByRole('radiogroup', { name: 'Tool execution mode' });
  await expect(mode.getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'true');
  await mode.getByRole('radio', { name: 'Auto' }).click();
  await expect(mode.getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'false');
  await expect(mode.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.app')).toHaveAttribute('data-agent-execution-mode', 'auto');
});

test('New Chat starts in Ask mode without the previous Tool result', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'auto',
    agentToolApproval: 'allowed',
  }));

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-agent-execution-mode', 'ask');
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toHaveCount(0);
});

test('Execution mode stays with its Chat when switching away and back', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentChat: 'checkout',
    agentExecutionMode: 'ask',
    agentCheckoutExecutionMode: 'ask',
  }));

  await page.getByRole('radiogroup', { name: 'Tool execution mode' })
    .getByRole('radio', { name: 'Auto' })
    .click();
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-agent-execution-mode', 'ask');
  await page.getByRole('button', { name: 'Select chat' }).click();
  await page.getByRole('option', { name: 'Checkout failures' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-agent-execution-mode', 'auto');
});

test('Pending Tool approval is isolated to its Chat and restored on return', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentChat: 'checkout',
    agentExecutionMode: 'ask',
    agentCheckoutExecutionMode: 'ask',
    agentToolApproval: 'pending',
    agentCheckoutToolApproval: 'pending',
  }));

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select chat' }).click();
  await page.getByRole('option', { name: 'Checkout failures' }).click();
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toContainText('stop_recording');
});

test('Ask mode keeps a change Tool pending until the user allows or denies it', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'ask',
    agentToolApproval: 'pending',
  }));

  const approval = page.locator('[data-parity="agent-tool-approval"]');
  await expect(approval).toContainText('stop_recording');
  await expect(approval).toContainText('Pause capture without stopping the proxy.');
  await expect(approval).toContainText('No parameters');
  await approval.getByRole('button', { name: 'Deny Tool' }).click();
  await expect(approval).toContainText('Denied');
  await expect(approval).toHaveAttribute('role', 'status');
  await expect(approval).toBeFocused();

  await page.evaluate(() => window.__setState?.({ agentToolApproval: 'pending' }));
  await approval.getByRole('button', { name: 'Allow Tool' }).click();
  await expect(approval).toContainText('Allowed');
  await expect(approval).toHaveAttribute('role', 'status');
  await expect(approval).toBeFocused();
});

test('Changing to Auto keeps an existing pending Tool available for a decision', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentExecutionMode: 'ask',
    agentToolApproval: 'pending',
  }));

  await page.getByRole('radiogroup', { name: 'Tool execution mode' })
    .getByRole('radio', { name: 'Auto' })
    .click();
  await expect(page.locator('.app')).toHaveAttribute('data-agent-execution-mode', 'auto');
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toContainText('stop_recording');
});

test('Pending Tool approval remains in the current Chat across workspace navigation', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentExecutionMode: 'ask',
    agentToolApproval: 'pending',
  }));

  const approval = page.locator('[data-parity="agent-tool-approval"]');
  await expect(approval).toContainText('stop_recording');
  await page.evaluate(() => window.__setState?.({ view: 'rules' }));
  await expect(page.locator('.app')).toHaveAttribute('data-view', 'rules');
  await expect(approval).toContainText('stop_recording');
});

test('Agent composer metrics fit when the panel contracts to 220px', async ({ page }) => {
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (app) {
      app.style.width = '880px';
      app.style.height = '560px';
    }
    window.__setState?.({
      view: 'capture',
      sidebar: 'expanded',
      agentPanel: 'open',
      agentProvider: 'configured',
    });
  });

  const panel = page.locator('[data-parity="agent-panel"]');
  const metrics = page.locator('[data-parity="agent-composer-metrics"]');
  const [panelBox, mainBox, overflow] = await Promise.all([
    panel.boundingBox(),
    page.locator('.mainhost').boundingBox(),
    metrics.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      childrenInside: [...element.children].every((child) => {
        const parentBox = element.getBoundingClientRect();
        const childBox = child.getBoundingClientRect();
        return childBox.left >= parentBox.left && childBox.right <= parentBox.right;
      }),
    })),
  ]);
  expect(panelBox?.width).toBe(220);
  expect(mainBox?.width).toBeGreaterThanOrEqual(440);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.childrenInside).toBe(true);
});

test('Agent Send action is vertically centered in the composer', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
  }));

  const [composerBox, sendBox] = await Promise.all([
    page.locator('[data-parity="agent-composer"]').boundingBox(),
    page.locator('[data-parity="agent-send"]').boundingBox(),
  ]);
  expect(composerBox).not.toBeNull();
  expect(sendBox).not.toBeNull();
  const composerCenter = composerBox!.y + composerBox!.height / 2;
  const sendCenter = sendBox!.y + sendBox!.height / 2;
  expect(Math.abs(composerCenter - sendCenter)).toBeLessThanOrEqual(1);
});

test('New Chat opens an empty composer and Send appends the drafted message', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentDefaultModel: 'qwen',
  }));

  await page.getByRole('button', { name: 'New chat' }).click();
  const panel = page.locator('[data-parity="agent-panel"]');
  const message = 'How should I retry an invalid_grant response?';
  await expect(panel).not.toContainText('Help me diagnose repeated 401 responses');
  await expect(page.locator('.app')).toHaveAttribute('data-agent-current-model', 'qwen');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Message', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(panel).toContainText(message);
  await expect(panel).toContainText('Treat invalid_grant as a credential failure');
});

test('Chat selector switches between an existing chat and a new chat', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
  }));

  const selector = page.getByRole('button', { name: 'Select chat' });
  await selector.click();
  await expect(selector).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option', { name: 'New chat' }).click();
  await expect(selector).toContainText('New chat');
  await selector.click();
  await page.getByRole('option', { name: 'Checkout failures' }).click();
  await expect(selector).toContainText('Checkout failures');
  await expect(page.locator('[data-parity="agent-panel"]')).toContainText('Help me diagnose repeated 401 responses');
});

test('Chat selector supports keyboard navigation and Escape restores trigger focus', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentChat: 'checkout',
    agentChatMenu: '',
  }));

  const selector = page.getByRole('button', { name: 'Select chat' });
  await selector.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: 'Checkout failures' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'New chat' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-parity="agent-chat-menu"]')).toHaveCount(0);
  await expect(selector).toBeFocused();
});

test('Current chat can be renamed and deleted through explicit commands', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
  }));

  const selector = page.getByRole('button', { name: 'Select chat' });
  await selector.click();
  await page.getByRole('button', { name: 'Rename current chat' }).click();
  await page.getByRole('textbox', { name: 'Chat title' }).fill('Token refresh failures');
  await page.getByRole('button', { name: 'Save chat title' }).click();
  await expect(selector).toContainText('Token refresh failures');

  await selector.click();
  await page.getByRole('button', { name: 'Delete current chat' }).click();
  await page.getByRole('button', { name: 'Confirm delete chat' }).click();
  await expect(selector).toContainText('New chat');
  await expect(page.locator('[data-parity="agent-panel"]')).not.toContainText('Help me diagnose repeated 401 responses');
});

test('Delete chat dialog traps focus and restores the chat selector', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
  }));

  const selector = page.getByRole('button', { name: 'Select chat' });
  await selector.click();
  await page.getByRole('button', { name: 'Delete current chat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete chat?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm delete chat' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(selector).toBeFocused();
});

test('Running turn can be stopped and retried without losing visible output', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentChat: 'new',
  }));
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Explain invalid_grant.');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.locator('[data-parity="agent-panel"]')).toContainText('Response stopped');
  await expect(page.locator('[data-parity="agent-panel"]')).toContainText('Explain invalid_grant.');
  await page.getByRole('button', { name: 'Retry response' }).click();
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
});

test('Failed turn exposes Retry and expandable Session usage', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentChat: 'sent',
    agentMessage: 'Summarize the authentication failure.',
    agentTurnState: 'failed',
  }));

  const panel = page.locator('[data-parity="agent-panel"]');
  await expect(panel).toContainText('Model request failed');
  await expect(page.getByRole('button', { name: 'Retry response' })).toBeVisible();
  await page.getByRole('button', { name: 'Session usage' }).click();
  await expect(panel).toContainText('47.2k tokens');
  await expect(panel).toContainText('73.1% cache hit');
});