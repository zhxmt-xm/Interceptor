import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Injectable PowerShell boundary for owner-scoped dialog teardown tests. */
export interface WindowsFileDialogCommandRunner {
  run(command: string, args: readonly string[], timeoutMs?: number): Promise<void>;
}

/** One exact Windows process generation allowed to own a test dialog. */
export interface WindowsFileDialogOwner {
  readonly processId: number;
  readonly processStartedAt: string;
}

/** Production PowerShell runner for native dialog teardown. */
const windowsFileDialogCommandRunner: WindowsFileDialogCommandRunner = {
  run: async (command, args, timeoutMs = 15_000) => {
    await execFileAsync(command, [...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });
  },
};

/** Close visible file dialogs owned by the supplied Electron process trees. */
export async function dismissWindowsFileDialogs(
  ownerProcesses: readonly WindowsFileDialogOwner[],
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  if (process.platform !== 'win32') {
    return;
  }
  const owners = [...new Map(ownerProcesses
    .filter((owner) => Number.isInteger(owner.processId) && owner.processId > 0)
    .map((owner) => [owner.processId, owner])).values()];
  if (owners.length === 0) {
    return;
  }
  const encodedOwners = Buffer.from(JSON.stringify(owners), 'utf8').toString('base64');

  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class NativeDialogTeardown {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr windowHandle, int command);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr windowHandle);
}
'@

$ownerProcesses = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedOwners}')
) | ConvertFrom-Json
$ownerStartedAtByProcessId = @{}
foreach ($owner in @($ownerProcesses)) {
  $ownerStartedAtByProcessId[[int]$owner.processId] = [string]$owner.processStartedAt
}
$parentProcessIdByProcessId = @{}
$processStartedAtByProcessId = @{}
Get-CimInstance Win32_Process | ForEach-Object {
  $parentProcessIdByProcessId[[int]$_.ProcessId] = [int]$_.ParentProcessId
  if ($null -ne $_.CreationDate) {
    $processStartedAtByProcessId[[int]$_.ProcessId] = $_.CreationDate.ToUniversalTime().ToString(
      'O',
      [Globalization.CultureInfo]::InvariantCulture
    )
  }
}

function Test-OwnerProcess([int]$processId) {
  $visited = @{}
  while ($processId -gt 0 -and -not $visited.ContainsKey($processId)) {
    if ($ownerStartedAtByProcessId.ContainsKey($processId)) {
      return $processStartedAtByProcessId.ContainsKey($processId) -and
        $processStartedAtByProcessId[$processId] -eq $ownerStartedAtByProcessId[$processId]
    }
    $visited[$processId] = $true
    if (-not $parentProcessIdByProcessId.ContainsKey($processId)) {
      return $false
    }
    $processId = [int]$parentProcessIdByProcessId[$processId]
  }
  return $false
}

$dialogCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty,
  '#32770'
)
$dialogs = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  $dialogCondition
)
$shell = New-Object -ComObject WScript.Shell
foreach ($dialog in @($dialogs)) {
  $windowHandle = [IntPtr]$dialog.Current.NativeWindowHandle
  if (
    $windowHandle -eq [IntPtr]::Zero -or
    -not (Test-OwnerProcess $dialog.Current.ProcessId) -or
    -not [NativeDialogTeardown]::IsWindowVisible($windowHandle) -or
    -not [NativeDialogTeardown]::IsWindowEnabled($windowHandle)
  ) {
    continue
  }
  [void][NativeDialogTeardown]::ShowWindow($windowHandle, 5)
  if (-not [NativeDialogTeardown]::SetForegroundWindow($windowHandle)) {
    continue
  }
  if ([NativeDialogTeardown]::GetForegroundWindow() -ne $windowHandle) {
    continue
  }
  $shell.SendKeys('{ESC}')
}
`;

  await commandRunner.run(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
  );
}

/** 通过 Windows UI Automation 定位真实文件对话框，并用鼠标键盘提交目标路径。 */
export async function submitWindowsFileDialogPath(
  owner: WindowsFileDialogOwner,
  targetPath: string,
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('真实文件对话框驱动目前只支持 Windows。');
  }

  const encodedPath = Buffer.from(targetPath, 'utf16le').toString('base64');
  const encodedOwner = Buffer.from(JSON.stringify(owner), 'utf8').toString('base64');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class NativeForegroundWindow {
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(
    uint attachThreadId,
    uint attachToThreadId,
    bool attach
  );
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(
    IntPtr windowHandle,
    IntPtr processId
  );
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr windowHandle, int command);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(
    uint flags,
    uint dx,
    uint dy,
    uint data,
    UIntPtr extraInfo
  );

  public static bool FocusWindow(IntPtr windowHandle) {
    uint currentThreadId = GetCurrentThreadId();
    uint foregroundThreadId = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint targetThreadId = GetWindowThreadProcessId(windowHandle, IntPtr.Zero);
    bool foregroundAttached = foregroundThreadId != 0
      && foregroundThreadId != currentThreadId
      && AttachThreadInput(currentThreadId, foregroundThreadId, true);
    bool targetAttached = targetThreadId != 0
      && targetThreadId != currentThreadId
      && targetThreadId != foregroundThreadId
      && AttachThreadInput(currentThreadId, targetThreadId, true);
    try {
      ShowWindow(windowHandle, 5);
      BringWindowToTop(windowHandle);
      SetForegroundWindow(windowHandle);
      return GetForegroundWindow() == windowHandle;
    } finally {
      if (targetAttached) AttachThreadInput(currentThreadId, targetThreadId, false);
      if (foregroundAttached) AttachThreadInput(currentThreadId, foregroundThreadId, false);
    }
  }
}
'@

$owner = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedOwner}')
) | ConvertFrom-Json
$ownerProcessId = [int]$owner.processId
$ownerProcessStartedAt = [string]$owner.processStartedAt
$targetPath = [System.Text.Encoding]::Unicode.GetString(
  [System.Convert]::FromBase64String('${encodedPath}')
)
$shell = New-Object -ComObject WScript.Shell
$fileNameCondition = [System.Windows.Automation.OrCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1001'
  ),
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1148'
  )
)
$submitCondition = [System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1'
  ),
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty,
    'Button'
  )
)
$dialogCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty,
  '#32770'
)

function Test-OwnerProcessGeneration([int]$processId) {
  $visited = @{}
  while ($processId -gt 0 -and -not $visited.ContainsKey($processId)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($null -eq $process -or $null -eq $process.CreationDate) {
      return $false
    }
    if ($processId -eq $ownerProcessId) {
      $processStartedAt = $process.CreationDate.ToUniversalTime().ToString(
        'O',
        [Globalization.CultureInfo]::InvariantCulture
      )
      return $processStartedAt -eq $ownerProcessStartedAt
    }
    $visited[$processId] = $true
    $processId = [int]$process.ParentProcessId
  }
  return $false
}

function Test-FocusedOwnedDialog([IntPtr]$windowHandle, [int]$processId) {
  return [NativeForegroundWindow]::IsWindow($windowHandle) -and
    [NativeForegroundWindow]::IsWindowVisible($windowHandle) -and
    [NativeForegroundWindow]::GetForegroundWindow() -eq $windowHandle -and
    (Test-OwnerProcessGeneration $processId)
}

function Find-FileDialog {
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $dialogCondition
  )
  $candidates = @()
  foreach ($dialog in @($windows)) {
    $windowHandle = [IntPtr]$dialog.Current.NativeWindowHandle
    if (
      $windowHandle -eq [IntPtr]::Zero -or
      -not (Test-OwnerProcessGeneration $dialog.Current.ProcessId) -or
      $dialog.Current.IsOffscreen -or
      -not [NativeForegroundWindow]::IsWindowVisible($windowHandle) -or
      -not [NativeForegroundWindow]::IsWindowEnabled($windowHandle)
    ) {
      continue
    }
    try {
      $fileNameFields = $dialog.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $fileNameCondition
      )
      $fileNameField = @($fileNameFields) |
        Where-Object {
          $_.Current.ClassName -eq 'Edit' -and
          $_.Current.BoundingRectangle.Width -gt 0 -and
          $_.Current.BoundingRectangle.Height -gt 0
        } |
        Sort-Object { $_.Current.BoundingRectangle.Top } -Descending |
        Select-Object -First 1
      $submitButton = $dialog.FindFirst(
        [System.Windows.Automation.TreeScope]::Descendants,
        $submitCondition
      )
      if (
        $fileNameField -and
        $fileNameField.Current.IsEnabled -and
        $submitButton -and
        $submitButton.Current.IsEnabled -and
        $submitButton.Current.NativeWindowHandle -ne 0
      ) {
        $candidates += [pscustomobject]@{
          FileNameField = $fileNameField
          SubmitButton = $submitButton
          WindowHandle = $windowHandle
          ProcessId = [int]$dialog.Current.ProcessId
        }
      }
    } catch {
      continue
    }
  }
  if ($candidates.Count -eq 1) {
    return $candidates[0]
  }
  return $null
}

function Close-FileDialog([IntPtr]$windowHandle, [int]$processId) {
  if (
    $windowHandle -ne [IntPtr]::Zero -and
    [NativeForegroundWindow]::IsWindow($windowHandle) -and
    [NativeForegroundWindow]::IsWindowVisible($windowHandle) -and
    (Test-OwnerProcessGeneration $processId) -and
    [NativeForegroundWindow]::FocusWindow($windowHandle) -and
    (Test-FocusedOwnedDialog $windowHandle $processId)
  ) {
    $shell.SendKeys('{ESC}')
  }
}

$deadline = [DateTime]::UtcNow.AddSeconds(15)
$fileDialog = $null
while (-not $fileDialog -and [DateTime]::UtcNow -lt $deadline) {
  $fileDialog = Find-FileDialog
  if (-not $fileDialog) {
    [System.Threading.Thread]::Sleep(100)
  }
}
if (-not $fileDialog) {
  $remainingWindows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $dialogCondition
  )
  $remaining = @($remainingWindows) | ForEach-Object {
    $handle = [IntPtr]$_.Current.NativeWindowHandle
    "$($_.Current.Name)|pid=$($_.Current.ProcessId)|handle=$handle|visible=$([NativeForegroundWindow]::IsWindowVisible($handle))|enabled=$([NativeForegroundWindow]::IsWindowEnabled($handle))"
  }
  throw "未找到 Electron Main PID $ownerProcessId 的真实文件对话框。候选：$($remaining -join '; ')"
}

$dialogWindowHandle = $fileDialog.WindowHandle
$dialogProcessId = $fileDialog.ProcessId
$fileNameField = $fileDialog.FileNameField
$submitButton = $fileDialog.SubmitButton
$fileNameBounds = $fileNameField.Current.BoundingRectangle
$submitBounds = $submitButton.Current.BoundingRectangle
if (
  $fileNameBounds.Width -le 0 -or
  $fileNameBounds.Height -le 0 -or
  $submitBounds.Width -le 0 -or
  $submitBounds.Height -le 0
) {
  Close-FileDialog $dialogWindowHandle $dialogProcessId
  throw '真实文件对话框的文件名或提交控件没有可点击边界。'
}

try {
  if (
    -not [NativeForegroundWindow]::FocusWindow($dialogWindowHandle) -or
    -not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)
  ) {
    throw '无法把真实文件对话框切换到前台。'
  }
  $shell.SendKeys('%n')
  [System.Threading.Thread]::Sleep(100)
  $focusedElement = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (
    -not $focusedElement -or
    $focusedElement.Current.ClassName -ne 'Edit' -or
    @('1001', '1148') -notcontains $focusedElement.Current.AutomationId
  ) {
    throw '真实文件对话框的文件名字段未获得输入焦点。'
  }
  $shell.SendKeys('^a')
  $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
  try {
    [System.Windows.Forms.Clipboard]::SetText($targetPath)
    if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
      throw '真实文件对话框在输入路径前失去所有权或焦点。'
    }
    $shell.SendKeys('^v')
    [System.Threading.Thread]::Sleep(300)
  } finally {
    if ($null -ne $previousClipboard) {
      [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
  }
  $valuePattern = $fileNameField.GetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern
  )
  if ($valuePattern.Current.Value -ne $targetPath) {
    throw "真实文件对话框没有收到目标路径。actual=$($valuePattern.Current.Value)"
  }
  if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
    throw '真实文件对话框在提交前失去所有权或焦点。'
  }
  $shell.SendKeys('{ENTER}')
} catch {
  Close-FileDialog $dialogWindowHandle $dialogProcessId
  throw
}

$closeDeadline = [DateTime]::UtcNow.AddSeconds(15)
while (
  [NativeForegroundWindow]::IsWindow($dialogWindowHandle) -and
  [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle) -and
  [DateTime]::UtcNow -lt $closeDeadline
) {
  [System.Threading.Thread]::Sleep(100)
}
if (
  [NativeForegroundWindow]::IsWindow($dialogWindowHandle) -and
  [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle)
) {
  Close-FileDialog $dialogWindowHandle $dialogProcessId
  throw '提交文件路径后，真实文件对话框没有关闭。'
}
`;

  await commandRunner.run(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    35_000,
  );
}