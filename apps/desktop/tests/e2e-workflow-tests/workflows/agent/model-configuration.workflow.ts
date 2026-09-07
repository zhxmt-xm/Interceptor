import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import {
  expect,
  LocalElectronApplicationDriver,
  test,
} from '../../fixtures/runtime/local-electron-driver';
import type {
  OpenAiCompatibleLab,
  OpenAiCompatibleObservation,
} from '../../fixtures/agent/openai-compatible-lab';

interface ProviderEvidence {
  readonly firstGenerationProviderIds: readonly string[];
  readonly restoredProviderIds: readonly string[];
  readonly observations: readonly OpenAiCompatibleObservation[];
  readonly startupRequestCount: number;
}

/** Return configured Provider IDs in stable list order. */
async function providerIds(page: Page): Promise<string[]> {
  return page.locator('[data-automation-id^="agent.model.row."]').evaluateAll((rows) => rows.map((row) => (
    row.getAttribute('data-automation-id')?.replace('agent.model.row.', '') ?? ''
  )));
}

/** Open the Custom Provider dialog and fill one complete draft. */
async function fillProvider(
  page: Page,
  draft: {
    profileName: string;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
  },
  beforeApiKey?: () => Promise<void>,
): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toBeVisible();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(draft.profileName);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(draft.baseUrl);
  if (draft.apiKey !== undefined) {
    await beforeApiKey?.();
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.apiKey).focus();
    for (const character of draft.apiKey) {
      await page.keyboard.insertText(character);
    }
  }
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(draft.modelId);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
}

/** Test the current draft and save its one-time verification. */
async function testAndSave(page: Page): Promise<void> {
  const save = getByAutomationId(page, AUTOMATION_IDS.agent.provider.save);
  await expect(save).toBeDisabled();
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.agent.provider.connectionStatus,
  )).toHaveAttribute('data-status', 'verified');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toHaveCount(0);
}

/** Close one generation and retain its trace, logs and destroy metadata. */
async function closeGeneration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  sensitiveText: string,
): Promise<void> {
  await desktopApp.captureFinalScreenshot(testInfo);
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  await desktopApp.assertSensitiveTextAbsentFromEvidence(sensitiveText);
  await desktopApp.writeEvidence(testInfo);
  await desktopApp.forceCleanup();
}

/** Attach only redacted lab and Provider identity evidence. */
async function attachProviderEvidence(
  testInfo: TestInfo,
  evidence: ProviderEvidence,
): Promise<void> {
  const evidencePath = testInfo.outputPath('agent-provider-configuration.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  await testInfo.attach('agent-provider-configuration.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
}

test('agent.settings.model-configuration persists verified redacted Providers', async ({
  desktopApp,
  openAiCompatibleLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'agent.settings.model-configuration',
  });

  let relaunchedApp: LocalElectronApplicationDriver | null = null;
  let workflowError: unknown;
  let cleanupError: unknown;
  let firstGenerationProviderIds: string[] = [];
  let restoredProviderIds: string[] = [];
  let startupRequestCount = -1;
  const keyedApiKey = `e2e-${randomBytes(16).toString('hex')}-9K4Q`;
  desktopApp.registerSensitiveTextForEvidenceAudit(keyedApiKey);

  try {
    // 准备：fresh profile进入Settings > Agent，只能看到诚实空列表。
    // Arrange: a fresh profile opens Settings > Agent with an honest empty list.
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.settings.section.agent).click();
    await expect(getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.models.list))
      .toHaveAttribute('data-model-count', '0');

    // 用户操作：配置带Key Provider；修改已验证字段必须使Save重新禁用。
    // User actions: configure a keyed Provider; changing a verified field must disable Save again.
    await fillProvider(desktopApp.page, {
      profileName: 'Keyed lab',
      baseUrl: openAiCompatibleLab.baseUrl('keyed'),
      apiKey: keyedApiKey,
      modelId: 'keyed-model',
    }, () => desktopApp.stopTrace(testInfo));
    const save = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.save);
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.testConnection).click();
    await expect(save).toBeEnabled();
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.modelId)
      .fill('keyed-model-v2');
    await expect(save).toBeDisabled();
    await testAndSave(desktopApp.page);
    await desktopApp.startTrace(testInfo);

    // 用户操作：配置无Key Provider，lab必须观测不到Authorization。
    // User actions: configure a keyless Provider; the lab must observe no Authorization header.
    await fillProvider(desktopApp.page, {
      profileName: 'Keyless lab',
      baseUrl: openAiCompatibleLab.baseUrl('keyless'),
      modelId: 'keyless-model',
    });
    await testAndSave(desktopApp.page);
    firstGenerationProviderIds = await providerIds(desktopApp.page);
    expect(firstGenerationProviderIds).toHaveLength(2);

    // 业务断言：default切换不重排；编辑已有项时Key不回到Renderer，keep仍可真实重测。
    // Business assertions: default changes do not reorder; editing never returns the key to Renderer and keep can retest.
    const [firstProviderId, secondProviderId] = firstGenerationProviderIds as [string, string];
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelRow(firstProviderId),
    )).toHaveAttribute('data-default', 'true');
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelSetDefault(secondProviderId),
    ).click();
    expect(await providerIds(desktopApp.page)).toEqual(firstGenerationProviderIds);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelRow(secondProviderId),
    )).toHaveAttribute('data-default', 'true');

    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelEdit(firstProviderId),
    ).click();
    const apiKeyInput = getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.apiKey);
    await expect(apiKeyInput).toHaveValue('');
    await expect(apiKeyInput).toHaveAttribute('data-credential-configured', 'true');
    await expect(apiKeyInput).toHaveAttribute('data-credential-last-four', '9K4Q');
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.modelId)
      .fill('keyed-model-edited');
    await testAndSave(desktopApp.page);
    expect(await providerIds(desktopApp.page)).toEqual(firstGenerationProviderIds);

    // 重启：同一profile恢复顺序、脱敏状态与default，且启动不自动请求Model。
    // Restart: the same profile restores order, redaction and default without an automatic Model request.
    const requestsBeforeRestart = openAiCompatibleLab.evidence().length;
    await closeGeneration(desktopApp, testInfo, keyedApiKey);
    relaunchedApp = await LocalElectronApplicationDriver.launch(testInfo, {
      userDataDirectory: desktopApp.userDataDirectory,
      evidencePrefix: 'relaunch',
    });
    relaunchedApp.registerSensitiveTextForEvidenceAudit(keyedApiKey);
    await relaunchedApp.waitUntilReady();
    startupRequestCount = openAiCompatibleLab.evidence().length - requestsBeforeRestart;
    expect(startupRequestCount).toBe(0);
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.settings.section.agent).click();
    restoredProviderIds = await providerIds(relaunchedApp.page);
    expect(restoredProviderIds).toEqual(firstGenerationProviderIds);
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentModelRow(secondProviderId),
    )).toHaveAttribute('data-default', 'true');

    // 用户操作：显式移除已存Key并重新Test；同一endpoint不得再收到Authorization。
    // User actions: explicitly remove the saved key and retest; the endpoint must no longer receive Authorization.
    await getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentModelEdit(firstProviderId),
    ).click();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.agent.provider.apiKey,
    )).toHaveAttribute('data-credential-configured', 'true');
    await getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.agent.provider.removeApiKey,
    ).check();
    await expect(getByAutomationId(
      relaunchedApp.page,
      AUTOMATION_IDS.agent.provider.apiKey,
    )).toBeDisabled();
    await testAndSave(relaunchedApp.page);
    await expect(getByAutomationId(
      relaunchedApp.page,
      AutomationIdFactory.agentModelRow(firstProviderId),
    )).toHaveAttribute('data-credential-configured', 'false');
    expect(openAiCompatibleLab.evidence().at(-1)).toMatchObject({
      profileId: 'keyed',
      modelId: 'keyed-model-edited',
      authorizationConfigured: false,
    });

    // 用户操作：删除default后首项接管；删除最后一项回到未配置态。
    // User actions: removing the default promotes the first model; removing the last returns to unconfigured.
    for (const providerId of [secondProviderId, firstProviderId]) {
      await getByAutomationId(
        relaunchedApp.page,
        AutomationIdFactory.agentModelRemove(providerId),
      ).click();
      await expect(getByAutomationId(
        relaunchedApp.page,
        AUTOMATION_IDS.agent.removeProvider.dialog,
      )).toBeVisible();
      await getByAutomationId(
        relaunchedApp.page,
        AUTOMATION_IDS.agent.removeProvider.confirm,
      ).click();
    }
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.models.list))
      .toHaveAttribute('data-model-count', '0');
    expect(relaunchedApp.rendererPageErrors()).toEqual([]);
  } catch (error) {
    workflowError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    if (relaunchedApp !== null) {
      try {
        await closeGeneration(relaunchedApp, testInfo, keyedApiKey);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await attachProviderEvidence(testInfo, {
        firstGenerationProviderIds,
        restoredProviderIds,
        observations: openAiCompatibleLab.evidence(),
        startupRequestCount,
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      cleanupError = new AggregateError(cleanupErrors, 'Provider workflow cleanup failed.');
      await relaunchedApp?.forceCleanup().catch(() => undefined);
    }
  }

  if (workflowError && cleanupError) {
    throw new AggregateError([workflowError, cleanupError], 'Provider workflow and cleanup failed.');
  }
  if (workflowError) throw workflowError;
  if (cleanupError) throw cleanupError;
});
