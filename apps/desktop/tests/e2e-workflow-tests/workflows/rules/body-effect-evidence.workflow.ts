import { readFile, rm } from 'node:fs/promises';

import type { Locator, Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

const BREAKPOINT_REPLACEMENT_TEXT = 'breakpoints.replacement.text';

/** Extract a Core-owned identifier from one public dynamic automation ID. */
async function dynamicId(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  if (!automationId?.startsWith(prefix)) {
    throw new Error(`Missing dynamic automation ID with prefix ${prefix}.`);
  }
  return automationId.slice(prefix.length);
}

/** Create and apply one Breakpoint Rule entirely through product controls. */
async function createBreakpointRule(
  page: Page,
  phase: 'request' | 'response',
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName)
    .fill(`E2E ${phase} body effect`);
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await screenshotStep(`填写${phase} Breakpoint规则的名称和Host / Enter the ${phase} Breakpoint Rule name and Host`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await screenshotStep(`移除${phase} Breakpoint规则的默认Header / Remove the default Header from the ${phase} Breakpoint Rule`);
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await screenshotStep(`为${phase}规则选择Breakpoint动作 / Choose Breakpoint for the ${phase} Rule`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
  await screenshotStep(`新增Breakpoint动作，准备配置${phase}阶段 / Add a Breakpoint action before configuring the ${phase} phase`);
  if (phase === 'response') {
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.response'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase'),
    ).scrollIntoViewIfNeeded();
    await screenshotStep('为Breakpoint选择响应阶段 / Select response phase for the Breakpoint', {
      highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')), label: '1' }],
    });
  }
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await screenshotStep(`启用${phase} Breakpoint规则 / Enable the ${phase} Breakpoint Rule`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await screenshotStep(`保存${phase} Breakpoint规则 / Save the ${phase} Breakpoint Rule`);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  return ruleId;
}

/** Create and apply one Text body Rule through public body-action controls. */
async function createTextBodyRule(
  page: Page,
  phase: 'request' | 'response',
  name: string,
  content: string,
): Promise<string> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
  await screenshotStep(`打开${phase} Body规则的新建菜单 / Open the create menu for the ${phase} Body Rule`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.create), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
  const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
  await expect(ruleRow).toBeVisible();
  const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
  await screenshotStep(`新建${phase} Body规则 / Create the ${phase} Body Rule`);
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(name);
  await screenshotStep(`填写${phase} Body规则名称 / Enter the ${phase} Body Rule name`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value'),
  ).fill('127.0.0.1');
  await screenshotStep(`填写${phase} Body规则Host / Enter the ${phase} Body Rule Host`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'remove'),
  ).click();
  await screenshotStep(`移除${phase} Body规则的默认Header / Remove the default Header from the ${phase} Body Rule`);
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await screenshotStep(`为${phase}规则选择Body动作 / Choose Body for the ${phase} Rule`, {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
  await screenshotStep(`新增Body动作，准备配置${phase}阶段 / Add a Body action before configuring the ${phase} phase`);
  if (phase === 'request') {
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase'),
    ).click();
    await getByAutomationId(
      page,
      AutomationIdFactory.ruleActionField(ruleId, 0, 'phase-option.request'),
    ).click();
  }
  await screenshotStep(`核对Body的${phase}阶段 / Check the Body ${phase} phase`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'phase')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.ruleActionField(ruleId, 0, 'content'),
  ).fill(content);
  await screenshotStep(`填写${phase} Body替换正文 / Enter the ${phase} Body replacement`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'content')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
  await screenshotStep(`启用${phase} Body规则 / Enable the ${phase} Body Rule`, {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
  await screenshotStep(`保存${phase} Body规则 / Save the ${phase} Body Rule`);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await screenshotStep(`返回Capture准备检查${phase} Body / Return to Capture to inspect the ${phase} Body`);
  return ruleId;
}

/** Set one Rule enabled state and persist it through the real Apply command. */
async function setRuleEnabled(page: Page, ruleId: string, enabled: boolean): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  const toggle = getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId));
  if (await toggle.getAttribute('aria-checked') !== String(enabled)) {
    await toggle.click();
    await screenshotStep(`在列表中${enabled ? '启用' : '停用'}规则 / ${enabled ? 'Enable' : 'Disable'} the Rule in the list`, {
      highlights: [{ target: toggle, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    await screenshotStep(`保存规则的${enabled ? '启用' : '停用'}状态 / Save the Rule's ${enabled ? 'enabled' : 'disabled'} state`, {
      highlights: [{ target: toggle, label: '1' }],
    });
  }
}

/** Select the paused Capture row for one test-owned path. */
async function selectPausedRequest(page: Page, requestPath: string): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
  const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: requestPath })
    .last();
  await expect(row).toBeVisible();
  await row.click();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.executeEdited,
  )).toBeVisible();
}

/** Remove one paused HTTP header using only public dynamic controls. */
async function removeBreakpointHeader(page: Page, headerName: string): Promise<void> {
  const names = page.locator(
    '[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
  );
  await expect.poll(() => names.count()).toBeGreaterThan(0);
  for (let index = 0; index < await names.count(); index += 1) {
    const name = names.nth(index);
    if ((await name.inputValue()).toLowerCase() !== headerName.toLowerCase()) {
      continue;
    }
    const automationId = await name.getAttribute('data-automation-id');
    if (!automationId) {
      break;
    }
    await getByAutomationId(page, automationId.replace(/\.name$/, '.remove')).click();
    return;
  }
  throw new Error(`Breakpoint header not found: ${headerName}`);
}

/** Add one header through the public Breakpoint editor controls. */
async function addBreakpointHeader(
  page: Page,
  name: string,
  value: string,
): Promise<void> {
  const names = page.locator(
    '[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]',
  );
  const count = await names.count();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.addHeader).click();
  await expect(names).toHaveCount(count + 1);
  const nameInput = names.last();
  const automationId = await nameInput.getAttribute('data-automation-id');
  if (!automationId) {
    throw new Error('New Breakpoint header did not expose its automation ID.');
  }
  await nameInput.fill(name);
  await getByAutomationId(page, automationId.replace(/\.name$/, '.value')).fill(value);
}

/** Wait for the origin observation proving that edited bytes crossed the real proxy. */
async function observe(
  loopbackLab: HttpTrafficRunner,
  requestPath: string,
): Promise<NonNullable<ReturnType<HttpTrafficRunner['observation']>>> {
  await expect.poll(() => loopbackLab.observation(requestPath)).toBeDefined();
  const observation = loopbackLab.observation(requestPath);
  if (!observation) {
    throw new Error(`Origin did not observe ${requestPath}.`);
  }
  return observation;
}

test('rules.body-effect-evidence exposes the final body writer', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  test.skip(!['win32', 'darwin'].includes(process.platform), 'Native file dialog workflow requires Windows or macOS.');
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.body-effect-evidence',
  });
  const { page } = desktopApp;
  const requestPath = '/e2e/body-effect-red';
  const original = Buffer.from('{"stage":"original"}');
  const replacement = '{"stage":"final"}';
  const inspectRegularBodyVersion = async (
    version: 'original' | 'final',
    expectedBody: string,
    fileName: string,
  ): Promise<void> => {
    const versionControl = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect[version]);
    await versionControl.click();
    await expect(versionControl).toHaveAttribute('aria-checked', 'true');
    await versionControl.scrollIntoViewIfNeeded();
    await screenshotStep(`选择普通Body的${version}版本 / Select the regular Body ${version} version`, {
      highlights: [{ target: versionControl, label: '1' }],
    });
    const raw = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
    await raw.click();
    await expect(raw).toHaveAttribute('aria-checked', 'true');
    const currentBody = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(currentBody).toContainText(expectedBody);
    await raw.scrollIntoViewIfNeeded();
    await screenshotStep(`查看普通Body ${version}的Raw正文 / Inspect Raw for the regular Body ${version}`, {
      highlights: [{ target: raw, label: '1' }],
    });

    const copy = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
    await copy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expectedBody);
    await screenshotStep(`复制普通Body ${version}正文 / Copy the regular Body ${version}`, {
      highlights: [{ target: copy, label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.fullscreen).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(getByAutomationId(dialog, AUTOMATION_IDS.capture.inspector.bodyPane)).toContainText(expectedBody);
    await screenshotStep(`全屏查看普通Body ${version} / Inspect the regular Body ${version} fullscreen`);
    const headerButtons = dialog.locator('header').getByRole('button');
    await expect(headerButtons).toHaveCount(2);
    await headerButtons.nth(0).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expectedBody);
    await screenshotStep(`从全屏复制普通Body ${version} / Copy the regular Body ${version} from fullscreen`, {
      highlights: [{ target: headerButtons.nth(0), label: '1' }],
    });
    await headerButtons.nth(1).click();
    await expect(dialog).toHaveCount(0);
    await expect(versionControl).toHaveAttribute('aria-checked', 'true');
    await expect(raw).toHaveAttribute('aria-checked', 'true');
    await expect(currentBody).toContainText(expectedBody);
    await screenshotStep(`关闭全屏后保留${version}与Raw / Retain ${version} and Raw after closing fullscreen`, {
      highlights: [{ target: versionControl, label: '1' }],
    });

    const exportedBody = testInfo.outputPath(fileName);
    try {
      const save = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save);
      await save.click();
      await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), exportedBody);
      await expect.poll(() => readFile(exportedBody).catch(() => undefined)).toEqual(Buffer.from(expectedBody));
      await expect(save).toBeEnabled();
      await expect(versionControl).toHaveAttribute('aria-checked', 'true');
      await expect(currentBody).toContainText(expectedBody);
      await testInfo.attach(fileName, { path: exportedBody, contentType: 'application/json' });
      await screenshotStep(`保存${fileName}后保留${version}正文 / Retain the ${version} body after saving ${fileName}`, {
        highlights: [{ target: versionControl, label: '1' }],
      });
    } finally {
      await rm(exportedBody, { force: true });
    }
  };
  const returnFromBodyMarker = async (bodyRuleId: string): Promise<void> => {
    const marker = getByAutomationId(page, AutomationIdFactory.captureBodyRuleEffect(bodyRuleId));
    await marker.scrollIntoViewIfNeeded();
    await screenshotStep('点击普通Body来源前核对标记 / Inspect the regular Body source marker before following it', {
      highlights: [{ target: marker, label: '1' }],
    });
    await marker.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
      .toHaveAttribute('aria-current', 'page');
    const target = getByAutomationId(page, AutomationIdFactory.ruleTarget(bodyRuleId));
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep('普通Body来源返回同一Rule身份 / The regular Body source returns to the same Rule identity', {
      highlights: [{ target, label: '1' }],
    });
  };

  // 中文：通过真实UI开始Recording并创建唯一的request Breakpoint规则。
  // English: Start Recording through the real UI and create the only request Breakpoint Rule.
  await startRecording(desktopApp);
  const ruleId = await createBreakpointRule(page, 'request');

  // 中文：真实POST经8888进入暂停态，再通过产品编辑器提交Text正文替换。
  // English: Send a real POST through 8888, then submit a Text body replacement in the product editor.
  const inFlight = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    requestPath,
    {
      method: 'POST',
      body: original,
      headers: {
        'content-type': 'application/json',
        'content-length': String(original.byteLength),
      },
    },
  );
  await selectPausedRequest(page, requestPath);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(replacement);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(inFlight).resolves.toMatchObject({ statusCode: 200 });
  const observation = await observe(loopbackLab, requestPath);
  expect(observation.body.toString('utf8')).toBe(replacement);
  await screenshotStep('中文：真实POST经8888进入暂停态，再通过产品编辑器提交Text正文替换。 / English: Send a real POST through 8888, then submit a Text body replacement in the product editor.');

  // 中文：数据面成功后，Capture必须公开绑定最终Breakpoint rule的正文证据marker。
  // English: After the data plane succeeds, Capture must expose a body marker bound to the final Breakpoint Rule.
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.source,
  )).toHaveAttribute('data-source', 'text');
  const bodyPane = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyPane,
  );
  await expect.poll(() => bodyPane.textContent()).toContain('final');
  await screenshotStep('查看Breakpoint修改后的请求Final / Inspect the request Final after the Breakpoint edit', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.final), label: '1' }],
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('original');
  await screenshotStep('切换到Breakpoint请求的Original / Switch to the Breakpoint request Original', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.original), label: '1' }],
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.final,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('final');
  await screenshotStep('中文：数据面成功后，Capture必须公开绑定最终Breakpoint rule的正文证据marker。 / English: After the data plane succeeds, Capture must expose a body marker bound to the final Breakpoint Rule.');

  // 中文：marker必须导航回最终写入Rule；随后停用Breakpoint以隔离普通Rule场景。
  // English: The marker must navigate to the final writer Rule; then disable the Breakpoint for the regular Rule scene.
  await getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  ).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
    .toHaveAttribute('aria-current', 'page');
  await screenshotStep('从正文标记返回最终写入规则 / Return from the body marker to the final writer Rule');
  await setRuleEnabled(page, ruleId, false);
  await screenshotStep('中文：marker必须导航回最终写入Rule；随后停用Breakpoint以隔离普通Rule场景。 / English: The marker must navigate to the final writer Rule; then disable the Breakpoint for the regular Rule scene.');

  // 中文：普通Request Text Rule使用chunked输入，origin与Capture分别验证Final和Original。
  // English: A regular Request Text Rule uses chunked input; origin and Capture verify Final and Original.
  const regularPath = '/e2e/body-effect-regular-request';
  const regularOriginal = Buffer.from('{"stage":"regular-original"}');
  const regularFinal = '{"stage":"regular-final"}';
  const regularRuleId = await createTextBodyRule(
    page,
    'request',
    'E2E regular request body',
    regularFinal,
  );
  const regularResponse = await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    regularPath,
    {
      method: 'POST',
      body: regularOriginal,
      headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' },
    },
  );
  expect(regularResponse.statusCode).toBe(200);
  const regularObservation = await observe(loopbackLab, regularPath);
  expect(regularObservation.body.toString('utf8')).toBe(regularFinal);
  expect(regularObservation.headers['transfer-encoding']).toBe('chunked');
  expect(regularObservation.headers['content-length']).toBeUndefined();
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(regularPath);
  const regularRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: regularPath })
    .last();
  await expect(regularRow).toBeVisible();
  await regularRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(regularRuleId),
  )).toBeVisible();
  await expect.poll(() => bodyPane.textContent()).toContain('regular-final');
  await screenshotStep('查看普通请求Body规则的Final / Inspect Final from the regular request Body Rule', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.final), label: '1' }],
  });
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('regular-original');
  await screenshotStep('中文：普通Request Text Rule使用chunked输入，origin与Capture分别验证Final和Original。 / English: A regular Request Text Rule uses chunked input; origin and Capture verify Final and Original.');
  // 版本工具：读取已断言的同一请求，真实复制、全屏和保存各版本，不改变网络输入。
  // Version tools: copy, expand and save each version of the already-verified request without changing traffic.
  await inspectRegularBodyVersion(
    'original',
    regularOriginal.toString('utf8'),
    'body-effect-regular-request-original.json',
  );
  await inspectRegularBodyVersion('final', regularFinal, 'body-effect-regular-request-final.json');
  await returnFromBodyMarker(regularRuleId);

  // 中文：Response Text Rule保留Final，并明确禁用不可观测的Original。
  // English: A Response Text Rule keeps Final while explicitly disabling the unobservable Original.
  await setRuleEnabled(page, regularRuleId, false);
  const responsePath = '/e2e/body-effect-regular-response';
  const responseOriginal = '{"stage":"response-original"}';
  const responseFinal = '{"stage":"response-final"}';
  loopbackLab.respondWith(responsePath, {
    body: responseOriginal,
    headers: { 'transfer-encoding': 'chunked' },
  });
  const responseRuleId = await createTextBodyRule(
    page,
    'response',
    'E2E regular response body',
    responseFinal,
  );
  const responseResult = await loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    responsePath,
  );
  expect(responseResult).toMatchObject({ statusCode: 200, body: responseFinal });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(responsePath);
  const responseRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
    .filter({ hasText: responsePath })
    .last();
  await expect(responseRow).toBeVisible();
  await responseRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(responseRuleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.source,
  )).toHaveAttribute('data-source', 'text');
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  )).toBeDisabled();
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable,
  )).toBeVisible();
  await expect.poll(() => bodyPane.textContent()).toContain('response-final');
  await screenshotStep('中文：Response Text Rule保留Final，并明确禁用不可观测的Original。 / English: A Response Text Rule keeps Final while explicitly disabling the unobservable Original.');
  await inspectRegularBodyVersion('final', responseFinal, 'body-effect-regular-response-final.json');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyEffect.original)).toBeDisabled();
  await returnFromBodyMarker(responseRuleId);

  // 中文：普通Rule先写正文，随后Request Breakpoint Text必须成为唯一最终写入者。
  // English: A regular Rule writes first, then Request Breakpoint Text must become the sole final writer.
  await setRuleEnabled(page, responseRuleId, false);
  await setRuleEnabled(page, regularRuleId, true);
  await setRuleEnabled(page, ruleId, true);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  const overridePath = '/e2e/body-effect-breakpoint-override';
  const overrideOriginal = Buffer.from('{"stage":"override-original"}');
  const overrideFinal = '{"stage":"breakpoint-final"}';
  const overrideRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    overridePath,
    {
      method: 'POST',
      body: overrideOriginal,
      headers: { 'content-type': 'application/json' },
    },
  );
  await selectPausedRequest(page, overridePath);
  await getByAutomationId(page, BREAKPOINT_REPLACEMENT_TEXT).click();
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.body).fill(overrideFinal);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(overrideRequest).resolves.toMatchObject({ statusCode: 200 });
  expect((await observe(loopbackLab, overridePath)).body.toString('utf8')).toBe(overrideFinal);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(ruleId),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureBodyRuleEffect(regularRuleId),
  )).toHaveCount(0);
  await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-final');
  await getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.bodyEffect.original,
  ).click();
  await expect.poll(() => bodyPane.textContent()).toContain('override-original');
  await screenshotStep('中文：普通Rule先写正文，随后Request Breakpoint Text必须成为唯一最终写入者。 / English: A regular Rule writes first, then Request Breakpoint Text must become the sole final writer.');

  // 中文：先用产品Save Dialog生成唯一的File replacement输入，不由测试写业务文件。
  // English: First generate the only File replacement input through the product Save Dialog, never by test seeding.
  await setRuleEnabled(page, ruleId, false);
  await setRuleEnabled(page, regularRuleId, false);
  await setRuleEnabled(page, responseRuleId, false);
  const responseFilePath = '/e2e/body-effect-file-source';
  const responseFileBytes = Buffer.from('{"stage":"breakpoint-file-final"}');
  loopbackLab.respondWith(responseFilePath, {
    body: responseFileBytes,
    headers: { 'content-type': 'application/json' },
  });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    responseFilePath,
  )).resolves.toMatchObject({ statusCode: 200 });
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(responseFilePath);
  const responseFileSourceRow = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureRequestRow,
  ).filter({ hasText: responseFilePath }).last();
  await expect(responseFileSourceRow).toBeVisible();
  await responseFileSourceRow.click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-file-final');
  await screenshotStep('选中用于保存的响应正文 / Select the response body to save', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
  });
  const generatedFile = testInfo.outputPath('body-effect-response-file.json');
  const mainProcessOwner = desktopApp.nativeFileDialogOwner();
  let responseBreakpointRuleId: string | null = null;

  try {
    await getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyAction.save,
    ).click();
    await submitFileDialogPath(mainProcessOwner, generatedFile);
    await expect.poll(async () => readFile(generatedFile).catch(() => null))
      .toEqual(responseFileBytes);
    await screenshotStep('保存响应文件后返回Capture / Return to Capture after saving the response file');

    // 中文：Response Breakpoint通过真实Open Dialog选中该文件并Forward edited。
    // English: A Response Breakpoint selects that file through the real Open Dialog and forwards it.
    responseBreakpointRuleId = await createBreakpointRule(page, 'response');
    const fileTargetPath = '/e2e/body-effect-response-file';
    const responseOriginalForFile = '{"stage":"response-before-file"}';
    loopbackLab.respondWith(fileTargetPath, {
      body: responseOriginalForFile,
      headers: { 'transfer-encoding': 'chunked' },
    });
    const fileResponse = loopbackLab.requestThroughProxy(
      desktopApp.capturePort(),
      fileTargetPath,
    );
    void fileResponse.catch(() => undefined);
    await selectPausedRequest(page, fileTargetPath);
    await getByAutomationId(
      page,
      AUTOMATION_IDS.breakpoints.replacement.file,
    ).click();
    const chooseFile = getByAutomationId(page, AUTOMATION_IDS.breakpoints.chooseFile);
    const filePresentation = await chooseFile.evaluate((button) => {
      const area = button.parentElement;
      if (!area) throw new Error('Replacement file area is missing.');
      const areaStyle = getComputedStyle(area);
      const buttonStyle = getComputedStyle(button);
      const buttonBounds = button.getBoundingClientRect();
      const areaBounds = area.getBoundingClientRect();
      return {
        minHeight: areaStyle.minHeight,
        alignItems: areaStyle.alignItems,
        justifyContent: areaStyle.justifyContent,
        buttonHeight: buttonBounds.height,
        buttonFontSize: buttonStyle.fontSize,
        fillsAreaWidth: buttonBounds.width >= areaBounds.width,
      };
    });
    await testInfo.attach('breakpoint-file-empty-presentation.json', {
      body: Buffer.from(JSON.stringify(filePresentation)), contentType: 'application/json',
    });
    await chooseFile.locator('..').screenshot({ path: testInfo.outputPath('breakpoint-file-empty.png') });
    expect(filePresentation).toMatchObject({
      minHeight: '112px', alignItems: 'center', justifyContent: 'center',
      buttonHeight: 32, buttonFontSize: '11.5px', fillsAreaWidth: false,
    });
    await chooseFile.click();
    await submitFileDialogPath(mainProcessOwner, generatedFile);
    const selectedFile = getByAutomationId(
      page,
      AUTOMATION_IDS.breakpoints.selectedFile,
    );
    await expect(selectedFile).toHaveAttribute(
      'data-file-name',
      'body-effect-response-file.json',
    );
    await expect(selectedFile).not.toContainText(generatedFile);
    await removeBreakpointHeader(page, 'transfer-encoding');
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
    await expect(fileResponse).resolves.toMatchObject({
      statusCode: 200,
      body: responseFileBytes.toString('utf8'),
    });
    await screenshotStep('中文：Response Breakpoint通过真实Open Dialog选中该文件并Forward edited。 / English: A Response Breakpoint selects that file through the real Open Dialog and forwards it.');

    // 中文：Capture只公开File来源和Final，绝不泄漏绝对路径或伪造Response Original。
    // English: Capture exposes only File source and Final, never an absolute path or fabricated Response Original.
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    await expect(getByAutomationId(
      page,
      AutomationIdFactory.captureBodyRuleEffect(responseBreakpointRuleId),
    )).toBeVisible();
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.source,
    )).toHaveAttribute('data-source', 'file');
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.original,
    )).toBeDisabled();
    await expect(getByAutomationId(
      page,
      AUTOMATION_IDS.capture.inspector.bodyEffect.unavailable,
    )).toBeVisible();
    await expect.poll(() => bodyPane.textContent()).toContain('breakpoint-file-final');
    await expect(getByAutomationId(page, AUTOMATION_IDS.app.root))
      .not.toContainText(generatedFile);
    await screenshotStep('中文：Capture只公开File来源和Final，绝不泄漏绝对路径或伪造Response Original。 / English: Capture exposes only File source and Final, never an absolute path or fabricated Response Original.');
  } finally {
    await rm(generatedFile, { force: true });
  }

  if (!responseBreakpointRuleId) {
    throw new Error('Response Breakpoint Rule was not created.');
  }
  await setRuleEnabled(page, responseBreakpointRuleId, false);
  await setRuleEnabled(page, ruleId, true);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await screenshotStep('中文：先用产品Save Dialog生成唯一的File replacement输入，不由测试写业务文件。 / English: First generate the only File replacement input through the product Save Dialog, never by test seeding.');

  // 中文：Continue unmodified保留原文，不能从rule hit反推正文marker。
  // English: Continue unmodified preserves the body and must not infer a body marker from a Rule hit.
  const unmodifiedPath = '/e2e/body-effect-unmodified';
  const unmodifiedBody = Buffer.from('{"stage":"unmodified"}');
  const unmodifiedRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    unmodifiedPath,
    {
      method: 'POST',
      body: unmodifiedBody,
      headers: {
        'content-type': 'application/json',
        'content-length': String(unmodifiedBody.byteLength),
      },
    },
  );
  await selectPausedRequest(page, unmodifiedPath);
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
  await expect(unmodifiedRequest).resolves.toMatchObject({ statusCode: 200 });
  expect((await observe(loopbackLab, unmodifiedPath)).body).toEqual(unmodifiedBody);
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureBodyRuleEffect,
  )).toHaveCount(0);
  await screenshotStep('中文：Continue unmodified保留原文，不能从rule hit反推正文marker。 / English: Continue unmodified preserves the body and must not infer a body marker from a Rule hit.');

  // 中文：只编辑header时仍保留原正文，也不制造body marker。
  // English: A header-only edit still preserves the original body and creates no body marker.
  const headerOnlyPath = '/e2e/body-effect-header-only';
  const headerOnlyBody = Buffer.from('{"stage":"header-only"}');
  const headerOnlyRequest = loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    headerOnlyPath,
    {
      method: 'POST',
      body: headerOnlyBody,
      headers: {
        'content-type': 'application/json',
        'content-length': String(headerOnlyBody.byteLength),
      },
    },
  );
  await selectPausedRequest(page, headerOnlyPath);
  await addBreakpointHeader(page, 'x-body-effect-header-only', 'edited');
  await getByAutomationId(page, AUTOMATION_IDS.breakpoints.executeEdited).click();
  await expect(headerOnlyRequest).resolves.toMatchObject({ statusCode: 200 });
  const headerOnlyObservation = await observe(loopbackLab, headerOnlyPath);
  expect(headerOnlyObservation.body).toEqual(headerOnlyBody);
  expect(headerOnlyObservation.headers['x-body-effect-header-only']).toBe('edited');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.request).click();
  await expect(getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.captureBodyRuleEffect,
  )).toHaveCount(0);
  await screenshotStep('中文：只编辑header时仍保留原正文，也不制造body marker。 / English: A header-only edit still preserves the original body and creates no body marker.');

  // 中文：保存origin证据；driver随后验证正常销毁、8888释放和系统代理恢复。
  // English: Attach origin evidence; the driver then verifies graceful teardown, port release, and proxy restoration.
  await testInfo.attach('body-effect-origin', {
    body: Buffer.from(JSON.stringify({
      path: requestPath,
      ruleId,
      original: original.toString('utf8'),
      final: observation.body.toString('utf8'),
    }, null, 2)),
    contentType: 'application/json',
  });
});

test('rules.body-effect-evidence keeps breakpoint header effects aligned', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  test.setTimeout(120_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'rules.body-effect-evidence' });
  const { page } = desktopApp;

  // 准备：真实Recording与loopback流量，不注入Rule或暂停快照。
  // Arrange: use real Recording and loopback traffic without injecting Rules or paused snapshots.
  await startRecording(desktopApp);
  for (const phase of ['request', 'response'] as const) {
    const operation = phase === 'request' ? 'set' : 'append';
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.rootMenuSurface).click({ button: 'right' });
    await getByAutomationId(page, AUTOMATION_IDS.rules.create).click();
    const ruleRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.ruleRow).last();
    const ruleId = await dynamicId(ruleRow, AUTOMATION_ID_PREFIXES.ruleRow);
    await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill(`E2E ${phase} header layout`);
    await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'name')).fill('x-effect-layout');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'value')).fill('from-rule');
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, 'operation')).click();
    await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, 0, `operation-option.${operation}`)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.breakpoint).click();
    if (phase === 'response') {
      for (const actionIndex of [0, 1]) {
        await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, actionIndex, 'phase')).click();
        await getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, actionIndex, 'phase-option.response')).click();
      }
    }
    await getByAutomationId(page, AutomationIdFactory.ruleToggle(ruleId)).click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.apply)).toBeDisabled();
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const requestPath = `/e2e/header-effect-layout-${phase}`;
    loopbackLab.respondWith(requestPath, {
      body: '{}',
      headers: { 'content-type': 'application/json', 'x-effect-layout': 'origin', 'x-ordinary-layout': 'unchanged' },
    });
    const inFlight = loopbackLab.run('h1-json', {
      kind: 'http',
      protocol: 'h1',
      method: 'GET',
      path: requestPath,
      body: '',
      headers: { 'x-effect-layout': 'client', 'x-ordinary-layout': 'unchanged' },
    }, desktopApp.capturePort());
    void inFlight.catch(() => undefined);
    await selectPausedRequest(page, requestPath);
    const effect = page.locator(
      `[data-automation-id^="breakpoints.header."][data-automation-id$=".effect"][data-effect="${operation}"]`,
    ).first();
    await expect(effect).toBeVisible();
    const effectId = await effect.getAttribute('data-automation-id');
    if (!effectId) throw new Error('Header effect automation ID is missing.');
    const valueInput = getByAutomationId(page, effectId.replace(/\.effect$/, '.value'));
    await expect(valueInput).toHaveValue('from-rule');

    // 布局证据：先保存真实区域与几何，再软断言以便两阶段都正常放行。
    // Layout evidence: capture real geometry before soft assertions so both phases can still resume normally.
    await page.mouse.move(0, 0);
    const names = page.locator('[data-automation-id^="breakpoints.header."][data-automation-id$=".name"]');
    const geometry = await names.evaluateAll((elements) => elements.map((nameInput) => {
      const nameBounds = nameInput.getBoundingClientRect();
      const automationId = nameInput.getAttribute('data-automation-id')!;
      const value = document.querySelector(`[data-automation-id="${automationId.replace(/\.name$/, '.value')}"]`)!;
      const marker = document.querySelector(`[data-automation-id="${automationId.replace(/\.name$/, '.effect')}"]`);
      const row = nameInput.parentElement!;
      const valueBounds = value.getBoundingClientRect();
      const markerBounds = marker?.getBoundingClientRect();
      return {
        nameWidth: nameBounds.width,
        valueLeft: valueBounds.left,
        valueWidth: valueBounds.width,
        rowHeight: row.getBoundingClientRect().height,
        overflow: row.scrollWidth > row.clientWidth,
        effect: marker && markerBounds ? {
          gap: markerBounds.top - valueBounds.bottom,
          rightDelta: markerBounds.right - valueBounds.right,
          height: markerBounds.height,
          fontSize: getComputedStyle(marker).fontSize,
        } : null,
      };
    }));
    await testInfo.attach(`header-effect-${phase}.json`, {
      body: Buffer.from(JSON.stringify(geometry)), contentType: 'application/json',
    });
    const screenshotPath = testInfo.outputPath(`header-effect-${phase}.png`);
    await names.first().locator('../..').screenshot({ path: screenshotPath });
    await testInfo.attach(`header-effect-${phase}`, { path: screenshotPath, contentType: 'image/png' });
    for (const row of geometry) {
      expect.soft(Math.abs(row.nameWidth - geometry[0]!.nameWidth)).toBeLessThan(1);
      expect.soft(Math.abs(row.valueLeft - geometry[0]!.valueLeft)).toBeLessThan(1);
      expect.soft(Math.abs(row.valueWidth - geometry[0]!.valueWidth)).toBeLessThan(1);
      expect.soft(row.overflow).toBe(false);
      expect.soft(row.rowHeight).toBe(row.effect ? 44 : 30);
      if (row.effect) {
        expect.soft(row.effect).toMatchObject({ gap: 2, height: 12, fontSize: '9px' });
        expect.soft(Math.abs(row.effect.rightDelta)).toBeLessThan(0.1);
      }
    }
    await screenshotStep('布局证据：先保存真实区域与几何，再软断言以便两阶段都正常放行。 / Layout evidence: capture real geometry before soft assertions so both phases can still resume normally.');

    // 用户操作与数据断言：编辑后恢复值，增删普通行，再正常放行验证原有Rule结果。
    // User actions and data assertions: restore an edited value, add/remove a row, then resume and verify the Rule result.
    await valueInput.fill('temporary-edit');
    await expect(valueInput).toHaveValue('temporary-edit');
    await valueInput.fill('from-rule');
    await addBreakpointHeader(page, 'x-layout-added', 'temporary');
    await removeBreakpointHeader(page, 'x-layout-added');
    await getByAutomationId(page, AUTOMATION_IDS.breakpoints.continueUnmodified).click();
    const execution = await inFlight;
    expect(execution.error).toBeUndefined();
    const result = execution.response;
    if (!result) throw new Error('The client did not receive a response.');
    expect(result.statusCode).toBe(200);
    if (phase === 'request') {
      expect((await observe(loopbackLab, requestPath)).headers['x-effect-layout']).toBe('from-rule');
    } else {
      expect(String(result.headers['x-effect-layout'])).toContain('from-rule');
      expect(String(result.headers['x-effect-layout'])).toContain('origin');
    }
    // Header来源：完成原网络断言后查看Capture的标记，并实际点击返回原Rule。
    // Header source: inspect Capture after the original wire assertions and follow its marker to the same Rule.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(requestPath);
    const completedRow = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: requestPath })
      .last();
    await expect(completedRow).toBeVisible();
    if (await completedRow.getAttribute('aria-pressed') !== 'true') await completedRow.click();
    await expect(completedRow).toHaveAttribute('aria-pressed', 'true');
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.headers).click();
    const headerSection = getByAutomationId(page, phase === 'request'
      ? AUTOMATION_IDS.capture.inspector.section.requestHeaders
      : AUTOMATION_IDS.capture.inspector.section.responseHeaders);
    await expect(headerSection).toBeVisible();
    if (await headerSection.getAttribute('aria-expanded') !== 'true') await headerSection.click();
    const capturedHeaders = headerSection.locator('..');
    const capturedHeaderEffect = getByAutomationId(
      capturedHeaders,
      AutomationIdFactory.captureRuleEffect(ruleId, operation, 'x-effect-layout'),
    );
    await expect(capturedHeaders).toContainText('from-rule');
    await expect(capturedHeaderEffect).toHaveAttribute('data-effect', operation);
    await capturedHeaders.scrollIntoViewIfNeeded();
    await screenshotStep(`Capture中查看${phase} Header来源 / Inspect the ${phase} Header source in Capture`, {
      highlights: [{ target: capturedHeaderEffect, label: '1' }],
    });
    await capturedHeaderEffect.click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules))
      .toHaveAttribute('aria-current', 'page');
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue(`E2E ${phase} header layout`);
    const returnedRule = getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId));
    await expect(returnedRule).toHaveAttribute('aria-pressed', 'true');
    await screenshotStep(`从${phase} Header标记返回原Rule / Return to the original Rule from the ${phase} Header marker`, {
      highlights: [{ target: returnedRule, label: '1' }],
    });
    await setRuleEnabled(page, ruleId, false);
    await screenshotStep('用户操作与数据断言：编辑后恢复值，增删普通行，再正常放行验证原有Rule结果。 / User actions and data assertions: restore an edited value, add/remove a row, then resume and verify the Rule result.');
  }
  await screenshotStep('准备：真实Recording与loopback流量，不注入Rule或暂停快照。 / Arrange: use real Recording and loopback traffic without injecting Rules or paused snapshots.');

  // 清理：fixture关闭真实应用并验证进程、端口、WinINet和journal恢复。
  // Cleanup: the fixture closes the real application and verifies process, port, WinINet, and journal restoration.
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});
