import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import {
  getByAutomationId,
  getByAutomationIdPrefix,
} from '../../fixtures/ui/automation';
import { createRequestBreakpointRule } from '../../fixtures/ui/breakpoint-workflow';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

test('breakpoints.queue-stepping advances from the latest HTTP snapshot without stealing focus', async ({
  desktopApp,
  httpTrafficRunner: loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'breakpoints.queue-stepping',
  });

  const { page } = desktopApp;
  const rows = getByAutomationIdPrefix(page, AUTOMATION_ID_PREFIXES.captureRequestRow);
  const continueUnmodified = getByAutomationId(
    page,
    AUTOMATION_IDS.breakpoints.continueUnmodified,
  );

  // Arrange: create one POST-only breakpoint and one ordinary GET row used to verify focus ownership.
  // 准备：创建只匹配POST的断点规则，并生成一条普通GET行用于验证焦点归属。
  await startRecording(desktopApp);
  await createRequestBreakpointRule(page, 'E2E queue stepping', 'POST');
  const ordinaryPath = '/e2e/queue-stepping-ordinary';
  await expect(loopbackLab.requestThroughProxy(
    desktopApp.capturePort(),
    ordinaryPath,
  )).resolves.toMatchObject({ statusCode: 200 });
  const ordinaryRow = rows.filter({ hasText: ordinaryPath }).last();
  await expect(ordinaryRow).toBeVisible();
  await expect(ordinaryRow).not.toHaveAttribute('data-breakpoint-id');

  // Arrange and assert: enqueue eleven real requests, proving every hit beyond the former limit remains pending.
  // 构造并断言：依次挂起十一条真实请求，证明超过旧上限后的每次命中仍保持等待。
  const capacityRequests = [];
  for (let index = 0; index < 11; index += 1) {
    const requestPath = `/e2e/queue-stepping-capacity-${index + 1}`;
    const request = loopbackLab.startAbortableRequestThroughProxy(
      desktopApp.capturePort(),
      requestPath,
      { method: 'POST', body: `queue-capacity-${index + 1}` },
    );
    const outcome = request.result.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    capacityRequests.push({ requestPath, request, outcome });

    const row = rows.filter({ hasText: requestPath }).last();
    await expect(row).toHaveAttribute(
      'data-breakpoint-state',
      index === 0 ? 'head' : 'queued',
    );
    await expect(row).toHaveAttribute('data-queue-position', String(index + 1));
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('11');
  for (const { requestPath } of capacityRequests) {
    expect(loopbackLab.observation(requestPath)).toBeUndefined();
  }
  await screenshotStep('构造并断言：依次挂起十一条真实请求，证明超过旧上限后的每次命中仍保持等待。 / Arrange and assert: enqueue eleven real requests, proving every hit beyond the former limit remains pending.');

  // Cleanup: real client disconnects release all eleven items before the stepping scenario starts.
  // 清理：由真实客户端断开释放十一条等待项，再开始后续逐项推进场景。
  for (const { request } of capacityRequests) {
    request.abort();
  }
  for (const { outcome } of capacityRequests) {
    await expect(outcome).resolves.toMatchObject({ error: expect.any(Error) });
  }
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');
  await screenshotStep('清理：由真实客户端断开释放十一条等待项，再开始后续逐项推进场景。 / Cleanup: real client disconnects release all eleven items before the stepping scenario starts.');

  // Arrange: enqueue A, B, C in a deterministic order and prove their public queue positions.
  // 构造：按确定顺序挂起A、B、C，并验证公开的队列位置。
  const requestA = loopbackLab.startAbortableRequestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/queue-stepping-a',
    { method: 'POST', body: 'queue-a' },
  );
  const outcomeA = requestA.result.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const rowA = rows.filter({ hasText: '/e2e/queue-stepping-a' }).last();
  await expect(rowA).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(rowA).toHaveAttribute('data-queue-position', '1');

  const requestB = loopbackLab.startAbortableRequestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/queue-stepping-b',
    { method: 'POST', body: 'queue-b' },
  );
  const outcomeB = requestB.result.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const rowB = rows.filter({ hasText: '/e2e/queue-stepping-b' }).last();
  await expect(rowB).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(rowB).toHaveAttribute('data-queue-position', '2');

  const requestC = loopbackLab.startAbortableRequestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/queue-stepping-c',
    { method: 'POST', body: 'queue-c' },
  );
  const outcomeC = requestC.result.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const rowC = rows.filter({ hasText: '/e2e/queue-stepping-c' }).last();
  await expect(rowC).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(rowC).toHaveAttribute('data-queue-position', '3');
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('3');
  await screenshotStep('构造：按确定顺序挂起A、B、C，并验证公开的队列位置。 / Arrange: enqueue A, B, C in a deterministic order and prove their public queue positions.');

  // Act: abort the middle client, then continue A and require selection to advance to C from the latest snapshot.
  // 操作：中止中间客户端，再继续A；选择必须根据最新快照推进到C。
  requestB.abort();
  await expect(outcomeB).resolves.toMatchObject({ error: expect.any(Error) });
  await expect(rowB).toBeVisible();
  await expect(rowB).not.toHaveAttribute('data-breakpoint-id');
  await expect(rowC).toHaveAttribute('data-queue-position', '2');

  await rowA.click();
  await expect(continueUnmodified).toBeVisible();
  await continueUnmodified.click();
  await expect(outcomeA).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(rowC).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(rowC).toHaveAttribute('data-queue-position', '1');
  await expect(continueUnmodified).toBeVisible();
  await screenshotStep('操作：中止中间客户端，再继续A；选择必须根据最新快照推进到C。 / Act: abort the middle client, then continue A and require selection to advance to C from the latest snapshot.');

  // Act: queue D, view ordinary traffic, then abort C; D becomes head without taking Capture focus.
  // 操作：加入D并查看普通流量，再中止C；D成为队首但不得夺取Capture焦点。
  const requestD = loopbackLab.startAbortableRequestThroughProxy(
    desktopApp.capturePort(),
    '/e2e/queue-stepping-d',
    { method: 'POST', body: 'queue-d' },
  );
  const outcomeD = requestD.result.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  const rowD = rows.filter({ hasText: '/e2e/queue-stepping-d' }).last();
  await expect(rowD).toHaveAttribute('data-breakpoint-state', 'queued');
  await expect(rowD).toHaveAttribute('data-queue-position', '2');

  await ordinaryRow.click();
  await expect(continueUnmodified).toHaveCount(0);
  requestC.abort();
  await expect(outcomeC).resolves.toMatchObject({ error: expect.any(Error) });
  await expect(rowC).toBeVisible();
  await expect(rowC).not.toHaveAttribute('data-breakpoint-id');
  await expect(rowD).toHaveAttribute('data-breakpoint-state', 'head');
  await expect(rowD).toHaveAttribute('data-queue-position', '1');
  await expect(continueUnmodified).toHaveCount(0);
  await screenshotStep('操作：加入D并查看普通流量，再中止C；D成为队首但不得夺取Capture焦点。 / Act: queue D, view ordinary traffic, then abort C; D becomes head without taking Capture focus.');

  // Assert and cleanup: D only becomes editable after explicit selection; aborted requests never reach origin.
  // 断言与清理：显式选择D后才出现编辑器；已中止请求绝不抵达origin。
  await rowD.click();
  await expect(continueUnmodified).toBeVisible();
  await continueUnmodified.click();
  await expect(outcomeD).resolves.toMatchObject({ result: { statusCode: 200 } });
  await expect(getByAutomationId(page, AUTOMATION_IDS.capture.breakpointManager)).toHaveText('');
  expect(loopbackLab.observation('/e2e/queue-stepping-a')).toBeDefined();
  expect(loopbackLab.observation('/e2e/queue-stepping-b')).toBeUndefined();
  expect(loopbackLab.observation('/e2e/queue-stepping-c')).toBeUndefined();
  expect(loopbackLab.observation('/e2e/queue-stepping-d')).toBeDefined();

  await testInfo.attach('http-queue-stepping-origin-observation', {
    body: Buffer.from(JSON.stringify(loopbackLab.evidence(), null, 2)),
    contentType: 'application/json',
  });
  await screenshotStep('断言与清理：显式选择D后才出现编辑器；已中止请求绝不抵达origin。 / Assert and cleanup: D only becomes editable after explicit selection; aborted requests never reach origin.');
});
