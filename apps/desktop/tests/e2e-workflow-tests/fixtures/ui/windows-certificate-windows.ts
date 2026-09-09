import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';

const execFileAsync = promisify(execFile);

export interface CertificateWindow {
  readonly handle: number;
  readonly processId: number;
  readonly processStartedAt: string;
  readonly kind: 'reveal' | 'view';
}

export async function listCertificateWindows(certificateDirectory: string): Promise<CertificateWindow[]> {
  const encodedDirectory = Buffer.from(certificateDirectory, 'utf8').toString('base64');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$certificateDirectory = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedDirectory}'))
$processesById = @{}
Get-CimInstance Win32_Process | ForEach-Object { $processesById[[int]$_.ProcessId] = $_ }
$explorerWindows = @((New-Object -ComObject Shell.Application).Windows())
$windows = [Windows.Automation.AutomationElement]::RootElement.FindAll(
  [Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition
)
$result = @()
foreach ($window in $windows) {
  try {
    if ($window.Current.IsOffscreen -or $window.Current.NativeWindowHandle -eq 0) { continue }
    $className = [string]$window.Current.ClassName
    $processId = [int]$window.Current.ProcessId
    $process = $processesById[$processId]
    if ($null -eq $process) { continue }
    $kind = $null
    if ($className -eq 'CabinetWClass') {
      foreach ($explorerWindow in $explorerWindows) {
        if ([long]$explorerWindow.HWND -ne [long]$window.Current.NativeWindowHandle) { continue }
        if ([string]$explorerWindow.Document.Folder.Self.Path -ne $certificateDirectory) { continue }
        $selectedItems = @($explorerWindow.Document.SelectedItems())
        if (@($selectedItems | Where-Object { $_.Path -eq (Join-Path $certificateDirectory 'root-cert.pem') }).Count -eq 1) {
          $kind = 'reveal'
        }
      }
    } elseif ($className -eq '#32770') {
      if ([string]$process.CommandLine -like ('*' + $certificateDirectory + '*')) { $kind = 'view' }
    }
    if ($null -eq $kind) { continue }
    $result += [pscustomobject]@{
      handle = [long]$window.Current.NativeWindowHandle
      processId = $processId
      processStartedAt = $process.CreationDate.ToUniversalTime().ToString('O')
      kind = $kind
    }
  } catch { continue }
}
ConvertTo-Json -InputObject @($result) -Compress
`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  });
  return JSON.parse(stdout.trim()) as CertificateWindow[];
}

export async function closeCertificateWindow(window: CertificateWindow): Promise<void> {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CertificateWindowInput {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct TitleBarInfo {
    public int Size;
    public Rect Bounds;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=6)] public uint[] States;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=6)] public Rect[] Buttons;
  }
  public struct CloseButton { public Rect Bounds; public uint State; public int MessageError; }
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr handle, uint flags);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("kernel32.dll")] public static extern void SetLastError(uint error);
  [DllImport("user32.dll", EntryPoint="SendMessageW", SetLastError=true)] public static extern IntPtr GetTitleBarInfo(IntPtr handle, uint message, IntPtr first, ref TitleBarInfo info);
  public static CloseButton ReadCloseButton(IntPtr handle) {
    var info = new TitleBarInfo { Size = Marshal.SizeOf(typeof(TitleBarInfo)), States = new uint[6], Buttons = new Rect[6] };
    SetLastError(0);
    GetTitleBarInfo(handle, 0x033F, IntPtr.Zero, ref info);
    return new CloseButton { Bounds = info.Buttons[5], State = info.States[5], MessageError = Marshal.GetLastWin32Error() };
  }
}
'@
$handle = [IntPtr]::new(${window.handle})
if (-not [CertificateWindowInput]::IsWindow($handle)) { Write-Output 'closed'; return }
$process = Get-CimInstance Win32_Process -Filter 'ProcessId=${window.processId}'
if ($null -eq $process -or $process.CreationDate.ToUniversalTime().ToString('O') -ne '${window.processStartedAt}') {
  throw 'Certificate window process generation changed.'
}
$ownerProcessId = [uint32]0
[void][CertificateWindowInput]::GetWindowThreadProcessId($handle, [ref]$ownerProcessId)
if ($ownerProcessId -ne ${window.processId}) { throw 'Certificate window owner changed.' }
$previousDpi = [CertificateWindowInput]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
[void][CertificateWindowInput]::ShowWindow($handle, 9)
[void][CertificateWindowInput]::SetWindowPos($handle, [IntPtr]::new(-1), 0, 0, 0, 0, 0x43)
try {
  $closeButton = [CertificateWindowInput]::ReadCloseButton($handle)
  $bounds = $closeButton.Bounds
  if (($closeButton.State -band 0x18001) -ne 0 -or $bounds.Right -le $bounds.Left -or $bounds.Bottom -le $bounds.Top) {
    $details = [pscustomobject]@{ state = $closeButton.State; messageError = $closeButton.MessageError; enabled = [CertificateWindowInput]::IsWindowEnabled($handle); activePopup = [CertificateWindowInput]::GetLastActivePopup($handle).ToInt64(); bounds = $bounds } | ConvertTo-Json -Compress
    Write-Output ('waiting-for-close-button ' + $details); return
  }
  $point = [CertificateWindowInput+Point]::new()
  $point.X = [int](($bounds.Left + $bounds.Right) / 2)
  $point.Y = [int](($bounds.Top + $bounds.Bottom) / 2)
  $pointOwner = [CertificateWindowInput]::GetAncestor([CertificateWindowInput]::WindowFromPoint($point), 2)
  if ($pointOwner -ne $handle) { Write-Output 'waiting-for-uncovered-window'; return }
  [void][CertificateWindowInput]::SetCursorPos($point.X, $point.Y)
  [CertificateWindowInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [CertificateWindowInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
} finally {
  [void][CertificateWindowInput]::SetThreadDpiAwarenessContext($previousDpi)
}
Write-Output 'clicked'
`;
  try {
    await expect.poll(async () => {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
        encoding: 'utf8', windowsHide: true, timeout: 20_000,
      });
      return stdout.trim();
    }, { timeout: 20_000, message: `Close the test ${window.kind} window through its native button.` }).toMatch(/^(clicked|closed)$/);
    await expect.poll(() => isCertificateWindowOpen(window.handle), { timeout: 15_000 }).toBe(false);
  } finally {
    await releaseCertificateWindow(window);
  }
}

async function releaseCertificateWindow(window: CertificateWindow): Promise<void> {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CertificateWindowRelease {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
$handle = [IntPtr]::new(${window.handle})
if (-not [CertificateWindowRelease]::IsWindow($handle)) { return }
$process = Get-CimInstance Win32_Process -Filter 'ProcessId=${window.processId}'
if ($null -eq $process -or $process.CreationDate.ToUniversalTime().ToString('O') -ne '${window.processStartedAt}') { return }
$ownerProcessId = [uint32]0
[void][CertificateWindowRelease]::GetWindowThreadProcessId($handle, [ref]$ownerProcessId)
if ($ownerProcessId -eq ${window.processId}) {
  [void][CertificateWindowRelease]::SetWindowPos($handle, [IntPtr]::new(-2), 0, 0, 0, 0, 0x13)
}
`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  });
}

export async function isCertificateWindowOpen(handle: number): Promise<boolean> {
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CertificateWindowState { [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle); }'; [CertificateWindowState]::IsWindow([IntPtr]::new(${handle}))`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  });
  return stdout.trim().toLowerCase() === 'true';
}

export async function verifyAndCloseCertificateWindow(
  kind: CertificateWindow['kind'], before: readonly CertificateWindow[], certificateDirectory: string,
  ownedWindows: CertificateWindow[],
): Promise<void> {
  const beforeHandles = new Set(before.map((window) => window.handle));
  let openedWindow: CertificateWindow | undefined;
  await expect.poll(async () => {
    openedWindow = (await listCertificateWindows(certificateDirectory))
      .find((window) => window.kind === kind && !beforeHandles.has(window.handle));
    return openedWindow !== undefined;
  }, { timeout: 25_000, message: `Expected a new ${kind} certificate window.` }).toBe(true);
  ownedWindows.push(openedWindow!);
  await closeCertificateWindow(openedWindow!);
}