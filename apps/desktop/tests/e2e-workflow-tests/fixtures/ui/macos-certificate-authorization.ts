import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import { expect, type Page } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';
import { getByAutomationId } from './automation';

const execFileAsync = promisify(execFile);
const helperPath = '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities';

export async function installMacosCertificateThroughHelper(
  page: Page, owner: WorkflowProcessIdentity, certificatePath: string,
): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Native certificate helper verification requires macOS.');
  const canonicalCertificatePath = await realpath(certificatePath);
  expect(await authorizationWindowProcessIds(), 'Another native authorization window is already open').toEqual([]);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install).click();
  const pendingAuthorization: { securityProcess?: WorkflowProcessIdentity; agentProcess?: WorkflowProcessIdentity } = {};
  await expect.poll(async () => {
    await verifyOwner(owner);
    if (await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall).isVisible()) return true;
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
    const children = stdout.split('\n').flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(?:\/usr\/bin\/)?security\s*$/.exec(line);
      return match && Number(match[2]) === owner.processId ? [Number(match[1])] : [];
    });
    if (children.length !== 1) {
      const agents = await authorizationWindowProcessIds();
      if (agents.length > 0) {
        expect(agents).toHaveLength(1);
        expect(await foregroundTrustRequester(owner), 'Only the native helper may request certificate trust authorization').not.toBeNull();
      }
      return false;
    }
    const argumentsResult = await execFileAsync('/bin/ps', ['-ww', '-p', String(children[0]), '-o', 'args='], { encoding: 'utf8' });
    const certificateArgument = /^(?:\/usr\/bin\/)?security add-trusted-cert -d -r trustRoot (.+)$/.exec(argumentsResult.stdout.trim())?.[1];
    if (!certificateArgument || await realpath(certificateArgument) !== canonicalCertificatePath) return false;
    const agents = await authorizationWindowProcessIds();
    if (agents.length !== 1) return false;
    pendingAuthorization.securityProcess = await MacosWorkflowHostSafetyOperations.readProcessIdentity(children[0]!);
    pendingAuthorization.agentProcess = await MacosWorkflowHostSafetyOperations.readProcessIdentity(agents[0]!);
    return true;
  }, { message: 'The native helper did not complete certificate trust', timeout: 120_000 }).toBe(true);
  if (!pendingAuthorization.securityProcess || !pendingAuthorization.agentProcess) {
    await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.uninstall)).toBeEnabled();
    expect(await authorizationWindowProcessIds(), 'The helper authorization window did not close').toEqual([]);
    return;
  }
  await cancelAuthorizationWindow(owner, pendingAuthorization.securityProcess, pendingAuthorization.agentProcess);
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
  throw new Error('Main executed security add-trusted-cert instead of delegating certificate trust to the native helper.');
}

export async function cancelMacosCertificateTrust(page: Page, owner: WorkflowProcessIdentity): Promise<WorkflowProcessIdentity> {
  if (process.platform !== 'darwin') throw new Error('Native certificate authorization cancellation requires macOS.');
  expect(await authorizationWindowProcessIds(), 'Another native authorization window is already open').toEqual([]);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install).click();
  const pendingAuthorization = await waitForMacosCertificateTrustRequest(owner);
  await cancelMacosCertificateTrustRequest(owner, pendingAuthorization);
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install)).toBeEnabled();
  return pendingAuthorization.requester;
}

export async function waitForMacosCertificateTrustRequest(owner: WorkflowProcessIdentity): Promise<{
  requester: WorkflowProcessIdentity; agent: WorkflowProcessIdentity;
}> {
  const pendingAuthorization: { requester?: WorkflowProcessIdentity; agent?: WorkflowProcessIdentity } = {};
  await expect.poll(async () => {
    const requester = await foregroundTrustRequester(owner);
    if (!requester) return false;
    const agents = await authorizationWindowProcessIds();
    if (agents.length !== 1) return false;
    pendingAuthorization.requester = requester;
    pendingAuthorization.agent = await MacosWorkflowHostSafetyOperations.readProcessIdentity(agents[0]!);
    return true;
  }, { message: 'The native helper did not expose a unique trust authorization window', timeout: 30_000 }).toBe(true);
  if (!pendingAuthorization.requester || !pendingAuthorization.agent) throw new Error('Missing native trust authorization identity.');
  return { requester: pendingAuthorization.requester, agent: pendingAuthorization.agent };
}

export async function cancelMacosCertificateTrustRequest(
  owner: WorkflowProcessIdentity,
  request: { requester: WorkflowProcessIdentity; agent: WorkflowProcessIdentity },
): Promise<void> {
  await cancelAuthorizationWindow(owner, request.requester, request.agent);
}

export async function dismissMacosStartupFailure(owner: WorkflowProcessIdentity): Promise<void> {
  await expect.poll(async () => {
    try {
      await verifyOwner(owner);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') return true;
      throw error;
    }
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application("System Events");
const owners = events.applicationProcesses.whose({ unixId: ${owner.processId} })();
if (owners.length === 0) "closed";
else {
  if (owners.length !== 1) throw new Error("Startup App identity is ambiguous");
  const app = owners[0];
  const dialogs = app.windows().flatMap(window => [
    ...(window.attributes.whose({ name: "AXSubrole" })().some(attribute => attribute.value() === "AXDialog") ? [window] : []),
    ...window.sheets()
  ]).filter(dialog => dialog.buttons().length === 1 && dialog.buttons()[0].enabled());
  if (dialogs.length > 1) throw new Error("Startup failure dialog is ambiguous");
  if (dialogs.length === 0) "pending";
  else {
    app.frontmost = true;
    if (!app.frontmost()) throw new Error("Startup App is not in the foreground");
    events.keyCode(36);
    "dismissed";
  }
}
`], { encoding: 'utf8', timeout: 5_000 });
    const state = stdout.trim();
    if (!['pending', 'closed', 'dismissed'].includes(state)) throw new Error('Unexpected native startup dialog state.');
    return state !== 'pending';
  }, { message: 'The owned startup failure dialog was not available', timeout: 15_000 }).toBe(true);
}

async function foregroundTrustRequester(owner: WorkflowProcessIdentity): Promise<WorkflowProcessIdentity | null> {
  await verifyOwner(owner);
  const { stdout } = await execFileAsync('/bin/ps', ['-axww', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' });
  const children = stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match && Number(match[2]) === owner.processId && match[3] === helperPath ? [Number(match[1])] : [];
  });
  if (children.length !== 1) return null;
  const argumentsResult = await execFileAsync('/bin/ps', ['-ww', '-p', String(children[0]), '-o', 'args='], { encoding: 'utf8' });
  if (argumentsResult.stdout.trim() !== `${helperPath} certificate.trust`) return null;
  return MacosWorkflowHostSafetyOperations.readProcessIdentity(children[0]!);
}

async function cancelAuthorizationWindow(
  owner: WorkflowProcessIdentity, requester: WorkflowProcessIdentity, agent: WorkflowProcessIdentity,
): Promise<void> {
  await verifyOwner(owner);
  await verifyOwner(requester);
  await verifyOwner(agent);
  await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  set targetAgent to first application process whose unix id is ${agent.processId}
  if (count of windows of targetAgent) is not 1 then error "Authorization window identity changed"
  set frontmost of targetAgent to true
  key code 53
end tell
`], { encoding: 'utf8' });
  await expect.poll(authorizationWindowProcessIds, { message: 'Native certificate authorization did not cancel' }).toEqual([]);
}

async function authorizationWindowProcessIds(): Promise<number[]> {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application("System Events");
JSON.stringify(events.applicationProcesses.whose({ name: "SecurityAgent" })()
  .filter(process => process.windows().length > 0).map(process => process.unixId()));
`], { encoding: 'utf8' });
  return JSON.parse(stdout) as number[];
}

async function verifyOwner(owner: WorkflowProcessIdentity): Promise<void> {
  const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
  if (current.processStartedAt !== owner.processStartedAt) throw new Error('Native authorization process generation changed.');
}