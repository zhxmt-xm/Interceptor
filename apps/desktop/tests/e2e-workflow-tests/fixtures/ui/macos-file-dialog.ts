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

export async function submitMacosFileDialogPath(
  owner: WorkflowProcessIdentity,
  targetPath: string,
  beforeConfirm?: () => Promise<void>,
): Promise<void> {
  if (!path.isAbsolute(targetPath) || /[\r\n\0]/.test(targetPath)) throw new Error('Native dialog target must be an absolute file path.');
  try {
    await prepareMacosFileDialogPath(owner, targetPath);
    await beforeConfirm?.();
    await sendMacosFileDialogKeys(owner, 'clickNativeButton("OKButton");');
    await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
      message: 'The macOS file dialog did not accept the selected path',
    }).toBe(false);
  } catch (error) {
    try {
      if ((await readMacosFileDialog(owner)).visible) await cancelMacosFileDialog(owner);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Native file dialog selection and cancellation failed.');
    }
    throw error;
  }
}

/** Navigate to this workflow's path before confirmation and optional screenshot capture. */
export async function prepareMacosFileDialogPath(
  owner: WorkflowProcessIdentity, targetPath: string,
): Promise<void> {
  if (!path.isAbsolute(targetPath) || /[\r\n\0]/.test(targetPath)) throw new Error('Native dialog target must be an absolute file path.');
  await activateMacosFileDialogOwner(owner);
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
    message: 'The workflow-owned macOS file dialog did not appear', timeout: 15_000,
  }).toBe(true);
  const initial = await readMacosFileDialog(owner);
  await sendMacosFileDialogKeys(owner, 'pressKey(5, $.kCGEventFlagMaskCommand | $.kCGEventFlagMaskShift);');
  await expect.poll(async () => (await readMacosFileDialog(owner)).goToVisible, {
    message: 'The macOS Go to Folder sheet did not open',
  }).toBe(true);
  const navigationPath = initial.save ? path.dirname(targetPath) : targetPath;
  await pasteMacosFileDialogText(owner, navigationPath);
  await expect.poll(async () => (await readMacosFileDialog(owner)).navigationPath, {
    message: 'The macOS Go to Folder path was not entered completely',
  }).toBe(navigationPath);
  // Return can crash the native panel's Chinese input-method context while GoTo closes.
  await sendMacosFileDialogKeys(owner, `
if (identifier(target) !== "GoToWindow") throw new Error("The owned Go to Folder sheet is unavailable");
const requestedName = ${JSON.stringify(path.basename(navigationPath))};
const matches = target.scrollAreas().flatMap(area => area.tables())
  .flatMap(table => table.rows())
  .flatMap(row => row.uiElements.whose({ role: "AXCell" })())
  .flatMap(cell => cell.uiElements.whose({ role: "AXList" })())
  .flatMap(list => list.staticTexts())
  .filter(label => label.value() === requestedName);
if (matches.length !== 1) throw new Error("The macOS Go to Folder suggestion is not unique: " + matches.length);
const position = matches[0].position(), size = matches[0].size();
clickAt([position[0] + size[0] / 2, position[1] + size[1] / 2], 2);
`);
  await expect.poll(async () => {
    const state = await readMacosFileDialog(owner);
    return state.visible && !state.goToVisible;
  }, {
    message: 'The macOS Go to Folder sheet did not finish navigating',
  }).toBe(true);
  if (initial.save) {
    let state = await readMacosFileDialog(owner);
    // AX can briefly omit the panel's controls while Go to Folder closes.
    await expect.poll(async () => {
      state = await readMacosFileDialog(owner);
      return state.visible && state.save && !state.goToVisible && state.nameFieldCenter !== null;
    }, {
      message: 'The macOS Save file name control did not become ready after navigation',
    }).toBe(true);
    if (!state.nameFieldCenter) throw new Error('The macOS Save dialog omitted its file name control.');
    await sendMacosFileDialogKeys(owner, `clickAt(${JSON.stringify(state.nameFieldCenter)});`);
    await sendMacosFileDialogKeys(owner, `
pressKey(124, $.kCGEventFlagMaskCommand);
pressKey(123, $.kCGEventFlagMaskCommand | $.kCGEventFlagMaskShift);
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
}

export async function cancelMacosFileDialog(owner: WorkflowProcessIdentity): Promise<void> {
  await activateMacosFileDialogOwner(owner);
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible, {
    message: 'The workflow-owned macOS file dialog did not appear', timeout: 15_000,
  }).toBe(true);
  if ((await readMacosFileDialog(owner)).goToVisible) {
    await sendMacosFileDialogKeys(owner, 'clickNativeButton("CloseButton");');
    await expect.poll(async () => (await readMacosFileDialog(owner)).goToVisible).toBe(false);
  }
  await sendMacosFileDialogKeys(owner, 'clickNativeButton("CancelButton");');
  await expect.poll(async () => (await readMacosFileDialog(owner)).visible).toBe(false);
}

/** Match the actual owned native panel to its public WindowServer rectangle. */
export async function macosFileDialogWindowId(owner: WorkflowProcessIdentity): Promise<number> {
  const output = await runMacosDialogScript(owner, `
ObjC.import("CoreGraphics");
function identifier(element) {
  const values = element.attributes.whose({ name: "AXIdentifier" })();
  return values.length ? values[0].value() : "";
}
const panels = ownedApp.windows().flatMap(window => [window, ...window.sheets()])
  .filter(panel => ["save-panel", "open-panel"].includes(identifier(panel)));
if (panels.length !== 1) throw new Error("The workflow must own exactly one native file panel");
const position = panels[0].position(), size = panels[0].size();
const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
const matches = windows.filter(window => {
  const bounds = window.kCGWindowBounds;
  return window.kCGWindowLayer === 0
    && Math.abs(bounds.X - position[0]) <= 1 && Math.abs(bounds.Y - position[1]) <= 1
    && Math.abs(bounds.Width - size[0]) <= 1 && Math.abs(bounds.Height - size[1]) <= 1;
});
if (matches.length !== 1) throw new Error("The owned native file panel has no unique WindowServer match");
JSON.stringify({ windowId: matches[0].kCGWindowNumber });
`);
  const result: unknown = JSON.parse(output);
  if (typeof result !== 'object' || result === null || !('windowId' in result)
    || typeof result.windowId !== 'number' || !Number.isInteger(result.windowId)) {
    throw new Error('Native file panel lookup returned an invalid window ID.');
  }
  return result.windowId;
}

/** Show only the chosen demo folder instead of parent-folder columns in published media. */
export async function showMacosFileDialogList(owner: WorkflowProcessIdentity): Promise<void> {
  const state = await readMacosFileDialog(owner);
  if (!state.visible || state.goToVisible) throw new Error('Prepare the owned file panel before capturing it.');
  if (!state.save) await sendMacosFileDialogKeys(owner, 'pressKey(19, $.kCGEventFlagMaskCommand);');
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
  const save = attribute(panel, "AXIdentifier") === "save-panel";
  const nameField = save
    ? panel.textFields().find(element => attribute(element, "AXIdentifier") === "saveAsNameTextField") : null;
  const position = nameField ? nameField.position() : null;
  const size = nameField ? nameField.size() : null;
  const navigationSheet = panel.sheets().find(sheet => attribute(sheet, "AXIdentifier") === "GoToWindow");
  const pathField = navigationSheet ? navigationSheet.textFields().find(element => attribute(element, "AXIdentifier") === "PathTextField") : null;
  JSON.stringify({ visible: true, save: save, goToVisible: Boolean(navigationSheet),
    navigationPath: pathField ? pathField.value() : null, nameFieldValue: nameField ? nameField.value() : null,
    nameFieldSelection: nameField ? attribute(nameField, "AXSelectedText") : null,
    nameFieldCenter: position && size ? [Math.round(position[0] + size[0] / 2), Math.round(position[1] + size[1] / 2)] : null });
}
`);
  return JSON.parse(result) as MacosFileDialogState;
}

async function sendMacosFileDialogKeys(owner: WorkflowProcessIdentity, script: string): Promise<void> {
  await runMacosDialogScript(owner, `
function identifier(element) {
  const values = element.attributes.whose({ name: "AXIdentifier" })();
  return values.length ? values[0].value() : null;
}
const panels = ownedApp.windows().flatMap(window => [window, ...window.sheets()])
  .filter(panel => ["save-panel", "open-panel"].includes(identifier(panel)));
if (panels.length !== 1) throw new Error("Expected one owned file dialog, found " + panels.length + ": " +
  JSON.stringify(panels.map(panel => ({ identifier: identifier(panel), role: panel.role(),
    position: panel.position(), size: panel.size() }))));
const target = panels[0].sheets().find(sheet => identifier(sheet) === "GoToWindow") ?? panels[0];
ownedApp.frontmost = true;
const raise = target.actions.whose({ name: "AXRaise" })();
if (raise.length === 1) raise[0].perform();
delay(0.2);
if (!ownedApp.frontmost()) throw new Error("The owned file dialog did not become foreground");
ObjC.import("CoreGraphics");
function pressKey(code, flags = 0) {
  for (const down of [true, false]) {
    const event = $.CGEventCreateKeyboardEvent(null, code, down);
    $.CGEventSetFlags(event, flags);
    $.CGEventPost($.kCGHIDEventTap, event);
    delay(0.05);
  }
}
function clickAt(coordinates, clicks = 1) {
  const point = $.CGPointMake(coordinates[0], coordinates[1]);
  for (let click = 1; click <= clicks; click += 1) {
    for (const type of [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp]) {
      const event = $.CGEventCreateMouseEvent(null, type, point, $.kCGMouseButtonLeft);
      $.CGEventSetFlags(event, 0);
      $.CGEventSetIntegerValueField(event, $.kCGMouseEventClickState, click);
      $.CGEventPost($.kCGHIDEventTap, event);
      delay(0.05);
    }
  }
}
function clickNativeButton(buttonId) {
  const button = target.buttons().find(element => identifier(element) === buttonId);
  if (!button || !button.enabled()) throw new Error("The owned file dialog button is unavailable: " + buttonId);
  const position = button.position(), size = button.size();
  clickAt([position[0] + size[0] / 2, position[1] + size[1] / 2]);
}
${script}`);
}

async function pasteMacosFileDialogText(owner: WorkflowProcessIdentity, value: string, selectAll = true): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile('/usr/bin/pbcopy', [], { timeout: 5_000 }, (error) => error ? reject(error) : resolve());
    child.stdin!.end(Buffer.from(value, 'utf8'));
  });
  await sendMacosFileDialogKeys(owner, `
${selectAll ? 'pressKey(0, $.kCGEventFlagMaskCommand);' : ''}
pressKey(9, $.kCGEventFlagMaskCommand);
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

async function activateMacosFileDialogOwner(owner: WorkflowProcessIdentity): Promise<void> {
  await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
  await runMacosDialogScript(owner, `
ownedApp.frontmost = true;
delay(0.2);
if (!ownedApp.frontmost()) throw new Error("The native file dialog owner did not become foreground");
`);
}