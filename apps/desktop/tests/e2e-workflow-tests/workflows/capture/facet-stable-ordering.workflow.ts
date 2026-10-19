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

test('capture facets keep first-seen order when a later count overtakes', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.facet-stable-ordering',
  });

  // 准备真实 Electron Capture，并通过产品 readiness flow 开始记录。
  // Arrange a real Electron Capture and start recording through the product readiness flow.
  const { page } = desktopApp;
  await startRecording(desktopApp);

  // 先捕获 GET、再捕获 POST，建立唯一可观察的首次出现顺序。
  // Capture GET before POST to establish one observable first-seen order.
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facet-order/get-first',
    { method: 'GET' },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facet-order/post-first',
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 200 });

  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  await expect(rows.filter({ hasText: '/e2e/facet-order/get-first' }).last()).toBeVisible();
  await expect(rows.filter({ hasText: '/e2e/facet-order/post-first' }).last()).toBeVisible();
  await screenshotStep('先捕获 GET、再捕获 POST，建立唯一可观察的首次出现顺序。 / Capture GET before POST to establish one observable first-seen order.');

  // 用户展开 Method facet；断言直接读取产品 DOM，而不是在测试侧重新排序。
  // The user expands Method; assertions read product DOM without sorting in the test.
  const methodToggle = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetToggle('method'),
  );
  if (await methodToggle.getAttribute('aria-expanded') !== 'true') {
    await methodToggle.click();
  }
  await expect(methodToggle).toHaveAttribute('aria-expanded', 'true');

  const methodGroup = getByAutomationId(
    page,
    AutomationIdFactory.captureFacetGroup('method'),
  );
  const expectedOrder = [
    AutomationIdFactory.captureFacetOption('method', 'GET'),
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  ];
  const methodOptionIds = async (): Promise<string[]> => (
    await methodGroup
      .locator('[data-automation-id^="capture.filter.option.method."]')
      .evaluateAll((options) => options.map(
        (option) => option.getAttribute('data-automation-id') ?? '',
      ))
  ).filter((automationId) => expectedOrder.includes(automationId));

  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'GET'),
  )).toBeVisible();
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOption('method', 'POST'),
  )).toBeVisible();
  expect(await methodOptionIds()).toEqual(expectedOrder);
  await screenshotStep('用户展开 Method facet；断言直接读取产品 DOM，而不是在测试侧重新排序。 / The user expands Method; assertions read product DOM without sorting in the test.');

  // 让后出现的 POST count 反超，并证明计数更新没有移动既有 option。
  // Make the later POST count overtake and prove the count update does not move existing options.
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/facet-order/post-second',
    { method: 'POST' },
  )).resolves.toMatchObject({ statusCode: 200 });
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetOptionCount('method', 'POST'),
  )).toHaveText('2');
  const orderAfterCountOvertake = await methodOptionIds();
  expect(
    orderAfterCountOvertake,
    'Facet options must stay in first-seen order after a later count overtakes.',
  ).toEqual(expectedOrder);
  await screenshotStep('让后出现的 POST count 反超，并证明计数更新没有移动既有 option。 / Make the later POST count overtake and prove the count update does not move existing options.');

  // 停止记录并保存语言无关的排序证据；fixture随后验证进程、8888和系统副作用恢复。
  // Stop recording and save language-independent order evidence; the fixture then verifies teardown.
  const recording = getByAutomationId(page, AUTOMATION_IDS.capture.recordingToggle);
  await recording.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'false');
  await screenshotStep('停止记录并保存语言无关的排序证据；fixture随后验证进程、8888和系统副作用恢复。 / Stop recording and save language-independent order evidence; the fixture then verifies teardown.');

  // 组头与All在同一次DOM读取中核对request总数，不把方法种类数当作请求数。
  // Compare the group and All request totals in one DOM read, not the number of methods.
  await expect(getByAutomationId(
    page,
    AutomationIdFactory.captureFacetAllCount('method'),
  )).toBeVisible();
  const requestCounts = await methodGroup.evaluate((group, ids) => {
    const count = (id: string): number => {
      const element = group.querySelector(`[data-automation-id="${id}"]`);
      if (!element) throw new Error(`Missing Capture counter: ${id}`);
      return Number(element.textContent);
    };
    return {
      group: count(ids.group),
      all: count(ids.all),
    };
  }, {
    group: AutomationIdFactory.captureFacetGroupCount('method'),
    all: AutomationIdFactory.captureFacetAllCount('method'),
  });
  await testInfo.attach('facet-request-counts', {
    body: Buffer.from(JSON.stringify(requestCounts, null, 2)),
    contentType: 'application/json',
  });
  expect(requestCounts.all).toBeGreaterThanOrEqual(3);
  expect(requestCounts.group).toBe(requestCounts.all);

  await testInfo.attach('facet-stable-order', {
    body: Buffer.from(JSON.stringify({
      expectedOrder,
      orderAfterCountOvertake,
      postCount: 2,
      requestCounts,
    }, null, 2)),
    contentType: 'application/json',
  });
  await screenshotStep('组头与All在同一次DOM读取中核对request总数，不把方法种类数当作请求数。 / Compare the group and All request totals in one DOM read, not the number of methods.');
});
