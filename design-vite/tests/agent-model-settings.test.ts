import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__setState === 'function');
});

test('Agent navigation opens the app-wide provider settings page', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'privacy',
    agentPanel: 'closed',
    agentProviderDialog: '',
  }));

  await page.locator('[data-settings-nav="agent"]').click();

  await expect(page.locator('.app')).toHaveAttribute('data-settings', 'agent');
  await expect(page.locator('[data-parity="agent-model-settings"]')).toBeVisible();
  await expect(page.locator('[data-settings-nav="agent"]')).toHaveCSS(
    'color',
    /rgb\(/,
  );
});

test('Unconfigured Agent settings shows an honest empty model state', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'unconfigured',
  }));

  const settings = page.locator('[data-parity="agent-model-settings"]');
  await expect(settings).toContainText('No models configured');
  await expect(settings).not.toContainText('DeepSeek V4 Flash');
  await expect(settings).not.toContainText('Qwen3 Max');
});

test('Tool capabilities lists the complete initial shared registry with both targets enabled', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'configured',
  }));

  const capabilities = page.locator('[data-parity="agent-tool-capabilities"]');
  await expect(capabilities).toBeVisible();
  await expect(capabilities.locator('[data-tool-capability]')).toHaveCount(24);
  await expect(capabilities.getByText('Traffic', { exact: true })).toBeVisible();
  await expect(capabilities.getByText('Rules', { exact: true })).toBeVisible();
  await expect(capabilities.getByText('Breakpoints', { exact: true })).toBeVisible();
  await expect(capabilities.getByText('Requests & diagnostics', { exact: true })).toBeVisible();
  await expect(capabilities.getByRole('switch')).toHaveCount(48);
  await expect(capabilities.getByRole('switch', { name: 'Enable get_exchange for Agent' }))
    .toBeChecked();
  await expect(capabilities.getByRole('switch', { name: 'Enable get_exchange for MCP' }))
    .toBeChecked();
});

test('Agent and MCP capability switches remain independent', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'configured',
  }));

  const agentSwitch = page.getByRole('switch', { name: 'Enable get_exchange for Agent' });
  const mcpSwitch = page.getByRole('switch', { name: 'Enable get_exchange for MCP' });
  await agentSwitch.click();
  await expect(agentSwitch).not.toBeChecked();
  await expect(mcpSwitch).toBeChecked();

  await mcpSwitch.click();
  await expect(agentSwitch).not.toBeChecked();
  await expect(mcpSwitch).not.toBeChecked();
});

test('Tool search filters by capability name without resetting switches', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'configured',
  }));

  const agentSwitch = page.getByRole('switch', { name: 'Enable get_exchange for Agent' });
  await agentSwitch.click();
  await page.getByRole('searchbox', { name: 'Search Tool capabilities' }).fill('websocket');
  await expect(page.locator('[data-tool-capability]')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search Tool capabilities' }).fill('get_exchange');
  await expect(page.locator('[data-tool-capability]')).toHaveCount(2);
  await expect(page.getByRole('switch', { name: 'Enable get_exchange for Agent' }))
    .not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Enable get_exchange for MCP' }))
    .toBeChecked();
});

test('Complete Tool capability registry remains reachable through Settings scrolling', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'configured',
    agentToolSearch: '',
  }));

  const lastTool = page.locator('[data-tool-capability="query_diagnostics"]');
  await lastTool.scrollIntoViewIfNeeded();
  await expect(lastTool).toBeVisible();
  await expect(lastTool.getByRole('switch', { name: 'Enable query_diagnostics for Agent' }))
    .toBeChecked();
  await expect(lastTool.getByRole('switch', { name: 'Enable query_diagnostics for MCP' }))
    .toBeChecked();
});

test('MCP server stays off until the user enables its loopback endpoint', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'configured',
  }));

  const server = page.locator('[data-parity="mcp-server-settings"]');
  const enabled = server.getByRole('switch', { name: 'Enable MCP server' });
  await expect(enabled).not.toBeChecked();
  await expect(server).toContainText('No listener');

  await enabled.click();

  await expect(enabled).toBeChecked();
  await expect(server).toContainText('http://127.0.0.1:43127/mcp');
  await expect(server.getByRole('button', { name: 'Add client' })).toBeEnabled();
});

test('MCP client configuration exposes Ask and Auto without revealing its token', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
  }));
  const server = page.locator('[data-parity="mcp-server-settings"]');
  await server.getByRole('switch', { name: 'Enable MCP server' }).click();
  await server.getByRole('button', { name: 'Add client' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add MCP client' });
  await expect(dialog.getByLabel('Host')).toHaveCount(0);
  await dialog.getByLabel('Client name').fill('VS Code E2E');
  await dialog.getByRole('button', { name: 'Create client' }).click();

  const client = page.locator('[data-parity="mcp-client-row"]');
  await expect(client).toContainText('VS Code E2E');
  await expect(client.getByRole('radio', { name: 'Ask' })).toBeChecked();
  await client.getByRole('radio', { name: 'Auto' }).click();
  await expect(client.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await client.getByRole('button', { name: 'Copy MCP configuration' }).click();
  await expect(client).toHaveAttribute('data-config-copied', 'true');
  await expect(server).not.toContainText('Bearer');
});

test('MCP credential rotates only through its explicit confirmation', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
  }));
  const server = page.locator('[data-parity="mcp-server-settings"]');
  const enabled = server.getByRole('switch', { name: 'Enable MCP server' });
  await enabled.click();
  await server.getByRole('button', { name: 'Add client' }).click();
  await page.getByRole('dialog', { name: 'Add MCP client' })
    .getByRole('button', { name: 'Create client' }).click();

  const client = page.locator('[data-parity="mcp-client-row"]');
  await expect(client).toHaveAttribute('data-credential-generation', '0');
  await enabled.click();
  await enabled.click();
  await expect(client).toHaveAttribute('data-credential-generation', '0');

  await client.getByRole('button', { name: 'Regenerate credential' }).click();
  const dialog = page.getByRole('dialog', { name: 'Regenerate MCP credential' });
  await expect(client).toHaveAttribute('data-credential-generation', '0');
  await dialog.getByRole('button', { name: 'Regenerate credential' }).click();
  await expect(client).toHaveAttribute('data-credential-generation', '1');
});

test('MCP change Tool approval is app-wide and requires an explicit verdict', async ({ page }) => {
  await page.evaluate(() => {
    const setState = window.__setState as ((patch: Record<string, unknown>) => void) | undefined;
    setState?.({
      view: 'capture',
      agentPanel: 'closed',
      mcpToolApproval: 'pending',
    });
  });

  const dialog = page.getByRole('dialog', { name: 'Approve MCP Tool call' });
  await expect(dialog).toContainText('VS Code');
  await expect(dialog).toContainText('stop_recording');
  await expect(dialog).toContainText('New traffic will continue through the proxy but will not be captured.');
  await dialog.getByRole('button', { name: 'Deny Tool call' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Add provider chooses a Provider type before opening its dialog', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProvider: 'unconfigured',
    agentProviderDialog: '',
  }));

  await page.getByRole('button', { name: 'Add provider' }).click();

  const menu = page.getByRole('menu', { name: 'Provider types' });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const items = menu.getByRole('menuitem');
  const firstItem = items.nth(0);
  const secondItem = items.nth(1);
  await expect.poll(async () => (await firstItem.boundingBox())?.height).toBe(32);
  const [firstBox, secondBox, iconBox, firstTextBox, secondTextBox, fontSize] = await Promise.all([
    firstItem.boundingBox(),
    secondItem.boundingBox(),
    firstItem.locator('svg').first().boundingBox(),
    firstItem.getByText('DeepSeek', { exact: true }).boundingBox(),
    secondItem.getByText('OpenAI-compatible', { exact: true }).boundingBox(),
    firstItem.evaluate((element) => getComputedStyle(element).fontSize),
  ]);
  expect(secondBox?.height).toBe(32);
  expect(secondBox!.y - (firstBox!.y + firstBox!.height)).toBe(0);
  expect(iconBox?.width).toBe(14);
  expect(iconBox?.height).toBe(14);
  expect(fontSize).toBe('12px');
  expect(iconBox!.x - firstBox!.x).toBe(8);
  expect(firstTextBox!.x - (iconBox!.x + iconBox!.width)).toBe(8);
  expect(secondBox!.x + secondBox!.width - (secondTextBox!.x + secondTextBox!.width)).toBe(8);
  await menu.getByRole('menuitem', { name: 'DeepSeek' }).click();
  await expect(page.getByRole('dialog', { name: 'DeepSeek' })).toBeVisible();
});

test('Unconfigured Agent panel routes to Agent settings without closing itself', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'unconfigured',
  }));

  await page.getByRole('button', { name: 'Configure Agent' }).click();

  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-view', 'settings');
  await expect(app).toHaveAttribute('data-settings', 'agent');
  await expect(app).toHaveAttribute('data-agent-panel', 'open');
  await expect(page.locator('[data-parity="agent-panel"]')).toBeVisible();
  await expect(page.locator('[data-parity="agent-model-settings"]')).toBeVisible();
});

test('Current chat model menu routes to Agent settings without closing the panel', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'rules',
    sidebar: 'collapsed',
    agentPanel: 'open',
    agentProvider: 'configured',
    agentModelMenu: '',
  }));

  const modelSelect = page.getByRole('button', { name: 'DeepSeek V4 Flash' });
  await expect(modelSelect).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(modelSelect).toHaveAttribute('aria-expanded', 'false');
  await modelSelect.click();
  await expect(modelSelect).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-parity="agent-model-menu"]')).toBeVisible();
  await page.getByRole('button', { name: 'Agent settings…' }).click();

  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-view', 'settings');
  await expect(app).toHaveAttribute('data-settings', 'agent');
  await expect(app).toHaveAttribute('data-agent-panel', 'open');
  await expect(page.locator('[data-parity="agent-panel"]')).toBeVisible();
});

test('Current chat model changes independently from the default for new chats', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentDefaultModel: 'deepseek',
    agentModelMenu: 'open',
  }));

  await page.getByRole('option', { name: /Qwen3 Max/ }).click();

  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-agent-current-model', 'qwen');
  await expect(app).toHaveAttribute('data-agent-default-model', 'deepseek');
  await expect(page.getByRole('button', { name: 'Qwen3 Max' })).toBeVisible();
  await expect(page.locator('[data-parity="agent-model-select"] [data-provider-brand="qwen"]'))
    .toHaveAttribute('data-active', 'true');
});

test('Current chat model menu supports keyboard navigation and restores trigger focus', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'capture',
    agentPanel: 'open',
    agentCurrentModel: 'deepseek',
    agentModelMenu: '',
  }));

  const trigger = page.getByRole('button', { name: 'DeepSeek V4 Flash' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: /DeepSeek V4 Flash/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Qwen3 Max/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Qwen3 Max' })).toBeFocused();
});

test('Provider rows open and close their owning configuration dialog', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: '',
  }));

  await page.getByRole('button', { name: 'Edit DeepSeek V4 Flash' }).click();
  const dialog = page.locator('[data-parity="model-provider-dialog"]');
  await expect(dialog).toContainText('DeepSeek');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit DeepSeek V4 Flash' }).click();
  await expect(dialog.getByLabel('Profile name')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit DeepSeek V4 Flash' })).toBeFocused();
});

test('Default model changes only through an explicit model-row button', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentDefaultModel: 'deepseek',
  }));

  const deepSeekStatus = page.locator('[data-default-model="deepseek"] [data-default-status]');
  const qwenButton = page.getByRole('button', { name: 'Set Qwen3 Max as default' });
  await expect(deepSeekStatus).toHaveText('Default');
  await expect(page.getByRole('button', { name: 'DeepSeek V4 Flash default model' })).toHaveCount(0);
  await expect(page.locator('[data-default-model="deepseek"]')).toHaveAttribute('data-default', 'true');
  await expect(page.locator('[data-default-model="qwen"]')).toHaveAttribute('data-default', 'false');
  await expect(page.locator('[data-default-model="deepseek"] [data-provider-brand="deepseek"]'))
    .toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-default-model="qwen"] [data-provider-brand="qwen"]'))
    .toHaveAttribute('data-active', 'true');

  await qwenButton.click();

  await expect(page.getByRole('button', { name: 'Set DeepSeek V4 Flash as default' })).toBeVisible();
  await expect(page.locator('[data-default-model="qwen"] [data-default-status]')).toHaveText('Default');
  await expect(page.getByRole('button', { name: 'Qwen3 Max default model' })).toHaveCount(0);
  await expect(page.locator('[data-default-model="deepseek"]')).toHaveAttribute('data-default', 'false');
  await expect(page.locator('[data-default-model="qwen"]')).toHaveAttribute('data-default', 'true');
});

test('Provider Dialog uses one uniform input control geometry', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: 'custom',
    agentProviderDialogMode: 'add',
    agentProviderDialogTarget: '',
  }));

  const controls = page.locator('[data-parity="model-provider-field-control"]');
  await expect(controls).toHaveCount(6);
  const heights = await controls.evaluateAll((elements) => elements.map(
    (element) => element.getBoundingClientRect().height,
  ));
  expect(new Set(heights)).toEqual(new Set([34]));
});

test('Adding a Custom provider requires a successful connection test before Save', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: '',
  }));
  await page.getByRole('button', { name: 'Add provider' }).click();
  await page.getByRole('menuitem', { name: 'OpenAI-compatible' }).click();

  const dialog = page.getByRole('dialog', { name: 'OpenAI-compatible provider' });
  const save = dialog.getByRole('button', { name: 'Save provider' });
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Profile name').fill('Local lab');
  await dialog.getByLabel('Base URL').fill('http://127.0.0.1:11434/v1');
  await dialog.getByLabel('Model ID').fill('lab-model');
  await dialog.getByLabel('Context window').fill('131072');
  await dialog.getByLabel('Maximum output').fill('8192');
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await expect(dialog).toContainText('Connection verified');
  await expect(save).toBeEnabled();

  await dialog.getByLabel('Model ID').fill('changed-after-test');
  await expect(save).toBeDisabled();
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await save.click();

  const addedModel = page.locator('[data-configured-model="added"]');
  await expect(addedModel).toContainText('Local lab');
  await expect(addedModel).toContainText('changed-after-test');
  await expect(page.getByRole('button', { name: 'Set Local lab as default' })).toBeVisible();
});

test('Editing the Qwen compatible profile opens its populated configuration', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: '',
  }));
  await page.getByRole('button', { name: 'Edit Qwen3 Max' }).click();

  const dialog = page.getByRole('dialog', { name: 'OpenAI-compatible provider' });
  await expect(dialog.getByLabel('Profile name')).toHaveValue('Qwen');
  await expect(dialog.getByLabel('Model ID')).toHaveValue('qwen3-max');
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Profile name').fill('Qwen gateway');
  await dialog.getByLabel('Model ID').fill('qwen3-coder');
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await save.click();

  const qwenModel = page.locator('[data-configured-model="qwen"]');
  await expect(qwenModel).toContainText('Qwen gateway');
  await expect(qwenModel).toContainText('qwen3-coder');
});

test('Editing a Custom provider can explicitly remove its saved API key', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: '',
  }));
  await page.getByRole('button', { name: 'Edit Qwen3 Max' }).click();

  const dialog = page.getByRole('dialog', { name: 'OpenAI-compatible provider' });
  const removeKey = dialog.getByRole('checkbox', { name: 'Remove saved API key' });
  const apiKey = dialog.getByRole('textbox', { name: 'API key', exact: true });
  await expect(removeKey).not.toBeChecked();
  await removeKey.check();
  await expect(apiKey).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.locator('[data-configured-model="qwen"]')).toContainText('No API key');
});

test('Editing DeepSeek requires a connection test before changes can be saved', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: 'deepseek',
    agentProviderDialogMode: 'edit',
    agentProviderDialogTarget: 'deepseek',
  }));

  const dialog = page.getByRole('dialog', { name: 'DeepSeek' });
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Model ID').fill('deepseek-chat');
  await expect(save).toBeDisabled();
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await expect(save).toBeEnabled();
});

test('Known providers use mapped brand logos and Custom uses the unknown fallback', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: '',
  }));

  await expect(page.locator('[data-provider-brand="deepseek"]')).not.toHaveCount(0);
  await expect(page.locator('[data-provider-brand="qwen"]')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Add provider' }).click();
  await page.getByRole('menuitem', { name: 'OpenAI-compatible' }).click();
  await expect(page.locator('[data-parity="model-provider-dialog"] [data-provider-brand="unknown"]'))
    .toHaveCount(1);
});

test('Configured model can be removed through an explicit confirmation', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentDefaultModel: 'qwen',
    agentCurrentModel: 'qwen',
  }));

  await page.getByRole('button', { name: 'Remove Qwen3 Max' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove Qwen3 Max' });
  await expect(dialog).toContainText('Existing chats using this model will switch');
  await dialog.getByRole('button', { name: 'Confirm remove model' }).click();

  await expect(page.locator('[data-configured-model="qwen"]')).toHaveCount(0);
  await expect(page.locator('.app')).toHaveAttribute('data-agent-default-model', 'deepseek');
  await expect(page.locator('.app')).toHaveAttribute('data-agent-current-model', 'deepseek');
});

test('Remove model dialog traps focus and restores its trigger', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
  }));

  const remove = page.getByRole('button', { name: 'Remove Qwen3 Max' });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Remove Qwen3 Max' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm remove model' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
});