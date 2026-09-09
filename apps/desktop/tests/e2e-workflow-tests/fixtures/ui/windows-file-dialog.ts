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

$ownerProcesses = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedOwners}')
) | ConvertFrom-Json
$ownerStartedAtByProcessId = @{}
foreach ($owner in @($ownerProcesses)) {
  $ownerStartedAtByProcessId[[int]$owner.processId] = [string]$owner.processStartedAt
}
$parentProcessIdByProcessId = @{}
Get-CimInstance Win32_Process | ForEach-Object {
  $parentProcessIdByProcessId[[int]$_.ProcessId] = [int]$_.ParentProcessId
}

function Test-OwnerProcess([int]$processId) {
  $visited = @{}
  while ($processId -gt 0 -and -not $visited.ContainsKey($processId)) {
    if ($ownerStartedAtByProcessId.ContainsKey($processId)) {
      $ownerProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($null -eq $ownerProcess -or $ownerProcess.HasExited) {
        return $false
      }
      try {
        $ownerProcessStartedAt = $ownerProcess.StartTime.ToUniversalTime().ToString(
          'O',
          [Globalization.CultureInfo]::InvariantCulture
        )
        return $ownerProcessStartedAt -eq $ownerStartedAtByProcessId[$processId]
      } catch {
        return $false
      }
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
foreach ($dialog in @($dialogs)) {
  $windowHandle = [IntPtr]$dialog.Current.NativeWindowHandle
  if (
    $windowHandle -eq [IntPtr]::Zero -or
    -not (Test-OwnerProcess $dialog.Current.ProcessId) -or
    $dialog.Current.IsOffscreen -or
    -not $dialog.Current.IsEnabled
  ) {
    continue
  }
  try {
    $windowPattern = $dialog.GetCurrentPattern(
      [System.Windows.Automation.WindowPattern]::Pattern
    )
    $windowPattern.Close()
  } catch {
    continue
  }
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
  await runWindowsFileDialogAction(owner, { type: 'submit-path', targetPath }, commandRunner);
}

export async function cancelWindowsFileDialog(
  owner: WindowsFileDialogOwner,
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  await runWindowsFileDialogAction(owner, { type: 'cancel' }, commandRunner);
}

async function runWindowsFileDialogAction(
  owner: WindowsFileDialogOwner,
  action: { type: 'submit-path'; targetPath: string } | { type: 'cancel' },
  commandRunner: WindowsFileDialogCommandRunner,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('真实文件对话框驱动目前只支持 Windows。');
  }

  const encodedPath = action.type === 'submit-path'
    ? Buffer.from(action.targetPath, 'utf16le').toString('base64')
    : '';
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
  private static readonly IntPtr HwndTopmost = new IntPtr(-1);
  private static readonly IntPtr HwndNotTopmost = new IntPtr(-2);
  private const uint SwpNoSize = 0x0001;
  private const uint SwpNoMove = 0x0002;
  private const uint SwpShowWindow = 0x0040;

  [StructLayout(LayoutKind.Sequential)]
  private struct KeyboardInput {
    public ushort VirtualKey;
    public ushort ScanCode;
    public uint Flags;
    public uint Time;
    public UIntPtr ExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct MouseInput {
    public int X;
    public int Y;
    public uint MouseData;
    public uint Flags;
    public uint Time;
    public UIntPtr ExtraInfo;
  }

  [StructLayout(LayoutKind.Explicit)]
  private struct InputData {
    [FieldOffset(0)] public KeyboardInput Keyboard;
    [FieldOffset(0)] public MouseInput Mouse;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct Input {
    public uint Type;
    public InputData Data;
  }

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint SendInput(uint count, Input[] inputs, int size);

  public static void SendControlShortcut(ushort virtualKey) {
    Input[] inputs = {
      KeyInput(0x11, false), KeyInput(virtualKey, false),
      KeyInput(virtualKey, true), KeyInput(0x11, true)
    };
    if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))) != inputs.Length) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
  }

  private static Input KeyInput(ushort virtualKey, bool released) {
    return new Input {
      Type = 1,
      Data = new InputData {
        Keyboard = new KeyboardInput { VirtualKey = virtualKey, Flags = released ? 2u : 0u }
      }
    };
  }

  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr windowHandle, int command);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr windowHandle);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(
    IntPtr windowHandle,
    IntPtr insertAfter,
    int x,
    int y,
    int width,
    int height,
    uint flags
  );
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(
    uint flags,
    uint dx,
    uint dy,
    uint data,
    UIntPtr extraInfo
  );

  public static void RaiseWindow(IntPtr windowHandle) {
    ShowWindow(windowHandle, 5);
    SetWindowPos(windowHandle, HwndTopmost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpShowWindow);
    BringWindowToTop(windowHandle);
    SetForegroundWindow(windowHandle);
  }

  public static void ReleaseWindow(IntPtr windowHandle) {
    SetWindowPos(windowHandle, HwndNotTopmost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpShowWindow);
  }
}
'@

$owner = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedOwner}')
) | ConvertFrom-Json
$ownerProcessId = [int]$owner.processId
$ownerProcessStartedAt = [string]$owner.processStartedAt
$dialogAction = '${action.type}'
$targetPath = [System.Text.Encoding]::Unicode.GetString(
  [System.Convert]::FromBase64String('${encodedPath}')
)
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
    $processEntry = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($null -eq $processEntry) {
      return $false
    }
    if ($processId -eq $ownerProcessId) {
      $ownerProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($null -eq $ownerProcess -or $ownerProcess.HasExited) {
        return $false
      }
      try {
        $processStartedAt = $ownerProcess.StartTime.ToUniversalTime().ToString(
          'O',
          [Globalization.CultureInfo]::InvariantCulture
        )
        return $processStartedAt -eq $ownerProcessStartedAt
      } catch {
        return $false
      }
    }
    $visited[$processId] = $true
    $processId = [int]$processEntry.ParentProcessId
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
          Dialog = $dialog
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

function Close-FileDialog(
  $dialog,
  [IntPtr]$windowHandle,
  [int]$processId
) {
  if (
    $windowHandle -ne [IntPtr]::Zero -and
    [NativeForegroundWindow]::IsWindow($windowHandle) -and
    [NativeForegroundWindow]::IsWindowVisible($windowHandle) -and
    (Test-OwnerProcessGeneration $processId)
  ) {
    try {
      $windowPattern = $dialog.GetCurrentPattern(
        [System.Windows.Automation.WindowPattern]::Pattern
      )
      $windowPattern.Close()
    } catch {
      return
    }
  }
}

function Click-Control($bounds) {
  [void][NativeForegroundWindow]::SetCursorPos(
    [int]($bounds.Left + $bounds.Width / 2),
    [int]($bounds.Top + $bounds.Height / 2)
  )
  [NativeForegroundWindow]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [NativeForegroundWindow]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [System.Threading.Thread]::Sleep(100)
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
$dialog = $fileDialog.Dialog
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
  Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
  throw '真实文件对话框的文件名或提交控件没有可点击边界。'
}

if ($dialogAction -eq 'cancel') {
  try {
    $cancelCondition = [System.Windows.Automation.AndCondition]::new(
      [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
        '2'
      ),
      [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ClassNameProperty,
        'Button'
      )
    )
    $cancelButton = $dialog.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants,
      $cancelCondition
    )
    if (-not $cancelButton -or -not $cancelButton.Current.IsEnabled) {
      throw '真实文件对话框没有可用的取消按钮。'
    }
    $cancelBounds = $cancelButton.Current.BoundingRectangle
    if ($cancelBounds.Width -le 0 -or $cancelBounds.Height -le 0) {
      throw '真实文件对话框的取消按钮没有可点击边界。'
    }
    if (
      -not (Test-OwnerProcessGeneration $dialogProcessId) -or
      -not [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle) -or
      -not [NativeForegroundWindow]::IsWindowEnabled($dialogWindowHandle)
    ) {
      throw '真实文件对话框在取消前已失效。'
    }
    [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
    Click-Control $fileNameBounds
    if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
      throw '取消前真实文件对话框没有获得焦点或所有权。'
    }
    Click-Control $cancelBounds
  } catch {
    Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
    throw
  } finally {
    [NativeForegroundWindow]::ReleaseWindow($dialogWindowHandle)
  }
} else {
try {
  if (
    -not (Test-OwnerProcessGeneration $dialogProcessId) -or
    -not [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle) -or
    -not [NativeForegroundWindow]::IsWindowEnabled($dialogWindowHandle)
  ) {
    throw '真实文件对话框在输入前已失效。'
  }
  [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
  Click-Control $fileNameBounds
  if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
    throw '真实文件对话框在点击文件名字段后没有获得前台焦点。'
  }
  $focusedElement = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (
    -not $focusedElement -or
    $focusedElement.Current.ClassName -ne 'Edit' -or
    @('1001', '1148') -notcontains $focusedElement.Current.AutomationId -or
    $focusedElement.Current.NativeWindowHandle -ne $fileNameField.Current.NativeWindowHandle
  ) {
    throw '真实文件对话框的文件名字段未获得输入焦点。'
  }
  [NativeForegroundWindow]::SendControlShortcut(0x41)
  $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
  try {
    [System.Windows.Forms.Clipboard]::SetText($targetPath)
    if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
      throw '真实文件对话框在输入路径前失去所有权或焦点。'
    }
    [NativeForegroundWindow]::SendControlShortcut(0x56)
    $valuePattern = $fileNameField.GetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern
    )
    $pasteDeadline = [DateTime]::UtcNow.AddSeconds(3)
    while ($valuePattern.Current.Value -ne $targetPath -and [DateTime]::UtcNow -lt $pasteDeadline) {
      if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
        throw '真实文件对话框在等待输入完成时失去所有权或焦点。'
      }
      [System.Threading.Thread]::Sleep(50)
    }
    if ($valuePattern.Current.Value -ne $targetPath) {
      throw "真实文件对话框没有收到目标路径。actual=$($valuePattern.Current.Value)"
    }
  } finally {
    if ($null -ne $previousClipboard) {
      [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
  }
  if (-not (Test-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
    throw '真实文件对话框在提交前失去所有权或焦点。'
  }
  Click-Control $submitBounds
} catch {
  Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
  throw
} finally {
  [NativeForegroundWindow]::ReleaseWindow($dialogWindowHandle)
}
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
  Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
  throw '完成操作后，真实文件对话框没有关闭。'
}
`;

  await commandRunner.run(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    35_000,
  );
}