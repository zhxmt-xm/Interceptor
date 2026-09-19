import type { TrustStoreServiceOptions } from '../interfaces';
import { MacosTrustStoreService } from '../macos/trust-store/entry';
import { WindowsTrustStoreService } from '../windows/trust-store/entry';
import { TrustStoreError } from './errors';

/**
 * 本地计算机信任库的安装/卸载/检测（仅 Main）。
 *
 * Windows 用 `certutil`（本地计算机 Root），安装和卸载通过 sudo-prompt 提权。
 * macOS 由已部署的 helper 导入/删除公开证书及设置/撤销 admin trust。
 * 只读的 isTrusted 检测用普通 execFile。卸载与检测按 SHA-1 thumbprint 精确定位。
 * 启动只检测，不自动修改信任库。
 */
export class TrustStoreService {
  private readonly platform: NodeJS.Platform;
  private readonly platformTrustStoreService: WindowsTrustStoreService | MacosTrustStoreService | null;

  constructor(options: TrustStoreServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.platformTrustStoreService = this.createPlatformTrustStoreService(options);
  }

  /** 平台实现分别拥有原生命令与权限边界。 */
  private createPlatformTrustStoreService(
    options: TrustStoreServiceOptions,
  ): WindowsTrustStoreService | MacosTrustStoreService | null {
    switch (this.platform) {
      case 'win32':
        return new WindowsTrustStoreService(options);
      case 'darwin':
        return new MacosTrustStoreService(options);
      default:
        return null;
    }
  }

  /** 当前平台是否支持信任库操作（Windows/macOS）。 */
  supported(): boolean {
    return this.platformTrustStoreService !== null;
  }

  /** 把 Root CA 安装到本地计算机信任库（需提权）。调用方：ca.install（用户在设置里授权后）。 */
  async install(certPath: string): Promise<void> {
    const result = await this.requirePlatformTrustStoreService().install(certPath);
    if (result.code !== 0) {
      throw new TrustStoreError(
        `Trust store install failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  }

  /** 按 SHA-1 thumbprint 精确从本地计算机信任库移除（需提权）。调用方：ca.uninstall。 */
  async uninstall(sha1Thumbprint: string): Promise<void> {
    const result = await this.requirePlatformTrustStoreService().uninstall(sha1Thumbprint);
    if (result.code !== 0) {
      throw new TrustStoreError(
        `Trust store uninstall failed (exit ${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  }

  /** 匹配机器证书库中的目标证书，再查询其系统信任结果。 */
  async isTrusted(sha1Thumbprint: string): Promise<boolean> {
    return this.platformTrustStoreService?.isTrusted(sha1Thumbprint) ?? false;
  }

  /** 不支持的平台拒绝写入，不通过空实现伪造成功。 */
  private requirePlatformTrustStoreService(): WindowsTrustStoreService | MacosTrustStoreService {
    if (!this.platformTrustStoreService) {
      throw new TrustStoreError(`Trust store is not supported on ${this.platform}.`);
    }
    return this.platformTrustStoreService;
  }
}
