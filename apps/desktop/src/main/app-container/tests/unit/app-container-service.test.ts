import { describe, expect, it } from 'vitest';

import type {
  CommandResult,
  CommandRunner,
  ElevatedRunner,
} from '../../../interfaces';
import { AppContainerError } from '../../app-container-error';
import { AppContainerService } from '../../app-container-service';

const AAD_SID = 'S-1-15-2-1910091885-1573563583-1104941280-2418270861-3411158377-2822700936-2990310272';
const UNKNOWN_EXEMPT_SID = 'S-1-15-2-999';

class FakeCommandRunner implements CommandRunner {
  readonly calls: { command: string; args: readonly string[] }[] = [];
  result: CommandResult = ok(snapshot());

  /** Record one helper invocation and return the configured result. */
  run(command: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ command, args: [...args] });
    return Promise.resolve(this.result);
  }
}

class FakeElevatedRunner implements ElevatedRunner {
  readonly commands: string[] = [];
  result: CommandResult = ok(snapshot());

  /** Record one elevated helper command and return the configured result. */
  run(command: string): Promise<CommandResult> {
    this.commands.push(command);
    return Promise.resolve(this.result);
  }
}

describe('AppContainerService', () => {
  it('reports unsupported without invoking the Windows helper', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const appContainerService = createService(fakeCommandRunner, 'darwin');

    await expect(appContainerService.list()).resolves.toEqual({
      supported: false,
      containers: [],
      exemptSids: [],
    });
    expect(fakeCommandRunner.calls).toEqual([]);
  });

  it('enumerates containers and derives exemptions from the complete SID set', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const appContainerService = createService(fakeCommandRunner);

    const result = await appContainerService.list();

    expect(fakeCommandRunner.calls).toEqual([{
      command: 'C:/helpers/app-container-helper.exe',
      args: ['list'],
    }]);
    expect(result).toMatchObject({
      supported: true,
      exemptSids: [AAD_SID, UNKNOWN_EXEMPT_SID],
      containers: [{
        appContainerSid: AAD_SID,
        displayName: 'Work or school account',
        exempt: true,
      }],
    });
  });

  it('keeps a container disabled when its SID is not exempt', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    fakeCommandRunner.result = ok(snapshot({ exemptSids: [UNKNOWN_EXEMPT_SID] }));
    const appContainerService = createService(fakeCommandRunner);

    const result = await appContainerService.list();

    expect(result.containers[0]?.exempt).toBe(false);
    expect(result.exemptSids).toEqual([UNKNOWN_EXEMPT_SID]);
  });

  it('rejects duplicate container SIDs', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const value = snapshot();
    fakeCommandRunner.result = ok({
      ...value,
      containers: [value.containers[0], value.containers[0]],
    });
    const appContainerService = createService(fakeCommandRunner);

    await expect(appContainerService.list()).rejects.toThrow(
      new AppContainerError('AppContainer helper returned a duplicate SID.'),
    );
  });

  it('rejects invalid helper JSON and SID fields', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const appContainerService = createService(fakeCommandRunner);
    fakeCommandRunner.result = { code: 0, stdout: '{', stderr: '' };
    await expect(appContainerService.list()).rejects.toThrow('invalid JSON');

    fakeCommandRunner.result = ok(snapshot({ appContainerSid: 'not-a-sid' }));
    await expect(appContainerService.list()).rejects.toThrow('appContainerSid is invalid');
  });

  it('bounds helper failure output', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    fakeCommandRunner.result = { code: 1, stdout: '', stderr: 'x'.repeat(1_000) };
    const appContainerService = createService(fakeCommandRunner);

    await expect(appContainerService.list()).rejects.toMatchObject({
      name: 'AppContainerError',
      message: expect.stringMatching(/^AppContainer helper failed \(exit 1\): x{500}$/),
    });
  });

  it('changes one SID through the elevated helper and parses its verified snapshot', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const fakeElevatedRunner = new FakeElevatedRunner();
    fakeElevatedRunner.result = ok(snapshot({ exemptSids: [UNKNOWN_EXEMPT_SID] }));
    const appContainerService = createService(
      fakeCommandRunner,
      'win32',
      fakeElevatedRunner,
    );

    const result = await appContainerService.setLoopbackExemption(AAD_SID, false);

    expect(fakeElevatedRunner.commands).toEqual([
      `"C:/helpers/app-container-helper.exe" set ${AAD_SID} disabled`,
    ]);
    expect(result.exemptSids).toEqual([UNKNOWN_EXEMPT_SID]);
    expect(result.containers[0]?.exempt).toBe(false);
  });

  it('enables every current AppContainer through one elevated helper command', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const fakeElevatedRunner = new FakeElevatedRunner();
    fakeElevatedRunner.result = ok(snapshot({
      exemptSids: [AAD_SID, UNKNOWN_EXEMPT_SID],
    }));
    const appContainerService = createService(
      fakeCommandRunner,
      'win32',
      fakeElevatedRunner,
    );

    const result = await appContainerService.enableAllLoopbackExemptions();

    expect(fakeElevatedRunner.commands).toEqual([
      '"C:/helpers/app-container-helper.exe" enable-all',
    ]);
    expect(result.exemptSids).toEqual([AAD_SID, UNKNOWN_EXEMPT_SID]);
    expect(result.containers.every((container) => container.exempt)).toBe(true);
  });

  it('rejects unsupported and non-AppContainer targets before elevation', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const fakeElevatedRunner = new FakeElevatedRunner();
    const unsupportedAppContainerService = createService(
      fakeCommandRunner,
      'darwin',
      fakeElevatedRunner,
    );
    await expect(
      unsupportedAppContainerService.setLoopbackExemption(AAD_SID, true),
    ).rejects.toThrow('not supported on darwin');

    const appContainerService = createService(
      fakeCommandRunner,
      'win32',
      fakeElevatedRunner,
    );
    await expect(
      appContainerService.setLoopbackExemption('S-1-5-18', true),
    ).rejects.toThrow('not an AppContainer SID');
    expect(fakeElevatedRunner.commands).toEqual([]);
  });

  it('reports elevated helper failures without accepting stale state', async () => {
    const fakeCommandRunner = new FakeCommandRunner();
    const fakeElevatedRunner = new FakeElevatedRunner();
    fakeElevatedRunner.result = { code: 1, stdout: '', stderr: 'access denied' };
    const appContainerService = createService(
      fakeCommandRunner,
      'win32',
      fakeElevatedRunner,
    );

    await expect(
      appContainerService.setLoopbackExemption(AAD_SID, true),
    ).rejects.toThrow('access denied');
  });
});

function createService(
  fakeCommandRunner: FakeCommandRunner,
  platform: NodeJS.Platform = 'win32',
  fakeElevatedRunner: FakeElevatedRunner = new FakeElevatedRunner(),
): AppContainerService {
  return new AppContainerService({
    platform,
    helperPath: 'C:/helpers/app-container-helper.exe',
    commandRunner: fakeCommandRunner,
    elevatedRunner: fakeElevatedRunner,
  });
}

function ok(value: unknown): CommandResult {
  return { code: 0, stdout: JSON.stringify(value), stderr: '' };
}

function snapshot(overrides: {
  readonly appContainerSid?: string;
  readonly exemptSids?: readonly string[];
} = {}) {
  return {
    containers: [{
      appContainerSid: overrides.appContainerSid ?? AAD_SID,
      userSid: 'S-1-5-18',
      packageFamilyName: 'Microsoft.AAD.BrokerPlugin_cw5n1h2txyewy',
      displayName: 'Work or school account',
      description: 'Windows sign-in broker',
      packageFullName: 'Microsoft.AAD.BrokerPlugin_1.0.0.0_neutral__cw5n1h2txyewy',
      workingDirectory: 'C:/Windows/SystemApps/AAD.BrokerPlugin',
      binaries: ['C:/Windows/System32/wwahost.exe'],
      capabilities: ['S-1-15-3-1'],
    }],
    exemptSids: overrides.exemptSids ?? [AAD_SID, UNKNOWN_EXEMPT_SID],
  };
}