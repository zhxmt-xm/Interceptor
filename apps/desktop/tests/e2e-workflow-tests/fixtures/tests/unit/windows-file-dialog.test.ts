import { describe, expect, it } from 'vitest';

import {
  cancelWindowsFileDialog,
  dismissWindowsFileDialogs,
  submitWindowsFileDialogPath,
  type WindowsFileDialogCommandRunner,
} from '../../windows-file-dialog';

class FakeWindowsFileDialogCommandRunner implements WindowsFileDialogCommandRunner {
  /** PowerShell invocations captured without opening a native dialog. */
  readonly calls: { command: string; args: readonly string[] }[] = [];

  /** Capture one owner-scoped dialog cleanup command. */
  run(command: string, args: readonly string[]): Promise<void> {
    this.calls.push({ command, args: [...args] });
    return Promise.resolve();
  }
}

describe('dismissWindowsFileDialogs', () => {
  it('clicks the native Cancel control only inside the exact owned file dialog', async () => {
    const fakeWindowsFileDialogCommandRunner = new FakeWindowsFileDialogCommandRunner();
    const owner = { processId: 101, processStartedAt: '2026-09-06T01:00:00.0000000Z' };

    await cancelWindowsFileDialog(owner, fakeWindowsFileDialogCommandRunner);

    expect(fakeWindowsFileDialogCommandRunner.calls).toHaveLength(1);
    const script = fakeWindowsFileDialogCommandRunner.calls[0]?.args.at(-1) ?? '';
    expect(script).toContain(Buffer.from(JSON.stringify(owner), 'utf8').toString('base64'));
    expect(script).toContain('Test-OwnerProcessGeneration');
    expect(script).toContain("$dialogAction = 'cancel'");
    expect(script).toContain('Click-Control $cancelBounds');
    const cancelSelector = script.slice(script.indexOf('$cancelCondition ='), script.indexOf('$cancelButton ='));
    expect(cancelSelector).toContain('[System.Windows.Automation.AndCondition]::new(');
    expect(cancelSelector).toContain('[System.Windows.Automation.AutomationElement]::ClassNameProperty');
    expect(cancelSelector).toContain("'Button'");
    expect(script).not.toContain("SendKeys('{ESC}')");
  });

  it('does nothing when no workflow-owned Main process was launched', async () => {
    const commandRunner = new FakeWindowsFileDialogCommandRunner();

    await dismissWindowsFileDialogs([], commandRunner);

    expect(commandRunner.calls).toEqual([]);
  });

  it('取消操作失去焦点时关闭本轮Dialog后再传播错误', async () => {
    const fakeWindowsFileDialogCommandRunner = new FakeWindowsFileDialogCommandRunner();
    await cancelWindowsFileDialog({
      processId: 101,
      processStartedAt: '2026-09-06T01:00:00.0000000Z',
    }, fakeWindowsFileDialogCommandRunner);
    const script = fakeWindowsFileDialogCommandRunner.calls[0]?.args.at(-1) ?? '';
    const cancelBranch = script.slice(
      script.indexOf("if ($dialogAction -eq 'cancel')"),
      script.indexOf('} else {\ntry {'),
    );

    expect(cancelBranch).toMatch(/} catch \{\s+Close-FileDialog \$dialog \$dialogWindowHandle \$dialogProcessId\s+throw/);
    expect(cancelBranch).toContain('[NativeForegroundWindow]::ReleaseWindow($dialogWindowHandle)');
  });

  it('passes every owner to a descendant-filtered dialog dismissal script', async () => {
    const commandRunner = new FakeWindowsFileDialogCommandRunner();

    const owners = [
      { processId: 101, processStartedAt: '2026-09-04T01:00:00.0000000Z' },
      { processId: 202, processStartedAt: '2026-09-04T02:00:00.0000000Z' },
    ];

    await dismissWindowsFileDialogs(owners, commandRunner);

    expect(commandRunner.calls).toHaveLength(1);
    expect(commandRunner.calls[0]?.command).toBe('powershell.exe');
    const script = commandRunner.calls[0]?.args.at(-1) ?? '';
    expect(script).toContain(
      Buffer.from(JSON.stringify(owners), 'utf8').toString('base64'),
    );
    expect(script).toContain('Test-OwnerProcess');
    expect(script).toContain(
      '$ownerProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue',
    );
    expect(script).toContain('$ownerProcess.StartTime.ToUniversalTime().ToString(');
    expect(script).not.toContain('$_.CreationDate.ToUniversalTime().ToString(');
    expect(script).toContain('$dialog.GetCurrentPattern(');
    expect(script).toContain('[System.Windows.Automation.WindowPattern]::Pattern');
    expect(script).toContain('$windowPattern.Close()');
    expect(script).not.toContain('SendKeys');
  });

  it('never sends a global Escape when no owned submit dialog can be focused', async () => {
    const commandRunner = new FakeWindowsFileDialogCommandRunner();
    const owner = {
      processId: 101,
      processStartedAt: '2026-09-04T01:00:00.0000000Z',
    };

    await submitWindowsFileDialogPath(
      owner,
      String.raw`C:\capture\rules.json`,
      commandRunner,
    );

    const script = commandRunner.calls[0]?.args.at(-1) ?? '';
    expect(script).toContain(
      Buffer.from(JSON.stringify(owner), 'utf8').toString('base64'),
    );
    expect(script).toContain('$ownerProcessStartedAt');
    expect(script).toContain('Test-OwnerProcessGeneration');
    expect(script).toContain(
      '$ownerProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue',
    );
    expect(script).toContain('$ownerProcess.StartTime.ToUniversalTime().ToString(');
    expect(script).not.toContain('$process.CreationDate.ToUniversalTime().ToString(');
    const missingDialogBranch = script.slice(
      script.indexOf('if (-not $fileDialog)'),
      script.indexOf('$dialogWindowHandle = $fileDialog.WindowHandle'),
    );
    expect(missingDialogBranch).not.toContain("SendKeys('{ESC}')");
    expect(script).toContain('function Close-FileDialog');
    expect(script).toContain('$dialog.GetCurrentPattern(');
    expect(script).toContain('[System.Windows.Automation.WindowPattern]::Pattern');
    expect(script).toContain('$windowPattern.Close()');
    expect(script).toContain('function Click-Control');
    expect(script).toContain('SetWindowPos(windowHandle, HwndTopmost');
    expect(script).toContain('SetWindowPos(windowHandle, HwndNotTopmost');
    expect(script).toContain('Click-Control $fileNameBounds');
    expect(script).toContain('Click-Control $submitBounds');
    expect(script).not.toContain("SendKeys('%n')");
    expect(script).not.toContain("SendKeys('{ENTER}')");
    expect(script).not.toContain("SendKeys('{ESC}')");
  });
});