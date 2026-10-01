import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { once } from 'node:events';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as x509 from '@peculiar/x509';

import { MacosHelperServiceClient } from '../../macos/helper-client';
import { MacosHelperServiceError } from '../../macos/internal/errors';

const execFileAsync = promisify(execFile);
const helperPath = process.env.INTERCEPTOR_NATIVE_SERVICE_HELPER_PATH
  ?? path.resolve(import.meta.dirname, '../../../../dist/system-proxy/macos-proxy-helper');
const capabilities = [
  'status', 'system-proxy.read', 'system-proxy.read-effective', 'system-proxy.replace',
  'certificate.import', 'certificate.remove', 'request.get-completion',
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

  async function startService(
    overrides: Record<string, unknown> = {},
    environment: 'production' | 'development' = 'production',
    serviceExecutablePath = helperPath,
  ): Promise<void> {
    const configurationPath = environment === 'development'
      ? await configureDevelopmentService(overrides) : await configureService(overrides);
    serviceProcess = spawn(serviceExecutablePath, [environment === 'development' ? 'serve-development' : 'serve', configurationPath], { stdio: ['ignore', 'pipe', 'pipe'] });
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

  it('verifies the expected code identity in an isolated read-only native invocation', async () => {
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    await expect(execFileAsync(helperPath, ['verify-code-signature', clientPath, clientRequirement]))
      .resolves.toMatchObject({ stdout: '' });
    await expect(execFileAsync(helperPath, [
      'verify-code-signature', clientPath, `cdhash H"${'00'.repeat(20)}"`,
    ])).rejects.toMatchObject({ code: 1 });
    await expect(execFileAsync(helperPath, [
      'verify-code-signature', path.join(directory, 'missing-client'), clientRequirement,
    ])).rejects.toMatchObject({ code: 1 });
    expect(JSON.parse((await execFileAsync(helperPath, ['get'])).stdout)).toEqual(before);
  });

  it.each([
    ['missing', 'operation-failed'],
    ['failed', 'unauthorized-client'],
  ] as const)('rejects a %s signature verifier without returning successful status', async (failure, code) => {
    const copiedHelperPath = path.join(directory, `verifier-${failure}`);
    await copyFile(helperPath, copiedHelperPath);
    await chmod(copiedHelperPath, 0o700);
    const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
    await startService({}, 'production', copiedHelperPath);
    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: 'verified', operation: 'status' }))
      .toMatchObject({ ok: true });

    if (failure === 'missing') {
      await rm(copiedHelperPath);
    } else {
      const replacementPath = path.join(directory, 'failed-verifier');
      await writeFile(replacementPath, '#!/bin/sh\nexit 7\n', { encoding: 'utf8', mode: 0o700 });
      await rename(replacementPath, copiedHelperPath);
    }

    expect(await requestFromNativeClient({ protocolVersion: 1, requestId: failure, operation: 'status' }))
      .toMatchObject({ ok: false, error: { code } });
    expect(serviceProcess!.exitCode).toBeNull();
    expect(JSON.parse((await execFileAsync(helperPath, ['get'])).stdout)).toEqual(before);
  });

  it.each(['system-proxy.replace', 'certificate.import', 'certificate.remove'] as const)(
    'reports completion metadata for an ended %s request without granting a system write', async (operation) => {
      const before = JSON.parse((await execFileAsync(helperPath, ['get'])).stdout);
      await startService({}, 'development');
      const requestId = `completed-${operation}`;
      const parameters = operation === 'system-proxy.replace'
        ? { expectedSnapshot: { services: [] }, replacementSnapshot: { services: [] } }
        : certificateParameters;
      await expect(requestFromNativeClient({ protocolVersion: 1, requestId, operation, parameters }))
        .resolves.toMatchObject({ ok: false, error: { code: 'authorization-required' } });

      await expect(requestFromNativeClient({
        protocolVersion: 1, requestId: 'completion-query', operation: 'request.get-completion',
        parameters: { requestId },
      })).resolves.toEqual({
        protocolVersion: 1, requestId: 'completion-query', ok: true,
        value: { requestId, state: 'completed', operation },
      });
      expect(JSON.parse((await execFileAsync(helperPath, ['get'])).stdout)).toEqual(before);
    },
  );

  it('does not treat an absent request or a read as a completed mutation', async () => {
    await startService({}, 'development');
    await requestFromNativeClient({ protocolVersion: 1, requestId: 'read-only', operation: 'system-proxy.read' });
    for (const requestId of ['not-received', 'read-only']) {
      await expect(requestFromNativeClient({
        protocolVersion: 1, requestId: `query-${requestId}`, operation: 'request.get-completion',
        parameters: { requestId },
      })).resolves.toMatchObject({ ok: true, value: { requestId, state: 'unknown' } });
    }
  });

  it('bounds completed mutation metadata and reports evicted requests as unknown', async () => {
    await startService({}, 'development');
    for (let index = 0; index < 129; index += 1) {
      await requestFromNativeClient({
        protocolVersion: 1, requestId: `mutation-${index}`, operation: 'system-proxy.replace',
        parameters: { expectedSnapshot: { services: [] }, replacementSnapshot: { services: [] } },
      });
    }
    await expect(requestFromNativeClient({
      protocolVersion: 1, requestId: 'old-query', operation: 'request.get-completion',
      parameters: { requestId: 'mutation-0' },
    })).resolves.toMatchObject({ ok: true, value: { requestId: 'mutation-0', state: 'unknown' } });
    await expect(requestFromNativeClient({
      protocolVersion: 1, requestId: 'latest-query', operation: 'request.get-completion',
      parameters: { requestId: 'mutation-128' },
    })).resolves.toMatchObject({
      ok: true, value: { requestId: 'mutation-128', state: 'completed', operation: 'system-proxy.replace' },
    });
  }, 15_000);

  it('rejects malformed completion queries without accepting caller-supplied completion facts', async () => {
    await startService({}, 'development');
    for (const parameters of [{ requestId: '' }, { requestId: true }, { requestId: 'x'.repeat(129) },
      { requestId: 'known', state: 'completed' }, { operation: 'certificate.remove' }]) {
      await expect(requestFromNativeClient({
        protocolVersion: 1, requestId: 'invalid-query', operation: 'request.get-completion', parameters,
      })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
  });

  it('retains mutation completion after the requesting client disconnects before reading the reply', async () => {
    await startService({}, 'development');
    const connection = net.createConnection(socketPath);
    await once(connection, 'connect');
    const closed = once(connection, 'close');
    await new Promise<void>((resolve, reject) => {
      connection.write(JSON.stringify({
        protocolVersion: 1, requestId: 'disconnected-mutation', operation: 'system-proxy.replace',
        parameters: { expectedSnapshot: { services: [] }, replacementSnapshot: { services: [] } },
      }) + '\n', (error) => {
        connection.destroy();
        if (error) reject(error);
        else resolve();
      });
    });
    await closed;

    await expect(requestFromNativeClient({
      protocolVersion: 1, requestId: 'query-disconnected', operation: 'request.get-completion',
      parameters: { requestId: 'disconnected-mutation' },
    })).resolves.toMatchObject({
      ok: true, value: { requestId: 'disconnected-mutation', state: 'completed', operation: 'system-proxy.replace' },
    });
    expect(serviceProcess!.exitCode).toBeNull();
  });

  it('does not reuse completion metadata after the native service restarts', async () => {
    await startService({}, 'development');
    await requestFromNativeClient({
      protocolVersion: 1, requestId: 'previous-generation', operation: 'system-proxy.replace',
      parameters: { expectedSnapshot: { services: [] }, replacementSnapshot: { services: [] } },
    });
    const exited = once(serviceProcess!, 'exit');
    serviceProcess!.kill('SIGTERM');
    await exited;
    serviceProcess = null;
    await startService({}, 'development');

    await expect(requestFromNativeClient({
      protocolVersion: 1, requestId: 'query-previous', operation: 'request.get-completion',
      parameters: { requestId: 'previous-generation' },
    })).resolves.toMatchObject({ ok: true, value: { requestId: 'previous-generation', state: 'unknown' } });
  });

  it('keeps completion metadata scoped to its production or development endpoint', async () => {
    const developmentSocketPath = path.join(directory, 'development.sock');
    await configureDevelopmentService({ socketPath: developmentSocketPath });
    await startService();
    await requestFromNativeClient({
      protocolVersion: 1, requestId: 'production-attempt', operation: 'system-proxy.replace',
      parameters: { expectedSnapshot: { services: [] }, replacementSnapshot: { services: [] } },
    });
    const query = {
      protocolVersion: 1, requestId: 'query-endpoint', operation: 'request.get-completion',
      parameters: { requestId: 'production-attempt' },
    };
    await expect(requestFromNativeClient(query)).resolves.toMatchObject({
      ok: true, value: { requestId: 'production-attempt', state: 'completed', operation: 'system-proxy.replace' },
    });
    const { stdout } = await execFileAsync(clientPath, [developmentSocketPath, JSON.stringify(query)]);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, value: { requestId: 'production-attempt', state: 'unknown' } });
  });

  it('authenticates the caller before looking up completion metadata', async () => {
    await startService({ clientUserId: process.getuid!() + 1 }, 'development');
    await expect(requestFromNativeClient({
      protocolVersion: 1, requestId: 'unapproved-query', operation: 'request.get-completion',
      parameters: { requestId: 'another-request' },
    })).resolves.toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

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

  it.each(['certificate.trust', 'certificate.untrust', 'certificate.view'])(
    'does not expose interactive %s on the background service', async (operation) => {
      await startService({}, 'development');
      expect(await requestFromNativeClient({
        protocolVersion: 1, requestId: 'certificate-trust', operation,
      })).toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
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

  it('uses the foreground helper for certificate authorization without a background trust request', async () => {
    const client = new MacosHelperServiceClient(socketPath, helperPath);
    await expect(client.trustCertificate(certificateParameters)).rejects.toMatchObject({
      code: 'verification-failed', executionState: 'completed',
    });
    await expect(client.untrustCertificate(certificateParameters)).resolves.toBeUndefined();
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('confirms that no authorization operation remains when the foreground helper cannot start', async () => {
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath, path.join(directory, 'missing-helper'));

    await expect(macosHelperServiceClient.trustCertificate(certificateParameters)).rejects.toMatchObject({
      code: 'unavailable', executionState: 'completed',
    });
  });

  it.each(['trustCertificate', 'viewCertificate'] as const)('waits for the foreground %s process to exit after a stdin failure', async (operation) => {
    const controlPath = path.join(directory, 'foreground-control.sock');
    const executablePath = path.join(directory, 'foreground-transport-helper');
    await writeFile(executablePath, `#!${process.execPath}\n` + [
      "const fs = require('node:fs');",
      "const net = require('node:net');",
      `const control = net.createConnection(${JSON.stringify(controlPath)});`,
      "process.on('SIGTERM', () => control.write('terminated\\n'));",
      "control.once('connect', () => fs.closeSync(0));",
      "control.once('data', () => process.exit(1));",
    ].join('\n'), { encoding: 'utf8', mode: 0o700 });
    let control: net.Socket | undefined;
    let confirmTermination!: () => void;
    const terminationRequested = new Promise<void>((resolve) => { confirmTermination = resolve; });
    const server = net.createServer((connection) => {
      control = connection;
      let response = '';
      connection.on('data', (chunk) => {
        response += chunk.toString('utf8');
        if (response.includes('terminated\n')) confirmTermination();
      });
    });
    await new Promise<void>((resolve) => server.listen(controlPath, resolve));
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath, executablePath);
    let settled = false;
    const running = macosHelperServiceClient[operation]({
      ...certificateParameters, certificate: 'A'.repeat(250_000),
    }).then(() => { settled = true; return null; }, (error: unknown) => { settled = true; return error; });
    try {
      await terminationRequested;
      expect(settled).toBe(false);
    } finally {
      control?.end('finish\n');
      await running;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(await running).toMatchObject({ code: 'unavailable', executionState: 'completed' });
  });

  it('uses the foreground viewer and rejects mismatched certificate data without a service socket', async () => {
    const macosHelperServiceClient = new MacosHelperServiceClient(socketPath, helperPath);
    await expect(macosHelperServiceClient.viewCertificate({ ...certificateParameters, sha256: '00'.repeat(32) }))
      .rejects.toMatchObject({ code: 'invalid-request' });
    await expect(lstat(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['certificate.trust', 'certificate.untrust', 'certificate.view'])(
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
    const requirement = `cdhash H"${applicationCodeHash}"`;
    await expect(execFileAsync(helperPath, ['verify-code-signature', applicationPath, requirement]))
      .resolves.toMatchObject({ stdout: '' });
    await startService({
      clientExecutablePath: applicationExecutablePath,
      clientRequirement: requirement,
    });
    const request = JSON.stringify({ protocolVersion: 1, requestId: 'bundle', operation: 'status' });
    const approved = await execFileAsync(applicationExecutablePath, [socketPath, request]);
    expect(JSON.parse(approved.stdout)).toMatchObject({ ok: true });

    await writeFile(path.join(nestedApplicationPath, 'Contents', 'Resources', 'resource.txt'), 'changed', 'utf8');
    await expect(execFileAsync(helperPath, ['verify-code-signature', applicationPath, requirement]))
      .rejects.toMatchObject({ code: 1 });
    const changed = await execFileAsync(applicationExecutablePath, [socketPath, request]);
    expect(JSON.parse(changed.stdout)).toMatchObject({ ok: false, error: { code: 'unauthorized-client' } });
  });

  it('rejects unknown commands and unexpected parameters instead of exposing command execution', async () => {
    await startService();
    for (const operation of ['execute', 'proxy.set', 'certificate.install', 'install-helper', 'uninstall-helper', 'verify-code-signature']) {
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
    await expect(macosHelperServiceClient.getStatus()).rejects.toMatchObject({
      code: 'unavailable', executionState: 'completed', requestSent: false,
    });
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
      await expect(client.importCertificate(certificateParameters)).rejects.toMatchObject({
        code: 'invalid-response', executionState: 'completed', operation: 'certificate.import', requestSent: true,
      });
      await expect(client.removeCertificate(certificateParameters)).rejects.toMatchObject({
        code: 'invalid-response', executionState: 'completed', operation: 'certificate.remove', requestSent: true,
      });
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

  it.each(['system-proxy.replace', 'certificate.import', 'certificate.remove'] as const)(
    'confirms the original %s completion after a lost reply without replaying the write', async (operation) => {
      const requests: Array<{ requestId: string; operation: string; parameters?: unknown }> = [];
      let originalRequestId: string | undefined;
      let releaseConfirmation: (() => void) | undefined;
      let receivedConfirmation!: () => void;
      const confirmationReceived = new Promise<void>((resolve) => { receivedConfirmation = resolve; });
      const server = net.createServer((connection) => {
        connection.once('data', (data) => {
          const request = JSON.parse(data.toString('utf8')) as { requestId: string; operation: string; parameters?: unknown };
          requests.push(request);
          if (request.operation === operation) {
            originalRequestId = request.requestId;
            connection.end();
          } else {
            releaseConfirmation = () => connection.end(JSON.stringify({
                protocolVersion: 1, requestId: request.requestId, ok: true,
                value: { requestId: originalRequestId, state: 'completed', operation },
              }) + '\n');
            receivedConfirmation();
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
      try {
        const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
        const request = operation === 'system-proxy.replace'
          ? macosHelperServiceClient.replaceSystemProxySnapshot({ services: [] }, { services: [] })
          : operation === 'certificate.import' ? macosHelperServiceClient.importCertificate(certificateParameters)
            : macosHelperServiceClient.removeCertificate(certificateParameters);
        let settled = false;
        const result = request.then(() => { settled = true; return null; }, (error: unknown) => {
          settled = true;
          return error;
        });
        await confirmationReceived;
        expect(settled).toBe(false);
        releaseConfirmation!();
        releaseConfirmation = undefined;
        const outcome = await result;
        expect(outcome).toBeInstanceOf(MacosHelperServiceError);
        if (!(outcome instanceof MacosHelperServiceError)) throw new Error('Expected the original write error.');
        expect(outcome).toMatchObject({ code: 'invalid-response', executionState: 'completed', operation, requestSent: true });
        expect(outcome.hasUnconfirmedMutation()).toBe(false);
        expect(requests.map((value) => value.operation)).toEqual([operation, 'request.get-completion']);
        expect(requests[1]!.parameters).toEqual({ requestId: requests[0]!.requestId });
        expect(requests[1]!.requestId).not.toBe(requests[0]!.requestId);
      } finally {
        releaseConfirmation?.();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    },
  );

  it.each(['success', 'formal-failure'] as const)('does not query completion for a normal %s reply', async (reply) => {
    const operations: string[] = [];
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string; operation: string };
        operations.push(request.operation);
        connection.end(JSON.stringify({
          protocolVersion: 1, requestId: request.requestId,
          ...(reply === 'success'
            ? { ok: true, value: { services: [] } }
            : { ok: false, error: { code: 'snapshot-conflict' } }),
        }) + '\n');
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
      const request = macosHelperServiceClient.replaceSystemProxySnapshot({ services: [] }, { services: [] });
      if (reply === 'success') await expect(request).resolves.toEqual({ services: [] });
      else await expect(request).rejects.toMatchObject({ code: 'snapshot-conflict', executionState: 'completed' });
      expect(operations).toEqual(['system-proxy.replace']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each(['status', 'system-proxy.read', 'system-proxy.read-effective'] as const)(
    'does not query completion after a lost %s read reply', async (operation) => {
      const operations: string[] = [];
      const server = net.createServer((connection) => {
        connection.once('data', (data) => {
          operations.push((JSON.parse(data.toString('utf8')) as { operation: string }).operation);
          connection.end();
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
      try {
        const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
        const request = operation === 'status' ? macosHelperServiceClient.getStatus()
          : operation === 'system-proxy.read' ? macosHelperServiceClient.readSystemProxySnapshot()
            : macosHelperServiceClient.readEffectiveSystemProxySettings();
        await expect(request).rejects.toMatchObject({ code: 'invalid-response', operation });
        expect(operations).toEqual([operation]);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    },
  );

  it('confirms a timed-out write only after its original 30-second deadline', async () => {
    const operations: string[] = [];
    let originalRequestId: string | undefined;
    let receivedWrite!: () => void;
    const writeReceived = new Promise<void>((resolve) => { receivedWrite = resolve; });
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string; operation: string };
        operations.push(request.operation);
        if (request.operation === 'system-proxy.replace') {
          originalRequestId = request.requestId;
          receivedWrite();
        } else {
          connection.end(JSON.stringify({
            protocolVersion: 1, requestId: request.requestId, ok: true,
            value: { requestId: originalRequestId, state: 'completed', operation: 'system-proxy.replace' },
          }) + '\n');
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
      const pending = macosHelperServiceClient.replaceSystemProxySnapshot({ services: [] }, { services: [] })
        .then(() => null, (error: unknown) => error);
      await writeReceived;
      await vi.advanceTimersByTimeAsync(29_999);
      expect(operations).toEqual(['system-proxy.replace']);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        code: 'timeout', executionState: 'completed', operation: 'system-proxy.replace', requestSent: true,
      });
      expect(operations).toEqual(['system-proxy.replace', 'request.get-completion']);
    } finally {
      vi.useRealTimers();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each(['unknown', 'wrong-request', 'wrong-operation', 'extra-field', 'invalid-value', 'disconnected'] as const)(
    'preserves an unknown write after %s completion evidence and a later successful status', async (evidence) => {
    const operations: string[] = [];
    let originalRequestId: string | undefined;
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string; operation: string };
        operations.push(request.operation);
        if (request.operation === 'system-proxy.replace') {
          originalRequestId = request.requestId;
          connection.end();
          return;
        }
        if (request.operation === 'request.get-completion' && evidence === 'disconnected') {
          connection.end();
          return;
        }
        let value: unknown = {
          processId: process.pid, privileged: true, clientAuthorizedForWrites: true, capabilities,
        };
        if (request.operation === 'request.get-completion') {
          value = evidence === 'invalid-value' ? null : {
            requestId: evidence === 'wrong-request' ? 'different' : originalRequestId,
            state: evidence === 'unknown' ? 'unknown' : 'completed',
            ...(evidence === 'unknown' ? {} : { operation: evidence === 'wrong-operation' ? 'certificate.remove' : 'system-proxy.replace' }),
            ...(evidence === 'extra-field' ? { confirmed: true } : {}),
          };
        }
        connection.end(JSON.stringify({
          protocolVersion: 1, requestId: request.requestId, ok: true, value,
        }) + '\n');
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
      const snapshot = { services: [] };
      const outcome = await macosHelperServiceClient.replaceSystemProxySnapshot(snapshot, snapshot)
        .then(() => null, (error: unknown) => error);
      expect(outcome).toBeInstanceOf(AggregateError);
      if (!(outcome instanceof AggregateError)) throw new Error('Expected both write and confirmation errors.');
      const errors: readonly unknown[] = outcome.errors;
      expect(errors).toHaveLength(2);
      const original = errors[0];
      expect(original).toMatchObject({
        code: 'invalid-response', executionState: 'unknown', operation: 'system-proxy.replace',
      });
      if (!(original instanceof MacosHelperServiceError)) throw new Error('The original write error was lost.');
      expect(original.hasUnconfirmedMutation()).toBe(true);
      expect(errors[1]).toMatchObject({ operation: 'request.get-completion' });
      await expect(macosHelperServiceClient.getStatus()).resolves.toMatchObject({
        privileged: true, clientAuthorizedForWrites: true,
      });
      expect(original.hasUnconfirmedMutation()).toBe(true);
      expect(operations).toEqual(['system-proxy.replace', 'request.get-completion', 'status']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each([
    { name: 'null', value: null },
    { name: 'array', value: [] },
    { name: 'string', value: 'invalid' },
  ])('marks a malformed effective-proxy payload $name as a completed read', async ({ value: malformedPayload }) => {
    let value: unknown = malformedPayload;
    const operations: string[] = [];
    const server = net.createServer((connection) => {
      connection.once('data', (data) => {
        const request = JSON.parse(data.toString('utf8')) as { requestId: string; operation: string };
        operations.push(request.operation);
        connection.end(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: true, value }) + '\n');
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      const macosHelperServiceClient = new MacosHelperServiceClient(socketPath);
      await expect(macosHelperServiceClient.readEffectiveSystemProxySettings()).rejects.toMatchObject({
        code: 'invalid-response', executionState: 'completed', operation: 'system-proxy.read-effective',
      });
      value = { HTTPEnable: 0 };
      await expect(macosHelperServiceClient.readEffectiveSystemProxySettings()).resolves.toEqual(value);
      expect(operations).toEqual(['system-proxy.read-effective', 'system-proxy.read-effective']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
        await expect(macosHelperServiceClient.getStatus()).rejects.toMatchObject({
          code: 'invalid-response', operation: 'status',
        });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  });
});