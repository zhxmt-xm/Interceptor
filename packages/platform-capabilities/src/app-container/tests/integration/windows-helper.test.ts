import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

interface HelperSnapshot {
  readonly containers: Array<{ readonly appContainerSid: string }>;
}

describe('Windows AppContainer helper', () => {
  it.runIf(process.platform === 'win32')('lists each AppContainer SID exactly once', async () => {
    const helperPath = path.resolve(
      __dirname,
      '../../../../dist/app-container/app-container-helper.exe',
    );

    const { stdout } = await execFileAsync(helperPath, ['list'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const snapshot = JSON.parse(stdout) as HelperSnapshot;
    const appContainerSids = snapshot.containers.map(
      (appContainer) => appContainer.appContainerSid.toLocaleLowerCase(),
    );

    expect(new Set(appContainerSids).size).toBe(appContainerSids.length);
  });
});