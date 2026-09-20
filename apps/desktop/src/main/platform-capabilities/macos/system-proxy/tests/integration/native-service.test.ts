import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as x509 from '@peculiar/x509';

import { MacosHelperServiceClient } from '../../../helper-client';

const execFileAsync = promisify(execFile);
const helperPath = process.env.INTERCEPTOR_NATIVE_SERVICE_HELPER_PATH
  ?? path.resolve(import.meta.dirname, '../../../../../../../dist/system-proxy/macos-proxy-helper');
const capabilities = [
  'status', 'system-proxy.read', 'system-proxy.read-effective', 'system-proxy.replace',
  'certificate.import', 'certificate.remove', 'certificate.trust', 'certificate.untrust',
];

describe.runIf(process.platform === 'darwin')('macOS native service transport', () => {
  let directory: string;
  let clientPath: string;
  let clientRequirement: string;
  let socketPath: string;
  let serviceProcess: ChildProcess | null = null;
  let certificateParameters: { certificate: string; sha256: string };

  beforeAll(async () => {
    if (process.getuid!() === 0) throw new Error('Native service tests must run without administrator privileges.');
    directory = await mkdtemp('/private/tmp/interceptor-service-');
    clientPath = path.join(directory, 'client');
    socketPath = path.join(directory, 'service.sock');
    await execFileAsync('xcrun', [
      'clang', '-o', clientPath, path.join(import.meta.dirname, 'native-service-client.c'),
    ]);
    await execFileAsync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', clientPath]);
    const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', clientPath]);
    const codeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    if (!codeHash) throw new Error('Native fixture did not produce a code identity.');
    clientRequirement = `cdhash H"${codeHash}"`;
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
      publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']) as CryptoKeyPair;
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: '01', name: 'CN=Interceptor CA, O=Interceptor', keys, signingAlgorithm: algorithm,
      notBefore: new Date(Date.now() - 60_000), notAfter: new Date(Date.now() + 86_400_000),
      extensions: [new x509.BasicConstraintsExtension(true, 0, true)],
    });
    const der = Buffer.from(certificate.rawData);
    certificateParameters = { certificate: der.toString('base64'), sha256: createHash('sha256').update(der).digest('hex').toUpperCase() };
  });

  afterEach(async () => {
    if (serviceProcess && serviceProcess.exitCode === null && serviceProcess.signalCode === null) {
      const exited = new Promise<void>((resolve) => serviceProcess!.once('exit', () => resolve()));
      serviceProcess.kill('SIGTERM');
      await exited;
    }
    serviceProcess = null;
    await rm(socketPath, { force: true });
    await rm(path.join(directory, 'development.sock'), { force: true });
    await rm(path.join(directory, 'development.json'), { force: true });
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function configureService(overrides: Record<string, unknown> = {}): Promise<string> {
    const configurationPath = path.join(directory, 'service.json');
    await writeFile(configurationPath, JSON.stringify({
      protocolVersion: 1,
      socketPath,
      clientUserId: process.getuid!(),
      clientExecutablePath: clientPath,
      clientRequirement,
      ...overrides,
    }), { encoding: 'utf8', mode: 0o600 });
    await chmod(configurationPath, 0o600);
    return configurationPath;
  }

  async function configureDevelopmentService(overrides: Record<string, unknown> = {}): Promise<string> {
    const configurationPath = path.join(directory, 'development.json');
    await writeFile(configurationPath, JSON.stringify({
      protocolVersion: 1, socketPath, clientUserId: process.getuid!(), ...overrides,
    }), { encoding: 'utf8', mode: 0o600 });
    await chmod(configurationPath, 0o600);
    return configurationPath;
  }

  async function startService(overrides: Record<string, unknown> = {}, environment: 'production' | 'development' = 'production'): Promise<void> {
    const configurationPath = environment === 'development'
      ? await configureDevelopmentService(overrides) : await configureService(overrides);
    serviceProcess = spawn(helperPath, [environment === 'development' ? 'serve-development' : 'serve', configurationPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    serviceProcess.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    await new Promise<void>((resolve, reject) => {
      serviceProcess!.once('error', reject);
      serviceProcess!.once('exit', (code) => reject(new Error(`Service exited before ready (${code}): ${stderr}`)));
      serviceProcess!.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (!stdout.includes('\n')) return;
        try {
          expect(JSON.parse(stdout.split('\n')[0]!)).toMatchObject({ event: 'ready', protocolVersion: 1 });
          resolve();
        } catch (error) { reject(error); }
      });
    });
  }

  async function requestFromNativeClient(request: unknown): Promise<Record<string, unknown>> {
    const { stdout } = await execFileAsync(clientPath, [socketPath, JSON.stringify(request)]);
    return JSON.parse(stdout) as Record<string, unknown>;
  }

  it('allows the approved development user without pinning code, paths or debugger permissions', async () => {
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    await startService({}, 'development');
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
    expect(await macosHelperServiceClient.getStatus()).toEqual({
      processId: serviceProcess!.pid, privileged: false, clientAuthorizedForWrites: true, capabilities,
    });
    const snapshot = await macosHelperServiceClient.readSystemProxySnapshot();
    expect(isDeepStrictEqual(snapshot, before)).toBe(true);
    await expect(macosHelperServiceClient.replaceSystemProxySnapshot(snapshot, snapshot))
      .rejects.toMatchObject({ code: 'authorization-required' });
    await expect(macosHelperServiceClient.importCertificate(certificateParameters))
      .rejects.toMatchObject({ code: 'authorization-required' });
    await expect(macosHelperServiceClient.removeCertificate(certificateParameters))
      .rejects.toMatchObject({ code: 'authorization-required' });
    expect(isDeepStrictEqual(JSON.parse((await execFileAsync(helperPath, ['get'])).stdout), before)).toBe(true);
  });

  it.each(['certificate.trust', 'certificate.untrust'])(
    'requires root for the automatic %s operation without showing authorization on the background service', async (operation) => {
      await startService({}, 'development');
      expect(await requestFromNativeClient({
        protocolVersion: 1, requestId: 'certificate-trust', operation, parameters: certificateParameters,
      })).toMatchObject({ ok: false, error: { code: 'authorization-required' } });
    },
  );

  it('validates a foreground trust request before asking for system authorization', async () => {
    const execution = execFileAsync(helperPath, ['certificate.trust'], { encoding: 'utf8' });
    execution.child.stdin!.end(JSON.stringify(certificateParameters));
    await expect(execution).rejects.toMatchObject({ code: 1, stderr: 'verification-failed\n' });
  });

  it('does not request foreground authorization when the exact CA has no admin trust', async () => {
    const execution = execFileAsync(helperPath, ['certificate.untrust'], { encoding: 'utf8' });
    execution.child.stdin!.end(JSON.stringify(certificateParameters));
    expect(JSON.parse((await execution).stdout)).toEqual({ sha256: certificateParameters.sha256, trusted: false });
  });

  it('does not start foreground trust when the automatic service is unavailable', async () => {
    const client = new MacosHelperServiceClient(socketPath, helperPath);
    await expect(client.trustCertificate(certificateParameters)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(client.untrustCertificate(certificateParameters)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  async function withCertificateAuthorizationReply(
    reply: Record<string, unknown>, verify: (requests: unknown[]) => Promise<void>,
  ): Promise<void> {
    const requests: unknown[] = [];
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string };
        requests.push(request);
        connection.end(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ...reply }) + '\n');
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try { await verify(requests); }
    finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }

  it.each([
    { operation: 'certificate.trust', method: 'trustCertificate', trusted: true },
    { operation: 'certificate.untrust', method: 'untrustCertificate', trusted: false },
  ] as const)('uses automatic certificate authorization for $operation without a foreground process', async ({ operation, method, trusted }) => {
    await withCertificateAuthorizationReply({ ok: true, value: { sha256: certificateParameters.sha256, trusted } }, async (requests) => {
      const client = new MacosHelperServiceClient(socketPath, path.join(directory, 'absent-foreground-helper'));
      await expect(client[method](certificateParameters)).resolves.toBeUndefined();
      expect(requests).toEqual([expect.objectContaining({ operation, parameters: certificateParameters })]);
    });
  });

  it('falls back once only after automatic certificate authorization reports the rule is restored', async () => {
    await withCertificateAuthorizationReply({ ok: false, error: { code: 'authorization-required' } }, async (requests) => {
      const client = new MacosHelperServiceClient(socketPath, helperPath);
      await expect(client.untrustCertificate(certificateParameters)).resolves.toBeUndefined();
      expect(requests).toEqual([expect.objectContaining({ operation: 'certificate.untrust', parameters: certificateParameters })]);
    });
  });

  it.each(['authorization-restoration-failed', 'certificate-state-uncertain', 'unauthorized-client', 'invalid-request'])(
    'does not fall back after automatic certificate authorization fails with %s', async (code) => {
      await withCertificateAuthorizationReply({ ok: false, error: { code } }, async (requests) => {
        const client = new MacosHelperServiceClient(socketPath, helperPath);
        await expect(client.untrustCertificate(certificateParameters)).rejects.toMatchObject({ code });
        expect(requests).toHaveLength(1);
      });
    },
  );

  it.each(['certificate.trust', 'certificate.untrust'])(
    'rejects paths and private material before foreground %s authorization', async (operation) => {
      for (const parameters of [
        { path: '/tmp/certificate.pem', sha256: certificateParameters.sha256 },
        { ...certificateParameters, privateKey: 'not-a-public-certificate' },
        { ...certificateParameters, sha256: '00'.repeat(32) },
      ]) {
        const execution = execFileAsync(helperPath, [operation], { encoding: 'utf8' });
        execution.child.stdin!.end(JSON.stringify(parameters));
        await expect(execution).rejects.toMatchObject({ code: 1, stderr: 'invalid-request\n' });
      }
    },
  );

  it('keeps the production socket strict while the same process serves the development socket', async () => {
    const developmentSocketPath = path.join(directory, 'development.sock');
    await configureDevelopmentService({ socketPath: developmentSocketPath });
    await startService();
    const developmentClient = new MacosHelperServiceClient(developmentSocketPath);
    expect(await developmentClient.getStatus()).toMatchObject({
      processId: serviceProcess!.pid, clientAuthorizedForWrites: true,
    });
    const productionClient = new MacosHelperServiceClient(socketPath);
    await expect(productionClient.getStatus()).rejects.toMatchObject({ code: 'unauthorized-client' });
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'production', operation: 'status' }))
      .toMatchObject({ ok: true, value: { processId: serviceProcess!.pid, clientAuthorizedForWrites: false } });
    const exited = new Promise<void>((resolve) => serviceProcess!.once('exit', () => resolve()));
    serviceProcess!.kill('SIGTERM');
    await exited;
    await expect(lstat(developmentSocketPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects another user on the development socket', async () => {
    await startService({ clientUserId: process.getuid!() + 1 }, 'development');
    await expect(new MacosHelperServiceClient(socketPath).getStatus())
      .rejects.toMatchObject({ code: 'unauthorized-client' });
  });

  it('keeps development available when the approved production application is absent', async () => {
    const developmentSocketPath = path.join(directory, 'development.sock');
    await configureDevelopmentService({ socketPath: developmentSocketPath });
    await startService({ clientExecutablePath: path.join(directory, 'absent-app-executable') });
    expect(await new MacosHelperServiceClient(developmentSocketPath).getStatus())
      .toMatchObject({ clientAuthorizedForWrites: true });
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'absent-app', operation: 'status' }))
      .toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it('keeps development requests inside the fixed protocol without caller-selected authentication', async () => {
    await startService({}, 'development');
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'extra', operation: 'status', environment: 'production' }))
      .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'shell', operation: 'execute' }))
      .toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
  });

  it('refuses a writable development configuration before creating a socket', async () => {
    const configurationPath = await configureDevelopmentService();
    await chmod(configurationPath, 0o666);
    await expect(execFileAsync(helperPath, ['serve-development', configurationPath]))
      .rejects.toMatchObject({ code: 1, stderr: 'service configuration must be protected\n' });
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serves successive approved clients in one process without modifying the host', async () => {
    await startService();
    for (const requestId of ['first', 'second', 'third']) {
      expect(await requestFromNativeClient({ protocolVersion: 1, requestId, operation: 'status' })).toEqual({
        protocolVersion: 1, requestId, ok: true,
        value: {
          processId: serviceProcess!.pid, privileged: false, clientAuthorizedForWrites: false,
          capabilities,
        },
      });
    }
    expect((await lstat(socketPath)).isSocket()).toBe(true);
  });

  it('reads effective system proxy settings without changing the service snapshots', async () => {
    await startService();
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    const effective = JSON.parse((await execFileAsync(helperPath, ['get-effective-proxies'])).stdout);
    const response = await requestFromNativeClient({
      protocolVersion: 1, requestId: 'effective-proxies', operation: 'system-proxy.read-effective',
    });

    expect(response).toMatchObject({ ok: true, value: expect.any(Object) });
    expect(Array.isArray(response.value)).toBe(false);
    expect(response.value).toEqual(effective);
    expect(isDeepStrictEqual(JSON.parse((await execFileAsync(helperPath, ['get'])).stdout), before)).toBe(true);
  });

  it('removes its endpoint on normal shutdown and recovers a stale endpoint after a crash', async () => {
    await startService();
    const exitedNormally = new Promise<void>((resolve) => serviceProcess!.once('exit', () => resolve()));
    serviceProcess!.kill('SIGTERM');
    await exitedNormally;
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await startService();
    const crashedProcessId = serviceProcess!.pid;
    const crashed = new Promise<void>((resolve) => serviceProcess!.once('exit', () => resolve()));
    serviceProcess!.kill('SIGKILL');
    await crashed;
    expect((await lstat(socketPath)).isSocket()).toBe(true);

    await startService();
    expect(serviceProcess!.pid).not.toBe(crashedProcessId);
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'restarted', operation: 'status' }))
      .toMatchObject({ ok: true, value: { processId: serviceProcess!.pid } });
  });

  it('does not replace an active service endpoint or an unrelated file', async () => {
    await startService();
    const endpointBefore = await lstat(socketPath);
    const configurationPath = path.join(directory, 'service.json');
    await expect(execFileAsync(helperPath, ['serve', configurationPath], { timeout: 2_000 }))
      .rejects.toMatchObject({ code: 1 });
    expect((await lstat(socketPath)).ino).toBe(endpointBefore.ino);
    const response = await requestFromNativeClient({ protocolVersion: 1, requestId: 'still-running', operation: 'status' })
      .catch((error: { code?: number; signal?: string }) => {
        throw new Error(JSON.stringify({
          clientExitCode: error.code, clientSignal: error.signal,
          serviceExitCode: serviceProcess!.exitCode, serviceSignal: serviceProcess!.signalCode,
        }));
      });
    expect(response)
      .toMatchObject({ ok: true, value: { processId: serviceProcess!.pid } });

    const exited = new Promise<void>((resolve) => serviceProcess!.once('exit', () => resolve()));
    serviceProcess!.kill('SIGTERM');
    await exited;
    await writeFile(socketPath, 'unrelated file', 'utf8');
    await expect(execFileAsync(helperPath, ['serve', configurationPath], { timeout: 2_000 }))
      .rejects.toMatchObject({ code: 1 });
    expect(await readFile(socketPath, 'utf8')).toBe('unrelated file');
  });

  it('rejects an unapproved process before reading a request', async () => {
    await startService();
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      let output = '';
      socket.on('data', (chunk) => { output += chunk.toString(); });
      socket.once('end', () => resolve(output));
      socket.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET' && output.length > 0) resolve(output);
        else reject(error);
      });
    });
    expect(JSON.parse(response)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it('rejects a changed client signature even at the configured executable path', async () => {
    await startService({ clientRequirement: `cdhash H"${'00'.repeat(20)}"` });
    const response = await requestFromNativeClient({ protocolVersion: 1, requestId: 'changed', operation: 'status' });
    expect(response).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it('rejects changed nested application resources even when the approved executable has not changed', async () => {
    const applicationPath = path.join(directory, 'Approved.app');
    const nestedApplicationPath = path.join(applicationPath, 'Contents', 'Helpers', 'Nested.app');
    for (const [bundlePath, executableName] of [[nestedApplicationPath, 'Nested'], [applicationPath, 'Approved']] as const) {
      const contentsPath = path.join(bundlePath, 'Contents');
      await mkdir(path.join(contentsPath, 'MacOS'), { recursive: true });
      await copyFile(clientPath, path.join(contentsPath, 'MacOS', executableName));
      const propertyListPath = path.join(contentsPath, 'Info.plist');
      await execFileAsync('/usr/bin/plutil', ['-create', 'xml1', propertyListPath]);
      for (const [key, value] of Object.entries({
        CFBundleExecutable: executableName,
        CFBundleIdentifier: `com.interceptor.test.${executableName.toLowerCase()}`,
        CFBundlePackageType: 'APPL',
        CFBundleVersion: '1',
      })) {
        await execFileAsync('/usr/bin/plutil', ['-insert', key, '-string', value, propertyListPath]);
      }
      await mkdir(path.join(contentsPath, 'Resources'));
      await writeFile(path.join(contentsPath, 'Resources', 'resource.txt'), 'approved', 'utf8');
      await execFileAsync('/usr/bin/codesign', ['--force', '--sign', '-', bundlePath]);
    }
    const applicationExecutablePath = path.join(applicationPath, 'Contents', 'MacOS', 'Approved');
    const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', applicationPath]);
    const applicationCodeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    if (!applicationCodeHash) throw new Error('The application fixture has no code identity.');
    await startService({
      clientExecutablePath: applicationExecutablePath,
      clientRequirement: `cdhash H"${applicationCodeHash}"`,
    });
    const request = JSON.stringify({ protocolVersion: 1, requestId: 'bundle', operation: 'status' });
    const approved = await execFileAsync(applicationExecutablePath, [socketPath, request]);
    expect(JSON.parse(approved.stdout)).toMatchObject({ ok: true });

    await writeFile(path.join(nestedApplicationPath, 'Contents', 'Resources', 'resource.txt'), 'changed', 'utf8');
    const changed = await execFileAsync(applicationExecutablePath, [socketPath, request]);
    expect(JSON.parse(changed.stdout)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it('rejects unknown commands and unexpected parameters instead of exposing command execution', async () => {
    await startService();
    for (const operation of ['execute', 'proxy.set', 'certificate.install', 'install-helper', 'uninstall-helper']) {
      expect(await requestFromNativeClient({ protocolVersion: 1, requestId: operation, operation }))
        .toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
    }
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'extra', operation: 'status', command: 'id' }))
      .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('reads the complete system proxy snapshot through the authenticated service without modifying it', async () => {
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    await startService();
    const response = await requestFromNativeClient({
      protocolVersion: 1, requestId: 'read-proxy', operation: 'system-proxy.read',
    });
    expect(response.ok).toBe(true);
    expect(response.requestId).toBe('read-proxy');
    expect(isDeepStrictEqual(response.value, before)).toBe(true);
    const after = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    expect(isDeepStrictEqual(after, before)).toBe(true);
  });

  it('does not give a standalone signed executable application write permissions', async () => {
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    await startService();
    const response = await requestFromNativeClient({
      protocolVersion: 1, requestId: 'replace-proxy', operation: 'system-proxy.replace',
      parameters: { expectedSnapshot: before, replacementSnapshot: before },
    });
    expect(response).toMatchObject({
      requestId: 'replace-proxy', ok: false, error: { code: 'unauthorized-client' },
    });
    const after = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    expect(isDeepStrictEqual(after, before)).toBe(true);
  });

  it('authorizes an approved signed user-owned App without moving it and refuses changed resources', async () => {
    const applicationPath = path.join(directory, 'Interceptor.app');
    const contentsPath = path.join(applicationPath, 'Contents');
    const executablePath = path.join(contentsPath, 'MacOS', 'Interceptor');
    const bundledHelper = path.join(contentsPath, 'Resources', 'system-proxy', 'macos-proxy-helper');
    await mkdir(path.dirname(executablePath), { recursive: true });
    await mkdir(path.dirname(bundledHelper), { recursive: true });
    await copyFile(clientPath, executablePath);
    await copyFile(helperPath, bundledHelper);
    await execFileAsync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', bundledHelper]);
    const propertyListPath = path.join(contentsPath, 'Info.plist');
    await execFileAsync('/usr/bin/plutil', ['-create', 'xml1', propertyListPath]);
    for (const [key, value] of Object.entries({
      CFBundleExecutable: 'Interceptor', CFBundleIdentifier: 'com.zhxmt.interceptor',
      CFBundlePackageType: 'APPL', CFBundleShortVersionString: '0.1.0', CFBundleVersion: '0.1.0',
    })) await execFileAsync('/usr/bin/plutil', ['-insert', key, '-string', value, propertyListPath]);
    const resourcePath = path.join(contentsPath, 'Resources', 'approved.txt');
    await writeFile(resourcePath, 'approved', 'utf8');
    await execFileAsync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', applicationPath]);
    const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', applicationPath]);
    const codeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    if (!codeHash) throw new Error('Approved application has no code identity.');
    await startService({ clientExecutablePath: executablePath, clientRequirement: `cdhash H"${codeHash}"` });
    const identityBefore = await lstat(applicationPath);
    const request = { protocolVersion: 1, requestId: 'client-permissions', operation: 'status' };
    const approved = await execFileAsync(executablePath, [socketPath, JSON.stringify(request)]);
    expect(JSON.parse(approved.stdout)).toMatchObject({ ok: true, value: { clientAuthorizedForWrites: true, privileged: false } });
    const snapshot = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    const write = await execFileAsync(executablePath, [socketPath, JSON.stringify({
      ...request, operation: 'system-proxy.replace', parameters: { expectedSnapshot: snapshot, replacementSnapshot: snapshot },
    })]);
    expect(JSON.parse(write.stdout)).toMatchObject({ ok: false, error: { code: 'authorization-required' } });
    for (const operation of ['certificate.import', 'certificate.remove']) {
      const certificateResult = await execFileAsync(executablePath, [socketPath, JSON.stringify({
        ...request, operation, parameters: certificateParameters,
      })]);
      expect(JSON.parse(certificateResult.stdout)).toMatchObject({ ok: false, error: { code: 'authorization-required' } });
    }
    const identityAfter = await lstat(applicationPath);
    expect(identityAfter.uid).toBe(process.getuid!());
    expect(identityAfter.ino).toBe(identityBefore.ino);
    await writeFile(resourcePath, 'changed', 'utf8');
    const publicRead = await execFileAsync(executablePath, [socketPath, JSON.stringify({
      ...request, operation: 'system-proxy.read',
    })]);
    expect(JSON.parse(publicRead.stdout).ok).toBe(true);
    expect(isDeepStrictEqual(JSON.parse(publicRead.stdout).value, snapshot)).toBe(true);
    const changed = await execFileAsync(executablePath, [socketPath, JSON.stringify(request)]);
    expect(JSON.parse(changed.stdout)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
    const changedWrite = await execFileAsync(executablePath, [socketPath, JSON.stringify({
      ...request, operation: 'system-proxy.replace', parameters: { expectedSnapshot: snapshot, replacementSnapshot: snapshot },
    })]);
    expect(JSON.parse(changedWrite.stdout)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it.each(['unhardened', 'dyld-environment', 'debuggable'] as const)(
    'rejects the approved %s client before considering system write authorization', async (variant) => {
      const executablePath = path.join(directory, variant);
      await copyFile(clientPath, executablePath);
      const signingArguments = ['--force', '--sign', '-', '--options', variant === 'unhardened' ? '0' : 'runtime'];
      if (variant !== 'unhardened') {
        const entitlementsPath = path.join(directory, `${variant}.plist`);
        await execFileAsync('/usr/bin/plutil', ['-create', 'xml1', entitlementsPath]);
        const entitlement = variant === 'dyld-environment'
          ? 'com.apple.security.cs.allow-dyld-environment-variables' : 'com.apple.security.get-task-allow';
        await execFileAsync('/usr/bin/plutil', ['-insert', entitlement.replaceAll('.', '\\.'), '-bool', 'true', entitlementsPath]);
        signingArguments.push('--entitlements', entitlementsPath);
      }
      await execFileAsync('/usr/bin/codesign', [...signingArguments, executablePath]);
      const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', executablePath]);
      const codeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
      if (!codeHash) throw new Error('The runtime fixture has no code identity.');
      await startService({ clientExecutablePath: executablePath, clientRequirement: `cdhash H"${codeHash}"` });
      const snapshot = { services: [] };
      const request = {
        protocolVersion: 1, requestId: 'runtime', operation: 'system-proxy.replace',
        parameters: { expectedSnapshot: snapshot, replacementSnapshot: snapshot },
      };
      const { stdout } = await execFileAsync(executablePath, [socketPath, JSON.stringify(request)]);
      expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
    },
  );

  it('validates proxy write snapshots and rejects parameters outside the fixed protocol', async () => {
    await startService();
    const service = { id: 'network-service', name: 'Wi-Fi', settings: { HTTPEnable: 0 } };
    const snapshot = { services: [service] };
    for (const parameters of [
      { expectedSnapshot: snapshot },
      { expectedSnapshot: snapshot, replacementSnapshot: snapshot, command: 'id' },
      { expectedSnapshot: snapshot, replacementSnapshot: { services: [service, service] } },
      { expectedSnapshot: snapshot, replacementSnapshot: { services: [{ ...service, settings: { HTTPEnable: null } }] } },
    ]) {
      expect(await requestFromNativeClient({
        protocolVersion: 1, requestId: 'invalid-proxy', operation: 'system-proxy.replace', parameters,
      })).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
  });

  it('rejects certificate paths, private material, invalid DER and mismatched fingerprints', async () => {
    await startService();
    for (const operation of ['certificate.import', 'certificate.remove']) {
      for (const parameters of [
        { path: '/tmp/certificate.pem', sha256: certificateParameters.sha256 },
        { ...certificateParameters, privateKey: 'not-a-public-certificate' },
        { ...certificateParameters, certificate: '-----BEGIN PRIVATE KEY-----' },
        { ...certificateParameters, certificate: Buffer.from('invalid DER').toString('base64') },
        { ...certificateParameters, sha256: '00'.repeat(32) },
        { ...certificateParameters, sha256: null },
      ]) {
        expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'certificate-input', operation, parameters }))
          .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
      }
    }
  });

  it('does not coerce JSON booleans or fractional versions into the protocol number', async () => {
    await startService();
    for (const protocolVersion of [true, false, '1', 1.5, null]) {
      expect(await requestFromNativeClient({ protocolVersion, requestId: 'version', operation: 'status' }))
        .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
  });

  it('refuses a writable service configuration before exposing a socket', async () => {
    const configurationPath = await configureService();
    await chmod(configurationPath, 0o666);
    const result = await execFileAsync(helperPath, ['serve', configurationPath])
      .then(({ stdout }) => ({ code: 0, stdout, stderr: '' }),
        (error: { code: number; stdout: string; stderr: string }) => error);
    expect(result).toMatchObject({ code: 1 });
    expect(result.stderr).toContain('service configuration must be protected');
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('connects the typed read client but refuses system writes from the injectable Node runtime', async () => {
    const nodePath = await realpath(process.execPath);
    const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', nodePath]);
    const nodeCodeHash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1];
    if (!nodeCodeHash) throw new Error('The local Node runtime has no code identity for this unprivileged test.');
    await startService({ clientExecutablePath: nodePath, clientRequirement: `cdhash H"${nodeCodeHash}"` });
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);

    expect(await macosHelperServiceClient.getStatus()).toEqual({
      processId: serviceProcess!.pid, privileged: false, clientAuthorizedForWrites: false,
      capabilities,
    });
    expect(await macosHelperServiceClient.getStatus()).toEqual({
      processId: serviceProcess!.pid, privileged: false, clientAuthorizedForWrites: false,
      capabilities,
    });
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    const snapshot = await macosHelperServiceClient.readSystemProxySnapshot();
    expect(isDeepStrictEqual(snapshot, before)).toBe(true);
    expect(await macosHelperServiceClient.readEffectiveSystemProxySettings())
      .toEqual(JSON.parse((await execFileAsync(helperPath, ['get-effective-proxies'])).stdout));
    await expect(macosHelperServiceClient.replaceSystemProxySnapshot(snapshot, snapshot))
      .rejects.toMatchObject({ code: 'unauthorized-client' });
    await expect(macosHelperServiceClient.importCertificate(certificateParameters))
      .rejects.toMatchObject({ code: 'unauthorized-client' });
    await expect(macosHelperServiceClient.removeCertificate(certificateParameters))
      .rejects.toMatchObject({ code: 'unauthorized-client' });
    const after = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    expect(isDeepStrictEqual(after, before)).toBe(true);
  }, 15_000);

  it('preserves native identity rejection in the typed client without requesting authorization', async () => {
    await startService();
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
    await expect(macosHelperServiceClient.getStatus()).rejects.toMatchObject({ code: 'unauthorized-client' });
  });

  it('reports an absent service instead of starting an installation or another helper', async () => {
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
    await expect(macosHelperServiceClient.getStatus()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('allows a bounded native signing check to finish after five seconds', async () => {
    let responseTimer: ReturnType<typeof setTimeout> | undefined;
    const server = net.createServer((connection) => {
      connection.on('error', () => undefined);
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string };
        responseTimer = setTimeout(() => connection.end(JSON.stringify({
          protocolVersion: 1, requestId: request.requestId, ok: true,
          value: { processId: process.pid, privileged: true, clientAuthorizedForWrites: true,
            capabilities },
        }) + '\n'), 5_200);
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try {
      const client = new MacosHelperServiceClient(socketPath);
      await expect(client.getStatus()).resolves.toMatchObject({ privileged: true, clientAuthorizedForWrites: true });
    } finally {
      clearTimeout(responseTimer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);

  it('checks the exact certificate fingerprint and presence in typed service replies', async () => {
    const replies: unknown[] = [
      { sha256: certificateParameters.sha256, present: true },
      { sha256: '00'.repeat(32), present: true },
      { sha256: certificateParameters.sha256, present: true },
      { sha256: certificateParameters.sha256, present: false },
    ];
    const requests: unknown[] = [];
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string };
        requests.push(request);
        connection.end(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: true, value: replies.shift() }) + '\n');
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try {
      const client = new MacosHelperServiceClient(socketPath);
      await client.importCertificate(certificateParameters);
      await expect(client.importCertificate(certificateParameters)).rejects.toMatchObject({ code: 'invalid-response' });
      await expect(client.removeCertificate(certificateParameters)).rejects.toMatchObject({ code: 'invalid-response' });
      await client.removeCertificate(certificateParameters);
      expect(requests).toEqual([
        expect.objectContaining({ operation: 'certificate.import', parameters: certificateParameters }),
        expect.objectContaining({ operation: 'certificate.import', parameters: certificateParameters }),
        expect.objectContaining({ operation: 'certificate.remove', parameters: certificateParameters }),
        expect.objectContaining({ operation: 'certificate.remove', parameters: certificateParameters }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects mismatched, incomplete, oversized and extra response frames in the typed client', async () => {
    const status = {
      processId: process.pid, privileged: false, clientAuthorizedForWrites: false,
      capabilities,
    };
    const responseVariants: ((requestId: string) => string)[] = [
      (requestId) => JSON.stringify({ protocolVersion: true, requestId, ok: true, value: status }) + '\n',
      () => JSON.stringify({ protocolVersion: 1, requestId: 'different', ok: true, value: status }) + '\n',
      (requestId) => JSON.stringify({ protocolVersion: 1, requestId, ok: true, value: status, command: 'id' }) + '\n',
      (requestId) => JSON.stringify({ protocolVersion: 1, requestId, ok: true, value: { ...status, processId: true } }) + '\n',
      (requestId) => JSON.stringify({ protocolVersion: 1, requestId, ok: true, value: { ...status, capabilities: ['status', 'status', 'system-proxy.read'] } }) + '\n',
      (requestId) => JSON.stringify({ protocolVersion: 1, requestId, ok: true, value: status }),
      (requestId) => JSON.stringify({ protocolVersion: 1, requestId, ok: true, value: status }) + '\n{}\n',
      () => ' '.repeat(262_145),
    ];
    for (const createResponse of responseVariants) {
      const server = net.createServer((connection) => {
        connection.on('error', () => undefined);
        connection.once('data', (data) => {
          const request = JSON.parse(data.toString('utf8')) as { requestId: string };
          connection.end(createResponse(request.requestId));
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
      try {
        const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
        await expect(macosHelperServiceClient.getStatus()).rejects.toMatchObject({ code: 'invalid-response' });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  });
});