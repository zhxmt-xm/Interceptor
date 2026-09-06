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
  await expect(panel).not.toContainText('capture_list_exchanges');

  await page.evaluate(() => window.__setState?.({ view: 'rules' }));

  await expect(page.locator('.app')).toHaveAttribute('data-view', 'rules');
  await expect(panel).toContainText('Checkout failures');
  await expect(panel).toContainText('Help me diagnose repeated 401 responses');
  await expect(panel).not.toContainText('Rewrite auth header');
});

test('Agent Capture Tool activity includes a compact storage result', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentToolTrace: 'capture',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(5);
  await expect(trace.locator('[data-tool-name="discover_tools"]'))
    .toContainText('10 tools discovered');
  await expect(trace.locator('[data-tool-name="capture_get_storage_status"]'))
    .toContainText('Exchanges 1 · Bodies 2 · 184 B');
});

test('Agent body and message Tool activity keeps bounded result summaries scannable', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentToolTrace: 'body-messages',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(5);
  await expect(trace.locator('[data-tool-name="capture_get_exchange_body"]'))
    .toContainText('exchangeId: body-json');
  await expect(trace.locator('[data-tool-name="capture_get_exchange_body"]'))
    .toContainText('14 B · complete');
  await expect(trace.locator('[data-tool-name="capture_list_websocket_messages"]'))
    .toContainText('2 messages · complete');
  await expect(trace.locator('[data-tool-name="capture_list_grpc_messages"]'))
    .toContainText('exchangeId: grpc-unary-json');
  await expect(trace.locator('[data-tool-name="capture_list_grpc_messages"]'))
    .toContainText('response · 1 message · complete');
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
  const [modelBox, usageBox, modelTextBox, modelChevronBox] = await Promise.all([
    modelSelect.boundingBox(),
    contextUsage.boundingBox(),
    modelSelect.locator('span').last().boundingBox(),
    modelSelect.locator('svg').last().boundingBox(),
  ]);
  expect(modelBox).not.toBeNull();
  expect(usageBox).not.toBeNull();
  expect(modelChevronBox!.x - (modelTextBox!.x + modelTextBox!.width)).toBe(6);
  expect(modelBox!.x + modelBox!.width - (modelChevronBox!.x + modelChevronBox!.width)).toBe(8);
  const circleBox = await contextUsage.locator('svg').first().boundingBox();
  expect(circleBox).not.toBeNull();
  expect(circleBox!.width).toBe(18);
  expect(circleBox!.height).toBe(18);
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
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toContainText('capture_stop_recording');
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
  await expect(approval).toContainText('capture_stop_recording');
  await expect(approval).toContainText('Pause capture without stopping the proxy.');
  await expect(approval).toContainText('No parameters');
  await approval.getByRole('button', { name: 'Deny Tool' }).click();
  await expect(approval).toContainText('Denied');
  await expect(approval).toHaveAttribute('role', 'status');
  await expect(approval).toBeFocused();

  await page.evaluate(() => window.__setState?.({ agentToolApproval: 'pending' }));
  await approval.getByRole('button', { name: 'Allow Tool' }).click();
  await expect(approval).toContainText('Allowed');
  await expect(approval).toContainText('Recording off');
  await expect(approval).toHaveAttribute('role', 'status');
  await expect(approval).toBeFocused();

  await page.evaluate(() => window.__setState?.({
    agentToolApproval: 'allowed',
    agentToolApprovalName: 'capture_clear',
  }));
  await expect(approval).toContainText('Exchanges 0 · Bodies 0 · 4 KB');
  expect(await approval.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Rules export approval distinguishes saved and canceled native dialogs', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture', agentPanel: 'open', agentExecutionMode: 'ask',
    agentToolApproval: 'pending', agentToolApprovalName: 'rules_export', agentRulesExported: true,
  }));
  const approval = page.locator('[data-parity="agent-tool-approval"]');
  await expect(approval).toContainText('rules_export');
  await expect(approval).toContainText('Saved Rules: 2');
  await expect(approval).toContainText('Saved folders: 1');
  await expect(approval).toContainText('No parameters');
  await approval.getByRole('button', { name: 'Allow Tool' }).click();
  await expect(approval).toContainText('Rules exported');
  await page.evaluate(() => window.__setState?.({ agentRulesExported: false }));
  await expect(approval).toContainText('Export canceled');
  expect(await approval.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toContainText('capture_stop_recording');
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
  await expect(approval).toContainText('capture_stop_recording');
  await page.evaluate(() => window.__setState?.({ view: 'rules' }));
  await expect(page.locator('.app')).toHaveAttribute('data-view', 'rules');
  await expect(approval).toContainText('capture_stop_recording');
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

test('Failed turn exposes Retry and Session usage from Context hover', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Session usage' })).toHaveCount(0);
  const contextUsage = page.locator('[data-parity="agent-context-usage"]');
  await contextUsage.hover();
  const usagePopover = page.locator('[data-parity="agent-session-usage-popover"]');
  await expect(usagePopover).toBeVisible();
  await expect(usagePopover).toContainText('47.2k tokens');
  await expect(usagePopover).toContainText('73.1% cache hit');
  await page.locator('[data-parity="agent-panel-header"]').hover();
  await expect(usagePopover).toHaveCount(0);
});

test('Capture Tool activity keeps calls, arguments, results, and final answer in order', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentToolTrace: 'capture',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(trace).toBeVisible();
  await expect(trace.locator('[data-tool-name]')).toHaveCount(5);
  await expect(trace.locator('[data-tool-name]').evaluateAll((rows) => (
    rows.map((row) => row.getAttribute('data-tool-name'))
  ))).resolves.toEqual([
    'discover_tools',
    'capture_get_storage_status',
    'capture_get_proxy_status',
    'capture_list_exchanges',
    'capture_get_exchange',
  ]);
  await expect(trace).toContainText('capabilityId: capture');
  await expect(trace).toContainText('Exchanges 1 · Bodies 2 · 184 B');
  await expect(trace).toContainText('GET /agent-e2e/traffic · 200');
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('Capture storage is non-empty');
});

test('Agent Rules Tool activity summarizes tree, hits and applied revision', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'rules',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentToolTrace: 'rules',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('1 enabled Rule with 1 captured hit');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(3);
  await expect(trace.locator('[data-tool-name="discover_tools"]')).toContainText('4 tools discovered');
  await expect(trace.locator('[data-tool-name="rules_get_tree"]'))
    .toContainText('Revision 1 · Rules 1 · Enabled 1');
  await expect(trace.locator('[data-tool-name="rules_get_hits"]'))
    .toContainText('Rules 1 · Hits 1');

  await page.evaluate(() => window.__setState?.({
    agentToolApproval: 'allowed',
    agentToolApprovalName: 'rules_replace_tree',
  }));
  const result = page.locator('[data-parity="agent-tool-approval"]');
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('Revision 2 is now applied');
  await expect(result).toContainText('Revision 2 applied');
  await expect(result).toHaveAttribute('data-approval-status', 'allowed');
  expect(await result.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Agent Breakpoints Tool activity keeps pending and resolution summaries scannable', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'auto',
    agentToolTrace: 'breakpoints',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(5);
  await expect(trace.locator('[data-tool-name="breakpoints_list"]'))
    .toContainText('Pending breakpoints: 1 · Enabled');
  await expect(trace.locator('[data-tool-name="breakpoints_disable_http"]'))
    .toContainText('Disabled');
  await expect(trace.locator('[data-tool-name="breakpoints_continue"]'))
    .toContainText('Continued · bp-agent-request');
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('bp-agent-request continued');
  expect(await trace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Agent Composer Tool activity summarizes direct HTTP and TLS results', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'auto',
    agentToolTrace: 'composer',
    agentToolApproval: 'allowed',
    agentToolApprovalName: 'composer_send_request',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  const result = page.locator('[data-parity="agent-tool-approval"]');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(3);
  await expect(trace.locator('[data-tool-name="composer_probe_connection"]').first())
    .toContainText('TLSv1.3 · h2 · Certificates 1');
  await expect(trace.locator('[data-tool-name="composer_probe_connection"]').last())
    .toContainText('TLS probe failed · connect ECONNREFUSED');
  await expect(result).toContainText('POST /e2e/agent/requests/allowed · 201 · 32 B');
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('TLS negotiated h2 with one certificate');
  expect(await trace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await result.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('Agent Diagnostics Tool activity summarizes records without exposing attributes', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentExecutionMode: 'ask',
    agentToolTrace: 'diagnostics',
  }));

  const trace = page.locator('[data-parity="agent-query-tool-trace"]');
  await expect(trace.locator('[data-tool-name]')).toHaveCount(2);
  await expect(trace.locator('[data-tool-name="diagnostics_query"]'))
    .toContainText('Records 4 · Completed · Dropped 0');
  await expect(page.locator('[data-parity="agent-tool-approval"]')).toHaveCount(0);
  await expect(page.locator('[data-parity="agent-transcript"]'))
    .toContainText('Four successful Composer diagnostic records are available in newest-first order.');
  expect(await trace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});