import { describe, expect, it } from 'vitest';

import {
  TrustStoreError,
  TrustStoreService,
  type CommandResult,
  type CommandRunner,
} from '../trust-store-service';

/** 记录被调用的命令，返回预设结果；绝不真实执行平台命令。 */
class RecordingRunner implements CommandRunner {
  readonly calls: { command: string; args: string[] }[] = [];
  result: CommandResult = { code: 0, stdout: '', stderr: '' };

  run(command: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ command, args });
    return Promise.resolve(this.result);
  }
}

const SHA1 = 'AABBCCDDEEFF00112233445566778899AABBCCDD';

describe('TrustStoreService', () => {
  it('installs into the current-user root store on Windows via certutil', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'win32', runner });
    await service.install('C:/certs/root.pem');
    expect(runner.calls[0]).toEqual({
      command: 'certutil',
      args: ['-user', '-addstore', '-f', 'Root', 'C:/certs/root.pem'],
    });
  });

  it('installs into the login keychain on macOS via security', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({
      platform: 'darwin',
      runner,
      loginKeychainPath: '/Users/me/Library/Keychains/login.keychain-db',
    });
    await service.install('/certs/root.pem');
    expect(runner.calls[0]).toEqual({
      command: 'security',
      args: [
        'add-trusted-cert',
        '-r',
        'trustRoot',
        '-k',
        '/Users/me/Library/Keychains/login.keychain-db',
        '/certs/root.pem',
      ],
    });
  });

  it('uninstalls by SHA-1 thumbprint on Windows', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'win32', runner });
    await service.uninstall(SHA1);
    expect(runner.calls[0]).toEqual({
      command: 'certutil',
      args: ['-user', '-delstore', 'Root', SHA1],
    });
  });

  it('uninstalls by SHA-1 thumbprint on macOS', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({
      platform: 'darwin',
      runner,
      loginKeychainPath: '/kc',
    });
    await service.uninstall(SHA1);
    expect(runner.calls[0]).toEqual({
      command: 'security',
      args: ['delete-certificate', '-Z', SHA1, '/kc'],
    });
  });

  it('throws when a command exits non-zero', async () => {
    const runner = new RecordingRunner();
    runner.result = { code: 1, stdout: '', stderr: 'denied' };
    const service = new TrustStoreService({ platform: 'win32', runner });
    await expect(service.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });

  it('detects Windows trust by exit code', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'win32', runner });
    runner.result = { code: 0, stdout: '', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(true);
    runner.result = { code: 1, stdout: '', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(false);
  });

  it('detects macOS trust when the thumbprint is listed', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'darwin', runner, loginKeychainPath: '/kc' });
    runner.result = { code: 0, stdout: `SHA-1 hash: ${SHA1}\n`, stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(true);
    runner.result = { code: 0, stdout: 'SHA-1 hash: 0000\n', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(false);
  });

  it('reports unsupported platforms and refuses to install', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'linux', runner });
    expect(service.supported()).toBe(false);
    expect(await service.isTrusted(SHA1)).toBe(false);
    await expect(service.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });
});
