import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

const execFileAsync = promisify(execFile);

interface AppContainerHelperSnapshot {
  readonly containers: Array<{ readonly appContainerSid: string }>;
  readonly exemptSids: string[];
}

interface AppContainerBulkEvidence {
  initial: SetEvidence;
  enabled: SetEvidence | null;
  disabled: SetEvidence | null;
  restored: SetEvidence | null;
  currentContainerCount: number;
  initialEnabledCount: number;
  outsideExemptionCount: number;
  enableDialogCount: number | null;
  disableDialogCount: number | null;
  disableButton: ButtonGeometry | null;
  enableButton: ButtonGeometry | null;
  uacPolicy: UacPolicyEvidence;
  cancelPreservedInitial: boolean;
  finalRestoredExactly: boolean;
}

interface SetEvidence {
  readonly count: number;
  readonly sha256: string;
}

interface ButtonGeometry {
  readonly width: number;
  readonly height: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly whiteSpace: string;
}

interface UacPolicyEvidence {
  readonly enableLUA: number | null;
  readonly consentPromptBehaviorAdmin: number | null;
  readonly promptOnSecureDesktop: number | null;
}

/** 通过产品随附 helper 只读系统集合，不执行任何写命令。 */
/** Read system sets through the product helper without invoking mutation commands. */
async function readSystemSnapshot(
  desktopDirectory: string,
): Promise<AppContainerHelperSnapshot> {
  const helperPath = path.join(
    desktopDirectory,
    '../../packages/platform-capabilities/dist',
    'app-container',
    'app-container-helper.exe',
  );
  const { stdout } = await execFileAsync(helperPath, ['list'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(stdout) as AppContainerHelperSnapshot;
}

/** 只读记录 Windows UAC 提升策略，区分真实提示与策略自动批准。 */
/** Read Windows elevation policy to distinguish a visible prompt from policy auto-approval. */
async function readUacPolicy(): Promise<UacPolicyEvidence> {
  const readDword = async (name: string): Promise<number | null> => {
    const { stdout } = await execFileAsync('reg.exe', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
      '/v',
      name,
    ], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const match = stdout.match(new RegExp(`${name}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'i'));
    return match ? Number.parseInt(match[1]!, 16) : null;
  };
  const [enableLUA, consentPromptBehaviorAdmin, promptOnSecureDesktop] = await Promise.all([
    readDword('EnableLUA'),
    readDword('ConsentPromptBehaviorAdmin'),
    readDword('PromptOnSecureDesktop'),
  ]);
  return { enableLUA, consentPromptBehaviorAdmin, promptOnSecureDesktop };
}

/** 将 SID 集合规范化为可比较的稳定顺序。 */
/** Normalize a SID set into a stable comparison order. */
function normalizedSids(values: readonly string[]): string[] {
  const sidByNormalizedValue = new Map<string, string>();
  for (const value of values) {
    sidByNormalizedValue.set(value.toLocaleLowerCase(), value);
  }
  return [...sidByNormalizedValue.values()].sort((left, right) =>
    left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

/** 将 SID 集合转换为大小写无关的比较键。 */
/** Convert a SID set to case-insensitive comparison keys. */
function sidKeys(values: readonly string[]): string[] {
  return normalizedSids(values).map((value) => value.toLocaleLowerCase());
}

/** 只保存集合数量与 hash，避免证据复制完整机器 SID 清单。 */
/** Retain only count and hash instead of copying the machine's full SID list. */
function setEvidence(values: readonly string[]): SetEvidence {
  const normalized = sidKeys(values);
  return {
    count: normalized.length,
    sha256: createHash('sha256').update(normalized.join('\n')).digest('hex'),
  };
}

/** 比较两个 SID 集合而不依赖 helper 返回顺序。 */
/** Compare two SID sets without relying on helper output order. */
function sameSids(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sidKeys(left)) === JSON.stringify(sidKeys(right));
}

/** 读取按钮盒模型，证明工具栏命令未换行或溢出。 */
/** Read button geometry to prove toolbar commands neither wrap nor overflow. */
async function buttonGeometry(page: Page, automationId: string): Promise<ButtonGeometry> {
  return getByAutomationId(page, automationId).evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      scrollWidth: button.scrollWidth,
      scrollHeight: button.scrollHeight,
      whiteSpace: getComputedStyle(button).whiteSpace,
    };
  });
}

/** 等待某个 SID 行反映目标 exemption 状态。 */
/** Wait for one SID row to reflect the expected exemption state. */
async function expectRowState(
  page: Page,
  appContainerSid: string,
  exempt: boolean,
): Promise<void> {
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.appContainerRow(appContainerSid),
  )).toHaveAttribute('data-exempt', String(exempt));
}

/** 执行一条批量产品命令并等待确认层关闭。 */
/** Execute one bulk product command and wait for its confirmation layer to close. */
async function confirmBulkAction(
  page: Page,
  action: 'enable' | 'disable',
  expectedCount: number,
): Promise<void> {
  const ids = AUTOMATION_IDS.settings.appContainers;
  await getByAutomationId(
    page,
    action === 'enable' ? ids.enableAll : ids.disableAll,
  ).click();
  const dialog = getByAutomationId(page, ids.bulkDialog);
  await expect(dialog).toHaveAttribute('data-action', action);
  await expect(dialog).toHaveAttribute('data-count', String(expectedCount));
  await getByAutomationId(
    page,
    action === 'enable' ? ids.enableAllConfirm : ids.disableAllConfirm,
  ).click();
  await expect(dialog).not.toBeVisible({ timeout: 30_000 });
}

/** 使用正式批量与单项 UI 把当前枚举 SID 恢复到测试前状态。 */
/** Restore current enumerated SIDs through public bulk and single-item UI. */
async function restoreInitialCurrentState(
  page: Page,
  currentSids: readonly string[],
  initialEnabledSids: readonly string[],
): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.appContainers).click();
  const enabledRows = await Promise.all(currentSids.map(async (appContainerSid) => ({
    appContainerSid,
    enabled: await getByAutomationId(
      page,
      AutomationIdFactory.appContainerRow(appContainerSid),
    ).getAttribute('data-exempt') === 'true',
  })));
  const initialEnabledSet = new Set(initialEnabledSids.map((value) => value.toLocaleLowerCase()));
  if (enabledRows.some(({ appContainerSid, enabled }) =>
    enabled && !initialEnabledSet.has(appContainerSid.toLocaleLowerCase()))) {
    await confirmBulkAction(
      page,
      'disable',
      enabledRows.filter(({ enabled }) => enabled).length,
    );
  }
  for (const appContainerSid of initialEnabledSids) {
    const row = getByAutomationId(
      page,
      AutomationIdFactory.appContainerRow(appContainerSid),
    );
    if (await row.getAttribute('data-exempt') === 'true') {
      continue;
    }
    await getByAutomationId(
      page,
      AutomationIdFactory.appContainerToggle(appContainerSid),
    ).click();
    await getByAutomationId(
      page,
      AUTOMATION_IDS.settings.appContainers.changeConfirm,
    ).click();
    await expectRowState(page, appContainerSid, true);
  }
}

test.skip(process.platform !== 'win32', 'AppContainer APIs are only available on Windows.');

test('settings.app-containers.bulk-access enables, disables, and restores exemptions', async ({
  desktopApp,
}, testInfo: TestInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'settings.app-containers.bulk-access',
  });
  desktopApp.preserveUserDataOnFailure();
  const { page } = desktopApp;
  const initialSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
  const currentSids = normalizedSids(initialSnapshot.containers.map(
    (appContainer) => appContainer.appContainerSid,
  ));
  const currentSidSet = new Set(currentSids.map((value) => value.toLocaleLowerCase()));
  const initialEnabledSids = normalizedSids(initialSnapshot.exemptSids).filter(
    (appContainerSid) => currentSidSet.has(appContainerSid.toLocaleLowerCase()),
  );
  const outsideExemptions = normalizedSids(initialSnapshot.exemptSids).filter(
    (appContainerSid) => !currentSidSet.has(appContainerSid.toLocaleLowerCase()),
  );
  const evidence: AppContainerBulkEvidence = {
    initial: setEvidence(initialSnapshot.exemptSids),
    enabled: null,
    disabled: null,
    restored: null,
    currentContainerCount: currentSids.length,
    initialEnabledCount: initialEnabledSids.length,
    outsideExemptionCount: outsideExemptions.length,
    enableDialogCount: null,
    disableDialogCount: null,
    disableButton: null,
    enableButton: null,
    uacPolicy: await readUacPolicy(),
    cancelPreservedInitial: false,
    finalRestoredExactly: false,
  };
  let workflowError: unknown;
  let cleanupError: unknown;

  try {
    // 准备：打开真实 AppContainer 面板；Disable all 入口必须在任何系统写入前存在。
    // Arrange: open the real AppContainer panel; Disable all must exist before any system mutation.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.appContainers).click();
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.appContainerRow(currentSids[0]!),
    )).toBeVisible();
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.settings.appContainers.disableAll,
    )).toBeVisible();
    const disableButton = await buttonGeometry(
      page,
      AUTOMATION_IDS.settings.appContainers.disableAll,
    );
    const enableButton = await buttonGeometry(
      page,
      AUTOMATION_IDS.settings.appContainers.enableAll,
    );
    evidence.disableButton = disableButton;
    evidence.enableButton = enableButton;
    expect(disableButton.whiteSpace).toBe('nowrap');
    expect(enableButton.whiteSpace).toBe('nowrap');
    expect(disableButton.height).toBe(enableButton.height);
    expect(disableButton.scrollWidth).toBeLessThanOrEqual(Math.ceil(disableButton.width));
    expect(enableButton.scrollWidth).toBeLessThanOrEqual(Math.ceil(enableButton.width));
    expect(disableButton.scrollHeight).toBeLessThanOrEqual(Math.ceil(disableButton.height));
    expect(enableButton.scrollHeight).toBeLessThanOrEqual(Math.ceil(enableButton.height));

    // 取消验证：Enable all dialog 报告准确数量，Cancel 不发系统命令。
    // Cancellation: Enable all reports the exact count and Cancel emits no system command.
    const initiallyDisabledCount = currentSids.length - initialEnabledSids.length;
    await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.enableAll).click();
    const bulkDialog = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.appContainers.bulkDialog,
    );
    await expect(bulkDialog).toHaveAttribute('data-action', 'enable');
    await expect(bulkDialog).toHaveAttribute('data-count', String(initiallyDisabledCount));
    evidence.enableDialogCount = initiallyDisabledCount;
    await getByAutomationId(
      page,
      AUTOMATION_IDS.settings.appContainers.bulkCancel,
    ).click();
    await expect(bulkDialog).not.toBeVisible();
    evidence.cancelPreservedInitial = sameSids(
      (await readSystemSnapshot(desktopApp.desktopDirectory)).exemptSids,
      initialSnapshot.exemptSids,
    );
    expect(evidence.cancelPreservedInitial).toBe(true);

    // Enable all：一个产品命令完成集合并集与读回校验，枚举外 exemption 保留。
    // Enable all: one product command performs the union and read-back while preserving outside exemptions.
    await confirmBulkAction(page, 'enable', initiallyDisabledCount);
    for (const appContainerSid of currentSids) {
      await expectRowState(page, appContainerSid, true);
    }
    const enabledSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
    const expectedEnabled = normalizedSids([...initialSnapshot.exemptSids, ...currentSids]);
    expect(sameSids(enabledSnapshot.exemptSids, expectedEnabled)).toBe(true);
    evidence.enabled = setEvidence(enabledSnapshot.exemptSids);

    // Disable all：对称命令只移除当前枚举 SID，枚举外 exemption 逐项保留。
    // Disable all: the symmetric command removes only current SIDs and preserves every outside exemption.
    await getByAutomationId(page, AUTOMATION_IDS.settings.appContainers.disableAll).click();
    await expect(bulkDialog).toHaveAttribute('data-action', 'disable');
    await expect(bulkDialog).toHaveAttribute('data-count', String(currentSids.length));
    evidence.disableDialogCount = currentSids.length;
    await getByAutomationId(
      page,
      AUTOMATION_IDS.settings.appContainers.disableAllConfirm,
    ).click();
    await expect(bulkDialog).not.toBeVisible({ timeout: 30_000 });
    for (const appContainerSid of currentSids) {
      await expectRowState(page, appContainerSid, false);
    }
    const disabledSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
    expect(sameSids(disabledSnapshot.exemptSids, outsideExemptions)).toBe(true);
    evidence.disabled = setEvidence(disabledSnapshot.exemptSids);

    // 恢复：只通过正式单项 UI 重新启用测试前项，最终 OS 集合必须逐项相同。
    // Restore: re-enable initial items only through public single-item UI; the final OS set must match exactly.
    await restoreInitialCurrentState(page, currentSids, initialEnabledSids);
    const restoredSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
    evidence.restored = setEvidence(restoredSnapshot.exemptSids);
    evidence.finalRestoredExactly = sameSids(
      restoredSnapshot.exemptSids,
      initialSnapshot.exemptSids,
    );
    expect(evidence.finalRestoredExactly).toBe(true);
    expect(desktopApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    try {
      const currentSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
      if (!sameSids(currentSnapshot.exemptSids, initialSnapshot.exemptSids)) {
        await restoreInitialCurrentState(page, currentSids, initialEnabledSids);
      }
      const finalSnapshot = await readSystemSnapshot(desktopApp.desktopDirectory);
      if (!sameSids(finalSnapshot.exemptSids, initialSnapshot.exemptSids)) {
        throw new Error('AppContainer exemptions did not return to the pre-workflow set.');
      }
      desktopApp.releasePreservedUserData();
    } catch (error) {
      cleanupError = error;
    }

    // 证据仅保存集合 hash/count 与行为结论，不复制完整机器 SID 清单。
    // Evidence stores only set hashes/counts and behavioral outcomes, not the machine's SID inventory.
    const evidencePath = testInfo.outputPath('app-container-bulk-access.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('app-container-bulk-access.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  }

  if (workflowError) {
    throw workflowError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
});