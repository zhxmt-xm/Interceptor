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
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
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
  await screenshotStep(`添加模型并选择Custom：${draft.profileName} / Add a model and choose Custom: ${draft.profileName}`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toBeVisible();
  await screenshotStep(`打开Custom模型配置：${draft.profileName} / Open Custom model configuration: ${draft.profileName}`);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(draft.profileName);
  await screenshotStep(`填写模型配置名称：${draft.profileName} / Enter the model profile name: ${draft.profileName}`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl).fill(draft.baseUrl);
  await screenshotStep(`填写本机模型服务地址：${draft.profileName} / Enter the local model endpoint: ${draft.profileName}`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl), label: '1' }],
  });
  if (draft.apiKey !== undefined) {
    await beforeApiKey?.();
    await getByAutomationId(page, AUTOMATION_IDS.agent.provider.apiKey).focus();
    for (const character of draft.apiKey) {
      await page.keyboard.insertText(character);
    }
  }
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill(draft.modelId);
  await screenshotStep(`填写Model ID：${draft.profileName} / Enter the Model ID: ${draft.profileName}`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await screenshotStep(`填写模型上下文与输出上限：${draft.profileName} / Enter context and output limits: ${draft.profileName}`, {
    highlights: [
      { target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow), label: '1' },
      { target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput), label: '2' },
    ],
  });
}

/** Test the current draft and save its one-time verification. */
async function testAndSave(page: Page): Promise<void> {
  const save = getByAutomationId(page, AUTOMATION_IDS.agent.provider.save);
  await expect(save).toBeDisabled();
  await screenshotStep('测试当前模型连接，尚不能Save / Test the current connection before Save becomes available', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.agent.provider.connectionStatus,
  )).toHaveAttribute('data-status', 'verified');
  await expect(save).toBeEnabled();
  await screenshotStep('连接验证成功后可以Save / Save becomes available after a successful connection test', {
    highlights: [{ target: save, label: '1' }],
  });
  await save.click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toHaveCount(0);
  await screenshotStep('在Configured models查看已保存的模型 / Inspect the saved model in Configured models');
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
    await screenshotStep('准备：fresh profile进入Settings > Agent，只能看到诚实空列表。 / Arrange: a fresh profile opens Settings > Agent with an honest empty list.');

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
    await screenshotStep('首次测试通过，当前字段可以保存 / The first connection test succeeds for the current fields', {
      highlights: [{ target: save, label: '1' }],
    });
    await getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.modelId)
      .fill('keyed-model-v2');
    await expect(save).toBeDisabled();
    await screenshotStep('修改Model ID后需要重新Test / Changing the Model ID requires another connection test', {
      highlights: [
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.modelId), label: '1' },
        { target: save, label: '2' },
      ],
    });
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
    await screenshotStep('为第二个模型选择Set default / Choose Set default for the second model', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelSetDefault(secondProviderId)), label: '1' }],
    });
    await getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelSetDefault(secondProviderId),
    ).click();
    expect(await providerIds(desktopApp.page)).toEqual(firstGenerationProviderIds);
    await expect(getByAutomationId(
      desktopApp.page,
      AutomationIdFactory.agentModelRow(secondProviderId),
    )).toHaveAttribute('data-default', 'true');
    await screenshotStep('默认模型已改变，配置顺序保持不变 / The default changes without reordering the models', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AutomationIdFactory.agentModelRow(secondProviderId)), label: '1' }],
    });

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
    await screenshotStep('编辑Model ID并保留已存凭据 / Edit the Model ID while retaining the stored credential', {
      highlights: [
        { target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.agent.provider.modelId), label: '1' },
        { target: apiKeyInput, label: '2' },
      ],
    });
    await testAndSave(desktopApp.page);
    expect(await providerIds(desktopApp.page)).toEqual(firstGenerationProviderIds);
    await screenshotStep('业务断言：default切换不重排；编辑已有项时Key不回到Renderer，keep仍可真实重测。 / Business assertions: default changes do not reorder; editing never returns the key to Renderer and keep can retest.');

    // 重启：同一profile恢复顺序、脱敏状态与default，且启动不自动请求Model。
    // Restart: the same profile restores order, redaction and default without an automatic Model request.
    const requestsBeforeRestart = openAiCompatibleLab.evidence().length;
    await screenshotStep('保存模型后正常关闭App / Close the App normally after saving the models', {
      highlights: [{ target: getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.window.close), label: '1' }],
    });
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
    await screenshotStep('真实重启后保留模型顺序和默认项 / Restore model order and the default after a real restart');

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
    await screenshotStep('选择移除已存Key，输入框停用 / Choose to remove the stored key and disable its input');
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
    await screenshotStep('用户操作：显式移除已存Key并重新Test；同一endpoint不得再收到Authorization。 / User actions: explicitly remove the saved key and retest; the endpoint must no longer receive Authorization.');

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
      await screenshotStep('删除模型前核对确认窗口 / Review the confirmation before removing a model', {
        highlights: [
          { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.removeProvider.cancel), label: '1' },
          { target: getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.removeProvider.confirm), label: '2' },
        ],
      });
      await getByAutomationId(
        relaunchedApp.page,
        AUTOMATION_IDS.agent.removeProvider.confirm,
      ).click();
      await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.removeProvider.dialog)).toHaveCount(0);
      await screenshotStep('确认删除后查看剩余模型 / Inspect the remaining models after confirming removal');
    }
    await expect(getByAutomationId(relaunchedApp.page, AUTOMATION_IDS.agent.models.list))
      .toHaveAttribute('data-model-count', '0');
    expect(relaunchedApp.rendererPageErrors()).toEqual([]);
    await screenshotStep('用户操作：删除default后首项接管；删除最后一项回到未配置态。 / User actions: removing the default promotes the first model; removing the last returns to unconfigured.');
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
