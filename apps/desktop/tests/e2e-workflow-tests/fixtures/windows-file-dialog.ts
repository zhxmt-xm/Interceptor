import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 通过 Windows UI Automation 定位真实文件对话框，并用鼠标键盘提交目标路径。 */
export async function submitWindowsFileDialogPath(
  ownerProcessId: number,
  targetPath: string,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('真实文件对话框驱动目前只支持 Windows。');
  }

  const encodedPath = Buffer.from(targetPath, 'utf16le').toString('base64');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class NativeForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr windowHandle);
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
}
'@

$ownerProcessId = ${ownerProcessId}
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

$deadline = [DateTime]::UtcNow.AddSeconds(15)
$fileDialog = $null
while (-not $fileDialog -and [DateTime]::UtcNow -lt $deadline) {
  $fileDialog = Find-FileDialog
  if (-not $fileDialog) {
    [System.Threading.Thread]::Sleep(100)
  }
}
if (-not $fileDialog) {
  $shell.SendKeys('{ESC}')
  $remainingWindows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    $dialogCondition
  )
  $remaining = @($remainingWindows) | ForEach-Object {
    $handle = [IntPtr]$_.Current.NativeWindowHandle
    "$($_.Current.Name)|$handle|$([NativeForegroundWindow]::IsWindowVisible($handle))|$([NativeForegroundWindow]::IsWindowEnabled($handle))"
  }
  throw "未找到 Electron Main PID $ownerProcessId 的真实文件对话框。候选：$($remaining -join '; ')"
}

$dialogWindowHandle = $fileDialog.WindowHandle
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
  $shell.SendKeys('{ESC}')
  throw '真实文件对话框的文件名或提交控件没有可点击边界。'
}

try {
  [void][NativeForegroundWindow]::SetForegroundWindow($dialogWindowHandle)
  [System.Threading.Thread]::Sleep(100)
  [void][NativeForegroundWindow]::SetCursorPos(
    [int]($fileNameBounds.Left + $fileNameBounds.Width / 2),
    [int]($fileNameBounds.Top + $fileNameBounds.Height / 2)
  )
  [NativeForegroundWindow]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [NativeForegroundWindow]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [System.Threading.Thread]::Sleep(100)
  $shell.SendKeys('^a')
  $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
  try {
    [System.Windows.Forms.Clipboard]::SetText($targetPath)
    $shell.SendKeys('^v')
    [System.Threading.Thread]::Sleep(300)
  } finally {
    if ($null -ne $previousClipboard) {
      [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
  }
  [void][NativeForegroundWindow]::SetCursorPos(
    [int]($submitBounds.Left + $submitBounds.Width / 2),
    [int]($submitBounds.Top + $submitBounds.Height / 2)
  )
  [NativeForegroundWindow]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [NativeForegroundWindow]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
} catch {
  $shell.SendKeys('{ESC}')
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
  [void][NativeForegroundWindow]::SetForegroundWindow($dialogWindowHandle)
  $shell.SendKeys('{ESC}')
  throw '提交文件路径后，真实文件对话框没有关闭。'
}
`;

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    { encoding: 'utf8', timeout: 35_000, windowsHide: true },
  );
}