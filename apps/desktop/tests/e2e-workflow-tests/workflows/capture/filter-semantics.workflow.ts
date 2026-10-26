import { access, readFile, writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const ALPHA_PATH = '/e2e/filter/alpha';
const BETA_PATH = '/e2e/filter/beta';
const WS_PATH = '/e2e/filter/ws';

/** Open one hidden facet group so its options can be selected. */
async function expandFacet(page: Page, facet: 'method' | 'status' | 'protocol'): Promise<void> {
  const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test('capture.filter.keyword applies keyword semantics across host and path', async ({
  desktopApp, httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.filter.keyword',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const keyword = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);

  await startRecording(desktopApp);
  loopbackLab.respondWith(BETA_PATH, {
    statusCode: 404,
    headers: { 'content-type': 'text/plain', 'content-length': '7' },
    body: 'missing',
  });
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), ALPHA_PATH))
    .resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), BETA_PATH))
    .resolves.toMatchObject({ statusCode: 404 });
  const alphaRow = rows.filter({ hasText: ALPHA_PATH });
  const betaRow = rows.filter({ hasText: BETA_PATH });
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await screenshotStep('两条真实请求进入Capture / Both real requests reach Capture');

  // Keyword按path匹配：alpha只保留alpha，beta隐藏。
  // Keyword matches path: alpha keeps only alpha and hides beta.
  await keyword.fill('alpha');
  await expect(alphaRow).toBeVisible();
  await expect(betaRow).toHaveCount(0);
  await screenshotStep('输入alpha只保留alpha / Typing alpha keeps only alpha');

  // Keyword同样匹配host片段：两条都保留。
  // Keyword also matches a host fragment: both rows remain.
  await keyword.fill('127.0.0.1');
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await screenshotStep('输入host片段两条都匹配 / A host fragment matches both rows');

  // 清空后完整恢复，数据未删除。
  // Clearing the input restores the full view without deleting data.
  await keyword.fill('');
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);

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
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('filter-keyword.json');
  await writeFile(evidencePath, JSON.stringify({
    alphaPath: ALPHA_PATH,
    betaPath: BETA_PATH,
    keywordRestored: true,
  }, null, 2), 'utf8');
  await testInfo.attach('filter-keyword.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});

test('capture.filter.structured combines method and status facets with AND', async ({
  desktopApp, httpTrafficRunner: loopbackLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.filter.structured',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const keyword = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);

  await startRecording(desktopApp);
  loopbackLab.respondWith(BETA_PATH, {
    statusCode: 404,
    headers: { 'content-type': 'text/plain', 'content-length': '7' },
    body: 'missing',
  });
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), ALPHA_PATH))
    .resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    BETA_PATH,
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 404 });
  const alphaRow = rows.filter({ hasText: ALPHA_PATH });
  const betaRow = rows.filter({ hasText: BETA_PATH });
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);

  // 用keyword隔离本轮路径，再按facet验证组内OR、组间AND。
  // Isolate this workflow by keyword, then verify OR within a facet and AND across facets.
  await keyword.fill('/e2e/filter/');
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await expandFacet(page, 'method');
  const postOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  );
  await postOption.click();
  await expect(postOption).toHaveAttribute('aria-pressed', 'true');
  await expect(betaRow).toHaveCount(1);
  await expect(alphaRow).toHaveCount(0);
  await expect(getByAutomationId(page, AutomationIdFactory.captureFacetOptionCount('method', 'POST')))
    .toHaveText('1');
  await screenshotStep('选择POST只保留beta / Selecting POST keeps only beta');

  // 再加Status 404：仍是beta；再加Method GET形成AND后为空。
  // Add status 404: beta remains; adding method GET makes the AND empty.
  await expandFacet(page, 'status');
  const notFound = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('status', '404'),
  );
  await notFound.click();
  await expect(notFound).toHaveAttribute('aria-pressed', 'true');
  await expect(betaRow).toHaveCount(1);
  await expect(alphaRow).toHaveCount(0);
  const getOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'GET'),
  );
  // 组内OR：再选GET不会排除POST，beta仍命中404；先取消POST只保留GET，才形成跨组AND空集。
  // Within-facet OR: adding GET keeps POST, so beta still matches 404; clear POST first to form an empty cross-facet AND.
  await getOption.click();
  await expect(getOption).toHaveAttribute('aria-pressed', 'true');
  await expect(betaRow).toHaveCount(1);
  await postOption.click();
  await expect(postOption).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(0);
  await screenshotStep('只选GET与404的AND为空 / The GET-only and 404 AND is empty');

  // 取消Status：只剩下GET行alpha；取消Method：两条恢复。
  // Remove status: only the GET row alpha remains; remove method: both return.
  await notFound.click();
  await expect(notFound).toHaveAttribute('aria-pressed', 'false');
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(0);
  await getOption.click();
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await keyword.fill('');
  await expect(alphaRow).toHaveCount(1);
  await expect(betaRow).toHaveCount(1);
  await screenshotStep('移除facet后恢复完整列表 / Removing the facets restores the complete list');

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
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('filter-structured.json');
  await writeFile(evidencePath, JSON.stringify({
    alphaPath: ALPHA_PATH,
    betaPath: BETA_PATH,
    methodAndStatusRestored: true,
  }, null, 2), 'utf8');
  await testInfo.attach('filter-structured.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});

test('capture.filter.protocol separates H1, websocket and TLS tunnel facets', async ({
  desktopApp, httpTrafficRunner: loopbackLab, trafficLab,
}, testInfo: TestInfo) => {
  desktopApp.configureWorkflowTimeout(testInfo, 180_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.filter.protocol',
  });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const keyword = getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter);

  await startRecording(desktopApp);

  // 准备三种协议的真实记录：H1、WebSocket与未解密的TLS tunnel。
  // Arrange real H1, WebSocket and opaque TLS tunnel records.
  await expect(loopbackLab.requestThroughProxy(desktopApp.capturePort(), ALPHA_PATH))
    .resolves.toMatchObject({ statusCode: 200 });
  const wsClient = await trafficLab.webSocketTrafficRunner.openThroughProxy(
    desktopApp.capturePort(),
    WS_PATH,
  );
  await wsClient.closeGracefully(1000, 'filter-scope-complete');
  const passthrough = trafficLab.scenarios().find((candidate) => candidate.id === 'tls-passthrough');
  if (!passthrough) throw new Error('Missing TLS passthrough scenario.');
  await expect(trafficLab.run(passthrough.id, passthrough.defaultDraft, desktopApp.capturePort()))
    .resolves.toMatchObject({ state: 'complete', protocol: 'tls' });
  const alphaRow = rows.filter({ hasText: ALPHA_PATH });
  const wsRow = rows.filter({ hasText: WS_PATH });
  const tunnelRow = rows.filter({ hasText: 'localhost' });
  await expect(alphaRow).toHaveCount(1);
  await expect(wsRow).toHaveCount(1);
  await expect(tunnelRow).toHaveCount(1);
  await screenshotStep('H1、WebSocket与TLS tunnel均进入Capture / H1, WebSocket and TLS tunnel all reach Capture');

  // 清空keyword后按Protocol facet逐项筛选。
  // Clear the keyword and filter by each Protocol facet value.
  await keyword.fill('');
  await expandFacet(page, 'protocol');
  const h1Option = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('protocol', 'HTTP/1.1'),
  );
  await h1Option.click();
  await expect(alphaRow).toBeVisible();
  await expect(wsRow).toHaveCount(0);
  await expect(tunnelRow).toHaveCount(0);
  await screenshotStep('Protocol选择HTTP/1.1 / Select HTTP/1.1 in the Protocol facet');

  const wsOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('protocol', 'WebSocket'),
  );
  await h1Option.click();
  await wsOption.click();
  await expect(wsRow).toBeVisible();
  await expect(alphaRow).toHaveCount(0);
  await expect(tunnelRow).toHaveCount(0);
  await screenshotStep('Protocol选择WebSocket / Select WebSocket in the Protocol facet');

  const tunnelOption = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('protocol', 'TLS tunnel'),
  );
  await wsOption.click();
  await tunnelOption.click();
  await expect(tunnelRow).toBeVisible();
  await expect(alphaRow).toHaveCount(0);
  await expect(wsRow).toHaveCount(0);
  await screenshotStep('Protocol选择TLS tunnel / Select TLS tunnel in the Protocol facet');

  await tunnelOption.click();
  await expect(alphaRow).toHaveCount(1);
  await expect(wsRow).toHaveCount(1);
  await expect(tunnelRow).toHaveCount(1);
  await screenshotStep('取消Protocol筛选后全部恢复 / Clearing the Protocol facet restores every row');

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
  expect(desktopApp.rendererPageErrors()).toEqual([]);
  const evidencePath = testInfo.outputPath('filter-protocol.json');
  await writeFile(evidencePath, JSON.stringify({
    alphaPath: ALPHA_PATH,
    webSocketPath: WS_PATH,
    tunnelHost: 'localhost',
    h2CoveredBy: 'capture.scenarios.http2',
  }, null, 2), 'utf8');
  await testInfo.attach('filter-protocol.json', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
