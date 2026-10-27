import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Read the Windows clipboard through PowerShell without touching product state. */
export async function readWindowsClipboardText(): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Clipboard verification requires Windows.');
  }
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'Get-Clipboard -Raw'],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true },
  );
  return stdout.replace(/\r?\n$/, '');
}
