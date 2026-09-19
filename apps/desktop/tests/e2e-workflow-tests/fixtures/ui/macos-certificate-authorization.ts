import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import { expect, type Page } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';
import { getByAutomationId } from './automation';

const execFileAsync = promisify(execFile);

export async function installMacosCertificateAndCancelTrust(
  page: Page, owner: WorkflowProcessIdentity, certificatePath: string,
): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Native certificate authorization cancellation requires macOS.');
  const canonicalCertificatePath = await realpath(certificatePath);
  expect(await authorizationWindowProcessIds(), 'Another native authorization window is already open').toEqual([]);
  await getByAutomationId(page, AUTOMATION_IDS.settings.certificates.install).click();
  let securityProcess: WorkflowProcessIdentity | null = null;
  let agentProcess: WorkflowProcessIdentity | null = null;
  await expect.poll(async () => {
    await verifyOwner(owner);
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
    const children = stdout.split('\n').flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(?:\/usr\/bin\/)?security\s*$/.exec(line);
      return match && Number(match[2]) === owner.processId ? [Number(match[1])] : [];
    });
    if (children.length !== 1) return false;
    const argumentsResult = await execFileAsync('/bin/ps', ['-ww', '-p', String(children[0]), '-o', 'args='], { encoding: 'utf8' });
    const certificateArgument = /^(?:\/usr\/bin\/)?security add-trusted-cert -d -r trustRoot (.+)$/.exec(argumentsResult.stdout.trim())?.[1];
    if (!certificateArgument || await realpath(certificateArgument) !== canonicalCertificatePath) return false;
    const agents = await authorizationWindowProcessIds();
    if (agents.length !== 1) return false;
    securityProcess = await MacosWorkflowHostSafetyOperations.readProcessIdentity(children[0]!);
    agentProcess = await MacosWorkflowHostSafetyOperations.readProcessIdentity(agents[0]!);
    return true;
  }, { message: 'The workflow-owned certificate trust request did not expose a unique native authorization window', timeout: 30_000 }).toBe(true);
  await verifyOwner(owner);
  await verifyOwner(securityProcess!);
  await verifyOwner(agentProcess!);
  await execFileAsync('/usr/bin/osascript', ['-e', `
tell application "System Events"
  set targetAgent to first application process whose unix id is ${agentProcess!.processId}
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