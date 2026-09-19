import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';

const execute = promisify(execFile);
const clashxPath = '/Applications/ClashX.app/Contents/MacOS/ClashX';
const helperPath = '/Library/PrivilegedHelperTools/com.west2online.ClashX.ProxyConfigHelper';

export async function requireReadyClashx(): Promise<WorkflowProcessIdentity> {
  if (process.platform !== 'darwin') throw new Error('ClashX UI verification requires macOS.');
  const helper = await lstat(helperPath);
  expect(helper.uid).toBe(0);
  expect(helper.mode & 0o022).toBe(0);
  const { stdout } = await execute('/bin/ps', ['-axww', '-o', 'pid=,uid=,comm='], { encoding: 'utf8' });
  const rows = stdout.split('\n').map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter((match) => match !== null);
  expect(rows.some((match) => match[2] === '0' && match[3] === helperPath), 'ClashX privileged helper must already be running').toBe(true);
  const clients = rows.filter((match) => match[3] === clashxPath);
  expect(clients).toHaveLength(1);
  const owner = await MacosWorkflowHostSafetyOperations.readProcessIdentity(Number(clients[0]![1]));
  await runClashxMenu(owner, 'read');
  return owner;
}

export async function enableClashxSystemProxy(owner: WorkflowProcessIdentity): Promise<void> {
  if (!await runClashxMenu(owner, 'read')) await toggleClashxSystemProxy(owner);
  await expect.poll(() => runClashxMenu(owner, 'read'), { timeout: 10_000 }).toBe(true);
  await waitForSystemProxyState(true);
}

export async function disableClashxSystemProxy(owner: WorkflowProcessIdentity): Promise<void> {
  if (await runClashxMenu(owner, 'read')) await toggleClashxSystemProxy(owner);
  await expect.poll(() => runClashxMenu(owner, 'read'), { timeout: 10_000 }).toBe(false);
  await waitForSystemProxyState(false);
}

async function waitForSystemProxyState(enabled: boolean): Promise<void> {
  const reader = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
    ? path.join(process.env.INTERCEPTOR_E2E_MACOS_APP_PATH, 'Contents/Resources/system-proxy/macos-proxy-helper')
    : path.resolve('dist/system-proxy/macos-proxy-helper');
  await expect.poll(async () => {
    const { stdout } = await execute(reader, ['get'], { encoding: 'utf8' });
    const snapshot = JSON.parse(stdout) as { services: Array<{ settings: Record<string, unknown> }> };
    return snapshot.services.length > 0 && snapshot.services.every(({ settings }) => enabled
      ? settings.HTTPEnable === 1 && settings.HTTPSEnable === 1
        && settings.HTTPProxy === '127.0.0.1' && settings.HTTPSProxy === '127.0.0.1'
        && settings.HTTPPort !== 8888 && settings.HTTPSPort !== 8888
      : settings.HTTPEnable !== 1 && settings.HTTPSEnable !== 1);
  }, { timeout: 15_000, message: 'ClashX menu state did not reach the actual network service configuration.' }).toBe(true);
}

async function toggleClashxSystemProxy(owner: WorkflowProcessIdentity): Promise<void> {
  await runClashxMenu(owner, 'open');
  await expect.poll(() => runClashxMenu(owner, 'visible'), { timeout: 3_000 }).toBe(true);
  await runClashxMenu(owner, 'toggle');
}

async function runClashxMenu(owner: WorkflowProcessIdentity, operation: 'read' | 'open' | 'visible' | 'toggle'): Promise<boolean> {
  const identity = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
  if (identity.processStartedAt !== owner.processStartedAt) throw new Error('ClashX process generation changed.');
  const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application('System Events');
const agents = events.applicationProcesses.whose({ name: 'SecurityAgent' })();
if (agents.some(agent => agent.windows().length > 0)) throw new Error('System confirmation is open; no ClashX action performed.');
const clients = events.applicationProcesses.whose({ unixId: ${owner.processId} })();
if (clients.length !== 1) throw new Error('ClashX process is unavailable.');
const ownedApp = clients[0];
const statusItems = ownedApp.menuBars().flatMap(bar => bar.menuBarItems()).filter(item => item.name() === null && item.menus().length === 1);
if (statusItems.length !== 1) throw new Error('ClashX status menu is ambiguous.');
const statusItem = statusItems[0];
const operation = ${JSON.stringify(operation)};
let enabled = false;
if (operation === 'open') {
  const position = statusItem.position();
  const size = statusItem.size();
  ownedApp.click({ at: [position[0] + size[0] / 2, position[1] + size[1] / 2] });
} else {
  const targets = statusItem.menus()[0].menuItems().filter(item => /^(Set as system proxy|设置为系统代理)$/i.test(item.name() || ''));
  if (targets.length !== 1 || !targets[0].enabled()) throw new Error('ClashX system proxy command is unavailable.');
  const target = targets[0];
  let mark = null;
  try { mark = target.attributes.byName('AXMenuItemMarkChar').value(); } catch {}
  enabled = typeof mark === 'string' && mark.length > 0;
  if (operation === 'visible') {
    try {
      const size = target.size();
      enabled = size[0] > 0 && size[1] > 0;
    } catch { enabled = false; }
  } else if (operation === 'toggle') {
    const position = target.position();
    const size = target.size();
    if (size[0] <= 0 || size[1] <= 0) throw new Error('ClashX system proxy command has no visible bounds.');
    ownedApp.click({ at: [position[0] + size[0] / 2, position[1] + size[1] / 2] });
  }
}
JSON.stringify({ enabled });
`], { encoding: 'utf8', timeout: 15_000 });
  return (JSON.parse(stdout) as { enabled: boolean }).enabled;
}