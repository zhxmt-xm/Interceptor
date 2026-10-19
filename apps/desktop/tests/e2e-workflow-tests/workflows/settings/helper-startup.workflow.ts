import { execFile } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { expect, LocalElectronApplicationDriver, test } from '../../fixtures/runtime/local-electron-driver';
import { screenshotStep } from '../../fixtures/runtime/step-screenshots';

const execute = promisify(execFile);
const helperPath = '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities';
const configurationPath = `/Library/Application Support/Interceptor/PlatformHelper/${process.env.INTERCEPTOR_E2E_MACOS_APP_PATH ? 'service' : 'development'}.json`;

test.skip(process.platform !== 'darwin', 'macOS component deployment only');
test.setTimeout(300_000);

test('settings.helper-startup deploys the bundled component on launch and reuses it after Close', async ({ desktopApp }, testInfo) => {
  testInfo.annotations.push({ type: 'renderer-workflow', description: 'settings.helper-startup' });

  // 准备：真实 App 已通过 Main 部署和 listener 就绪；只读记录组件身份。
  // Arrange: the real App passed Main deployment and listener readiness; record component identity without mutation.
  const helperBefore = await lstat(helperPath);
  const configurationBefore = await readFile(configurationPath);
  expect(helperBefore.uid).toBe(0);
  expect(helperBefore.mode & 0o022).toBe(0);
  const { stdout: launchDaemonJson } = await execute('/usr/bin/plutil', [
    '-convert', 'json', '-o', '-',
    '/Library/LaunchDaemons/com.zhxmt.interceptor.platform-capabilities.plist',
  ]);
  expect(JSON.parse(launchDaemonJson)).toMatchObject({
    ProcessType: 'Interactive', UserName: 'root', GroupName: 'wheel', Umask: 0o077,
  });
  const { stdout } = await execute('/bin/ps', ['-axww', '-o', 'pid=,comm=']);
  const servicePid = stdout.split('\n').find((line) => line.trim().endsWith(helperPath))?.trim().split(/\s+/)[0];
  expect(servicePid).toMatch(/^\d+$/);
  await screenshotStep('App启动后原生组件已就绪 / The native component is ready after App startup');

  // 用户操作：由产品 Close 退出，再以同一 profile 启动新的真实 App。
  // User actions: exit using product Close and start another real App with the same profile.
  await desktopApp.stopTrace(testInfo);
  await desktopApp.closeGracefully();
  const restartedApp = await LocalElectronApplicationDriver.launch(testInfo, {
    userDataDirectory: desktopApp.userDataDirectory, evidencePrefix: 'restarted',
  });
  try {
    await restartedApp.waitUntilReady();
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(restartedApp.page, AUTOMATION_IDS.settings.section.proxy).click();

    // 业务断言：原生服务同一 PID、文件和配置被复用，不重复部署。
    // Business assertions: the same native PID, executable and configuration are reused without deployment.
    const helperAfter = await lstat(helperPath);
    expect(helperAfter.ino).toBe(helperBefore.ino);
    expect((await readFile(configurationPath)).equals(configurationBefore)).toBe(true);
    const processInfo = await execute('/bin/ps', ['-ww', '-p', servicePid!, '-o', 'comm=']);
    expect(processInfo.stdout.trim()).toBe(helperPath);
    await screenshotStep('重新启动App后复用原生组件 / Reuse the native component after restarting the App');
    await restartedApp.captureFinalScreenshot(testInfo);
    await writeFile(testInfo.outputPath('helper-reuse.json'), JSON.stringify({
      helperProcessId: Number(servicePid), helperReused: true,
      configurationSha256: createHash('sha256').update(configurationBefore).digest('hex'),
    }, null, 2), 'utf8');
  } finally {
    // 清理与证据：第二代经正式 Close 恢复代理；外层 guard 复核完整宿主状态。
    // Cleanup and evidence: the second generation restores the proxy through Close; the outer guard verifies host restoration.
    await restartedApp.stopTrace(testInfo);
    try { await restartedApp.closeGracefully(); }
    finally {
      await restartedApp.writeEvidence(testInfo);
      await restartedApp.forceCleanup();
    }
  }
});