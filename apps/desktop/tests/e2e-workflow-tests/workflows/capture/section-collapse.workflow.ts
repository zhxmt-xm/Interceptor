import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/automation';
import {
  CaptureWorkflowFixture,
  startRecording,
} from '../../fixtures/capture-workflow';
import { expect, test } from '../../fixtures/local-electron-driver';

test('capture.inspector.section-collapse keeps sections independent and accessible', async ({
  desktopApp,
  loopbackLab,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.inspector.section-collapse',
  });

  const { page } = desktopApp;

  // 启动真实Recording并经8888捕获一条loopback请求，建立Inspector测试数据。
  // Start real Recording and capture one loopback request through 8888 to arrange Inspector data.
  await startRecording(desktopApp);
  await CaptureWorkflowFixture.captureAndSelect(desktopApp, loopbackLab, {
    requestPath: '/e2e/capture/section-collapse',
  });

  // 读取两个独立section的公共控件与正文关系，不依赖当前语言文案。
  // Resolve two independent public section controls and bodies without localized text.
  const general = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.general,
  );
  const responseHeaders = getByAutomationId(
    page,
    AUTOMATION_IDS.capture.inspector.section.responseHeaders,
  );

  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');

  const generalBodyId = await general.getAttribute('aria-controls');
  const responseHeadersBodyId = await responseHeaders.getAttribute('aria-controls');
  expect(generalBodyId).toBeTruthy();
  expect(responseHeadersBodyId).toBeTruthy();
  const generalBody = page.locator(`[id="${generalBodyId}"]`);
  const responseHeadersBody = page.locator(`[id="${responseHeadersBodyId}"]`);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);

  // 用户依次折叠两个section；每次只允许目标状态变化。
  // Collapse each section in turn; each action may change only its target state.
  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'false');
  await expect(generalBody).toHaveJSProperty('hidden', true);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'true');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', false);

  await responseHeaders.click();
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);
  await expect(general).toHaveAttribute('aria-expanded', 'false');

  await general.click();
  await expect(general).toHaveAttribute('aria-expanded', 'true');
  await expect(general).toHaveAttribute('aria-controls', generalBodyId!);
  await expect(generalBody).toHaveJSProperty('hidden', false);
  await expect(responseHeaders).toHaveAttribute('aria-expanded', 'false');
  await expect(responseHeadersBody).toHaveJSProperty('hidden', true);

  // 保存最终ARIA与正文状态；driver随后负责trace、正常Close和销毁验证。
  // Save final ARIA and body state; the driver then owns trace, graceful Close, and teardown verification.
  await testInfo.attach('section-collapse-state', {
    body: Buffer.from(JSON.stringify({
      general: {
        controls: generalBodyId,
        expanded: await general.getAttribute('aria-expanded'),
        hidden: await generalBody.getAttribute('hidden') !== null,
      },
      responseHeaders: {
        controls: responseHeadersBodyId,
        expanded: await responseHeaders.getAttribute('aria-expanded'),
        hidden: await responseHeadersBody.getAttribute('hidden') !== null,
      },
    }, null, 2)),
    contentType: 'application/json',
  });
});