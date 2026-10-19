import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
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
  };
  const replace = async (option: string) => {
    await field('remove').click();
    await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
    await getByAutomationId(page, option).click();
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
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await startRecording(desktopApp);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await ruleRows.click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorName).fill('E2E action variants');
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 0, 'value')).fill('127.0.0.1');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addCondition).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.conditionOption.path).click();
  await getByAutomationId(page, AutomationIdFactory.ruleMatcherField(ruleId, 1, 'value')).fill(prefix);
  await field('name').fill('x-e2e-action');
  await field('value').fill('from-rule');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  for (const phase of ['request', 'response'] as const) {
    await field('phase').click();
    await field(`phase-option.${phase}`).click();
    for (const operation of ['set', 'append', 'remove'] as const) {
      await field('operation').click();
      await field(`operation-option.${operation}`).click();
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
      await screenshotStep(`${phase} Header执行${operation} / ${operation} the ${phase} Header`);
    }
  }

  // 修改与模拟：复用同一规则，分别验证Query、状态、模拟响应和延迟的线上结果。
  // Rewriting and simulation: reuse the Rule to verify Query, status, synthetic response and delay on the wire.
  await replace(AUTOMATION_IDS.rules.actionOption.query);
  await card().locator('input:not([readonly])').nth(0).fill('entry');
  await card().locator('input:not([readonly])').nth(1).fill('rewritten');
  await apply();
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/query-set?entry=original`)).statusCode).toBe(200);
  expect(httpTrafficRunner.observation(`${prefix}/query-set?entry=rewritten`)?.method).toBe('GET');
  await screenshotStep('Query set改写实际参数 / Query set rewrites the actual parameter');
  await card().getByRole('combobox').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await apply();
  expect((await httpTrafficRunner.requestThroughProxy(desktopApp.capturePort(), `${prefix}/query-remove?entry=original`)).statusCode).toBe(200);
  expect(httpTrafficRunner.observation(`${prefix}/query-remove`)?.method).toBe('GET');
  await screenshotStep('Query remove删除实际参数 / Query remove deletes the actual parameter');
  await replace(AUTOMATION_IDS.rules.actionOption.status);
  await card().locator('input[type="number"]').fill('418');
  await apply();
  expect(await request('status')).toMatchObject({ response: { statusCode: 418 } });
  await screenshotStep('Status动作使客户端收到418 / The Status action returns 418 to the client');
  await replace(AUTOMATION_IDS.rules.actionOption.synthetic);
  await card().locator('input[type="number"]').fill('503');
  await card().locator('textarea').fill('{"message":"synthetic-action-body"}');
  await card().getByRole('button').last().click();
  await card().locator('input:not([readonly]):not([type="number"])').nth(0).fill('x-e2e-synthetic');
  await card().locator('input:not([readonly]):not([type="number"])').nth(1).fill('present');
  await apply();
  expect(await request('synthetic')).toMatchObject({
    response: { statusCode: 503, body: '{"message":"synthetic-action-body"}', headers: { 'x-e2e-synthetic': 'present' } },
  });
  expect(httpTrafficRunner.observation(`${prefix}/synthetic`)).toBeUndefined();
  await screenshotStep('Synthetic返回指定Header与正文且不访问源站 / Synthetic returns its Header and body without reaching the origin');
  await replace(AUTOMATION_IDS.rules.actionOption.delay);
  await card().locator('input[type="number"]').fill('500');
  await apply();
  const began = performance.now();
  expect(await request('delay')).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
  expect(performance.now() - began).toBeGreaterThanOrEqual(500);
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
    }
    await apply();
    expect(await request(`block-${mode}`)).toMatchObject({ state: 'failed' });
    expect(httpTrafficRunner.observation(`${prefix}/block-${mode}`)).toBeUndefined();
    await screenshotStep(`Block ${mode}阻断源站请求 / Block ${mode} prevents an origin request`);
  }
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  expect(await request('block-disabled')).toMatchObject({ state: 'complete', response: { statusCode: 200 } });
  await screenshotStep('停用并Apply后恢复正常响应 / Disabling and applying restores the normal response');

  // 映射：Map Remote使用真实目标路径，Map Local只读取本次产品Save生成的文件。
  // Mapping: Map Remote reaches a real target path; Map Local only reads a file saved by this product run.
  await replace(AUTOMATION_IDS.rules.actionOption.mapRemote);
  await card().locator('input').last().fill(`${prefix}/remote-target`);
  httpTrafficRunner.respondWith(`${prefix}/remote-target`, { body: 'mapped-target-body' });
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  expect(await request('remote-source')).toMatchObject({ response: { body: 'mapped-target-body' } });
  expect(httpTrafficRunner.observation(`${prefix}/remote-source`)).toBeUndefined();
  expect(httpTrafficRunner.observation(`${prefix}/remote-target`)?.method).toBe('GET');
  await screenshotStep('Map Remote实际访问目标路径 / Map Remote reaches the actual target path');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  const sourcePath = `${prefix}/file-source`;
  expect(await request('file-source')).toMatchObject({ response: { body: '{"message":"original-action-body"}' } });
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(sourcePath);
  await getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow).filter({ hasText: sourcePath }).click();
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.tab.response).click();
  const exportedFile = testInfo.outputPath('rule-map-source.json');
  await getByAutomationId(page, AUTOMATION_IDS.capture.inspector.bodyAction.save).click();
  await submitFileDialogPath(desktopApp.nativeFileDialogOwner(), exportedFile);
  await expect.poll(() => readFile(exportedFile, 'utf8')).toBe('{"message":"original-action-body"}');
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AutomationIdFactory.ruleRow(ruleId)).click();
  await replace(AUTOMATION_IDS.rules.actionOption.mapLocal);
  await card().locator('input').fill(testInfo.outputPath('rule-map-missing.json'));
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  expect(await request('local-missing')).toMatchObject({ response: { statusCode: 404 } });
  await card().locator('input').fill(exportedFile);
  await apply();
  expect(await request('local-file')).toMatchObject({ response: { statusCode: 200, body: '{"message":"original-action-body"}' } });
  expect(httpTrafficRunner.observation(`${prefix}/local-file`)).toBeUndefined();
  await screenshotStep('Map Local区分缺失文件与产品实际保存的文件 / Map Local distinguishes a missing file from the product-saved file');

  // 编码边界：仅改Header不编码；显式Body替换才按最终Header产生gzip字节。
  // Encoding boundary: Header-only editing does not encode; explicit Body replacement creates gzip bytes using final Headers.
  await replace(AUTOMATION_IDS.rules.actionOption.header);
  await field('phase').click();
  await field('phase-option.response').click();
  await field('name').fill('content-encoding');
  await field('value').fill('gzip');
  await apply();
  const unchanged = await request('header-only');
  expect(unchanged.response?.bodyEncoding).toBe('base64');
  expect(Buffer.from(unchanged.response!.body, 'base64').toString('utf8')).toBe('{"message":"original-action-body"}');
  await screenshotStep('仅修改Content-Encoding时原始字节不变 / Header-only Content-Encoding editing retains original bytes');
  await getByAutomationId(page, AUTOMATION_IDS.rules.addAction).click();
  await getByAutomationId(page, AUTOMATION_IDS.rules.actionOption.body).click();
  await field('phase', 1).click();
  await field('phase-option.response', 1).click();
  await field('content', 1).fill('{"message":"encoded-action-body"}');
  await apply();
  const encoded = await request('body-encoded');
  expect(encoded.response?.bodyEncoding).toBe('base64');
  const encodedBytes = Buffer.from(encoded.response!.body, 'base64');
  expect(gunzipSync(encodedBytes).toString('utf8')).toBe('{"message":"encoded-action-body"}');
  expect(Number(encoded.response?.headers['content-length'])).toBe(encodedBytes.length);
  await screenshotStep('显式替换正文后核对gzip和长度 / Verify gzip and length after explicitly replacing the body');
  await getByAutomationId(page, AUTOMATION_IDS.rules.editorEnabled).click();
  await apply();
  expect(await request('all-disabled')).toMatchObject({ response: { statusCode: 200, body: '{"message":"original-action-body"}' } });
  expect(desktopApp.rendererPageErrors()).toEqual([]);
});