import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MacosHelperDeploymentService } from '../../helper-deployment';

const execute = promisify(execFile);
const helperPath = process.env.INTERCEPTOR_NATIVE_SERVICE_HELPER_PATH
  ?? path.resolve(import.meta.dirname, '../../../../../../../../dist/system-proxy/macos-proxy-helper');

describe.runIf(process.platform === 'darwin')('macOS bundled helper deployment', () => {
  let directory: string;
  let applicationPath: string;

  beforeAll(async () => {
    if (process.getuid!() === 0) throw new Error('Installation integration tests must run without administrator privileges.');
    directory = await realpath(await mkdtemp('/private/tmp/interceptor-installation-'));
    applicationPath = path.join(directory, 'Interceptor.app');
    const contentsPath = path.join(applicationPath, 'Contents');
    await mkdir(path.join(contentsPath, 'MacOS'), { recursive: true });
    await mkdir(path.join(contentsPath, 'Resources', 'system-proxy'), { recursive: true });
    await execute('xcrun', [
      'clang', '-o', path.join(contentsPath, 'MacOS', 'Interceptor'),
      path.resolve(import.meta.dirname, '../../../../tests/integration/native-service-client.c'),
    ]);
    await copyFile(helperPath, path.join(contentsPath, 'Resources', 'system-proxy', 'macos-proxy-helper'));
    await execute('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime',
      path.join(contentsPath, 'Resources', 'system-proxy', 'macos-proxy-helper')]);
    const propertyListPath = path.join(contentsPath, 'Info.plist');
    await execute('/usr/bin/plutil', ['-create', 'xml1', propertyListPath]);
    for (const [key, value] of Object.entries({
      CFBundleExecutable: 'Interceptor',
      CFBundleIdentifier: 'com.zhxmt.interceptor',
      CFBundlePackageType: 'APPL',
      CFBundleShortVersionString: '0.1.0',
      CFBundleVersion: '0.1.0',
    })) {
      await execute('/usr/bin/plutil', ['-insert', key, '-string', value, propertyListPath]);
    }
    await writeFile(path.join(contentsPath, 'Resources', 'identity.txt'), 'approved', 'utf8');
    await execute('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', applicationPath]);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('inspects the helper itself without requiring a signed application', async () => {
    const bundledHelperPath = path.join(applicationPath, 'Contents/Resources/system-proxy/macos-proxy-helper');
    const { stderr } = await execute('/usr/bin/codesign', ['--display', '--verbose=4', bundledHelperPath]);
    const codeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    expect(codeHash).toBeTruthy();
    const { stdout } = await execute(bundledHelperPath, ['inspect-helper']);
    expect(JSON.parse(stdout)).toEqual({ helperRequirement: `cdhash H"${codeHash}"` });
  });

  it('checks development readiness without an application path or user profile', async () => {
    const bundledHelperPath = path.join(applicationPath, 'Contents/Resources/system-proxy/macos-proxy-helper');
    const before = await lstat(bundledHelperPath);
    const { stdout } = await execute(bundledHelperPath, ['development-deployment-status', String(process.getuid!())]);
    expect(['missing', 'outdated', 'ready']).toContain(JSON.parse(stdout).state);
    const after = await lstat(bundledHelperPath);
    expect(after.ino).toBe(before.ino);
    expect(after.uid).toBe(process.getuid!());
  });

  it.each(['successful', 'cancelled'] as const)('stages and removes the exact helper for a %s development authorization', async (outcome) => {
    const bundledHelperPath = path.join(applicationPath, 'Contents/Resources/system-proxy/macos-proxy-helper');
    const identity = JSON.parse((await execute(bundledHelperPath, ['inspect-helper'])).stdout);
    let readinessChecks = 0;
    let stagedPath: string | undefined;
    const macosHelperDeploymentService = new MacosHelperDeploymentService({
      environment: 'development', helperPath: bundledHelperPath, userId: process.getuid!(),
      runner: {
        async run(command, args) {
          if (args[0] === 'development-deployment-status') {
            return { code: 0, stdout: JSON.stringify({ state: readinessChecks++ === 0 ? 'missing' : 'ready' }), stderr: '' };
          }
          if (args[0] === 'inspect-helper') return { code: 0, stdout: JSON.stringify(identity), stderr: '' };
          expect(args).toEqual(['request-development-installation', String(process.getuid!()), identity.helperRequirement]);
          expect(command).not.toBe(bundledHelperPath);
          stagedPath = command;
          const attributes = await lstat(command);
          expect(attributes.isFile()).toBe(true);
          expect(attributes.uid).toBe(process.getuid!());
          expect(attributes.mode & 0o777).toBe(0o500);
          expect((await lstat(path.dirname(command))).mode & 0o777).toBe(0o700);
          expect(JSON.parse((await execute(command, ['inspect-helper'])).stdout)).toEqual(identity);
          return outcome === 'successful'
            ? { code: 0, stdout: '', stderr: '' }
            : { code: 1, stdout: '', stderr: 'helper installation authorization cancelled' };
        },
      },
    });
    if (outcome === 'successful') await macosHelperDeploymentService.ensureInstalled();
    else await expect(macosHelperDeploymentService.ensureInstalled()).rejects.toMatchObject({ code: 'authorization-required' });
    expect(stagedPath).toBeDefined();
    await expect(lstat(path.dirname(stagedPath!))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse((await execute(bundledHelperPath, ['inspect-helper'])).stdout)).toEqual(identity);
  });

  it('rejects development installation without root privileges instead of requesting them', async () => {
    await expect(execute(helperPath, ['install-development-helper', String(process.getuid!()), `cdhash H"${'ab'.repeat(20)}"`]))
      .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'installation requires administrator privileges\n' });
  });

  it('rejects development authorization for another user before activating a prompt', async () => {
    await expect(execute(helperPath, ['request-development-installation', '0', `cdhash H"${'ab'.repeat(20)}"`]))
      .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'installation requires a logged-in local user\n' });
  });

  it.each(['install-helper', 'uninstall-helper'])(
    'rejects %s without administrator privileges instead of requesting them', async (command) => {
      const argumentsList = command === 'install-helper'
        ? [command, applicationPath, String(process.getuid!()), `cdhash H"${'ab'.repeat(20)}"`, `cdhash H"${'cd'.repeat(20)}"`]
        : [command];
      await expect(execute(helperPath, argumentsList, { timeout: 10_000 }))
        .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'installation requires administrator privileges\n' });
    }, 15_000,
  );

  it('checks readiness without installing or moving the user-owned App', async () => {
    const before = await lstat(applicationPath);
    const { stdout } = await execute(helperPath, ['deployment-status', applicationPath, String(process.getuid!())]);
    expect(['missing', 'outdated']).toContain(JSON.parse(stdout).state);
    const after = await lstat(applicationPath);
    expect(after.ino).toBe(before.ino);
    expect(after.uid).toBe(process.getuid!());
  });

  it('rejects an authorization request for another user before activating a prompt', async () => {
    await expect(execute(helperPath, ['request-installation', applicationPath, '0',
      `cdhash H"${'ab'.repeat(20)}"`, `cdhash H"${'cd'.repeat(20)}"`]))
      .rejects.toMatchObject({ code: 1, stderr: 'installation requires a logged-in local user\n' });
  });

  it('keeps deployment discovery separate from the full resource check required before authorization', async () => {
    const identity = JSON.parse((await execute(helperPath, ['inspect-application', applicationPath])).stdout);
    const argumentsList = ['deployment-status', applicationPath, String(process.getuid!())];
    const before = JSON.parse((await execute(helperPath, argumentsList)).stdout);
    const resourcePath = path.join(applicationPath, 'Contents', 'Resources', 'identity.txt');
    await writeFile(resourcePath, 'changed', 'utf8');
    try {
      const after = JSON.parse((await execute(helperPath, argumentsList)).stdout);
      expect(after).toEqual(before);
      await expect(execute(helperPath, ['inspect-application', applicationPath]))
        .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'application signature is invalid\n' });
      await expect(execute(helperPath, ['request-installation', applicationPath, String(process.getuid!()),
        identity.clientRequirement, identity.helperRequirement], { timeout: 10_000 }))
        .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'application signature is invalid\n' });
    } finally {
      await writeFile(resourcePath, 'approved', 'utf8');
    }
  });

  it('still rejects changed executable bytes during deployment discovery', async () => {
    const executablePath = path.join(applicationPath, 'Contents', 'MacOS', 'Interceptor');
    const original = await readFile(executablePath);
    expect(original.byteLength).toBeGreaterThan(4096);
    const changed = Buffer.from(original);
    changed[4096] = changed[4096]! ^ 0xff;
    await writeFile(executablePath, changed);
    try {
      await expect(execute(helperPath, ['deployment-status', applicationPath, String(process.getuid!())]))
        .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'application signature is invalid\n' });
    } finally {
      await writeFile(executablePath, original);
    }
  });

  it('inspects the complete signed application and rejects a resource change', async () => {
    const { stderr } = await execute('/usr/bin/codesign', ['--display', '--verbose=4', applicationPath]);
    const codeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    if (!codeHash) throw new Error('The signed application fixture has no code identity.');
    const helperIdentity = await execute('/usr/bin/codesign', ['--display', '--verbose=4',
      path.join(applicationPath, 'Contents/Resources/system-proxy/macos-proxy-helper')]);
    const helperCodeHash = /^CDHash=([a-f0-9]+)$/m.exec(helperIdentity.stderr)?.[1];
    if (!helperCodeHash) throw new Error('The bundled helper fixture has no code identity.');
    const { stdout } = await execute(helperPath, ['inspect-application', applicationPath]);
    expect(JSON.parse(stdout)).toEqual({
      bundleIdentifier: 'com.zhxmt.interceptor',
      bundleVersion: '0.1.0',
      clientRequirement: `cdhash H"${codeHash}"`,
      helperRequirement: `cdhash H"${helperCodeHash}"`,
    });
    await writeFile(path.join(applicationPath, 'Contents', 'Resources', 'identity.txt'), 'changed', 'utf8');
    await expect(execute(helperPath, ['inspect-application', applicationPath]))
      .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'application signature is invalid\n' });
  });
});