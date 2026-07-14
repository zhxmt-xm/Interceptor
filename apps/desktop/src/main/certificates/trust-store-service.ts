import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/** 平台信任库命令结果。 */
export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** 平台命令执行抽象；抽成接口以便注入 fake 做单元测试（不真实修改系统）。 */
export interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult>;
}

/** 默认 runner：execFile 不经 shell，参数以数组传入，避免命令注入。 */
export const execFileRunner: CommandRunner = {
  run(command, args) {
    return new Promise((resolve) => {
      execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        const rawCode = (error as { code?: number | string } | null)?.code;
        const code = typeof rawCode === 'number' ? rawCode : error ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    });
  },
};

export interface TrustStoreServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly runner?: CommandRunner;
  /** macOS 登录钥匙串路径；默认当前用户 login.keychain-db。 */
  readonly loginKeychainPath?: string;
}

export class TrustStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustStoreError';
  }
}

interface PlatformCommand {
  readonly command: string;
  readonly args: string[];
}

/**
 * 当前用户信任库的安装/卸载/检测（仅 Main）。
 *
 * Windows 用 `certutil -user`，macOS 用 `security`（登录钥匙串）；都只操作当前用户，
 * 不做机器级安装（那需要显式提权）。命令经 execFile 执行、参数数组传入，绝不拼接 shell。
 * 卸载与检测按 SHA-1 thumbprint 精确定位。启动只检测，不自动修改信任库。
 */
export class TrustStoreService {
  private readonly platform: NodeJS.Platform;
  private readonly runner: CommandRunner;
  private readonly loginKeychain: string;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runner ?? execFileRunner;
    this.loginKeychain =
      options.loginKeychainPath ??
      path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
  }

  /** 当前平台是否支持信任库操作（Windows/macOS）。 */
  supported(): boolean {
    return this.platform === 'win32' || this.platform === 'darwin';
  }

  /** 把 Root CA 安装到当前用户信任库。调用方：ca.install（用户在设置里授权后）。 */
  async install(certPath: string): Promise<void> {
    const { command, args } = this.installCommand(certPath);
    const result = await this.runner.run(command, args);
    if (result.code !== 0) {
      throw new TrustStoreError(
        `Trust store install failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  }

  /** 按 SHA-1 thumbprint 精确从当前用户信任库移除。调用方：ca.uninstall。 */
  async uninstall(sha1Thumbprint: string): Promise<void> {
    const { command, args } = this.uninstallCommand(sha1Thumbprint);
    const result = await this.runner.run(command, args);
    if (result.code !== 0) {
      throw new TrustStoreError(
        `Trust store uninstall failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  }

  /** 检测指定 SHA-1 thumbprint 的证书是否已在当前用户信任库。 */
  async isTrusted(sha1Thumbprint: string): Promise<boolean> {
    if (!this.supported()) {
      return false;
    }
    const { command, args } = this.isTrustedCommand(sha1Thumbprint);
    const result = await this.runner.run(command, args);
    if (this.platform === 'win32') {
      return result.code === 0;
    }
    // macOS：列出登录钥匙串证书的 SHA-1，命中目标即视为已安装。
    return (
      result.code === 0 &&
      result.stdout.toUpperCase().includes(sha1Thumbprint.toUpperCase())
    );
  }

  private installCommand(certPath: string): PlatformCommand {
    if (this.platform === 'win32') {
      return { command: 'certutil', args: ['-user', '-addstore', '-f', 'Root', certPath] };
    }
    if (this.platform === 'darwin') {
      return {
        command: 'security',
        args: ['add-trusted-cert', '-r', 'trustRoot', '-k', this.loginKeychain, certPath],
      };
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }

  private uninstallCommand(sha1Thumbprint: string): PlatformCommand {
    if (this.platform === 'win32') {
      return { command: 'certutil', args: ['-user', '-delstore', 'Root', sha1Thumbprint] };
    }
    if (this.platform === 'darwin') {
      return {
        command: 'security',
        args: ['delete-certificate', '-Z', sha1Thumbprint, this.loginKeychain],
      };
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }

  private isTrustedCommand(sha1Thumbprint: string): PlatformCommand {
    if (this.platform === 'win32') {
      return { command: 'certutil', args: ['-user', '-verifystore', 'Root', sha1Thumbprint] };
    }
    if (this.platform === 'darwin') {
      return { command: 'security', args: ['find-certificate', '-a', '-Z', this.loginKeychain] };
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }
}
