import { execFile } from 'node:child_process';

import type {
  CommandRunner,
  ElevatedRunner,
  PlatformCommand,
  SudoExec,
  TrustStoreServiceOptions,
} from '../interfaces';
import { TrustStoreError } from './trust-store-error';

/**
 * 本地计算机信任库的安装/卸载/检测（仅 Main）。
 *
 * Windows 用 `certutil`（本地计算机 Root）、macOS 用 `security`（系统钥匙串）；install/uninstall
 * 写机器级信任库需管理员权限，经 @vscode/sudo-prompt 弹系统原生提权对话框执行整条命令行；
 * 只读的 isTrusted 检测用普通 execFile。卸载与检测按 SHA-1 thumbprint 精确定位。
 * 启动只检测，不自动修改信任库。
 */
export class TrustStoreService {
  /** 默认 runner：execFile 不经 shell，参数以数组传入，避免命令注入。 */
  private static readonly EXEC_FILE_RUNNER: CommandRunner = {
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
  /** 懒加载的 @vscode/sudo-prompt exec 单例；仅在提权时加载，避免顶层 require 阻塞启动。 */
  private static sudoExecPromise: Promise<SudoExec> | null = null;
  /** 默认提权 runner：弹系统原生提权对话框执行整条命令行。 */
  private static readonly SUDO_PROMPT_RUNNER: ElevatedRunner = {
    async run(command) {
      const sudoExec = await TrustStoreService.loadSudoExec();
      return new Promise((resolve) => {
        sudoExec(command, { name: 'Interceptor' }, (error, stdout, stderr) => {
          resolve({
            code: error ? 1 : 0,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? error?.message ?? ''),
          });
        });
      });
    },
  };

  private readonly platform: NodeJS.Platform;
  private readonly runner: CommandRunner;
  private readonly elevatedRunner: ElevatedRunner;
  private readonly systemKeychain: string;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runner ?? TrustStoreService.EXEC_FILE_RUNNER;
    this.elevatedRunner =
      options.elevatedRunner ?? TrustStoreService.SUDO_PROMPT_RUNNER;
    this.systemKeychain =
      options.systemKeychainPath ?? '/Library/Keychains/System.keychain';
  }

  /** 当前平台是否支持信任库操作（Windows/macOS）。 */
  supported(): boolean {
    return this.platform === 'win32' || this.platform === 'darwin';
  }

  /** 把 Root CA 安装到本地计算机信任库（需提权）。调用方：ca.install（用户在设置里授权后）。 */
  async install(certPath: string): Promise<void> {
    const result = await this.elevatedRunner.run(
      this.installCommandLine(certPath),
    );
    if (result.code !== 0) {
      throw new TrustStoreError(
        `Trust store install failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  }

  /** 按 SHA-1 thumbprint 精确从本地计算机信任库移除（需提权）。调用方：ca.uninstall。 */
  async uninstall(sha1Thumbprint: string): Promise<void> {
    const result = await this.elevatedRunner.run(
      this.uninstallCommandLine(sha1Thumbprint),
    );
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
    // macOS：列出系统钥匙串证书的 SHA-1，命中目标即视为已安装。
    return (
      result.code === 0 &&
      result.stdout.toUpperCase().includes(sha1Thumbprint.toUpperCase())
    );
  }

  private installCommandLine(certPath: string): string {
    if (this.platform === 'win32') {
      return `certutil -addstore -f Root "${certPath}"`;
    }
    if (this.platform === 'darwin') {
      return `security add-trusted-cert -d -r trustRoot -k "${this.systemKeychain}" "${certPath}"`;
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }

  private uninstallCommandLine(sha1Thumbprint: string): string {
    if (this.platform === 'win32') {
      return `certutil -delstore Root ${sha1Thumbprint}`;
    }
    if (this.platform === 'darwin') {
      return `security delete-certificate -Z ${sha1Thumbprint} "${this.systemKeychain}"`;
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }

  private isTrustedCommand(sha1Thumbprint: string): PlatformCommand {
    if (this.platform === 'win32') {
      return { command: 'certutil', args: ['-verifystore', 'Root', sha1Thumbprint] };
    }
    if (this.platform === 'darwin') {
      return { command: 'security', args: ['find-certificate', '-a', '-Z', this.systemKeychain] };
    }
    throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
  }

  /** 懒加载 @vscode/sudo-prompt 的 exec；仅在 install/uninstall 需要提权时加载。 */
  private static loadSudoExec(): Promise<SudoExec> {
    if (!TrustStoreService.sudoExecPromise) {
      TrustStoreService.sudoExecPromise = import('@vscode/sudo-prompt').then(
        (module) => module.exec,
      );
    }
    return TrustStoreService.sudoExecPromise;
  }
}
