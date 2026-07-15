import { describe, expect, it } from 'vitest';

import {
  TrustStoreError,
  TrustStoreService,
  type CommandResult,
  type CommandRunner,
  type ElevatedRunner,
} from '../trust-store-service';

/** 记录只读命令（isTrusted）；绝不真实执行平台命令。 */
class RecordingRunner implements CommandRunner {
  readonly calls: { command: string; args: string[] }[] = [];
  result: CommandResult = { code: 0, stdout: '', stderr: '' };

  run(command: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ command, args });
    return Promise.resolve(this.result);
  }
}

/** 记录提权命令行（install/uninstall）；绝不真实提权。 */
class RecordingElevatedRunner implements ElevatedRunner {
  readonly calls: string[] = [];
  result: CommandResult = { code: 0, stdout: '', stderr: '' };

  run(command: string): Promise<CommandResult> {
    this.calls.push(command);
    return Promise.resolve(this.result);
  }
}

const SHA1 = 'AABBCCDDEEFF00112233445566778899AABBCCDD';

describe('TrustStoreService', () => {
  it('installs into the local machine root store on Windows via elevated certutil', async () => {
    const elevated = new RecordingElevatedRunner();
    const service = new TrustStoreService({ platform: 'win32', elevatedRunner: elevated });
    await service.install('C:/certs/root.pem');
    expect(elevated.calls[0]).toBe('certutil -addstore -f Root "C:/certs/root.pem"');
  });

  it('installs into the system keychain on macOS via elevated security', async () => {
    const elevated = new RecordingElevatedRunner();
    const service = new TrustStoreService({
      platform: 'darwin',
      elevatedRunner: elevated,
      systemKeychainPath: '/Library/Keychains/System.keychain',
    });
    await service.install('/certs/root.pem');
    expect(elevated.calls[0]).toBe(
      'security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "/certs/root.pem"',
    );
  });

  it('uninstalls by SHA-1 thumbprint on Windows (elevated)', async () => {
    const elevated = new RecordingElevatedRunner();
    const service = new TrustStoreService({ platform: 'win32', elevatedRunner: elevated });
    await service.uninstall(SHA1);
    expect(elevated.calls[0]).toBe(`certutil -delstore Root ${SHA1}`);
  });

  it('uninstalls by SHA-1 thumbprint on macOS (elevated)', async () => {
    const elevated = new RecordingElevatedRunner();
    const service = new TrustStoreService({
      platform: 'darwin',
      elevatedRunner: elevated,
      systemKeychainPath: '/kc',
    });
    await service.uninstall(SHA1);
    expect(elevated.calls[0]).toBe(`security delete-certificate -Z ${SHA1} "/kc"`);
  });

  it('throws when an elevated command exits non-zero', async () => {
    const elevated = new RecordingElevatedRunner();
    elevated.result = { code: 1, stdout: '', stderr: 'denied' };
    const service = new TrustStoreService({ platform: 'win32', elevatedRunner: elevated });
    await expect(service.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });

  it('detects Windows trust by exit code (local machine store)', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'win32', runner });
    runner.result = { code: 0, stdout: '', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(true);
    expect(runner.calls[0]).toEqual({
      command: 'certutil',
      args: ['-verifystore', 'Root', SHA1],
    });
    runner.result = { code: 1, stdout: '', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(false);
  });

  it('detects macOS trust when the thumbprint is listed', async () => {
    const runner = new RecordingRunner();
    const service = new TrustStoreService({ platform: 'darwin', runner, systemKeychainPath: '/kc' });
    runner.result = { code: 0, stdout: `SHA-1 hash: ${SHA1}\n`, stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(true);
    runner.result = { code: 0, stdout: 'SHA-1 hash: 0000\n', stderr: '' };
    expect(await service.isTrusted(SHA1)).toBe(false);
  });

  it('reports unsupported platforms and refuses to install', async () => {
    const service = new TrustStoreService({ platform: 'linux' });
    expect(service.supported()).toBe(false);
    expect(await service.isTrusted(SHA1)).toBe(false);
    await expect(service.install('root.pem')).rejects.toBeInstanceOf(TrustStoreError);
  });
});
