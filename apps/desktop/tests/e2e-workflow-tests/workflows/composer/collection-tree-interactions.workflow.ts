import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import type { Locator, Page } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { COLLECTION_SAVE_DELAY_MS } from '../../../../src/renderer/features/composer/constants';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { recordScreenshotExample, screenshotStep } from '../../fixtures/runtime/step-screenshots';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';

async function automationSuffix(locator: Locator, prefix: string): Promise<string> {
  const automationId = await locator.getAttribute('data-automation-id');
  expect(automationId?.startsWith(prefix)).toBe(true);
  return automationId!.slice(prefix.length);
}

async function openFolderMenu(page: Page, folderId: string): Promise<void> {
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolder(folderId),
  ).hover();
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolderMenu(folderId),
  ).click();
}

async function verifyRequestAuthentication(page: Page): Promise<void> {
  const username = 'workflow-user';
  const password = 'public-loopback-password';
  const token = 'public-loopback-token';
  const basic = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const bearer = `Bearer ${token}`;
  const authorizations: Array<string | undefined> = [];
  let currentAuth = 'none';
  const origin = createServer((incoming, response) => {
    if (incoming.url !== '/e2e/composer/auth') {
      response.writeHead(404).end();
      return;
    }
    const authorization = incoming.headers.authorization;
    authorizations.push(authorization);
    const status = authorization === basic || authorization === bearer ? 200 : 401;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ marker: `auth-${authorizations.length}`, status }));
  });
  const selectAuth = async (kind: 'none' | 'bearer' | 'basic'): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.auth).click();
    await screenshotStep('打开请求Auth设置 / Open request authentication settings', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.authType), label: '1' }],
    });
    const control = getByAutomationId(page, AUTOMATION_IDS.composer.authType).getByRole('combobox');
    await control.click();
    const types = ['none', 'bearer', 'basic'];
    const distance = types.indexOf(kind) - types.indexOf(currentAuth);
    for (let index = 0; index < Math.abs(distance); index += 1) {
      await control.press(distance > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    await control.press('Enter');
    currentAuth = kind;
    await screenshotStep(`选择Auth ${kind}，尚未重新发送 / Select Auth ${kind} before sending again`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.authType), label: '1' }],
    });
  };
  const send = async (authorization: string | undefined, status: number): Promise<void> => {
    const count = authorizations.length;
    await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
    await expect.poll(() => authorizations.length).toBe(count + 1);
    expect(authorizations[count]).toBe(authorization);
    const response = getByAutomationId(page, AUTOMATION_IDS.composer.responseBodyPane);
    await expect(response).toContainText(`auth-${count + 1}`);
    await expect(response).toContainText(String(status));
  };
  try {
    origin.listen(0, '127.0.0.1');
    await once(origin, 'listening');
    const address = origin.address();
    if (!address || typeof address === 'string') throw new Error('The owned authentication origin has no TCP port.');
    recordScreenshotExample('authentication-origin', `http://127.0.0.1:${address.port}/e2e/composer/auth`);
    await getByAutomationId(page, AUTOMATION_IDS.composer.url).fill(`127.0.0.1:${address.port}/e2e/composer/auth`);
    await screenshotStep('填写自有认证接口地址，尚未发送 / Enter the owned authentication endpoint before sending', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.url), label: '1' }],
    });
    await send(undefined, 401);
    await screenshotStep('None请求由自有认证服务返回401 / The owned authentication service rejects a None request');
    await selectAuth('basic');
    await getByAutomationId(page, AUTOMATION_IDS.composer.username).fill(username);
    await screenshotStep('填写公开Basic示例用户名 / Enter the public Basic example username', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.username), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.password).fill(password);
    await screenshotStep('填完公开Basic示例，尚未发送 / Complete the public Basic example before sending', {
      highlights: [
        { target: getByAutomationId(page, AUTOMATION_IDS.composer.username), label: '1' },
        { target: getByAutomationId(page, AUTOMATION_IDS.composer.password), label: '2' },
      ],
    });
    await send(basic, 200);
    await screenshotStep('Basic仅使用公开本机示例并核对200 / Verify Basic with public loopback-only example values');
    await selectAuth('bearer');
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken)).toBeVisible();
    await getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken).fill(token);
    await screenshotStep('填写公开Bearer示例，尚未发送 / Enter the public Bearer example before sending', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.bearerToken), label: '1' }],
    });
    await send(bearer, 200);
    await screenshotStep('切换Bearer并核对真实Authorization / Switch to Bearer and verify the actual Authorization');
    await selectAuth('none');
    await send(undefined, 401);
    await screenshotStep('切回None后不再发送自动认证字段 / Switching to None removes the derived authentication header');
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await screenshotStep('Auth None下打开Headers / Open Headers with Auth None', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill('Authorization');
    await screenshotStep('填写显式Authorization Header名称 / Enter the explicit Authorization header name', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(bearer);
    await screenshotStep('填写公开Authorization示例值，尚未添加 / Enter the public Authorization example before adding the row', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    await screenshotStep('添加显式Authorization，尚未发送 / Add the explicit Authorization header before sending', {
      highlights: [{ target: page.locator('input[value="Authorization"]').locator('..'), label: '1' }],
    });
    await send(bearer, 200);
    await screenshotStep('None仍保留用户显式添加的Header / None retains an explicitly authored header');
    await page.locator('input[value="Authorization"]').locator('..').getByRole('button').click();
    await screenshotStep('删除显式Authorization，尚未重新发送 / Delete the explicit Authorization header before resending', {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name), label: '1' }],
    });
    await send(undefined, 401);
    await screenshotStep('删除显式Authorization后重新核对401 / Verify 401 after deleting the explicit Authorization');
  } finally {
    if (origin.listening) {
      await new Promise<void>((resolve, reject) => origin.close((error) => error ? reject(error) : resolve()));
    }
  }
}

async function verifyRequestFields(page: Page, loopbackLab: HttpTrafficRunner): Promise<void> {
  const prefix = '/e2e/composer/fields';
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  const method = getByAutomationId(page, AUTOMATION_IDS.composer.method);
  const body = getByAutomationId(page, AUTOMATION_IDS.composer.body);
  const bodyModes = () => getByAutomationId(page, AUTOMATION_IDS.composer.bodyType).locator('..').getByRole('radio');
  const fillUrl = async (pathname: string): Promise<void> => {
    const target = new URL(loopbackLab.url(pathname));
    await url.fill(`${target.host}${target.pathname}${target.search}`);
    await screenshotStep('更新请求URL，尚未发送 / Update the request URL before sending', {
      highlights: [{ target: url, label: '1' }],
    });
  };
  const addHeader = async (name: string, value: string): Promise<void> => {
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name).fill(name);
    await screenshotStep(`填写Header名称${name} / Enter the ${name} header name`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value).fill(value);
    await screenshotStep(`填写${name}的值，尚未添加 / Enter the ${name} value before adding the row`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.value), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.addHeader).click();
    await screenshotStep(`添加并启用${name} / Add and enable ${name}`, {
      highlights: [{ target: page.locator(`input[value=${JSON.stringify(name)}]`).locator('..'), label: '1' }],
    });
  };
  const headerRow = (name: string) => page.locator(`input[value=${JSON.stringify(name)}]`).locator('..');
  const send = async (pathname: string) => {
    const count = loopbackLab.evidence().length;
    await getByAutomationId(page, AUTOMATION_IDS.composer.send).click();
    await expect.poll(() => loopbackLab.evidence().length).toBe(count + 1);
    await expect(getByAutomationId(page, AUTOMATION_IDS.composer.send)).toBeEnabled();
    const observation = loopbackLab.observation(pathname);
    if (!observation) throw new Error(`The owned origin did not receive ${pathname}.`);
    return observation;
  };

  // 用户操作：Query保留同名行和URL参数，Body/Content-Type由实际编辑决定。
  // User actions: preserve duplicate Query/URL values; actual edits determine Body and Content-Type.
  await method.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await screenshotStep('选择POST方法 / Select the POST method', {
    highlights: [{ target: method, label: '1' }],
  });
  await addHeader('x-e2e-current', 'enabled');
  await addHeader('Content-Type', 'application/json');
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  await screenshotStep('打开尚未添加行的Query表格 / Open Query before adding rows', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name), label: '1' }],
  });
  for (const value of ['table', 'again']) {
    await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name).fill('entry');
    await screenshotStep(`填写Query名称，准备添加${value} / Enter the Query name for ${value}`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.name), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value).fill(value);
    await screenshotStep(`填写Query值${value} / Enter the Query value ${value}`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.queryDraft.value), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.addQuery).click();
    await screenshotStep(`添加同名Query行entry=${value} / Add the entry=${value} Query row`, {
      highlights: [{ target: page.locator('input[value="entry"]').last().locator('..'), label: '1' }],
    });
  }
  const jsonText = '{"message":"formatted-request","count":2}';
  for (const [kind, index, contentType] of [
    ['json', 1, 'application/json'],
    ['text', 2, 'text/plain'],
    ['form', 3, 'application/x-www-form-urlencoded'],
  ] as const) {
    const count = loopbackLab.evidence().length;
    await fillUrl(`${prefix}/${kind}?entry=url`);
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
    await headerRow('Content-Type').locator('input:not([type="checkbox"])').nth(1).fill(contentType);
    await screenshotStep(`设置${kind}请求的Content-Type / Set Content-Type for the ${kind} request`, {
      highlights: [{ target: headerRow('Content-Type'), label: '1' }],
    });
    await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
    await screenshotStep(`打开Body，准备切换为${kind} / Open Body before selecting ${kind}`);
    await bodyModes().nth(index).click();
    await screenshotStep(`选择${kind}正文类型，尚未输入 / Select the ${kind} body type before entering its content`, {
      highlights: [{ target: bodyModes().nth(index), label: '1' }],
    });
    if (kind === 'form') {
      for (const [name, value] of [['name', 'Interceptor'], ['ready', 'true']]) {
        await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.name).fill(name!);
        await getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.value).fill(value!);
        await screenshotStep(`填写Form字段${name}，尚未添加 / Enter the ${name} Form field before adding it`, {
          highlights: [
            { target: getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.name), label: '1' },
            { target: getByAutomationId(page, AUTOMATION_IDS.composer.formDraft.value), label: '2' },
          ],
        });
        await getByAutomationId(page, AUTOMATION_IDS.composer.addForm).click();
        await screenshotStep(`添加Form字段${name} / Add the ${name} Form field`, {
          highlights: [{ target: page.locator(`input[value=${JSON.stringify(name)}]`).locator('..'), label: '1' }],
        });
      }
    } else {
      await body.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(kind === 'json' ? jsonText : 'Hello text');
      await screenshotStep(`输入${kind}正文，尚未Format或Send / Enter the ${kind} body before Format or Send`, {
        highlights: [{ target: body, label: '1' }],
      });
      if (kind === 'json') await body.locator('xpath=preceding-sibling::div[1]').getByRole('button').first().click();
      if (kind === 'json') await screenshotStep('Format后的JSON，尚未发送 / Inspect formatted JSON before sending', {
        highlights: [{ target: body, label: '1' }],
      });
    }
    expect(loopbackLab.evidence()).toHaveLength(count);
    const observation = await send(`${prefix}/${kind}?entry=url&entry=table&entry=again`);
    expect(observation.method).toBe('POST');
    expect(observation.headers['content-type']).toBe(contentType);
    expect(observation.headers['x-e2e-current']).toBe('enabled');
    const sentBody = observation.body.toString('utf8');
    if (kind === 'json') {
      expect(JSON.parse(sentBody)).toEqual(JSON.parse(jsonText));
      expect(sentBody).toContain('\n');
    } else {
      expect(sentBody).toBe(kind === 'text' ? 'Hello text' : 'name=Interceptor&ready=true');
    }
    expect(new URL(observation.path, 'http://127.0.0.1').searchParams.getAll('entry')).toEqual(['url', 'table', 'again']);
    await screenshotStep(`发送${kind}并核对重复Query与完整正文 / Send ${kind} and verify duplicate Query values and complete body bytes`);
  }

  // 历史恢复：只恢复method和已组合URL，当前Query、Header及Text不被旧快照覆盖。
  // History restoration: restore only method/composed URL, never replace the current Query, Header or Text.
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  await screenshotStep('重发前查看当前Query行 / Inspect the current Query rows before replay');
  await page.locator('input[value="table"]').fill('current');
  await screenshotStep('将当前Query值改为current / Change the current Query value to current', {
    highlights: [{ target: page.locator('input[value="current"]').locator('..'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
  await headerRow('x-e2e-current').locator('input:not([type="checkbox"])').nth(1).fill('current');
  await headerRow('Content-Type').locator('input:not([type="checkbox"])').nth(1).fill('text/plain');
  await screenshotStep('设置本次重发使用的Headers / Set the Headers used by the next replay', {
    highlights: [
      { target: headerRow('x-e2e-current'), label: '1' },
      { target: headerRow('Content-Type'), label: '2' },
    ],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  await bodyModes().nth(2).click();
  await body.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('Hello replay');
  await screenshotStep('输入本次重发正文Hello replay / Enter Hello replay for the next send', {
    highlights: [{ target: body, label: '1' }],
  });
  await method.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await screenshotStep('选择历史记录前的方法与当前正文 / Inspect the method and current body before choosing history', {
    highlights: [
      { target: method, label: '1' },
      { target: body, label: '2' },
    ],
  });
  const beforeHistory = loopbackLab.evidence().length;
  await getByAutomationId(page, AUTOMATION_IDS.composer.history).click();
  await screenshotStep('打开Recent sends菜单 / Open the Recent sends menu', {
    highlights: [{
      target: page.getByRole('button').filter({ hasText: `${prefix}/json?entry=url&entry=table&entry=again` }),
      label: '1',
    }],
  });
  await page.getByRole('button').filter({
    hasText: `${prefix}/json?entry=url&entry=table&entry=again`,
  }).click();
  await expect(method).toContainText('POST');
  await expect(body).toContainText('Hello replay');
  expect(loopbackLab.evidence()).toHaveLength(beforeHistory);
  await screenshotStep('恢复历史POST与已组合URL，保留当前正文且尚未重发 / Restore the historical POST and composed URL without sending or replacing the current body', {
    highlights: [
      { target: url, label: '1' },
      { target: body, label: '2' },
    ],
  });
  const replay = await send(`${prefix}/json?entry=url&entry=table&entry=again&entry=current&entry=again`);
  expect(replay.body.toString('utf8')).toBe('Hello replay');
  expect(replay.headers['x-e2e-current']).toBe('current');
  expect(replay.headers['content-type']).toBe('text/plain');
  expect(new URL(replay.path, 'http://127.0.0.1').searchParams.getAll('entry'))
    .toEqual(['url', 'table', 'again', 'current', 'again']);
  await screenshotStep('Recent sends重发使用当前字段与正文 / Recent sends replay uses the current fields and body');

  // 业务断言：停用与删除分别操作；Body None不发送残留正文。
  // Business assertions: disabling and deleting are separate actions; Body None sends no retained body.
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  for (const row of await page.locator('input[value="entry"]').all()) {
    await row.locator('..').getByRole('checkbox').click();
    await screenshotStep('停用Query行但保留名称和值 / Disable a Query row while retaining its name and value', {
      highlights: [{ target: row.locator('..'), label: '1' }],
    });
  }
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
  await headerRow('x-e2e-current').getByRole('checkbox').click();
  await screenshotStep('停用Header行但保留其值 / Disable the Header row while retaining its value', {
    highlights: [{ target: headerRow('x-e2e-current'), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.body).click();
  await bodyModes().first().click();
  await expect(body).toHaveCount(0);
  await screenshotStep('选择Body None，尚未发送 / Select Body None before sending', {
    highlights: [{ target: bodyModes().first(), label: '1' }],
  });
  await fillUrl(`${prefix}/disabled`);
  const disabled = await send(`${prefix}/disabled`);
  expect(disabled.headers['x-e2e-current']).toBeUndefined();
  expect(disabled.body.byteLength).toBe(0);
  await screenshotStep('停用的字段和Body None均不发送 / Disabled fields and Body None are not sent');
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.query).click();
  for (let index = 0; index < 2; index += 1) {
    await page.locator('input[value="entry"]').first().locator('..').getByRole('button').click();
    await screenshotStep(`删除第${index + 1}条Query行 / Delete Query row ${index + 1}`, {
      highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.tab.query), label: '1' }],
    });
  }
  await expect(page.locator('input[value="entry"]')).toHaveCount(0);
  await getByAutomationId(page, AUTOMATION_IDS.composer.tab.headers).click();
  await headerRow('x-e2e-current').getByRole('button').click();
  await screenshotStep('删除自定义Header，保留Content-Type / Delete the custom Header while retaining Content-Type', {
    highlights: [{ target: headerRow('Content-Type'), label: '1' }],
  });
  await headerRow('Content-Type').getByRole('button').click();
  await screenshotStep('删除Content-Type后查看空Headers表格 / Inspect the empty Headers table after deleting Content-Type', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.headerDraft.name), label: '1' }],
  });
  await method.click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await screenshotStep('删除测试字段后保留同一请求身份 / Delete the test fields while retaining the same request identity');
}

test('composer.collection.tree-interactions keeps tree intent and layout independent', async ({
  desktopApp, httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'composer.collection.tree-interactions',
  });

  const { page } = desktopApp;
  const folderRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionFolder,
  );
  const renameFields = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );

  // 通过toolbar与目录菜单连续创建三级目录，每次都走同一行内rename流程。
  // Create three folder levels through the toolbar and folder menus, using the same inline rename flow.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  await screenshotStep('打开Composer的Collection工具栏 / Open the Composer Collection toolbar', {
    highlights: [{ target: getByAutomationId(page, AUTOMATION_IDS.composer.newFolder), label: '1' }],
  });
  await getByAutomationId(page, AUTOMATION_IDS.composer.newFolder).click();
  await expect(renameFields).toHaveCount(1);
  await screenshotStep('新建根目录并进入名称编辑 / Create a root folder and edit its name', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  const level1Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 1');
  await renameFields.press('Enter');
  await screenshotStep('保存第一级目录名称 / Save the first-level folder name', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(level1Id)), label: '1' }],
  });

  await openFolderMenu(page, level1Id);
  await screenshotStep('在第一级目录菜单中找到New folder / Locate New folder in the first-level folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level1Id, 'new-folder')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level1Id, 'new-folder'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  const level2Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 2');
  await renameFields.press('Enter');
  await screenshotStep('保存第二级目录名称 / Save the second-level folder name', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(level2Id)), label: '1' }],
  });

  await openFolderMenu(page, level2Id);
  await screenshotStep('在第二级目录菜单中找到New folder / Locate New folder in the second-level folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level2Id, 'new-folder')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level2Id, 'new-folder'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  const level3Id = await automationSuffix(
    renameFields,
    AUTOMATION_ID_PREFIXES.composerCollectionFolderRename,
  );
  await renameFields.fill('E2E level 3');
  await renameFields.press('Enter');
  await expect(folderRows).toHaveCount(3);
  await screenshotStep('通过toolbar与目录菜单连续创建三级目录，每次都走同一行内rename流程。 / Create three folder levels through the toolbar and folder menus, using the same inline rename flow.');

  // 第三层菜单必须禁用继续嵌套，但仍允许在该目录中新建request。
  // The third-level menu must disable deeper nesting while still allowing request creation.
  await openFolderMenu(page, level3Id);
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-folder'),
  )).toBeDisabled();
  await screenshotStep('第三级菜单禁用New folder，仍可New request / The third-level menu disables New folder but permits New request', {
    highlights: [
      { target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-folder')), label: '1' },
      { target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-request')), label: '2' },
    ],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-request'),
  ).click();
  const requestRows = getByAutomationIdPrefix(
    page,
    AUTOMATION_ID_PREFIXES.composerCollectionRequest,
  );
  await expect(requestRows).toHaveCount(1);
  await screenshotStep('在第三级目录中新建Untitled请求 / Create an Untitled request in the third-level folder', {
    highlights: [{ target: requestRows, label: '1' }],
  });
  const requestId = await automationSuffix(
    requestRows,
    AUTOMATION_ID_PREFIXES.composerCollectionRequest,
  );
  const requestUrl = loopbackLab.url('/e2e/collection/first').replace(/^http:\/\//, '');
  const url = getByAutomationId(page, AUTOMATION_IDS.composer.url);
  await url.fill(`http://${requestUrl}`);
  await screenshotStep('填写第三级目录中请求的URL，尚未发送 / Enter the nested request URL before sending', {
    highlights: [{ target: url, label: '1' }],
  });

  // request右键菜单进入同一行内rename，提交后节点身份与打开文档保持。
  // Use the request context menu for inline rename while preserving node identity and the open document.
  await requestRows.click({ button: 'right' });
  await screenshotStep('打开请求菜单，选择Rename / Open the request menu and locate Rename', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename')), label: '1' }],
  });
  await getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionNodeAction(requestId, 'rename'),
  ).click();
  await expect(renameFields).toHaveCount(1);
  await expect(renameFields).toHaveAttribute(
    'data-automation-id',
    AutomationIdFactory.composerCollectionFolderRename(requestId),
  );
  await renameFields.fill('E2E renamed request');
  await screenshotStep('填写请求新名称，尚未提交 / Enter the new request name before committing it', {
    highlights: [{ target: renameFields, label: '1' }],
  });
  await renameFields.press('Enter');

  // 在节流保存触发前立即卸载Composer，返回后必须由Core恢复最新rename与URL。
  // Unmount Composer before the debounce fires; remount must restore the latest rename and URL from Core.
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.rules).click();
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.composer).click();
  const persistedRequest = getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionRequest(requestId),
  );
  await page.waitForTimeout(COLLECTION_SAVE_DELAY_MS * 2);
  const persistedRequestCount = await persistedRequest.count();
  const remountPersistence = {
    count: persistedRequestCount,
    name: persistedRequestCount ? await persistedRequest.textContent() : null,
    url: await url.count() ? await url.inputValue() : null,
  };
  expect(remountPersistence).toMatchObject({
    count: 1,
    name: expect.stringContaining('E2E renamed request'),
    url: requestUrl,
  });
  await screenshotStep('在节流保存触发前立即卸载Composer，返回后必须由Core恢复最新rename与URL。 / Unmount Composer before the debounce fires; remount must restore the latest rename and URL from Core.');

  // 目录选择和空白取消只改变新建落点，不得关闭或替换当前request。
  // Folder selection and whitespace clearing change only the creation target, never the active request.
  const level1Target = getByAutomationId(
    page,
    AutomationIdFactory.composerCollectionFolderTarget(level1Id),
  );
  await level1Target.click();
  await expect(level1Target).toHaveAttribute('aria-pressed', 'true');
  await expect(url).toHaveValue(requestUrl);
  await screenshotStep('选择目录作为新建落点，保留当前请求 / Select the creation folder while retaining the active request', {
    highlights: [
      { target: level1Target, label: '1' },
      { target: url, label: '2' },
    ],
  });
  const collectionTree = getByAutomationId(page, AUTOMATION_IDS.composer.collectionTree);
  const treeBox = await collectionTree.boundingBox();
  expect(treeBox).not.toBeNull();
  await collectionTree.click({ position: { x: 12, y: treeBox!.height - 8 } });
  await expect(level1Target).toHaveAttribute('aria-pressed', 'false');
  await expect(url).toHaveValue(requestUrl);
  await screenshotStep('目录选择和空白取消只改变新建落点，不得关闭或替换当前request。 / Folder selection and whitespace clearing change only the creation target, never the active request.');

  // 拖动Collection splitter只改变左栏宽度，树与当前文档仍保持可用。
  // Drag the Collection splitter to change only layout while preserving the tree and active document.
  const collection = getByAutomationId(page, AUTOMATION_IDS.composer.collection);
  const splitter = getByAutomationId(page, AUTOMATION_IDS.composer.collectionSplitter);
  const widthBefore = (await collection.boundingBox())!.width;
  const splitterBox = await splitter.boundingBox();
  expect(splitterBox).not.toBeNull();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + 80, splitterBox!.y + 100);
  await page.mouse.up();
  const widthAfter = (await collection.boundingBox())!.width;
  expect(widthAfter).toBeGreaterThan(widthBefore + 60);
  await expect(folderRows).toHaveCount(3);
  await expect(url).toHaveValue(requestUrl);
  await screenshotStep('拖动Collection splitter只改变左栏宽度，树与当前文档仍保持可用。 / Drag the Collection splitter to change only layout while preserving the tree and active document.');

  // 保存动态ID、层级几何与splitter证据；driver随后负责trace和完整销毁。
  // Save dynamic IDs, nesting geometry, and splitter evidence; the driver owns trace and teardown.
  const folderBoxes = await Promise.all([level1Id, level2Id, level3Id].map((folderId) =>
    getByAutomationId(
      page,
      AutomationIdFactory.composerCollectionFolderTarget(folderId),
    ).boundingBox()));
  expect(folderBoxes.every(Boolean)).toBe(true);
  expect(folderBoxes[1]!.x - folderBoxes[0]!.x).toBeCloseTo(30, 1);
  expect(folderBoxes[2]!.x - folderBoxes[1]!.x).toBeCloseTo(26, 1);
  const methodAlignment = await persistedRequest.evaluate((row) => {
    const badge = row.firstElementChild!;
    const title = row.lastElementChild!;
    const rowBounds = row.getBoundingClientRect();
    const badgeBounds = badge.getBoundingClientRect();
    const titleBounds = title.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(badge);
    const textBounds = range.getBoundingClientRect();
    const rowCenter = rowBounds.y + rowBounds.height / 2;
    const badgeStyle = getComputedStyle(badge);
    return {
      display: badgeStyle.display,
      alignItems: badgeStyle.alignItems,
      justifyContent: badgeStyle.justifyContent,
      badgeWidth: badgeBounds.width,
      badgeHeight: badgeBounds.height,
      badgeCenterDelta: badgeBounds.y + badgeBounds.height / 2 - rowCenter,
      titleCenterDelta: titleBounds.y + titleBounds.height / 2 - rowCenter,
      textTop: textBounds.top - badgeBounds.top,
      textBottom: badgeBounds.bottom - textBounds.bottom,
      textLeft: textBounds.left - badgeBounds.left,
      textRight: badgeBounds.right - textBounds.right,
      pixelRatio: window.devicePixelRatio,
    };
  });
  const evidencePath = testInfo.outputPath('collection-tree-state.json');
  await writeFile(evidencePath, JSON.stringify({
    folderIds: [level1Id, level2Id, level3Id],
    requestId,
    folderX: folderBoxes.map((box) => box!.x),
    requestUrl,
    remountPersistence,
    widthBefore,
    widthAfter,
    methodAlignment,
  }, null, 2), 'utf8');
  await testInfo.attach('collection-tree-state', {
    path: evidencePath,
    contentType: 'application/json',
  });
  await screenshotStep('保存动态ID、层级几何与splitter证据；driver随后负责trace和完整销毁。 / Save dynamic IDs, nesting geometry, and splitter evidence; the driver owns trace and teardown.');

  // 标签通过flex在固定尺寸中居中文字，外框与标题保持居中对齐。
  // Center badge text with flex in a fixed frame, and align the frame with its title.
  expect(methodAlignment).toMatchObject({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    badgeWidth: 40,
    badgeHeight: 16,
  });
  expect(methodAlignment.badgeCenterDelta).toBeCloseTo(0, 1);
  expect(methodAlignment.titleCenterDelta).toBeCloseTo(0, 1);
  expect(Math.abs(methodAlignment.textTop - methodAlignment.textBottom))
    .toBeLessThanOrEqual(1 / methodAlignment.pixelRatio);
  expect(Math.abs(methodAlignment.textLeft - methodAlignment.textRight))
    .toBeLessThanOrEqual(1 / methodAlignment.pixelRatio);

  // 请求字段：在同一真实文档补齐Auth、Body、Query和历史的必要网络断言。
  // Request fields: verify Auth, Body, Query and history against real network results on this same document.
  expect(loopbackLab.evidence()).toHaveLength(0);
  await verifyRequestAuthentication(page);
  await verifyRequestFields(page, loopbackLab);
  await url.fill(requestUrl);
  const explicitSendCount = loopbackLab.evidence().length;

  // 用户操作：同一目录新建另一请求，切换、改名和拖动不能串改请求内容。
  // User actions: create a sibling request; switching, renaming and dragging must preserve each document.
  await openFolderMenu(page, level3Id);
  await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'new-request')).click();
  await expect(requestRows).toHaveCount(2);
  const secondId = await automationSuffix(requestRows.last(), AUTOMATION_ID_PREFIXES.composerCollectionRequest);
  const secondRequest = getByAutomationId(page, AutomationIdFactory.composerCollectionRequest(secondId));
  const secondUrl = loopbackLab.url('/e2e/collection/second').replace(/^http:\/\//, '');
  await url.fill(secondUrl);
  await screenshotStep('填写同目录第二条请求的独立URL / Enter a separate URL for the sibling request', {
    highlights: [
      { target: secondRequest, label: '1' },
      { target: url, label: '2' },
    ],
  });
  await persistedRequest.click();
  await expect(url).toHaveValue(requestUrl);
  await screenshotStep('切回第一条请求，恢复它自己的URL / Switch to the first request and recover its own URL', {
    highlights: [
      { target: persistedRequest, label: '1' },
      { target: url, label: '2' },
    ],
  });
  await secondRequest.click();
  await expect(url).toHaveValue(secondUrl);
  await screenshotStep('切换同目录请求并保留各自内容 / Switch sibling requests while preserving their content');
  await openFolderMenu(page, level3Id);
  await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'rename')).click();
  await renameFields.fill('E2E renamed folder');
  await renameFields.press('Enter');
  await screenshotStep('重命名目录，尚未调整请求顺序 / Rename the folder before reordering its requests', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionFolderTarget(level3Id)), label: '1' }],
  });
  await secondRequest.dragTo(persistedRequest, { targetPosition: { x: 40, y: 2 } });
  await expect(requestRows.first()).toHaveAttribute('data-automation-id', AutomationIdFactory.composerCollectionRequest(secondId));
  await expect(url).toHaveValue(secondUrl);
  await screenshotStep('重命名目录并调整请求顺序 / Rename the folder and reorder its requests');

  // 业务断言：删除只作用于本轮节点，编辑过程没有向源站隐式发送请求。
  // Business assertions: delete only owned nodes; editing must never send to the origin implicitly.
  await secondRequest.click({ button: 'right' });
  await screenshotStep('打开第二条请求的Delete菜单项 / Locate Delete in the sibling request menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(secondId, 'delete')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(secondId, 'delete')).click();
  await expect(requestRows).toHaveCount(1);
  await expect(persistedRequest).toBeVisible();
  await screenshotStep('删除同级请求并保留原请求 / Delete the sibling while retaining the original request');
  await openFolderMenu(page, level3Id);
  await screenshotStep('打开目录的Delete菜单项 / Locate Delete in the folder menu', {
    highlights: [{ target: getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'delete')), label: '1' }],
  });
  await getByAutomationId(page, AutomationIdFactory.composerCollectionNodeAction(level3Id, 'delete')).click();
  await expect(requestRows).toHaveCount(0);
  await expect(folderRows).toHaveCount(2);
  await expect(collection).toHaveAttribute('data-save-state', 'saved');
  expect(loopbackLab.evidence()).toHaveLength(explicitSendCount);
  await screenshotStep('删除目录及其请求后完成自动保存 / Autosave after deleting the folder and its requests');
});