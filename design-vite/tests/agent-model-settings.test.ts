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
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeFocused();
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
  await expect(save).toBeEnabled();
  await dialog.getByLabel('Profile name').fill('Qwen gateway');
  await dialog.getByLabel('Model ID').fill('qwen3-coder');
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await save.click();

  const qwenModel = page.locator('[data-configured-model="qwen"]');
  await expect(qwenModel).toContainText('Qwen gateway');
  await expect(qwenModel).toContainText('qwen3-coder');
});

test('Editing DeepSeek invalidates verification until the connection is tested again', async ({ page }) => {
  await page.evaluate(() => window.__setState?.({
    view: 'settings',
    settings: 'agent',
    agentProviderDialog: 'deepseek',
    agentProviderDialogMode: 'edit',
    agentProviderDialogTarget: 'deepseek',
  }));

  const dialog = page.getByRole('dialog', { name: 'DeepSeek' });
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeEnabled();
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