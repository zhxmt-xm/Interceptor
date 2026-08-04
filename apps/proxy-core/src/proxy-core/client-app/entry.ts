/**
 * 客户端应用归属解析：把 Mockttp 报告的客户端源端口反查成发起流量的本地应用。
 *
 * Core 只持有 id/名称/可执行文件路径三元组，`path` 用于 Main 取应用图标，
 * 绝不进入 Renderer；Renderer 只见 id 与展示名。
 */

import type { DiagnosticsRecorder } from '../core-diagnostics';
import { CLIENT_APP_SNAPSHOT_TTL_MS } from './internal/constants';
import type {
  ClientAppIdentity,
  ClientAppLookupRunner,
  ClientAppServiceOptions,
} from './interfaces';
import * as ClientAppUtils from './utils';

export class ClientAppService {
  /** 本机进程反查 helper 路径；null 表示当前平台不支持。 */
  private readonly helperPath: string | null;
  /** 执行 helper 的运行器；生产为无 shell 的 execFile。 */
  private readonly runner: ClientAppLookupRunner;
  /** 当前代理监听端口；未监听时不反查。 */
  private proxyPort: number | null = null;
  /** 最近一次快照：客户端源端口 → 发起该连接的应用。整表随每次快照替换。 */
  private appByPort = new Map<number, ClientAppIdentity>();
  /** 已解析过的应用 id；id 是可执行文件路径的纯函数，因此只用于去重，不需要失效。 */
  private readonly knownAppIds = new Set<string>();
  /** 尚未随事件批交给 Main 的应用身份；Main 需要其中的 path 去取系统图标。 */
  private readonly undeliveredApps = new Map<string, ClientAppIdentity>();
  /** 最近一次快照的采样时刻（取 helper 启动时刻，作为保守下界）。 */
  private snapshotStartedAt = 0;
  /** 进行中的快照；并发解析共享同一次 helper 调用。 */
  private snapshotInFlight: Promise<void> | null = null;
  /** 最近一次 helper 失败时刻；在退避窗口内不再重复拉起子进程。 */
  private snapshotFailedAt = 0;
  /** 诊断汇；反查失败只记录，绝不影响转发与抓包。 */
  private diagnostics: DiagnosticsRecorder | null = null;

  constructor(options: ClientAppServiceOptions = {}) {
    this.helperPath = options.helperPath ?? null;
    this.runner = options.runner ?? ClientAppUtils.clientAppLookupRunner;
  }

  /** 当前平台是否具备本机进程反查能力。 */
  get supported(): boolean {
    return this.helperPath !== null;
  }

  /** 注入诊断汇；调用方：CoreApplication 组合根。 */
  attachDiagnostics(sink: DiagnosticsRecorder): void {
    this.diagnostics = sink;
  }

  /** 绑定当前代理监听端口；换端口即作废旧快照。 */
  setProxyPort(port: number | null): void {
    if (port === this.proxyPort) {
      return;
    }
    this.proxyPort = port;
    this.appByPort = new Map();
    this.snapshotStartedAt = 0;
  }

  /**
   * 从当前有效快照直接读取端口归属，不触发任何 helper 调用。
   * 调用方：ExchangeTracker 在创建 Exchange 时同步取用，命中即无需后续更新事件。
   */
  cachedAppForPort(sourcePort: number): ClientAppIdentity | null {
    if (Date.now() - this.snapshotStartedAt > CLIENT_APP_SNAPSHOT_TTL_MS) {
      return null;
    }
    return this.appByPort.get(sourcePort) ?? null;
  }

  /**
   * 解析客户端源端口所属应用，必要时重新取快照。
   * 请求到达时 TCP 连接必然已建立，因此一张采样时刻不早于此刻的快照足以定论：
   * 里面没有就说明进程不可读（如系统权限进程）。第一轮可能复用了更早启动的快照，
   * 所以最多再取一轮；每一轮都会等待结果，绝不在快照飞行中直接放弃。
   */
  async resolveAppForPort(
    sourcePort: number,
  ): Promise<ClientAppIdentity | null> {
    if (!this.supported || this.proxyPort === null) {
      return null;
    }
    const cached = this.cachedAppForPort(sourcePort);
    if (cached) {
      return cached;
    }
    const arrivedAt = Date.now();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.takeSnapshot();
      const identity = this.cachedAppForPort(sourcePort);
      if (identity || this.snapshotStartedAt >= arrivedAt) {
        return identity;
      }
    }
    return null;
  }

  /**
   * 取出尚未交给 Main 的应用身份；随捕获事件批一起下发。
   * 批次发送成功后由调用方 markAppsDelivered，发送失败则下一轮继续带上。
   */
  pendingAppsForMain(): ClientAppIdentity[] {
    return [...this.undeliveredApps.values()];
  }

  /** 确认一批应用身份已随事件批送达 Main。 */
  markAppsDelivered(apps: readonly ClientAppIdentity[]): void {
    for (const identity of apps) {
      this.undeliveredApps.delete(identity.id);
    }
  }

  /** 取一次快照；进行中的快照被所有并发调用共享，helper 连续失败时退避。 */
  private takeSnapshot(): Promise<void> {
    if (this.snapshotInFlight) {
      return this.snapshotInFlight;
    }
    if (
      this.snapshotFailedAt > 0 &&
      Date.now() - this.snapshotFailedAt <= CLIENT_APP_SNAPSHOT_TTL_MS
    ) {
      return Promise.resolve();
    }
    const running = this.runLookupHelper().finally(() => {
      this.snapshotInFlight = null;
    });
    this.snapshotInFlight = running;
    return running;
  }

  /** 执行 helper 并用结果整表替换端口归属；失败只记诊断。 */
  private async runLookupHelper(): Promise<void> {
    if (this.helperPath === null || this.proxyPort === null) {
      return;
    }
    // helper 读取系统表发生在启动之后，因此用启动时刻作为采样时刻的保守下界。
    const startedAt = Date.now();
    try {
      const output = await this.runner(this.helperPath, [String(this.proxyPort)]);
      const appByPort = ClientAppUtils.parseAppsByPort(output);
      this.appByPort = appByPort;
      this.snapshotStartedAt = startedAt;
      this.snapshotFailedAt = 0;
      for (const identity of appByPort.values()) {
        if (!this.knownAppIds.has(identity.id)) {
          this.knownAppIds.add(identity.id);
          this.undeliveredApps.set(identity.id, identity);
        }
      }
    } catch (error) {
      this.snapshotFailedAt = Date.now();
      this.diagnostics?.warn('client-app.lookup-failed', {
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}
