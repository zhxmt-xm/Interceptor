import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

export interface AppContainerSystemState {
  readonly supported: boolean;
  readonly containers: readonly { appContainerSid: string }[];
  readonly exemptSids: readonly string[];
}

const execFileAsync = promisify(execFile);

export function readAppContainerSystemState(desktopDirectory: string): Promise<AppContainerSystemState> {
  switch (process.platform) {
    case 'win32': return readWindowsAppContainerSystemState(desktopDirectory);
    case 'darwin': return Promise.resolve({ supported: false, containers: [], exemptSids: [] });
    default: throw new Error('AppContainer evidence requires a supported desktop platform.');
  }
}

async function readWindowsAppContainerSystemState(desktopDirectory: string): Promise<AppContainerSystemState> {
  try {
    const { stdout } = await execFileAsync(path.join(desktopDirectory, '../../packages/platform-capabilities/dist/app-container/app-container-helper.exe'), ['list'], {
      encoding: 'utf8', windowsHide: true,
    });
    return { ...JSON.parse(stdout), supported: true } as AppContainerSystemState;
  } catch {
    throw new Error('Could not read the system state for Settings query verification.');
  }
}

export function verifyAppContainerQueryResult(
  access: Readonly<Record<string, unknown>>, baseline: AppContainerSystemState,
): void {
  switch (process.platform) {
    case 'win32': return verifyWindowsAppContainerQueryResult(access, baseline);
    case 'darwin': return verifyMacosAppContainerQueryResult(access, baseline);
    default: throw new Error('AppContainer evidence requires a supported desktop platform.');
  }
}

function verifyWindowsAppContainerQueryResult(access: Readonly<Record<string, unknown>>, baseline: AppContainerSystemState): void {
  expect(access.supported).toBe(true);
  if (!Array.isArray(access.containers)) throw new Error('AppContainer Tool Result has no containers.');
  const containers = access.containers.filter((entry): entry is Record<string, unknown> => (
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
  ));
  const actualSids = containers.map((entry) => String(entry.appContainerSid).toLowerCase()).sort();
  const expectedSids = [...new Set(baseline.containers.map((entry) => entry.appContainerSid.toLowerCase()))].sort();
  expect(JSON.stringify(actualSids) === JSON.stringify(expectedSids)).toBe(true);
  const exemptions = new Set(baseline.exemptSids.map((sid) => sid.toLowerCase()));
  expect(containers.every((entry) => entry.exempt === exemptions.has(String(entry.appContainerSid).toLowerCase())))
    .toBe(true);
}

function verifyMacosAppContainerQueryResult(access: Readonly<Record<string, unknown>>, baseline: AppContainerSystemState): void {
  expect(baseline.supported).toBe(false);
  expect(access).toMatchObject({ supported: false, containers: [] });
}