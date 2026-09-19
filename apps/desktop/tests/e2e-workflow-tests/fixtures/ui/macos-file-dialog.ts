import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';

interface MacosFileDialogState {
  readonly visible: boolean;
  readonly save: boolean;
  readonly goToVisible: boolean;
  readonly navigationPath: string | null;
  readonly nameFieldValue: string | null;
  readonly nameFieldSelection: string | null;
  readonly nameFieldCenter: readonly number[] | null;
}

const execFileAsync = promisify(execFile);

export async function submitMacosFileDialogPath(owner: WorkflowProcessIdentity, targetPath: string): Promise<void> {
  if (!path.isAbsolute(targetPath) || /[\r\n\0]/.test(targetPath)) throw new Error('Native dialog target must be an absolute file path.');
  try {
    await navigateMacosFileDialog(owner, targetPath);
  } catch (error) {
    try {
      if ((await readMacosFileDialog(owner)).visible) await cancelMacosFileDialog(owner);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Native file dialog selection and cancellation failed.');
    }
    throw error;
  }
}

async function navigateMacosFileDialog(owner: WorkflowProcessIdentity, targetPath: string): Promise<void> {
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
    message: 'The workflow-owned macOS file dialog did not appear', timeout: 15_000,
  }).toBe(true);
  const initial = await readMacosFileDialog(owner);
  await sendMacosFileDialogKeys(owner, 'events.keyCode(5, { using: ["command down", "shift down"] });');
  await expect.poll(async () => (await readMacosFileDialog(owner)).goToVisible, {
    message: 'The macOS Go to Folder sheet did not open',
  }).toBe(true);
  const navigationPath = initial.save ? path.dirname(targetPath) : targetPath;
  await pasteMacosFileDialogText(owner, navigationPath);
  await expect.poll(async () => (await readMacosFileDialog(owner)).navigationPath, {
    message: 'The macOS Go to Folder path was not entered completely',
  }).toBe(navigationPath);
  await sendMacosFileDialogKeys(owner, 'events.keyCode(36);');
  await expect.poll(async () => (await readMacosFileDialog(owner)).goToVisible, {
    message: 'The macOS Go to Folder sheet did not finish navigating',
  }).toBe(false);
  if (initial.save) {
    const state = await readMacosFileDialog(owner);
    if (!state.nameFieldCenter) throw new Error('The macOS Save dialog omitted its file name control.');
    await sendMacosFileDialogKeys(owner, `ownedApp.click({ at: ${JSON.stringify(state.nameFieldCenter)} });`);
    await sendMacosFileDialogKeys(owner, `
events.keyCode(124, { using: ["command down"] });
events.keyCode(123, { using: ["command down", "shift down"] });
`);
    const selectedName = await readMacosFileDialog(owner);
    if (selectedName.nameFieldSelection !== selectedName.nameFieldValue) {
      throw new Error('The macOS Save file name was not fully selected.');
    }
    await pasteMacosFileDialogText(owner, path.basename(targetPath), false);
    await expect.poll(async () => (await readMacosFileDialog(owner)).nameFieldValue, {
      message: 'The macOS Save file name was not entered completely',
    }).toBe(path.basename(targetPath));
  }
  await sendMacosFileDialogKeys(owner, 'events.keyCode(36);');
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
    message: 'The macOS file dialog did not accept the selected path',
  }).toBe(false);
}

export async function cancelMacosFileDialog(owner: WorkflowProcessIdentity): Promise<void> {
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
    message: 'The workflow-owned macOS file dialog did not appear', timeout: 15_000,
  }).toBe(true);
  if ((await readMacosFileDialog(owner)).goToVisible) {
    await sendMacosFileDialogKeys(owner, 'events.keyCode(53);');
    await expect.poll(async () => (await readMacosFileDialog(owner)).goToVisible).toBe(false);
  }
  await sendMacosFileDialogKeys(owner, 'events.keyCode(53);');
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible).toBe(false);
}

async function readMacosFileDialog(owner: WorkflowProcessIdentity): Promise<MacosFileDialogState> {
  const result = await runMacosDialogScript(owner, `
function attribute(element, name) {
  const matches = element.attributes.whose({ name: name })();
  return matches.length > 0 ? matches[0].value() : null;
}
const panels = ownedApp.windows().flatMap(window => [window, ...window.sheets()])
  .filter(panel => ["save-panel", "open-panel"].includes(attribute(panel, "AXIdentifier")));
const panel = panels[0];
if (!panel) {
  JSON.stringify({ visible: false, save: false, goToVisible: false, navigationPath: null, nameFieldValue: null, nameFieldSelection: null, nameFieldCenter: null });
} else {
  const nameField = attribute(panel, "AXIdentifier") === "save-panel"
    ? panel.textFields().find(element => attribute(element, "AXIdentifier") === "saveAsNameTextField") : null;
  const position = nameField ? nameField.position() : null;
  const size = nameField ? nameField.size() : null;
  const navigationSheet = panel.sheets().find(sheet => attribute(sheet, "AXIdentifier") === "GoToWindow");
  const pathField = navigationSheet ? navigationSheet.textFields().find(element => attribute(element, "AXIdentifier") === "PathTextField") : null;
  JSON.stringify({ visible: true, save: Boolean(nameField), goToVisible: Boolean(navigationSheet),
    navigationPath: pathField ? pathField.value() : null, nameFieldValue: nameField ? nameField.value() : null,
    nameFieldSelection: nameField ? attribute(nameField, "AXSelectedText") : null,
    nameFieldCenter: position && size ? [Math.round(position[0] + size[0] / 2), Math.round(position[1] + size[1] / 2)] : null });
}
`);
  return JSON.parse(result) as MacosFileDialogState;
}

async function sendMacosFileDialogKeys(owner: WorkflowProcessIdentity, script: string): Promise<void> {
  await runMacosDialogScript(owner, `ownedApp.frontmost = true;\n${script}`);
}

async function pasteMacosFileDialogText(owner: WorkflowProcessIdentity, value: string, selectAll = true): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile('/usr/bin/pbcopy', [], { timeout: 5_000 }, (error) => error ? reject(error) : resolve());
    child.stdin!.end(Buffer.from(value, 'utf8'));
  });
  await sendMacosFileDialogKeys(owner, `
${selectAll ? 'events.keyCode(0, { using: ["command down"] });' : ''}
events.keyCode(9, { using: ["command down"] });
`);
}

async function runMacosDialogScript(owner: WorkflowProcessIdentity, script: string): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('macOS file dialog driver used on another platform.');
  const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
  if (current.processStartedAt !== owner.processStartedAt) throw new Error('Native dialog Main process generation changed.');
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
const events = Application("System Events");
const owners = events.applicationProcesses.whose({ unixId: ${owner.processId} })();
if (owners.length !== 1) throw new Error("Native dialog owner is unavailable");
const ownedApp = owners[0];
${script}
`], { encoding: 'utf8', timeout: 15_000 });
  return stdout.trim();
}