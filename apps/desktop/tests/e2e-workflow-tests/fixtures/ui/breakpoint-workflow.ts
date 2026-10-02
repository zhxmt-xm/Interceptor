import { expect, type Locator, type Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from './automation';

/** Read a Core-owned identifier from one public dynamic automation ID. */
async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Missing dynamic automation ID with prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create and apply one request breakpoint Rule entirely through product UI. */
export async function createRequestBreakpointRule(
  page: Page,
  name: string,
  method?: string,
): Promise<string> {
  return createHttpBreakpointRule(page, name, '127.0.0.1', 'request', method);
}

export async function createResponseBreakpointRule(page: Page, name: string, pathMatch: string): Promise<string> {
  return createHttpBreakpointRule(page, name, pathMatch, 'response');
}

async function createHttpBreakpointRule(
  page: Page,
  name: string,
  matchValue: string,
  phase: 'request' | 'response',
  method?: string,
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();

  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await ruleRow.waitFor({ state: 'visible' });
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);

  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
  if (phase === 'response') {
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'remove')).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  }
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill(matchValue);
  if (method) {
    await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.method).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value'),
    ).fill(method);
  }
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
  if (phase === 'response') {
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')).click();
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response')).click();
  }
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}
