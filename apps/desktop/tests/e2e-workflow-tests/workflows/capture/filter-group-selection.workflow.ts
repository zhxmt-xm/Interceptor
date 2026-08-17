import { AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { PENDING_FACET_VALUE } from '../../../../src/renderer/features/capture/constants';
import { getByAutomationId } from '../../fixtures/automation';
import { expect, test } from '../../fixtures/local-electron-driver';

test('capture.filter-group-selection keeps option selection independent from expansion', async ({
  desktopApp,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.filter-group-selection',
  });

  // 准备无系统副作用的真实 Electron Capture，并使用永久 Pending option 覆盖非默认展开组。
  // Arrange a side-effect-free real Electron Capture and use permanent Pending options in non-default groups.
  const { page } = desktopApp;
  const expansionEvidence: Array<{
    facet: 'status' | 'type';
    afterExpand: string | null;
    afterSelect: string | null;
    afterDeselect: string | null;
  }> = [];

  for (const facet of ['status', 'type'] as const) {
    const toggle = getByAutomationId(
      page,
      AutomationIdFactory.captureFacetToggle(facet),
    );
    const pendingOption = getByAutomationId(
      page,
      AutomationIdFactory.captureFacetOption(facet, PENDING_FACET_VALUE),
    );

    // 用户只通过组标题展开，并确认可交互 option 已挂载。
    // Expand only through the group heading and prove the interactive option is mounted.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pendingOption).toBeVisible();
    const afterExpand = await toggle.getAttribute('aria-expanded');

    // 选择和取消 option 均不得发出折叠命令或卸载当前分组。
    // Selecting and deselecting the option must not emit collapse intent or unmount the group.
    await pendingOption.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pendingOption).toBeVisible();
    const afterSelect = await toggle.getAttribute('aria-expanded');

    await pendingOption.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pendingOption).toBeVisible();
    const afterDeselect = await toggle.getAttribute('aria-expanded');

    expansionEvidence.push({
      facet,
      afterExpand,
      afterSelect,
      afterDeselect,
    });
  }

  // 保存语言无关的 DOM 状态证据；fixture 负责 trace、截图、进程与 8888 销毁验证。
  // Save language-independent DOM state evidence; the fixture verifies trace, screenshot, processes, and port teardown.
  await testInfo.attach('facet-expansion-state', {
    body: Buffer.from(JSON.stringify(expansionEvidence, null, 2)),
    contentType: 'application/json',
  });
});
