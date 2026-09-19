import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect } from '../runtime/local-electron-driver';
import { getByAutomationId } from './automation';

export async function automaticallyExecuteMcpClientTools(page: Page, clientId: string): Promise<void> {
  await getByAutomationId(page, AutomationIdFactory.mcpClientAuto(clientId)).click();
  await expect(getByAutomationId(page, AutomationIdFactory.mcpClientRow(clientId)))
    .toHaveAttribute('data-execution-mode', 'auto');
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toHaveAttribute('aria-busy', 'false');
}

export function verifyAppContainerControls(page: Page, testInfo: TestInfo): Promise<void> {
  switch (process.platform) {
    case 'darwin': return verifyMacosAppContainerControls(page, testInfo);
    case 'win32': return verifyWindowsAppContainerControls(page);
    default: throw new Error('App Container workflow requires a supported desktop platform.');
  }
}

async function verifyWindowsAppContainerControls(page: Page): Promise<void> {
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.search)).toBeVisible();
}

async function verifyMacosAppContainerControls(page: Page, testInfo: TestInfo): Promise<void> {
  for (const controlId of [
    AUTOMATION_IDS.settings.appContainers.search,
    AUTOMATION_IDS.settings.appContainers.enableAll,
    AUTOMATION_IDS.settings.appContainers.disableAll,
  ]) {
    await expect(getByAutomationId(page, controlId)).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath('app-containers-unsupported.png') });
}