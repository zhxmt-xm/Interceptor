import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { Locator } from '@playwright/test';
import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { submitFileDialogPath } from '../../fixtures/ui/file-dialog';

test('rules.root-toolbar exposes the root commands end to end', async ({
  desktopApp, httpTrafficRunner,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'rules.root-toolbar',
  });

  const { page } = desktopApp;
  page.setDefaultTimeout(15_000);

  // 进入 Rules 工作区；driver 已完成冷启动 readiness 收敛。
  // Enter Rules after the driver has settled cold-start proxy readiness.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await screenshotStep('进入 Rules 工作区；driver 已完成冷启动 readiness 收敛。 / Enter Rules after the driver has settled cold-start proxy readiness.');

  // 锁定空树初态，避免把残留 profile 数据误判为 toolbar 行为。
  // Lock the empty-tree baseline so persisted profile data cannot mask the flow.
  const ruleRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleRow,
  );
  const folderRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleFolderRow,
  );
  const folderRename = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.ruleFolderRename,
  );
  await expect(ruleRows).toHaveCount(0);
  await expect(folderRows).toHaveCount(0);
  await screenshotStep('锁定空树初态，避免把残留 profile 数据误判为 toolbar 行为。 / Lock the empty-tree baseline so persisted profile data cannot mask the flow.');

  // 验证三个根级命令及空树导出状态，不依赖当前语言文案。
  // Verify all root commands and the empty-tree export state without localized text.
  const createRule = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.create,
  );
  const createFolder = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.createFolder,
  );
  const exportRules = getByAutomationId(
    page,
    AUTOMATION_IDS.rules.toolbar.exportRules,
  );
  await expect(createRule).toBeVisible();
  await expect(createFolder).toBeVisible();
  await expect(exportRules).toBeDisabled();
  await screenshotStep('验证三个根级命令及空树导出状态，不依赖当前语言文案。 / Verify all root commands and the empty-tree export state without localized text.');

  // 新建 rule 后应打开其 editor，并允许导出当前非空草稿树。
  // Creating a rule opens its editor and enables export for the non-empty draft tree.
  await createRule.click();
  await expect(ruleRows).toHaveCount(1);
  await expect(getByAutomationId(
    page,
    AUTOMATION_IDS.rules.editorName,
  )).toBeVisible();
  await expect(exportRules).toBeEnabled();
  await screenshotStep('新建 rule 后应打开其 editor，并允许导出当前非空草稿树。 / Creating a rule opens its editor and enables export for the non-empty draft tree.');

  // 新建 folder 不得替换或删除刚创建的 rule。
  // Creating a folder must preserve the rule created in the previous step.
  await createFolder.click();
  await expect(folderRename).toBeVisible();
  await folderRename.press('Enter');
  await expect(folderRows).toHaveCount(1);
  await expect(ruleRows).toHaveCount(1);
  await screenshotStep('新建 folder 不得替换或删除刚创建的 rule。 / Creating a folder must preserve the rule created in the previous step.');

  // 用户操作：继续编辑刚创建的同一规则，只有本轮路径受影响。
  // User actions: continue editing the Rule just created, restricting effects to this workflow's paths.
  const automationId = await ruleRows.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.ruleRow)) throw new Error('The Rule omitted its public identity.');
  const ruleId = automationId.slice(AUTOMATION_ID_PREFIXES.ruleRow.length);
  const prefix = '/e2e/rules/actions';
  const field = (name: string, index = 0) => getByAutomationId(page, AutomationIdFactory.ruleActionField(ruleId, index, name));
  const card = () => field('remove').locator('../..');
  const apply = async () => {
    await getByAutomationId(page, AUTOMATION_IDS.rules.apply).click();
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.status.state)).toHaveAttribute('data-state', 'applied');
    await screenshotStep('保存当前规则配置 / Save the current Rule configuration', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.status.state), label: '1' }],
    });
  };
  const replace = async (option: string) => {
    await field('remove').click();
    await screenshotStep(`移除旧动作，准备选择${option} / Remove the previous action before selecting ${option}`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.addAction), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
    await screenshotStep(`打开动作菜单并定位${option} / Locate ${option} in the action menu`, {
      highlights: [{ target: getByAutomationId(page, option), label: '1' }],
    });
    await getByAutomationId(page, option).click();
    await screenshotStep(`添加${option}后的初始字段 / Initial fields after adding ${option}`);
  };
  const request = (suffix: string) => {
    const pathname = `${prefix}/${suffix}`;
    httpTrafficRunner.respondWith(pathname, {
      body: '{"message":"original-action-body"}',
      headers: {
        'content-type': 'application/json', 'x-e2e-action': 'original',
        'content-length': String(Buffer.byteLength('{"message":"original-action-body"}')),
      },
    });
    return httpTrafficRunner.run('h1-json', {
      kind: 'http', protocol: 'h1', method: 'GET', path: pathname, body: '',
      headers: { 'x-e2e-action': 'original' },
    }, desktopApp.capturePort());
  };
  const selectCapturedRequest = async (pathname: string): Promise<Locator> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    const keyword = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);
    await keyword.fill(pathname);
    const row = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow)
      .filter({ hasText: pathname })
      .last();
    await expect(row).toBeVisible();
    if (await row.getAttribute('aria-pressed') !== 'true') await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    const general = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
    await expect(general).toContainText(pathname);
    await screenshotStep(`在Capture选中${pathname} / Select ${pathname} in Capture`, {
      highlights: [{ target: keyword, label: '1' }, { target: row, label: '2' }],
    });
    return row;
  };
  const openCaptureSection = async (
    tab: 'headers' | 'request' | 'timing',
    sectionId: string,
  ): Promise<Locator> => {
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab[tab]).click();
    const heading = getByAutomationId(page, sectionId);
    await expect(heading).toBeVisible();
    if (await heading.getAttribute('aria-expanded') !== 'true') await heading.click();
    const section = heading.locator('..');
    await section.scrollIntoViewIfNeeded();
    return section;
  };
  const inspectResponseBody = async (expectedBody: string, title: string): Promise<string> => {
    await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
    const body = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyPane);
    await expect(body).toBeVisible();
    const rawOption = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.raw);
    const raw = await rawOption.count() > 0
      ? rawOption
      : getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyMode.default);
    await raw.click();
    await expect(raw).toHaveAttribute('aria-checked', 'true');
    // Raw Copy读取完整正文；Monaco的DOM软换行不是响应内容。
    // Raw Copy reads the complete body; Monaco's wrapped DOM is not response content.
    const copy = getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.copy);
    await copy.click();
    let copiedBody = '';
    await expect.poll(async () => {
      copiedBody = await page.evaluate(() => navigator.clipboard.readText());
      return copiedBody;
    }).toBe(expectedBody);
    await copy.scrollIntoViewIfNeeded();
    await screenshotStep(title, { highlights: [{ target: copy, label: '1' }] });
    return copiedBody;
  };
  const returnToRule = async (): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
    await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
    await expect(getByAutomationId(page, AutomationIdFactory.ruleTarget(ruleId)))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(getByAutomationId(page, AUTOMATION_IDS.rules.editorName)).toHaveValue('E2E action variants');
    await screenshotStep('返回同一条E2E action variants继续编辑 / Return to the same E2E action variants Rule');
  };
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await ruleRows.click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E action variants');
  await screenshotStep('填写规则名称 / Enter the Rule name', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorName), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
  await screenshotStep('填写Host匹配条件 / Enter the Host condition', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await screenshotStep('在条件菜单中选择Path / Choose Path from the condition menu', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await screenshotStep('新增待填写的Path条件 / Add the empty Path condition', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
  await screenshotStep('填写本次请求的Path范围 / Enter the request Path scope', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')), label: '1' }],
  });
  await field('name').fill('x-e2e-action');
  await screenshotStep('填写请求Header名称 / Enter the request Header name', {
    highlights: [{ target: field('name'), label: '1' }],
  });
  await field('value').fill('from-rule');
  await screenshotStep('填写请求Header值 / Enter the request Header value', {
    highlights: [{ target: field('value'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('启用完整规则，尚未保存 / Enable the complete Rule before saving', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  for (const phase of ['request', 'response'] as const) {
    await field('phase').click();
    await screenshotStep(`选择${phase} Header阶段 / Choose the ${phase} Header phase`, {
      highlights: [{ target: field(`phase-option.${phase}`), label: '1' }],
    });
    await field(`phase-option.${phase}`).click();
    await screenshotStep(`已选择${phase} Header阶段 / Select the ${phase} Header phase`, {
      highlights: [{ target: field('phase'), label: '1' }],
    });
    for (const operation of ['set', 'append', 'remove'] as const) {
      await field('operation').click();
      await screenshotStep(`在${phase} Header菜单中选择${operation} / Choose ${operation} for the ${phase} Header`, {
        highlights: [{ target: field(`operation-option.${operation}`), label: '1' }],
      });
      await field(`operation-option.${operation}`).click();
      await screenshotStep(`保存前的${phase} Header ${operation}配置 / The ${phase} Header ${operation} configuration before saving`, {
        highlights: [{ target: field('operation'), label: '1' }],
      });
      await apply();
      const result = await request(`${phase}-${operation}`);
      expect(result).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
      const value = phase === 'request'
        ? httpTrafficRunner.observation(`${prefix}/${phase}-${operation}`)?.headers['x-e2e-action']
        : result.response?.headers['x-e2e-action'];
      if (operation === 'remove') expect(value).toBeUndefined();
      else if (operation === 'set') expect(value).toBe('from-rule');
      else {
        expect(String(value)).toContain('original');
        expect(String(value)).toContain('from-rule');
      }
      // 可见结果：网络断言完成后查看同一请求的Header来源，再返回原Rule。
      // Visible result: inspect this request's Header effect after wire assertions, then return to its Rule.
      await selectCapturedRequest(`${prefix}/${phase}-${operation}`);
      const headers = await openCaptureSection('headers', phase === 'request'
        ? AUTOMATION_IDS.capture.inspector.section.requestHeaders
        : AUTOMATION_IDS.capture.inspector.section.responseHeaders);
      const effect = getByAutomationId(
        headers,
        AutomationIdFactory.captureRuleEffect(ruleId, operation, 'x-e2e-action'),
      );
      await expect(effect).toHaveAttribute('data-effect', operation);
      await expect(headers).toContainText('x-e2e-action');
      await expect(headers).toContainText(operation === 'remove' ? 'original' : 'from-rule');
      if (operation === 'append') await expect(headers).toContainText('original');
      await effect.scrollIntoViewIfNeeded();
      await effect.hover();
      await page.mouse.wheel(0, 120);
      await screenshotStep(`Capture中的${phase} Header ${operation}结果 / The ${phase} Header ${operation} result in Capture`, {
        highlights: [{ target: effect, label: '1' }],
      });
      await returnToRule();
      await screenshotStep(`${phase} Header执行${operation} / ${operation} the ${phase} Header`);
    }
  }

  // 修改与模拟：复用同一规则，分别验证Query、状态、模拟响应和延迟的线上结果。
  // Rewriting and simulation: reuse the Rule to verify Query, status, synthetic response and delay on the wire.
  await replace(AUTOMATION_IDS.rules.actionOption.query);
  await card().locator('input:not([readonly])').nth(0).fill('entry');
  await screenshotStep('填写Query参数名称entry / Enter Query parameter name entry', {
    highlights: [{ target: card().locator('input:not([readonly])').nth(0), label: '1' }],
  });
  await card().locator('input:not([readonly])').nth(1).fill('rewritten');
  await screenshotStep('填写Query替换值rewritten / Enter Query replacement value rewritten', {
    highlights: [{ target: card().locator('input:not([readonly])').nth(1), label: '1' }],
  });
  await apply();
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/query-set?entry=original`)).statusCode).toBe(200);
  expect(httpTrafficRunner.observation(`${prefix}/query-set?entry=rewritten`)?.method).toBe('GET');
  // Query证据：Capture保留入站Query，原origin echo正文显示实际转发路径。
  // Query evidence: Capture retains the incoming query; the existing origin echo shows the forwarded path.
  await selectCapturedRequest(`${prefix}/query-set`);
  const querySetInput = await openCaptureSection('request', AUTOMATION_IDS.capture.inspector.section.queryParameters);
  await expect(querySetInput).toContainText('entry');
  await expect(querySetInput).toContainText('original');
  await screenshotStep('Capture中查看Query set的入站参数 / Inspect the incoming Query set parameters in Capture', {
    highlights: [{ target: querySetInput, label: '1' }],
  });
  const querySetBody = await inspectResponseBody(JSON.stringify({
    workflow: 'capture',
    method: 'GET',
    path: `${prefix}/query-set?entry=rewritten`,
    requestBody: '',
    ok: true,
  }), '响应echo显示实际entry=rewritten / The response echo shows the forwarded entry=rewritten');
  expect(JSON.parse(querySetBody).path).toBe(`${prefix}/query-set?entry=rewritten`);
  await returnToRule();
  await screenshotStep('Query set改写实际参数 / Query set rewrites the actual parameter');
  await card().getByRole('combobox').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await screenshotStep('选择Query remove / Select Query remove', {
    highlights: [{ target: card().getByRole('combobox'), label: '1' }],
  });
  await apply();
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/query-remove?entry=original`)).statusCode).toBe(200);
  expect(httpTrafficRunner.observation(`${prefix}/query-remove`)?.method).toBe('GET');
  await selectCapturedRequest(`${prefix}/query-remove`);
  const queryRemoveInput = await openCaptureSection('request', AUTOMATION_IDS.capture.inspector.section.queryParameters);
  await expect(queryRemoveInput).toContainText('entry');
  await expect(queryRemoveInput).toContainText('original');
  await screenshotStep('Capture中查看Query remove的入站参数 / Inspect the incoming Query remove parameters in Capture', {
    highlights: [{ target: queryRemoveInput, label: '1' }],
  });
  const queryRemoveBody = await inspectResponseBody(JSON.stringify({
    workflow: 'capture',
    method: 'GET',
    path: `${prefix}/query-remove`,
    requestBody: '',
    ok: true,
  }), '响应echo显示移除Query后的实际路径 / The response echo shows the path after Query removal');
  expect(JSON.parse(queryRemoveBody).path).toBe(`${prefix}/query-remove`);
  expect(queryRemoveBody).not.toContain('entry=');
  await returnToRule();
  await screenshotStep('Query remove删除实际参数 / Query remove deletes the actual parameter');
  await replace(AUTOMATION_IDS.rules.actionOption.status);
  await card().locator('input[type="number"]').fill('418');
  await screenshotStep('填写响应状态418 / Enter response status 418', {
    highlights: [{ target: card().locator('input[type="number"]'), label: '1' }],
  });
  await apply();
  expect(await request('status')).toMatchObject({ response: { statusCode: 418 } });
  await selectCapturedRequest(`${prefix}/status`);
  const statusResult = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(statusResult).toContainText('418');
  await screenshotStep('Capture中核对状态改写418 / Inspect status 418 in Capture', {
    highlights: [{ target: statusResult, label: '1' }],
  });
  await returnToRule();
  await screenshotStep('Status动作使客户端收到418 / The Status action returns 418 to the client');
  await replace(AUTOMATION_IDS.rules.actionOption.synthetic);
  await card().locator('input[type="number"]').fill('503');
  await screenshotStep('填写模拟响应状态503 / Enter synthetic response status 503', {
    highlights: [{ target: card().locator('input[type="number"]'), label: '1' }],
  });
  await card().locator('textarea').fill('{"message":"synthetic-action-body"}');
  await screenshotStep('填写模拟响应正文 / Enter the synthetic response body', {
    highlights: [{ target: card().locator('textarea'), label: '1' }],
  });
  await card().getByRole('button').last().click();
  await screenshotStep('为模拟响应新增Header行 / Add a Header row to the synthetic response');
  await card().locator('input:not([readonly]):not([type="number"])').nth(0).fill('x-e2e-synthetic');
  await screenshotStep('填写模拟响应Header名称 / Enter the synthetic response Header name', {
    highlights: [{ target: card().locator('input:not([readonly]):not([type="number"])').nth(0), label: '1' }],
  });
  await card().locator('input:not([readonly]):not([type="number"])').nth(1).fill('present');
  await screenshotStep('填写模拟响应Header值 / Enter the synthetic response Header value', {
    highlights: [{ target: card().locator('input:not([readonly]):not([type="number"])').nth(1), label: '1' }],
  });
  await apply();
  expect(await request('synthetic')).toMatchObject({
    response: { statusCode: 503, body: '{"message":"synthetic-action-body"}', headers: { 'x-e2e-synthetic': 'present' } },
  });
  expect(httpTrafficRunner.observation(`${prefix}/synthetic`)).toBeUndefined();
  await selectCapturedRequest(`${prefix}/synthetic`);
  const syntheticStatus = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(syntheticStatus).toContainText('503');
  await screenshotStep('Capture中核对模拟响应503 / Inspect the synthetic response status 503 in Capture', {
    highlights: [{ target: syntheticStatus, label: '1' }],
  });
  const syntheticHeaders = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.responseHeaders);
  await expect(syntheticHeaders).toContainText('x-e2e-synthetic');
  await expect(syntheticHeaders).toContainText('present');
  await screenshotStep('Capture中核对模拟响应Header / Inspect the synthetic response Header in Capture', {
    highlights: [{ target: syntheticHeaders, label: '1' }],
  });
  await inspectResponseBody('{"message":"synthetic-action-body"}', 'Capture中核对模拟响应正文 / Inspect the synthetic response body in Capture');
  await returnToRule();
  await screenshotStep('Synthetic返回指定Header与正文且不访问源站 / Synthetic returns its Header and body without reaching the origin');
  await replace(AUTOMATION_IDS.rules.actionOption.delay);
  await card().locator('input[type="number"]').fill('500');
  await screenshotStep('填写500毫秒Delay / Enter a 500 millisecond Delay', {
    highlights: [{ target: card().locator('input[type="number"]'), label: '1' }],
  });
  await apply();
  const began = performance.now();
  expect(await request('delay')).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
  expect(performance.now() - began).toBeGreaterThanOrEqual(500);
  await selectCapturedRequest(`${prefix}/delay`);
  const delayTiming = await openCaptureSection('timing', AUTOMATION_IDS.capture.inspector.section.timing);
  await screenshotStep('Capture Timing显示本次Delay请求的等待 / Capture Timing shows the wait for this delayed request', {
    highlights: [{ target: delayTiming, label: '1' }],
  });
  await returnToRule();
  await screenshotStep('Delay保留响应并满足实际500ms等待 / Delay preserves the response and waits at least 500 ms');

  // 阻断与恢复：两种方式均不抵达源站；停用Apply后新请求恢复。
  // Blocking and recovery: neither mode reaches the origin; disabling and applying restores new requests.
  await replace(AUTOMATION_IDS.rules.actionOption.block);
  const blockMode = card().getByRole('combobox');
  for (const [index, mode] of ['reset', 'close'].entries()) {
    if (index > 0) {
      await blockMode.click();
      await blockMode.press('ArrowDown');
      await blockMode.press('Enter');
      await screenshotStep('将Block切换为close / Switch Block to close', {
        highlights: [{ target: blockMode, label: '1' }],
      });
    }
    await apply();
    expect(await request(`block-${mode}`)).toMatchObject({ state: 'failed' });
    expect(httpTrafficRunner.observation(`${prefix}/block-${mode}`)).toBeUndefined();
    await selectCapturedRequest(`${prefix}/block-${mode}`);
    const blockedDetails = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
    await expect(blockedDetails).toContainText(`${prefix}/block-${mode}`);
    await screenshotStep(`Capture中查看Block ${mode}失败请求 / Inspect the failed Block ${mode} request in Capture`, {
      highlights: [{ target: blockedDetails, label: '1' }],
    });
    await returnToRule();
    await screenshotStep(`Block ${mode}阻断源站请求 / Block ${mode} prevents an origin request`);
  }
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('停用Block规则，准备保存 / Disable the Block Rule before saving', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply();
  expect(await request('block-disabled')).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
  await selectCapturedRequest(`${prefix}/block-disabled`);
  const unblockedDetails = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(unblockedDetails).toContainText('200');
  await screenshotStep('Capture中核对Block停用后的200 / Inspect status 200 after disabling Block in Capture', {
    highlights: [{ target: unblockedDetails, label: '1' }],
  });
  await returnToRule();
  await screenshotStep('停用并Apply后恢复正常响应 / Disabling and applying restores the normal response');

  // 映射：Map Remote使用真实目标路径，Map Local只读取本次产品Save生成的文件。
  // Mapping: Map Remote reaches a real target path; Map Local only reads a file saved by this product run.
  await replace(AUTOMATION_IDS.rules.actionOption.mapRemote);
  await card().locator('input').last().fill(`${prefix}/remote-target`);
  await screenshotStep('填写Map Remote目标Path / Enter the Map Remote target Path', {
    highlights: [{ target: card().locator('input').last(), label: '1' }],
  });
  httpTrafficRunner.respondWith(`${prefix}/remote-target`, { body: 'mapped-target-body' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('启用Map Remote，准备保存 / Enable Map Remote before saving', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply();
  expect(await request('remote-source')).toMatchObject({ response: { body: 'mapped-target-body' } });
  expect(httpTrafficRunner.observation(`${prefix}/remote-source`)).toBeUndefined();
  expect(httpTrafficRunner.observation(`${prefix}/remote-target`)?.method).toBe('GET');
  await selectCapturedRequest(`${prefix}/remote-source`);
  const mappedRequest = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(mappedRequest).toContainText(`${prefix}/remote-source`);
  await screenshotStep('Capture保留Map Remote的原入口请求 / Capture retains the original Map Remote entry request', {
    highlights: [{ target: mappedRequest, label: '1' }],
  });
  await inspectResponseBody('mapped-target-body', 'Capture显示HTTP目标返回的映射正文 / Capture shows the mapped body returned by the HTTP target');
  await returnToRule();
  await screenshotStep('Map Remote实际访问目标路径 / Map Remote reaches the actual target path');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('停用Map Remote，准备保存文件 / Disable Map Remote before saving the source file', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply();
  const sourcePath = `${prefix}/file-source`;
  expect(await request('file-source')).toMatchObject({ response: { body: '{"message":"original-action-body"}' } });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(sourcePath);
  await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: sourcePath }).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  await screenshotStep('在Capture中选择要保存的响应正文 / Select the source response body in Capture', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response), label: '1' }],
  });
  const exportedFile = testInfo.outputPath('rule-map-source.json');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), exportedFile);
  await expect.poll(() => readFile(exportedFile, 'utf8')).toBe('{"message":"original-action-body"}');
  await screenshotStep('保存rule-map-source.json后返回Capture / Return to Capture after saving rule-map-source.json');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  await replace(AUTOMATION_IDS.rules.actionOption.mapLocal);
  await card().locator('input').fill(testInfo.outputPath('rule-map-missing.json'));
  await screenshotStep('填写不存在的Map Local文件名 / Enter a nonexistent Map Local file name', {
    highlights: [{ target: card().locator('input'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('启用Map Local，准备保存 / Enable Map Local before saving', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply();
  expect(await request('local-missing')).toMatchObject({ response: { statusCode: 404 } });
  await selectCapturedRequest(`${prefix}/local-missing`);
  const missingFileDetails = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(missingFileDetails).toContainText('404');
  await screenshotStep('Capture中核对本地文件缺失404 / Inspect the missing local file status 404 in Capture', {
    highlights: [{ target: missingFileDetails, label: '1' }],
  });
  await returnToRule();
  await card().locator('input').fill(exportedFile);
  await screenshotStep('将Local path改为刚保存的文件 / Correct Local path to the file just saved', {
    highlights: [{ target: card().locator('input'), label: '1' }],
  });
  await apply();
  expect(await request('local-file')).toMatchObject({ response: { statusCode: 200, body: '{"message":"original-action-body"}' } });
  expect(httpTrafficRunner.observation(`${prefix}/local-file`)).toBeUndefined();
  await selectCapturedRequest(`${prefix}/local-file`);
  const localFileDetails = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(localFileDetails).toContainText('200');
  await screenshotStep('Capture中核对本地文件映射200 / Inspect the mapped local file status 200 in Capture', {
    highlights: [{ target: localFileDetails, label: '1' }],
  });
  await inspectResponseBody('{"message":"original-action-body"}', 'Capture中核对产品保存文件返回的正文 / Inspect the body returned from the product-saved file in Capture');
  await returnToRule();
  await screenshotStep('Map Local区分缺失文件与产品实际保存的文件 / Map Local distinguishes a missing file from the product-saved file');

  // 编码边界：仅改Header不编码；显式Body替换才按最终Header产生gzip字节。
  // Encoding boundary: Header-only editing does not encode; explicit Body replacement creates gzip bytes using final Headers.
  await replace(AUTOMATION_IDS.rules.actionOption.header);
  await field('phase').click();
  await field('phase-option.response').click();
  await screenshotStep('为Content-Encoding选择响应阶段 / Select response phase for Content-Encoding', {
    highlights: [{ target: field('phase'), label: '1' }],
  });
  await field('name').fill('content-encoding');
  await screenshotStep('填写content-encoding Header名称 / Enter the content-encoding Header name', {
    highlights: [{ target: field('name'), label: '1' }],
  });
  await field('value').fill('gzip');
  await screenshotStep('将Content-Encoding填写为gzip / Enter gzip as Content-Encoding', {
    highlights: [{ target: field('value'), label: '1' }],
  });
  await apply();
  const unchanged = await request('header-only');
  expect(unchanged.response?.bodyEncoding).toBe('base64');
  expect(Buffer.from(unchanged.response!.body, 'base64').toString('utf8')).toBe('{"message":"original-action-body"}');
  await selectCapturedRequest(`${prefix}/header-only`);
  const encodingHeaders = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.responseHeaders);
  await expect(encodingHeaders).toContainText('content-encoding');
  await expect(encodingHeaders).toContainText('gzip');
  await screenshotStep('Capture中查看仅改写的Content-Encoding / Inspect the Header-only Content-Encoding change in Capture', {
    highlights: [{ target: encodingHeaders, label: '1' }],
  });
  await inspectResponseBody('{"message":"original-action-body"}', 'Capture显示原字节及gzip解码提示 / Capture shows the original bytes and gzip decoding notice');
  await returnToRule();
  await screenshotStep('仅修改Content-Encoding时原始字节不变 / Header-only Content-Encoding editing retains original bytes');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await screenshotStep('保留编码Header并选择Body动作 / Choose Body while retaining the encoding Header', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
  await screenshotStep('在编码Header后添加Body动作 / Add Body after the encoding Header');
  await field('phase', 1).click();
  await field('phase-option.response', 1).click();
  await screenshotStep('为新增Body选择响应阶段 / Select response phase for the new Body action', {
    highlights: [{ target: field('phase', 1), label: '1' }],
  });
  await field('content', 1).fill('{"message":"encoded-action-body"}');
  await screenshotStep('填写显式替换的响应正文 / Enter the explicit replacement response body', {
    highlights: [{ target: field('content', 1), label: '1' }],
  });
  await apply();
  const encoded = await request('body-encoded');
  expect(encoded.response?.bodyEncoding).toBe('base64');
  const encodedBytes = Buffer.from(encoded.response!.body, 'base64');
  expect(gunzipSync(encodedBytes).toString('utf8')).toBe('{"message":"encoded-action-body"}');
  expect(Number(encoded.response?.headers['content-length'])).toBe(encodedBytes.length);
  await selectCapturedRequest(`${prefix}/body-encoded`);
  const encodedHeaders = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.responseHeaders);
  await expect(encodedHeaders).toContainText('gzip');
  await expect(encodedHeaders).toContainText(String(encodedBytes.length));
  await screenshotStep('Capture中核对gzip响应Header和长度 / Inspect gzip response Headers and length in Capture', {
    highlights: [{ target: encodedHeaders, label: '1' }],
  });
  await inspectResponseBody('{"message":"encoded-action-body"}', 'Capture中查看真正gzip响应的解码正文 / Inspect the decoded body of the real gzip response in Capture');
  await returnToRule();
  await screenshotStep('显式替换正文后核对gzip和长度 / Verify gzip and length after explicitly replacing the body');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await screenshotStep('停用正文与编码规则，准备保存 / Disable the body and encoding Rule before saving', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled), label: '1' }],
  });
  await apply();
  expect(await request('all-disabled')).toMatchObject({ response: { statusCode: 200, body: '{"message":"original-action-body"}' } });
  await selectCapturedRequest(`${prefix}/all-disabled`);
  const restoredHeaders = await openCaptureSection('headers', AUTOMATION_IDS.capture.inspector.section.general);
  await expect(restoredHeaders).toContainText('200');
  await inspectResponseBody('{"message":"original-action-body"}', 'Capture中核对最终停用后的原始响应 / Inspect the original response after final disabling in Capture');
  await returnToRule();
  await screenshotStep('恢复普通转发后的已停用规则 / The disabled Rule after normal forwarding is restored');
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});
