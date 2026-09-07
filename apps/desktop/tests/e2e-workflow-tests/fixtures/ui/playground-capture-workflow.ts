import { expect, type Page } from '@playwright/test';

import type { TrafficScenarioId } from '../../../../../playground/server/scenarios/interfaces';

/** Select and run one official Capture Lab scenario through only public Browser controls. */
export async function runPlaygroundCaptureScenario(
  page: Page,
  scenarioId: TrafficScenarioId,
): Promise<void> {
  await page.locator(`[data-scenario-id="${scenarioId}"]`).click();
  await expect(page.locator('[data-traffic-state]')).toHaveCount(0);
  await page.locator('[data-playground-action="run"]').click();
  const result = page.locator('[data-traffic-state]');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute('data-traffic-state', 'complete');
}