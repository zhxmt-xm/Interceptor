import { describe, expect, it } from 'vitest';

import {
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
  it('does nothing when no workflow-owned Main process was launched', async () => {
    const commandRunner = new FakeWindowsFileDialogCommandRunner();

    await dismissWindowsFileDialogs([], commandRunner);

    expect(commandRunner.calls).toEqual([]);
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
    expect(script).toContain('$processStartedAtByProcessId[$processId] -eq');
    expect(script).toContain(
      'if (-not [NativeDialogTeardown]::SetForegroundWindow($windowHandle))',
    );
    expect(script).toContain("$shell.SendKeys('{ESC}')");
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
    const missingDialogBranch = script.slice(
      script.indexOf('if (-not $fileDialog)'),
      script.indexOf('$dialogWindowHandle = $fileDialog.WindowHandle'),
    );
    expect(missingDialogBranch).not.toContain("SendKeys('{ESC}')");
    expect(script).toContain('function Close-FileDialog');
    expect(script).not.toContain("} catch {\n  $shell.SendKeys('{ESC}')");
  });
});