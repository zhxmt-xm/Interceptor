import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '../runtime/local-electron-driver';

const execFileAsync = promisify(execFile);
const MOUNT_ROOT = '/Volumes';
const APPLICATION_NAME = 'Interceptor.app';

/** Read the system clipboard written by the packaged Main through the real Copy link action. */
export async function readMacosClipboardText(): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/pbpaste', { encoding: 'utf8' });
  return stdout;
}

/** Snapshot mounted volumes before opening a DMG so only the new volume is accepted. */
export async function listMountedVolumeNames(): Promise<string[]> {
  return (await readdir(MOUNT_ROOT)).sort();
}

export interface MountedInstallerVolume {
  readonly volumeName: string;
  readonly volumePath: string;
  readonly applicationPath: string;
  readonly applicationVersion: string;
  readonly executableArchitectures: readonly string[];
}

/** Read the mounted App executable's Mach-O slices so the DMG cannot carry another architecture. */
async function readExecutableArchitectures(applicationPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('/usr/bin/lipo', [
    '-archs',
    path.join(applicationPath, 'Contents/MacOS/Interceptor'),
  ], { encoding: 'utf8' });
  return stdout.trim().split(/\s+/).filter(Boolean);
}

/** Wait for the DMG opened through the product to mount a volume containing the real App. */
export async function waitForMountedInstallerVolume(options: {
  readonly knownVolumes: readonly string[];
  readonly timeoutMs?: number;
}): Promise<MountedInstallerVolume> {
  let mounted: MountedInstallerVolume | null = null;
  await expect.poll(async () => {
    for (const volumeName of await listMountedVolumeNames()) {
      if (options.knownVolumes.includes(volumeName)) continue;
      const volumePath = path.join(MOUNT_ROOT, volumeName);
      const applicationPath = path.join(volumePath, APPLICATION_NAME);
      const application = await stat(applicationPath).catch(() => null);
      if (!application?.isDirectory()) continue;
      const { stdout } = await execFileAsync('/usr/bin/defaults', [
        'read',
        path.join(applicationPath, 'Contents/Info.plist'),
        'CFBundleShortVersionString',
      ], { encoding: 'utf8' });
      mounted = {
        volumeName,
        volumePath,
        applicationPath,
        applicationVersion: stdout.trim(),
        executableArchitectures: await readExecutableArchitectures(applicationPath),
      };
      return true;
    }
    return false;
  }, {
    message: 'The opened DMG did not mount a volume containing Interceptor.app',
    timeout: options.timeoutMs ?? 120_000,
  }).toBe(true);
  if (!mounted) throw new Error('The opened DMG volume could not be inspected.');
  return mounted;
}

/** Detach only this run's mounted installer volume and verify it is gone. */
export async function detachMountedInstallerVolume(mounted: MountedInstallerVolume): Promise<void> {
  try {
    await execFileAsync('/usr/bin/hdiutil', ['detach', mounted.volumePath], {
      encoding: 'utf8',
      timeout: 60_000,
    });
  } catch {
    await execFileAsync('/usr/bin/hdiutil', ['detach', '-force', mounted.volumePath], {
      encoding: 'utf8',
      timeout: 60_000,
    });
  }
  await expect.poll(async () => (await listMountedVolumeNames()).includes(mounted.volumeName), {
    message: 'The installer DMG volume stayed mounted',
    timeout: 60_000,
  }).toBe(false);
}
