import { randomUUID } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
  type AutomationId,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

/** Chromium cache trees never hold Core or preference documents and would dominate the scan. */
const PROFILE_SCAN_SKIP_DIRECTORIES = new Set([
  'Cache',
  'Code Cache',
  'Crashpad',
  'DawnCache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'blob_storage',
]);

interface ProfileScan {
  scannedFiles: number;
  found: boolean;
}

/** Search every profile-owned document for one workflow marker, skipping only Chromium caches. */
async function scanProfileForMarker(
  directory: string,
  marker: string,
): Promise<ProfileScan> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const needle = Buffer.from(marker, 'utf8');
  let scannedFiles = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const relative = path.relative(directory, filePath);
    if (relative.split(path.sep).some((part) => PROFILE_SCAN_SKIP_DIRECTORIES.has(part))) {
      continue;
    }
    scannedFiles += 1;
    if ((await readFile(filePath)).includes(needle)) {
      return { scannedFiles, found: true };
    }
  }
  return { scannedFiles, found: false };
}

/** Close one App generation, retain its evidence, then scan its final profile. */
async function closeGeneration(
  driver: LocalElectronApplicationDriver,
  testInfo: TestInfo,
): Promise<void> {
  await driver.captureFinalScreenshot(testInfo);
  await driver.stopTrace(testInfo);
  await driver.closeGracefully();
  await driver.writeEvidence(testInfo);
}

test('application.lifecycle.profile-isolation keeps theme, language, capture and rules inside one profile', async ({
  desktopApp,
  httpTrafficRunner,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'application.lifecycle.profile-isolation',
  });
  desktopApp.preserveUserDataOnFailure();

  const { page } = desktopApp;
  const marker = `e2e-profile-isolation-${randomUUID().slice(0, 8)}`;
  const requestPath = `/e2e/profile-isolation/${marker}`;
  const initialLanguage = await page.locator('html').getAttribute('lang');
  if (!initialLanguage) throw new Error('The ready App omitted its initial language.');
  const targetLanguage = initialLanguage === 'ja' ? 'de' : 'ja';
  const targetLanguageEntry: AutomationId = targetLanguage === 'ja'
    ? AUTOMATION_IDS.shell.language.ja
    : AUTOMATION_IDS.shell.language.de;
  const captureRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const ruleRows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow);
  let profileB: LocalElectronApplicationDriver | null = null;
  let profileBClosed = false;
  let workflowError: unknown;
  let cleanupError: unknown;
  const evidence: Record<string, unknown> = {
    marker,
    initialLanguage,
    targetLanguage,
  };

  try {
    // 准备：Profile A 完成真实启动；只检查与本流程相关的默认态。
    // Arrange: Profile A finished real startup; inspect only the defaults this workflow compares.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // 产品冷启动会自动接管系统代理，宿主已有流量可能先进入列表；本轮请求必须尚不存在。
    await expect(captureRows.filter({ hasText: requestPath })).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(ruleRows).toHaveCount(0);
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await screenshotStep('Profile A 的默认主题、语言与空数据 / Profile A starts with default appearance and empty data');

    // 用户操作：在 A 选择非默认主题和语言。
    // User actions: choose a non-default theme and language inside A.
    await getByAutomationId(page, AUTOMATION_IDS.shell.theme.trigger).click();
    await getByAutomationId(page, AUTOMATION_IDS.shell.theme.dark).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await getByAutomationId(page, AUTOMATION_IDS.shell.language.trigger).click();
    await getByAutomationId(page, targetLanguageEntry).click();
    await expect(page.locator('html')).toHaveAttribute('lang', targetLanguage);
    await screenshotStep('Profile A 切换到dark主题和另一种语言 / Profile A selects the dark theme and another language');

    // 业务输入：A 通过真实 Recording 产生一条唯一请求。
    // Business input: A produces one unique request through real Recording.
    await startRecording(desktopApp);
    await expect(httpTrafficRunner.requestThroughProxy(
      desktopApp.capturePort(),
      requestPath,
    )).resolves.toMatchObject({ statusCode: 200 });
    const requestRow = captureRows.filter({ hasText: requestPath });
    await expect(requestRow).toBeVisible();
    await screenshotStep('Profile A 捕获到本轮唯一请求 / Profile A captured this workflow request');

    // 业务输入：A 新建、启用并 Apply 一条唯一规则。
    // Business input: A creates, enables and applies one unique Rule.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.toolbar.create).click();
    await expect(ruleRows).toHaveCount(1);
    await ruleRows.first().click();
    const ruleAutomationId = await ruleRows.first().getAttribute('data-automation-id');
    if (!ruleAutomationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) {
      throw new Error('The created Rule omitted its public identity.');
    }
    const ruleId = ruleAutomationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(marker);
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
    ).fill('127.0.0.1');
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'name'),
    ).fill('x-e2e-profile-marker');
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'value'),
    ).fill(marker);
    const enabled = getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled);
    if (await enabled.getAttribute('aria-checked') !== 'true') {
      await enabled.click();
    }
    await expect(enabled).toHaveAttribute('aria-checked', 'true');
    await screenshotStep('Profile A 的完整规则配置 / The complete Rule configuration in Profile A');
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state))
      .toHaveAttribute('data-state', 'applied');
    await expect(ruleRows).toHaveCount(1);
    await screenshotStep('Profile A Apply 唯一规则 / Profile A applies its unique Rule');

    // 清理路由：先经真实 Proxy Restore 交回系统代理，再关闭 A 并保留 profile。
    // Route cleanup: hand the system proxy back through the real Proxy Restore before closing A, then retain its profile.
    const journalPath = desktopApp.systemProxyJournalPath();
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { original: unknown };
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.proxy).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.proxy.restore).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.proxy.enable)).toBeEnabled();
    expect(desktopApp.matchesSystemProxyEvidence(
      await desktopApp.readSystemProxySettings(),
      journal.original,
    )).toBe(true);
    await expect(access(journalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await screenshotStep('Profile A 交回系统代理后准备关闭 / Profile A restored the system proxy before closing');

    const profileADirectory = desktopApp.userDataDirectory;
    await closeGeneration(desktopApp, testInfo);
    const scanA = await scanProfileForMarker(profileADirectory, marker);
    expect(scanA, 'Profile A must contain the Rule this workflow created').toMatchObject({ found: true });
    evidence.profileA = {
      userDataDirectory: profileADirectory,
      systemProxyRestored: true,
      markerFound: scanA.found,
      scannedFiles: scanA.scannedFiles,
    };

    // 用户操作：用全新 Profile B 启动第二代，复用同一宿主和同一 HTTP origin。
    // User action: start a second generation with a brand-new Profile B on the same host and origin.
    profileB = await LocalElectronApplicationDriver.launch(testInfo, { evidencePrefix: 'profile-b' });
    await profileB.waitUntilReady();
    const profileBPage = profileB.page;
    const profileBCaptureRows = getByAutomationIdPrefix(
      profileBPage,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    );

    // 业务断言：B 的 UI 偏好、Capture 与 Rules 都回到新 profile 的默认值。
    // Assert: Profile B falls back to a new profile's appearance, Capture and Rules state.
    expect(profileB.userDataDirectory).not.toBe(profileADirectory);
    await expect(profileBPage.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(profileBPage.locator('html')).toHaveAttribute('lang', initialLanguage);
    // 新 profile 也可能捕获宿主自身流量；隔离要求是 A 的本轮请求不在 B 的列表里。
    await expect(profileBCaptureRows.filter({ hasText: requestPath })).toHaveCount(0);
    await getByAutomationId(profileBPage, AUTOMATION_IDS.shell.workspace.rules).click();
    await expect(getByAutomationIdPrefix(
      profileBPage,
      AUTOMATION_ID_PREFIXES.ruleRow,
    )).toHaveCount(0);
    await getByAutomationId(profileBPage, AUTOMATION_IDS.shell.workspace.capture).click();
    await screenshotStep('Profile B 没有继承 A 的主题、语言、请求或规则 / Profile B inherits no theme, language, request or Rule from A');

    // 证据与销毁：B 正常关闭后，其 profile 目录不得出现 A 的唯一规则标记。
    // Evidence and teardown: Profile B must not contain A's unique Rule marker after its normal close.
    await profileB.captureFinalScreenshot(testInfo);
    await profileB.stopTrace(testInfo);
    await profileB.closeGracefully();
    profileBClosed = true;
    await profileB.writeEvidence(testInfo);
    await expect(access(journalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const scanB = await scanProfileForMarker(profileB.userDataDirectory, marker);
    expect(scanB, 'Profile B must not contain the Rule created in Profile A').toMatchObject({ found: false });
    evidence.profileB = {
      userDataDirectory: profileB.userDataDirectory,
      systemProxyJournalRemovedAfterClose: true,
      markerFound: scanB.found,
      scannedFiles: scanB.scannedFiles,
    };
    expect(profileB.rendererPageErrors()).toEqual([]);

    const evidencePath = testInfo.outputPath('profile-isolation.json');
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
    await testInfo.attach('profile-isolation.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    desktopApp.releasePreservedUserData();
  } catch (error) {
    workflowError = error;
  } finally {
    if (profileB) {
      try {
        if (!profileBClosed) {
          await profileB.captureFinalScreenshot(testInfo);
          await profileB.stopTrace(testInfo);
          await profileB.closeGracefully();
          await profileB.writeEvidence(testInfo);
        }
      } catch (error) {
        cleanupError = error;
        await profileB.forceCleanup().catch(() => undefined);
      }
      if (!workflowError && !cleanupError) {
        await profileB.removeUserData();
      } else {
        testInfo.annotations.push({
          type: 'preserved-user-data',
          description: profileB.userDataDirectory,
        });
      }
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Profile isolation and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
