import type { Locator, Page } from '@playwright/test';

import type { AutomationId } from '../../../../src/shared/automation-ids';

type AutomationScope = Pick<Page, 'locator'> | Pick<Locator, 'locator'>;

/** Locate one stable interactive element through the shared automation contract. */
export function getByAutomationId(
  scope: AutomationScope,
  automationId: AutomationId,
): Locator {
  return scope.locator(`[data-automation-id=${JSON.stringify(automationId)}]`);
}

/** Locate runtime-owned rows whose stable automation ID begins with a public prefix. */
export function getByAutomationIdPrefix(
  scope: AutomationScope,
  prefix: string,
): Locator {
  return scope.locator(`[data-automation-id^=${JSON.stringify(prefix)}]`);
}
