import type { Locator } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES, AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { CAPTURE_FACET_IDS } from '../../../../src/renderer/features/capture/constants';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';
import { getByAutomationId, getByAutomationIdPrefix } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expectSameExchangeUi, expectSameOriginRequest } from '../../fixtures/ui/exchange-inspector';
import { cleanHttpsCapture, prepareHttpsCapture } from '../../fixtures/ui/https-capture';

/** 从公开 Capture row automation ID 提取 Core exchange ID。 */
async function exchangeId(row: Locator): Promise<string> {
  const automationId = await row.getAttribute('data-automation-id');
  if (!automationId?.startsWith(AUTOMATION_ID_PREFIXES.captureRequestRow)) {
    throw new Error('Capture row did not expose its exchange ID.');
  }
  return automationId.slice(AUTOMATION_ID_PREFIXES.captureRequestRow.length);
}

test('capture.replay.https replays decrypted HTTPS and HTTP/2 requests', async ({
  desktopApp,
  trafficLab,
}, testInfo) => {
  test.setTimeout(180_000);
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'capture.replay.https' });
  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const replayNotice = getByAutomationId(page, AUTOMATION_IDS.capture.replayNotice).last();
  const tlsTrafficRunner = await trafficLab.getTlsTrafficRunner();
  const responseBody = 'replay-https-response-body';
  // 固定 Date，使两次响应的 header 可以逐字比较。
  const fixedDate = 'Thu, 01 Jan 2026 00:00:00 GMT';
  const scenarios = [
    { id: 'tls-mitm-h1', path: '/playground/tls/h1', protocol: 'h1' },
    { id: 'tls-mitm-h2', path: '/playground/tls/h2', protocol: 'h2' },
  ] as const;
  const receivedOfPath = (path: string) => tlsTrafficRunner.receivedRequests()
    .filter((request) => request.path === path);

  // 准备：复用共享CA经真实Certificates UI开启MITM，再开始录制并收起无关facet。
  // Arrange: enable MITM through the real Certificates UI with the shared CA, start Recording and collapse unrelated facets.
  await startRecording(desktopApp);
  try {
    await prepareHttpsCapture(desktopApp);
    for (const facet of CAPTURE_FACET_IDS) {
      const toggle = getByAutomationId(page, AutomationIdFactory.captureFacetToggle(facet));
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

    for (const expected of scenarios) {
      await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill(expected.path);
      const scenario = trafficLab.scenarios().find((candidate) => candidate.id === expected.id);
      if (!scenario) throw new Error(`Missing TLS scenario: ${expected.id}`);
      const draft = scenario.defaultDraft;
      if (draft.kind !== 'tls') throw new Error(`Scenario ${expected.id} is not a TLS draft.`);
      // retainRun 让同一 runId 的重放请求复用同一响应定义，响应可逐字比较。
      const result = await tlsTrafficRunner.runTls(draft, desktopApp.capturePort(), {
        retainRun: true,
        response: {
          responseBody: Buffer.from(responseBody),
          responseHeaders: { 'content-type': 'text/plain', date: fixedDate },
          responseTrailers: {},
        },
      });
      expect(result).toMatchObject({ state: 'complete', protocol: 'tls', response: { statusCode: 200 } });

      const matching = rows.filter({ hasText: expected.path });
      await expect(matching).toHaveCount(1);
      const sourceRow = matching.first();
      // 等响应状态进入行内，避免在 request-complete 窗口里打开禁用的 Replay。
      await expect(sourceRow).toContainText('200');
      const sourceExchangeId = await exchangeId(sourceRow);
      const receivedOf = () => receivedOfPath(expected.path);
      expect(receivedOf()).toHaveLength(1);

      // 用户操作：右键重放解密后的请求，origin 必须再次收到同一份内容。
      // User action: replay the decrypted request and require the origin to receive the same content again.
      await sourceRow.click({ button: 'right' });
      const replay = getByAutomationId(page, AutomationIdFactory.captureReplay(sourceExchangeId));
      await expect(replay).toBeVisible();
      await replay.click();
      await expect(replayNotice).toHaveAttribute('data-state', 'sent');
      await expect(matching).toHaveCount(2);
      const replayedRow = matching.last();
      await expect(replayedRow).toContainText(expected.protocol);
      await expect.poll(() => receivedOf().length, { timeout: 5_000 }).toBe(2);
      // origin 侧：两次请求的 method、path、端到端 header 与正文必须完全一致。
      // Origin side: both requests must match on method, path, end-to-end headers and body.
      expectSameOriginRequest(receivedOf()[0]!, receivedOf()[1]!);
      // App 侧：两条记录的请求与响应在 Inspector 中必须完全一致。
      // App side: both rows must show the same request and response in the Inspector.
      await expectSameExchangeUi(page, sourceRow, replayedRow, {
        url: `https://localhost:${tlsTrafficRunner.port}${expected.path}`,
        method: 'GET',
        status: '200',
      });
      await screenshotStep(
        `重放解密的${expected.protocol}请求并核对完整请求与响应 / Replay a decrypted ${expected.protocol} request and compare the complete request and response`,
        { highlights: [{ target: replayedRow, label: '1' }] },
      );
    }
    // 关闭 MITM 后重放同一 HTTPS 行：必须被拒绝，不新增记录也不触达 origin。
    // With MITM off the same HTTPS row must be rejected without a new row or an origin request.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    const mitmToggle = getByAutomationId(page, AUTOMATION_IDS.settings.certificates.mitmToggle);
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');
    await mitmToggle.click();
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();

    await getByAutomationId(page, AUTOMATION_IDS.capture.keywordFilter).fill('/playground/tls/h1');
    const h1Rows = rows.filter({ hasText: '/playground/tls/h1' });
    await expect(h1Rows).toHaveCount(2);
    const h1SourceId = await exchangeId(h1Rows.first());
    await h1Rows.first().click({ button: 'right' });
    await getByAutomationId(page, AutomationIdFactory.captureReplay(h1SourceId)).click();
    await expect(replayNotice).toHaveAttribute('data-state', 'failed');
    await expect(h1Rows).toHaveCount(2);
    await expect.poll(() => receivedOfPath('/playground/tls/h1').length, { timeout: 5_000 }).toBe(2);
    await screenshotStep('关闭 MITM 后重放被拒绝 / Replay is rejected after MITM is turned off', {
      highlights: [{ target: replayNotice, label: '1' }],
    });
  } finally {
    await cleanHttpsCapture(desktopApp);
  }
});
