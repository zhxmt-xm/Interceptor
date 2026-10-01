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

export async function requireReadyClashx(clashxPort: number): Promise<WorkflowProcessIdentity> {
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
  const { stdout: listeners } = await execute('/usr/sbin/lsof', [
    '-nP', '-a', '-p', String(owner.processId), `-iTCP:${clashxPort}`, '-sTCP:LISTEN', '-Fn',
  ], { encoding: 'utf8' });
  expect(listeners.split('\n'), 'ClashX must own the expected loopback upstream listener')
    .toContain(`n127.0.0.1:${clashxPort}`);
  await runClashxMenu(owner, 'read');
  return owner;
}

export async function enableClashxSystemProxy(owner: WorkflowProcessIdentity, clashxPort: number): Promise<void> {
  if (!await matchesSystemProxyState(true, clashxPort)) await runClashxMenu(owner, 'toggle');
  await waitForSystemProxyState(true, clashxPort);
}

export async function disableClashxSystemProxy(owner: WorkflowProcessIdentity, clashxPort: number): Promise<void> {
  if (!await matchesSystemProxyState(false, clashxPort)) {
    if (!await matchesSystemProxyState(true, clashxPort)) {
      throw new Error('ClashX must own the external system proxy before disabling it through its menu.');
    }
    await runClashxMenu(owner, 'toggle');
  }
  await waitForSystemProxyState(false, clashxPort);
}

async function matchesSystemProxyState(enabled: boolean, clashxPort: number): Promise<boolean> {
  const reader = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH
    ? path.join(process.env.INTERCEPTOR_E2E_MACOS_APP_PATH, 'Contents/Resources/system-proxy/macos-proxy-helper')
    : path.resolve('dist/system-proxy/macos-proxy-helper');
  const { stdout } = await execute(reader, ['get'], { encoding: 'utf8' });
  const snapshot = JSON.parse(stdout) as { services: Array<{ settings: Record<string, unknown> }> };
  return snapshot.services.length > 0 && snapshot.services.every(({ settings }) => enabled
    ? settings.HTTPEnable === 1 && settings.HTTPSEnable === 1
      && settings.HTTPProxy === '127.0.0.1' && settings.HTTPSProxy === '127.0.0.1'
      && settings.HTTPPort === clashxPort && settings.HTTPSPort === clashxPort
    : settings.HTTPEnable !== 1 && settings.HTTPSEnable !== 1);
}

async function waitForSystemProxyState(enabled: boolean, clashxPort: number): Promise<void> {
  await expect.poll(() => matchesSystemProxyState(enabled, clashxPort), {
    timeout: 15_000,
    message: 'ClashX menu state did not reach the actual network service configuration.',
  }).toBe(true);
}

async function runClashxMenu(owner: WorkflowProcessIdentity, operation: 'read' | 'toggle'): Promise<void> {
  const identity = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
  if (identity.processStartedAt !== owner.processStartedAt) throw new Error('ClashX process generation changed.');
  await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
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
ObjC.import('CoreGraphics');
function clickElement(element) {
  const position = element.position();
  const size = element.size();
  if (size[0] <= 0 || size[1] <= 0) throw new Error('ClashX click target is not visible.');
  const point = $.CGPointMake(position[0] + size[0] / 2, position[1] + size[1] / 2);
  $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft));
  delay(0.1);
  $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft));
  delay(0.05);
  $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft));
}
function proxyMenuItem() {
  const targets = statusItem.menus()[0].menuItems().filter(item => /^(Set as system proxy|设置为系统代理)$/i.test(item.name() || ''));
  if (targets.length !== 1 || !targets[0].enabled()) throw new Error('ClashX system proxy command is unavailable.');
  return targets[0];
}
function menuVisible() {
  const selected = statusItem.attributes.byName('AXSelected').value();
  if (typeof selected !== 'boolean') throw new Error('ClashX menu selection state is unavailable.');
  return selected;
}
proxyMenuItem();
if (operation === 'toggle') {
  ownedApp.frontmost = true;
  if (!menuVisible()) clickElement(statusItem);
  const openDeadline = Date.now() + 3000;
  let clicked = false;
  while (Date.now() < openDeadline) {
    if (agents.some(agent => agent.windows().length > 0)) throw new Error('System confirmation opened; no ClashX command clicked.');
    const target = proxyMenuItem();
    const size = target.size();
    if (menuVisible() && size[0] > 0 && size[1] > 0) {
      clickElement(target);
      clicked = true;
      break;
    }
    delay(0.05);
  }
  if (!clicked) throw new Error('ClashX system proxy command did not become visible.');
  const closeDeadline = Date.now() + 3000;
  while (menuVisible() && Date.now() < closeDeadline) delay(0.05);
  if (menuVisible()) throw new Error('ClashX status menu did not close after the command.');
}
`], { encoding: 'utf8', timeout: 15_000 });
}