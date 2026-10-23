import { execFile } from 'node:child_process';
import path from 'node:path';
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
  beforeConfirm?: () => Promise<void>,
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  await runWindowsFileDialogAction(owner, { type: 'prepare-path', targetPath }, commandRunner);
  try {
    await beforeConfirm?.();
  } catch (error) {
    try {
      await cancelWindowsFileDialog(owner, commandRunner);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Windows file dialog screenshot and cancellation failed.',
      );
    }
    throw error;
  }
  await runWindowsFileDialogAction(owner, { type: 'confirm', targetPath }, commandRunner);
}

export async function cancelWindowsFileDialog(
  owner: WindowsFileDialogOwner,
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  await runWindowsFileDialogAction(owner, { type: 'cancel' }, commandRunner);
}

/** Capture only the exact workflow-owned native dialog without reading the desktop. */
export async function screenshotWindowsFileDialog(
  owner: WindowsFileDialogOwner,
  destination: string,
  commandRunner: WindowsFileDialogCommandRunner = windowsFileDialogCommandRunner,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Windows file dialog screenshots require Windows.');
  }
  if (!path.isAbsolute(destination) || /[\r\n\0]/.test(destination)) {
    throw new Error('Windows file dialog screenshot destination must be an absolute file path.');
  }
  const encodedOwner = Buffer.from(JSON.stringify(owner), 'utf8').toString('base64');
  const encodedDestination = Buffer.from(destination, 'utf16le').toString('base64');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$nativeCaptureSource = @'
using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class NativeFileDialogCapture {
  [StructLayout(LayoutKind.Sequential)]
  private struct WindowRectangle {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool GetWindowRect(IntPtr windowHandle, out WindowRectangle rectangle);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool PrintWindow(IntPtr windowHandle, IntPtr deviceContext, uint flags);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern bool IsWindowEnabled(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr windowHandle);

  [DllImport("user32.dll")]
  private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

  public static void SavePng(
    IntPtr windowHandle,
    string destination,
    int navigationRight,
    int navigationTop,
    int navigationBottom,
    int addressLeft,
    int addressTop,
    int addressRight,
    int addressBottom
  ) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    if (
      windowHandle == IntPtr.Zero ||
      !IsWindow(windowHandle) ||
      !IsWindowVisible(windowHandle) ||
      !IsWindowEnabled(windowHandle)
    ) {
      throw new InvalidOperationException("The owned native dialog is not capturable.");
    }
    WindowRectangle rectangle;
    if (!GetWindowRect(windowHandle, out rectangle)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    int width = rectangle.Right - rectangle.Left;
    int height = rectangle.Bottom - rectangle.Top;
    if (width <= 0 || height <= 0) {
      throw new InvalidOperationException("The owned native dialog has an empty window rectangle.");
    }
    using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
      using (Graphics graphics = Graphics.FromImage(bitmap)) {
        graphics.Clear(Color.Magenta);
        IntPtr deviceContext = graphics.GetHdc();
        try {
          if (!PrintWindow(windowHandle, deviceContext, 2)) {
            throw new Win32Exception(Marshal.GetLastWin32Error());
          }
        } finally {
          graphics.ReleaseHdc(deviceContext);
        }
      }
      bool rendered = false;
      for (int y = 0; y < height && !rendered; y += Math.Max(1, height / 64)) {
        for (int x = 0; x < width; x += Math.Max(1, width / 64)) {
          if (bitmap.GetPixel(x, y).ToArgb() != Color.Magenta.ToArgb()) {
            rendered = true;
            break;
          }
        }
      }
      if (!rendered) {
        throw new InvalidOperationException("PrintWindow returned an empty native dialog image.");
      }
      int privacyRight = Math.Max(0, Math.Min(width, navigationRight - rectangle.Left));
      int privacyTop = Math.Max(0, Math.Min(height, navigationTop - rectangle.Top));
      int privacyBottom = Math.Max(privacyTop, Math.Min(height, navigationBottom - rectangle.Top));
      int privacyAddressLeft = Math.Max(0, Math.Min(width, addressLeft - rectangle.Left));
      int privacyAddressTop = Math.Max(0, Math.Min(height, addressTop - rectangle.Top));
      int privacyAddressRight = Math.Max(
        privacyAddressLeft,
        Math.Min(width, addressRight - rectangle.Left)
      );
      int privacyAddressBottom = Math.Max(
        privacyAddressTop,
        Math.Min(height, addressBottom - rectangle.Top)
      );
      if (
        privacyRight <= 0 ||
        privacyBottom <= privacyTop ||
        privacyAddressRight <= privacyAddressLeft ||
        privacyAddressBottom <= privacyAddressTop
      ) {
        throw new InvalidOperationException("The native navigation pane has no privacy-safe bounds.");
      }
      Color background = bitmap.GetPixel(
        Math.Min(width - 1, privacyRight + 4),
        Math.Min(height - 1, privacyTop + 4)
      );
      using (Graphics privacyGraphics = Graphics.FromImage(bitmap))
      using (SolidBrush privacyBrush = new SolidBrush(background)) {
        privacyGraphics.FillRectangle(
          privacyBrush,
          0,
          privacyTop,
          privacyRight,
          privacyBottom - privacyTop
        );
        privacyGraphics.FillRectangle(
          privacyBrush,
          privacyAddressLeft,
          privacyAddressTop,
          privacyAddressRight - privacyAddressLeft,
          privacyAddressBottom - privacyAddressTop
        );
      }
      bitmap.Save(destination, ImageFormat.Png);
    }
  }
}
'@
Add-Type -TypeDefinition $nativeCaptureSource -ReferencedAssemblies @(
  [System.Drawing.Bitmap].Assembly.Location
)

$owner = [System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String('${encodedOwner}')
) | ConvertFrom-Json
$destination = [System.Text.Encoding]::Unicode.GetString(
  [System.Convert]::FromBase64String('${encodedDestination}')
)
$ownerProcessId = [int]$owner.processId
$ownerProcessStartedAt = [string]$owner.processStartedAt
$parentProcessIdByProcessId = @{}
Get-CimInstance Win32_Process | ForEach-Object {
  $parentProcessIdByProcessId[[int]$_.ProcessId] = [int]$_.ParentProcessId
}

function Test-OwnerProcessGeneration([int]$processId) {
  $visited = @{}
  while ($processId -gt 0 -and -not $visited.ContainsKey($processId)) {
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
$dialogs = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  $dialogCondition
)
$candidates = @()
foreach ($dialog in @($dialogs)) {
  $windowHandle = [IntPtr]$dialog.Current.NativeWindowHandle
  if (
    $windowHandle -eq [IntPtr]::Zero -or
    -not (Test-OwnerProcessGeneration $dialog.Current.ProcessId) -or
    $dialog.Current.IsOffscreen -or
    -not [NativeFileDialogCapture]::IsWindowVisible($windowHandle) -or
    -not [NativeFileDialogCapture]::IsWindowEnabled($windowHandle)
  ) {
    continue
  }
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
  $dialogBounds = $dialog.Current.BoundingRectangle
  $descendants = @($dialog.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  ))
  $contentPane = $descendants |
    Where-Object {
      $bounds = $_.Current.BoundingRectangle
      $bounds.Left -gt $dialogBounds.Left + 100 -and
      $bounds.Top -lt $fileNameField.Current.BoundingRectangle.Top -and
      $bounds.Width -gt $dialogBounds.Width * 0.4 -and
      $bounds.Height -gt $dialogBounds.Height * 0.3
    } |
    Sort-Object {
      $bounds = $_.Current.BoundingRectangle
      $bounds.Width * $bounds.Height
    } -Descending |
    Select-Object -First 1
  $addressBar = $descendants |
    Where-Object {
      $bounds = $_.Current.BoundingRectangle
      (
        $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ToolBar -or
        $_.Current.ClassName -eq 'ToolbarWindow32'
      ) -and
      $bounds.Left -gt $dialogBounds.Left + 100 -and
      $bounds.Top -lt $dialogBounds.Top + $dialogBounds.Height * 0.2 -and
      $bounds.Width -gt $dialogBounds.Width * 0.4 -and
      $bounds.Height -gt 0
    } |
    Sort-Object { $_.Current.BoundingRectangle.Width } -Descending |
    Select-Object -First 1
  if (
    $fileNameField -and
    $fileNameField.Current.IsEnabled -and
    $submitButton -and
    $submitButton.Current.IsEnabled -and
    $contentPane -and
    $addressBar
  ) {
    $contentBounds = $contentPane.Current.BoundingRectangle
    $addressBounds = $addressBar.Current.BoundingRectangle
    $fileNameBounds = $fileNameField.Current.BoundingRectangle
    $candidates += [pscustomobject]@{
      WindowHandle = $windowHandle
      ProcessId = [int]$dialog.Current.ProcessId
      NavigationRight = [int]$contentBounds.Left
      NavigationTop = [int]$contentBounds.Top
      NavigationBottom = [int]$fileNameBounds.Top
      AddressLeft = [int]$addressBounds.Left
      AddressTop = [int]$addressBounds.Top
      AddressRight = [int]$addressBounds.Right
      AddressBottom = [int]$addressBounds.Bottom
    }
  }
}
if ($candidates.Count -ne 1) {
  throw "Expected one workflow-owned Windows file dialog, found $($candidates.Count)."
}
$candidate = $candidates[0]
if (
  -not (Test-OwnerProcessGeneration $candidate.ProcessId) -or
  [NativeFileDialogCapture]::GetForegroundWindow() -ne $candidate.WindowHandle
) {
  throw 'The workflow-owned Windows file dialog is not the foreground window.'
}
[NativeFileDialogCapture]::SavePng(
  $candidate.WindowHandle,
  $destination,
  $candidate.NavigationRight,
  $candidate.NavigationTop,
  $candidate.NavigationBottom,
  $candidate.AddressLeft,
  $candidate.AddressTop,
  $candidate.AddressRight,
  $candidate.AddressBottom
)
if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
  throw 'The Windows file dialog screenshot was not written.'
}
`;
  await commandRunner.run(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    30_000,
  );
}

async function runWindowsFileDialogAction(
  owner: WindowsFileDialogOwner,
  action:
    | { type: 'prepare-path'; targetPath: string }
    | { type: 'confirm'; targetPath: string }
    | { type: 'cancel' },
  commandRunner: WindowsFileDialogCommandRunner,
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('真实文件对话框驱动目前只支持 Windows。');
  }

  const encodedPath = action.type !== 'cancel'
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

  public static void SendKey(ushort virtualKey) {
    Input[] inputs = { KeyInput(virtualKey, false), KeyInput(virtualKey, true) };
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
  [DllImport("user32.dll")] private static extern bool AttachThreadInput(
    uint sourceThreadId,
    uint targetThreadId,
    bool attach
  );
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(
    IntPtr windowHandle,
    IntPtr processId
  );
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
  [DllImport("user32.dll")] public static extern bool SetPhysicalCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(
    uint flags,
    uint dx,
    uint dy,
    uint data,
    UIntPtr extraInfo
  );

  public static void RaiseWindow(IntPtr windowHandle) {
    uint currentThread = GetCurrentThreadId();
    uint targetThread = GetWindowThreadProcessId(windowHandle, IntPtr.Zero);
    IntPtr foregroundWindow = GetForegroundWindow();
    uint foregroundThread = foregroundWindow == IntPtr.Zero
      ? 0
      : GetWindowThreadProcessId(foregroundWindow, IntPtr.Zero);
    bool attachedCurrent = currentThread != targetThread
      && AttachThreadInput(currentThread, targetThread, true);
    bool attachedForeground = foregroundThread != 0
      && foregroundThread != targetThread
      && AttachThreadInput(foregroundThread, targetThread, true);
    try {
      ShowWindow(windowHandle, 5);
      SetWindowPos(windowHandle, HwndTopmost, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpShowWindow);
      BringWindowToTop(windowHandle);
      SetForegroundWindow(windowHandle);
    } finally {
      if (attachedForeground) AttachThreadInput(foregroundThread, targetThread, false);
      if (attachedCurrent) AttachThreadInput(currentThread, targetThread, false);
    }
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
$targetDirectory = if ($dialogAction -eq 'cancel') {
  ''
} else {
  [System.IO.Path]::GetDirectoryName($targetPath)
}
$targetFileName = if ($dialogAction -eq 'cancel') {
  ''
} else {
  [System.IO.Path]::GetFileName($targetPath)
}
if (
  $dialogAction -ne 'cancel' -and (
    [string]::IsNullOrWhiteSpace($targetDirectory) -or
    [string]::IsNullOrWhiteSpace($targetFileName) -or
    -not (Test-Path -LiteralPath $targetDirectory -PathType Container)
  )
) {
  throw '目标文件必须位于已存在的测试目录中。'
}
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

function Wait-FocusedOwnedDialog([IntPtr]$windowHandle, [int]$processId) {
  $deadline = [DateTime]::UtcNow.AddSeconds(3)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-FocusedOwnedDialog $windowHandle $processId) {
      return $true
    }
    [System.Threading.Thread]::Sleep(50)
  }
  return $false
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
  [void][NativeForegroundWindow]::SetPhysicalCursorPos(
    [int]($bounds.Left + $bounds.Width / 2),
    [int]($bounds.Top + $bounds.Height / 2)
  )
  [NativeForegroundWindow]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [NativeForegroundWindow]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [System.Threading.Thread]::Sleep(100)
}

function Wait-AddressField {
  $deadline = [DateTime]::UtcNow.AddSeconds(3)
  while ([DateTime]::UtcNow -lt $deadline) {
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (
      $focused -and
      $focused.Current.ClassName -eq 'Edit' -and
      @('1001', '1148') -notcontains $focused.Current.AutomationId
    ) {
      try {
        [void]$focused.GetCurrentPattern(
          [System.Windows.Automation.ValuePattern]::Pattern
        )
        return $focused
      } catch {
      }
    }
    [System.Threading.Thread]::Sleep(50)
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
    $cancelFocused = $false
    for ($attempt = 0; $attempt -lt 3 -and -not $cancelFocused; $attempt += 1) {
      [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
      Click-Control $fileNameBounds
      $cancelFocused = Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId
    }
    if (-not $cancelFocused) {
      throw '取消前真实文件对话框没有获得焦点或所有权。'
    }
    Click-Control $cancelBounds
  } catch {
    Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
    throw
  } finally {
    [NativeForegroundWindow]::ReleaseWindow($dialogWindowHandle)
  }
} elseif ($dialogAction -eq 'prepare-path') {
try {
  if (
    -not (Test-OwnerProcessGeneration $dialogProcessId) -or
    -not [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle) -or
    -not [NativeForegroundWindow]::IsWindowEnabled($dialogWindowHandle)
  ) {
    throw '真实文件对话框在输入前已失效。'
  }
  [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
  $previousClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
  try {
    $addressField = $null
    for ($attempt = 0; $attempt -lt 3 -and -not $addressField; $attempt += 1) {
      [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
      Click-Control $fileNameBounds
      if (-not (Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
        continue
      }
      [NativeForegroundWindow]::SendControlShortcut(0x4C)
      $addressField = Wait-AddressField
    }
    if (-not $addressField) {
      throw '真实文件对话框没有打开目录输入框。'
    }
    if (-not (Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
      throw '真实文件对话框在定位测试目录前失去所有权或焦点。'
    }
    [System.Windows.Forms.Clipboard]::SetText($targetDirectory)
    [NativeForegroundWindow]::SendControlShortcut(0x56)
    [NativeForegroundWindow]::SendKey(0x0D)
    [System.Threading.Thread]::Sleep(500)
    $normalizedTargetDirectory = [System.IO.Path]::GetFullPath($targetDirectory).TrimEnd('\')
    $actualDirectory = ''
    $directoryVerified = $false
    for ($attempt = 0; $attempt -lt 3 -and -not $directoryVerified; $attempt += 1) {
      [NativeForegroundWindow]::SendControlShortcut(0x4C)
      $addressField = Wait-AddressField
      if (-not $addressField) {
        continue
      }
      $addressPattern = $addressField.GetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern
      )
      $valueDeadline = [DateTime]::UtcNow.AddSeconds(1)
      do {
        $actualDirectory = $addressPattern.Current.Value
        if (-not [string]::IsNullOrWhiteSpace($actualDirectory)) {
          break
        }
        [System.Threading.Thread]::Sleep(50)
      } while ([DateTime]::UtcNow -lt $valueDeadline)
      $directoryVerified = (
        -not [string]::IsNullOrWhiteSpace($actualDirectory) -and
        $actualDirectory.Trim().TrimEnd('\').EndsWith(
          $normalizedTargetDirectory,
          [System.StringComparison]::OrdinalIgnoreCase
        )
      )
      if (-not $directoryVerified) {
        [NativeForegroundWindow]::SendControlShortcut(0x41)
        [System.Windows.Forms.Clipboard]::SetText($targetDirectory)
        [NativeForegroundWindow]::SendControlShortcut(0x56)
        [NativeForegroundWindow]::SendKey(0x0D)
        [System.Threading.Thread]::Sleep(500)
      }
    }
    if (-not $directoryVerified) {
      throw "真实文件对话框没有进入测试目录。actual=$actualDirectory"
    }
    [NativeForegroundWindow]::SendKey(0x1B)
    $fileDialog = Find-FileDialog
    if (-not $fileDialog) {
      throw '进入测试目录后，真实文件对话框已失效。'
    }
    $dialogWindowHandle = $fileDialog.WindowHandle
    $dialogProcessId = $fileDialog.ProcessId
    $dialog = $fileDialog.Dialog
    $fileNameField = $fileDialog.FileNameField
    $submitButton = $fileDialog.SubmitButton
    $fileNameBounds = $fileNameField.Current.BoundingRectangle
    $submitBounds = $submitButton.Current.BoundingRectangle
    $valuePattern = $fileNameField.GetCurrentPattern(
      [System.Windows.Automation.ValuePattern]::Pattern
    )
    $fileNameAccepted = $false
    for ($attempt = 0; $attempt -lt 3 -and -not $fileNameAccepted; $attempt += 1) {
      [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
      Click-Control $fileNameBounds
      if (-not (Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
        continue
      }
      $focusedElement = [System.Windows.Automation.AutomationElement]::FocusedElement
      if (
        -not $focusedElement -or
        $focusedElement.Current.ClassName -ne 'Edit' -or
        @('1001', '1148') -notcontains $focusedElement.Current.AutomationId -or
        $focusedElement.Current.NativeWindowHandle -ne $fileNameField.Current.NativeWindowHandle
      ) {
        continue
      }
      [NativeForegroundWindow]::SendControlShortcut(0x41)
      [System.Windows.Forms.Clipboard]::SetText($targetFileName)
      [NativeForegroundWindow]::SendControlShortcut(0x56)
      $pasteDeadline = [DateTime]::UtcNow.AddSeconds(1)
      do {
        $fileNameAccepted = $valuePattern.Current.Value -eq $targetFileName
        if ($fileNameAccepted) {
          break
        }
        [System.Threading.Thread]::Sleep(50)
      } while ([DateTime]::UtcNow -lt $pasteDeadline)
    }
    if (-not $fileNameAccepted) {
      throw "真实文件对话框没有收到目标文件名。actual=$($valuePattern.Current.Value)"
    }
  } finally {
    if ($null -ne $previousClipboard) {
      [System.Windows.Forms.Clipboard]::SetDataObject($previousClipboard, $true)
    } else {
      [System.Windows.Forms.Clipboard]::Clear()
    }
  }
  if (-not (Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
    throw '真实文件对话框在截图前失去所有权或焦点。'
  }
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
    throw '真实文件对话框在提交前已失效。'
  }
  $valuePattern = $fileNameField.GetCurrentPattern(
    [System.Windows.Automation.ValuePattern]::Pattern
  )
  $submitted = $false
  for ($attempt = 0; $attempt -lt 3 -and -not $submitted; $attempt += 1) {
    [NativeForegroundWindow]::RaiseWindow($dialogWindowHandle)
    Click-Control $fileNameBounds
    if (-not (Wait-FocusedOwnedDialog $dialogWindowHandle $dialogProcessId)) {
      continue
    }
    if ($valuePattern.Current.Value -ne $targetFileName) {
      throw '截图后真实文件对话框中的目标路径发生变化。'
    }
    Click-Control $submitBounds
    $submitDeadline = [DateTime]::UtcNow.AddSeconds(2)
    while (
      [NativeForegroundWindow]::IsWindow($dialogWindowHandle) -and
      [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle) -and
      [DateTime]::UtcNow -lt $submitDeadline
    ) {
      [System.Threading.Thread]::Sleep(50)
    }
    $submitted = -not (
      [NativeForegroundWindow]::IsWindow($dialogWindowHandle) -and
      [NativeForegroundWindow]::IsWindowVisible($dialogWindowHandle)
    )
  }
  if (-not $submitted) {
    throw '完成操作后，真实文件对话框没有关闭。'
  }
} catch {
  Close-FileDialog $dialog $dialogWindowHandle $dialogProcessId
  throw
} finally {
  [NativeForegroundWindow]::ReleaseWindow($dialogWindowHandle)
}
}

if ($dialogAction -ne 'prepare-path') {
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
}
`;

  await commandRunner.run(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    35_000,
  );
}