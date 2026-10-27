import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Injectable PowerShell boundary for MSI installer window handling. */
export interface WindowsMsiInstallerCommandRunner {
  run(command: string, args: readonly string[], timeoutMs?: number): Promise<string>;
}

/** MSI installer UI process observed before or after the Open action. */
export interface WindowsMsiInstallerProcess {
  readonly processId: number;
  readonly commandLine: string;
}

/** One visible MSI window owned by a real installer process generation. */
export interface WindowsMsiInstallerWindow {
  readonly processId: number;
  readonly title: string;
}

/** Result of closing the installer UI after the product opened it. */
export interface WindowsMsiInstallerCancellation {
  readonly window: WindowsMsiInstallerWindow;
  readonly commandLine: string;
  readonly closed: boolean;
  readonly exited: boolean;
  readonly actions: string[];
  readonly buttons: string[];
}

/** Production PowerShell runner for MSI installer windows. */
const windowsMsiInstallerCommandRunner: WindowsMsiInstallerCommandRunner = {
  run: async (command, args, timeoutMs = 30_000) => {
    const { stdout } = await execFileAsync(command, [...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
    return stdout;
  },
};

/** Run one PowerShell script through the injectable runner. */
async function runPowerShell(
  script: string,
  commandRunner: WindowsMsiInstallerCommandRunner,
  timeoutMs = 30_000,
): Promise<string> {
  return commandRunner.run('powershell.exe', ['-NoProfile', '-STA', '-Command', script], timeoutMs);
}

/** Read every real MSI installer process that currently has a command line. */
export async function readWindowsMsiInstallerProcesses(
  commandRunner: WindowsMsiInstallerCommandRunner = windowsMsiInstallerCommandRunner,
): Promise<WindowsMsiInstallerProcess[]> {
  if (process.platform !== 'win32') {
    return [];
  }
  const output = await runPowerShell(String.raw`
$ErrorActionPreference = 'Stop'
$processes = @(Get-CimInstance Win32_Process -Filter "Name='msiexec.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match '/i\b' } |
  ForEach-Object { [pscustomobject]@{ processId = [int]$_.ProcessId; commandLine = [string]$_.CommandLine } })
ConvertTo-Json -InputObject @($processes) -Compress
`, commandRunner);
  const parsed = JSON.parse(output.trim() || '[]') as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('MSI installer process output is invalid.');
  }
  return parsed.map((value) => {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.processId !== 'number' || typeof candidate.commandLine !== 'string') {
      throw new Error('MSI installer process output omitted its identity.');
    }
    return { processId: candidate.processId, commandLine: candidate.commandLine };
  });
}

/** Read visible MSI wizard windows owned by the supplied process generation. */
export async function readWindowsMsiInstallerWindows(
  processIds: readonly number[],
  commandRunner: WindowsMsiInstallerCommandRunner = windowsMsiInstallerCommandRunner,
): Promise<WindowsMsiInstallerWindow[]> {
  if (process.platform !== 'win32' || processIds.length === 0) {
    return [];
  }
  const allowed = processIds.join(',');
  const output = await runPowerShell(String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$allowed = @(${allowed})
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = @($root.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  [System.Windows.Automation.Condition]::TrueCondition
) | Where-Object {
  $_.Current.ClassName -eq 'MsiDialogCloseClass' -and
  -not $_.Current.IsOffscreen -and
  $allowed -contains [int]$_.Current.ProcessId
} | ForEach-Object {
  [pscustomobject]@{
    processId = [int]$_.Current.ProcessId
    title = [string]$_.Current.Name
  }
})
ConvertTo-Json -InputObject $windows -Compress
`, commandRunner);
  const parsed = JSON.parse(output.trim() || '[]') as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('MSI installer window output is invalid.');
  }
  return parsed.map((value) => {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.processId !== 'number' || typeof candidate.title !== 'string') {
      throw new Error('MSI installer window output omitted its identity.');
    }
    return { processId: candidate.processId, title: candidate.title };
  });
}

/** Click the localized confirmation that cancels an MSI wizard, then wait for exit. */
export async function cancelWindowsMsiInstallerWindow(
  processId: number,
  exitTimeoutMs: number,
  commandRunner: WindowsMsiInstallerCommandRunner = windowsMsiInstallerCommandRunner,
): Promise<{ exited: boolean; actions: string[]; buttons: string[] }> {
  if (process.platform !== 'win32') {
    return { exited: false, actions: [], buttons: [] };
  }
  const output = await runPowerShell(String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MsiCancelClick {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@
$installedProcessId = ${Math.trunc(processId)}
$deadline = (Get-Date).AddMilliseconds(${Math.trunc(exitTimeoutMs)})
$root = [System.Windows.Automation.AutomationElement]::RootElement
$processCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
  $installedProcessId
)
$buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty,
  'Button'
)
$actions = New-Object System.Collections.ArrayList
$buttons = New-Object System.Collections.ArrayList
$wizardClosed = $false
$cancelClicked = $false
while ((Get-Date) -lt $deadline) {
  $installedProcess = Get-Process -Id $installedProcessId -ErrorAction SilentlyContinue
  if ($null -eq $installedProcess -or $installedProcess.HasExited) {
    break
  }
  $acted = $false
  foreach ($window in @($root.FindAll([System.Windows.Automation.TreeScope]::Children, $processCondition))) {
    if ($window.Current.IsOffscreen) {
      continue
    }
    $windowButtons = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition))
    foreach ($button in $windowButtons) {
      if ($button.Current.Name) { [void]$buttons.Add([string]$button.Current.Name) }
    }
    $yes = $windowButtons | Where-Object { $_.Current.Name -match '^(Yes|是)$' } | Select-Object -First 1
    if ($yes) {
      [MsiCancelClick]::PostMessage([IntPtr]$yes.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      [void]$actions.Add('confirm-cancel')
      $acted = $true
      continue
    }
    $finish = $windowButtons | Where-Object { $_.Current.Name -match '^(Finish|完成|Close|关闭|OK)$' } | Select-Object -First 1
    if ($finish) {
      [MsiCancelClick]::PostMessage([IntPtr]$finish.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      [void]$actions.Add('finish')
      $acted = $true
      continue
    }
    if (-not $wizardClosed -and $window.Current.ClassName -eq 'MsiDialogCloseClass') {
      try {
        $pattern = $window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
        $pattern.Close()
        [void]$actions.Add('close-window')
        $wizardClosed = $true
        $acted = $true
        continue
      } catch {
      }
    }
    if (-not $cancelClicked -and $wizardClosed) {
      $cancel = $windowButtons | Where-Object { $_.Current.Name -match '^(Cancel|取消)$' } | Select-Object -First 1
      if ($cancel) {
        [MsiCancelClick]::PostMessage([IntPtr]$cancel.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        [void]$actions.Add('cancel-button')
        $cancelClicked = $true
        $acted = $true
      }
    }
  }
  if ($acted) {
    Start-Sleep -Milliseconds 250
  } else {
    Start-Sleep -Milliseconds 500
  }
}
$installedProcess = Get-Process -Id $installedProcessId -ErrorAction SilentlyContinue
[pscustomobject]@{
  exited = ($null -eq $installedProcess -or $installedProcess.HasExited)
  actions = @($actions | Select-Object -Unique)
  buttons = @($buttons | Select-Object -Unique)
} | ConvertTo-Json -Compress
`, commandRunner, exitTimeoutMs + 60_000);
  const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  if (typeof parsed.exited !== 'boolean' || !Array.isArray(parsed.actions) || !Array.isArray(parsed.buttons)) {
    throw new Error('MSI installer cancellation output is invalid.');
  }
  return {
    exited: parsed.exited,
    actions: parsed.actions.map((action) => String(action)),
    buttons: parsed.buttons.map((button) => String(button)),
  };
}

/** Wait for one new installer window, verify its file, then cancel it and wait for exit. */
export async function cancelOpenedWindowsInstaller(options: {
  readonly knownProcessIds: readonly number[];
  readonly expectedInstallerPath: string;
  readonly windowTimeoutMs?: number;
  readonly exitTimeoutMs?: number;
  readonly commandRunner?: WindowsMsiInstallerCommandRunner;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}): Promise<WindowsMsiInstallerCancellation> {
  if (process.platform !== 'win32') {
    throw new Error('MSI installer cancellation requires Windows.');
  }
  const commandRunner = options.commandRunner ?? windowsMsiInstallerCommandRunner;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const windowTimeoutMs = options.windowTimeoutMs ?? 120_000;
  const exitTimeoutMs = options.exitTimeoutMs ?? 120_000;
  const known = new Set(options.knownProcessIds);
  const expectedPath = options.expectedInstallerPath.toLocaleLowerCase();
  const deadline = Date.now() + windowTimeoutMs;
  let window: WindowsMsiInstallerWindow | null = null;
  let commandLine = '';

  while (Date.now() < deadline) {
    const processes = (await readWindowsMsiInstallerProcesses(commandRunner))
      .filter((candidate) => !known.has(candidate.processId) &&
        candidate.commandLine.toLocaleLowerCase().includes(expectedPath));
    for (const candidate of processes) {
      const [visible] = await readWindowsMsiInstallerWindows([candidate.processId], commandRunner);
      if (visible) {
        window = visible;
        commandLine = candidate.commandLine;
        break;
      }
    }
    if (window) {
      break;
    }
    await sleep(500);
  }
  if (!window) {
    throw new Error('No installer window opened for the downloaded MSI.');
  }
  const cancellation = await cancelWindowsMsiInstallerWindow(
    window.processId,
    exitTimeoutMs,
    commandRunner,
  );
  return {
    window,
    commandLine,
    closed: cancellation.actions.length > 0,
    exited: cancellation.exited,
    actions: cancellation.actions,
    buttons: cancellation.buttons,
  };
}
