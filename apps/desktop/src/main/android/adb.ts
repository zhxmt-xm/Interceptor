import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 生产使用随包platform-tools；开发只读取显式SDK或PATH。 */
export function resolveAdbExecutable(packaged: boolean, resourcesPath: string,
  androidHome: string | undefined, platform: NodeJS.Platform): string {
  const executable = platform === 'win32' ? 'adb.exe' : 'adb';
  if (packaged) return path.join(resourcesPath, 'android', 'platform-tools', executable);
  return androidHome ? path.join(androidHome, 'platform-tools', executable) : executable;
}

export function createAdbRunner(executable: string): (args: readonly string[]) => Promise<string> {
  return async (args) => {
    const timeout = args.includes('install') || args.includes('pull') ? 120_000 : 30_000;
    const { stdout } = await execFileAsync(executable, [...args], {
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  };
}

export async function verifyPackagedAdbExecutable(
  executable: string,
  runtimeDirectory: string,
  platform: NodeJS.Platform,
  applicationExecutable: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(runtimeDirectory, 'manifest.json'), 'utf8'),
  ) as unknown;
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid Android runtime manifest.');
  const platformTools = (manifest as Record<string, unknown>).platformTools;
  if (!platformTools || typeof platformTools !== 'object') {
    throw new Error('Android runtime manifest has no platform-tools metadata.');
  }
  if ((platformTools as Record<string, unknown>).revision !== '37.0.1') {
    throw new Error('Android platform-tools revision is not verified.');
  }
  const files = (platformTools as Record<string, unknown>).files;
  if (!Array.isArray(files)) throw new Error('Android platform-tools manifest is invalid.');
  const expectedAdbPath = platform === 'win32'
    ? 'platform-tools/adb.exe'
    : 'platform-tools/adb';
  const expectedPaths = platform === 'win32'
    ? [
        expectedAdbPath,
        'platform-tools/AdbWinApi.dll',
        'platform-tools/AdbWinUsbApi.dll',
      ]
    : [expectedAdbPath];
  if (path.resolve(executable) !== path.resolve(runtimeDirectory, expectedAdbPath)) {
    throw new Error('Packaged Android ADB path is outside the verified runtime.');
  }
  const mismatched: string[] = [];
  for (const expectedPath of expectedPaths) {
    const entry = files.find((value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && (value as Record<string, unknown>).path === expectedPath);
    const expected = entry?.sha256;
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error(`Android runtime checksum is missing for ${expectedPath}.`);
    }
    const filePath = path.join(runtimeDirectory, expectedPath);
    const actual = createHash('sha256').update(await readFile(filePath)).digest('hex');
    if (actual !== expected) mismatched.push(filePath);
  }
  if (mismatched.length === 0) return;
  if (platform === 'darwin') {
    throw new Error('Packaged Android ADB checksum verification failed.');
  }
  if (platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$app=Get-AuthenticodeSignature -LiteralPath $env:INTERCEPTOR_APP;' +
      'if($app.Status -ne "Valid"){exit 1};' +
      '$files=ConvertFrom-Json $env:INTERCEPTOR_ANDROID_RUNTIME_FILES;' +
      'foreach($file in $files){$sig=Get-AuthenticodeSignature -LiteralPath $file;' +
      'if($sig.Status -ne "Valid" -or ' +
      '$sig.SignerCertificate.Thumbprint -ne $app.SignerCertificate.Thumbprint){exit 1}}',
    ], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        INTERCEPTOR_APP: applicationExecutable,
        INTERCEPTOR_ANDROID_RUNTIME_FILES: JSON.stringify(mismatched),
      },
    });
    return;
  }
  throw new Error('Packaged Android ADB checksum verification failed.');
}
